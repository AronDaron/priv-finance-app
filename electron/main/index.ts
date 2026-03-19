// electron/main/index.ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import {
  fetchQuote,
  fetchHistory,
  searchTickers,
  fetchFundamentals,
  fetchDividends,
  calculateTechnicals,
  fetchAssetMeta,
  fetchPortfolioHistory,
  fetchGlobalMarketData,
} from './finance'
import { computeGlobalScores, detectMarketRegime } from './globalScore'
import type { HistoryPeriod } from '../../src/lib/types'
import { gramsToTroyOz } from '../../src/lib/types'
import {
  initDatabase,
  getAllAssets,
  addAsset,
  updateAsset,
  deleteAsset,
  getAllTransactions,
  getTransactionsByTicker,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  getLatestReportByTicker,
  getAllReports,
  addReport,
  getSetting,
  setSetting,
  getAllSettings,
  getPortfolios,
  createPortfolio,
  renamePortfolio,
  deletePortfolio,
  updatePortfolioTags,
  getCashAccounts,
  addCashTransaction,
  getCashTransactions,
  archiveNews,
  searchNews,
  pruneOldNews,
  type DBNewsItem,
  type DBPortfolioAsset,
  type DBPortfolio,
  type DBCashAccount,
  type DBTransaction,
  type DBAIReport,
} from './database'
import { analyzeStock, analyzePortfolio, analyzeRegion, chatWithPortfolio, WORKER_MODEL, MANAGER_MODEL, WORLD_MODEL, type ChatMessage } from './ai'
import { fetchNewsForRegion } from './news'
import type { NewsRegion } from './news'

// ─── Chat RAG helpers ─────────────────────────────────────────────────────────

/** Agreguje dzienne świece OHLCV do miesięcznych podsumowań */
function aggregateToMonthly(
  candles: Array<{ time: number; open: number; close: number; high: number; low: number }>
): Array<{ month: string; open: number; close: number; high: number; low: number; changePercent: number }> {
  const byMonth = new Map<string, typeof candles>()
  for (const c of candles) {
    const d = new Date(c.time * 1000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key)!.push(c)
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cs]) => ({
      month,
      open: cs[0].open,
      close: cs[cs.length - 1].close,
      high: Math.max(...cs.map(c => c.high)),
      low: Math.min(...cs.map(c => c.low)),
      changePercent: cs[0].open > 0 ? ((cs[cs.length - 1].close - cs[0].open) / cs[0].open) * 100 : 0,
    }))
}

/** Buduje zapytanie FTS5 z tickerów portfela i słów kluczowych pytania */
function buildNewsQuery(question: string, assets: Array<{ ticker: string; name: string }>): string {
  const terms: Set<string> = new Set()
  const sanitize = (s: string) => s.replace(/["*()+,\-]/g, ' ').trim()
  for (const a of assets) {
    const base = sanitize(a.ticker.split('.')[0])
    if (base.length >= 2) terms.add(base)
    const firstWord = sanitize(a.name.split(/[\s,]/)[0])
    if (firstWord.length > 3) terms.add(`"${firstWord}"`)
  }
  const stopwords = new Set(['portfel', 'spółka', 'akcje', 'przez', 'które', 'kiedy', 'dlaczego', 'jaka', 'jakie', 'będzie', 'mojego', 'moim'])
  question.split(/\s+/)
    .map(w => sanitize(w.replace(/[?!.,]/g, '')))
    .filter(w => w.length > 4 && !stopwords.has(w.toLowerCase()))
    .slice(0, 5)
    .forEach(w => terms.add(w))
  return Array.from(terms).slice(0, 12).join(' OR ')
}

/** Buduje system prompt z pełnym kontekstem portfela dla AI Agenta */
function buildChatSystemContext(params: {
  assets: DBPortfolioAsset[]
  quotes: Map<string, { price: number; currency: string; changePercent: number }>
  portfolios: DBPortfolio[]
  transactions: DBTransaction[]
  cashAccounts: DBCashAccount[]
  priceHistories: Map<string, ReturnType<typeof aggregateToMonthly>>
  globalMarket: { indices: { VIX: { price: number }; SP500: { price: number; changePercent: number; change1m: number }; WIG20: { price: number; changePercent: number; change1m: number }; DAX: { change1m: number; price: number } }; bonds: { US10Y: { price: number } }; commodities: { gold: { price: number; change1m: number }; oil: { price: number; change1m: number } }; currencies: { EURUSD: { price: number } } } | null
  news: DBNewsItem[]
  aiReports: DBAIReport[]
  usdPln: number
  eurPln: number
  today: string
}): string {
  const { assets, quotes, portfolios, transactions, cashAccounts, priceHistories, globalMarket, news, aiReports, usdPln, eurPln, today } = params
  const toPln = (amount: number, currency: string) =>
    currency === 'PLN' ? amount : currency === 'USD' ? amount * usdPln : currency === 'EUR' ? amount * eurPln : amount

  // --- Portfolio snapshot ---
  let totalValuePLN = 0
  const assetLines: string[] = []
  for (const a of assets) {
    const q = quotes.get(a.ticker)
    if (!q) continue
    const pricePLN = toPln(q.price, q.currency)
    const valuePLN = pricePLN * a.quantity
    totalValuePLN += valuePLN
    const purchasePLN = toPln(a.purchase_price, a.currency)
    const pnl = purchasePLN > 0 ? ((pricePLN - purchasePLN) / purchasePLN * 100).toFixed(1) : '0.0'
    const ch = q.changePercent >= 0 ? `+${q.changePercent.toFixed(2)}%` : `${q.changePercent.toFixed(2)}%`
    const pnlStr = parseFloat(pnl) >= 0 ? `+${pnl}%` : `${pnl}%`
    assetLines.push(`  ${a.ticker} (${a.name}): ${a.quantity} szt. × ${q.price.toFixed(2)} ${q.currency} = ${valuePLN.toFixed(0)} PLN | P&L: ${pnlStr} | Dziś: ${ch}${a.purchase_date ? ` | Zakup: ${a.purchase_date}` : ''}`)
  }

  const sections: string[] = [
    `Jesteś asystentem finansowym z pełnym dostępem do portfela inwestycyjnego użytkownika. Odpowiadaj WYŁĄCZNIE po polsku. Używaj markdown do formatowania. Data: ${today}.`,
    '',
    `=== PORTFEL (${today}) ===`,
    `Łączna wartość: ~${totalValuePLN.toFixed(0)} PLN | USD/PLN: ${usdPln.toFixed(2)} | EUR/PLN: ${eurPln.toFixed(2)}`,
    ...assetLines,
  ]

  const pfLines = portfolios.map(p => {
    const tags = p.tags ? JSON.parse(p.tags) as string[] : []
    return `  ${p.name}${tags.length ? ' [' + tags.join(', ') + ']' : ''}`
  })
  if (pfLines.length > 0) sections.push('', 'PORTFELE:', ...pfLines)

  const cashLines = cashAccounts.filter(c => c.balance !== 0).map(c => `  ${c.currency}: ${c.balance.toFixed(2)}`)
  if (cashLines.length > 0) sections.push('', 'GOTÓWKA:', ...cashLines)

  // --- Transactions (last 12 months) ---
  const cutoffDate = new Date()
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 1)
  const cutoff = cutoffDate.toISOString().split('T')[0]
  const recentTx = transactions.filter(t => t.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60)
  if (recentTx.length > 0) {
    const txLines = recentTx.map(t => {
      const fee = t.fee > 0 ? `, prowizja ${t.fee} ${t.fee_type === 'percent' ? '%' : t.currency}` : ''
      return `  ${t.date} ${t.type.toUpperCase()} ${t.ticker}: ${t.quantity} szt. × ${t.price} ${t.currency}${fee}`
    })
    sections.push('', `=== TRANSAKCJE (ostatnie 12 mies., ${recentTx.length} pozycji) ===`, ...txLines)
  }

  // --- Price histories ---
  if (priceHistories.size > 0) {
    sections.push('', '=== HISTORIA CEN (miesięczna, wybrane spółki) ===')
    for (const [ticker, monthly] of priceHistories.entries()) {
      const asset = assets.find(a => a.ticker === ticker)
      sections.push(`\n${ticker} (${asset?.name ?? ticker}):`)
      sections.push('  Miesiąc  | Otwarcie | Zamknięcie | Zmiana')
      for (const m of monthly) {
        const ch = m.changePercent >= 0 ? `+${m.changePercent.toFixed(1)}%` : `${m.changePercent.toFixed(1)}%`
        sections.push(`  ${m.month}  | ${m.open.toFixed(2)} | ${m.close.toFixed(2)} | ${ch}`)
      }
    }
  }

  // --- Macro ---
  if (globalMarket) {
    const m = globalMarket
    const vixLevel = m.indices.VIX.price < 15 ? 'spokój' : m.indices.VIX.price < 25 ? 'umiarkowany' : m.indices.VIX.price < 35 ? 'wysoki' : 'panika'
    sections.push(
      '', '=== MAKROEKONOMIA ===',
      `  VIX: ${m.indices.VIX.price.toFixed(1)} (${vixLevel}) | US10Y: ${m.bonds.US10Y.price.toFixed(2)}%`,
      `  S&P500: ${m.indices.SP500.price.toFixed(0)} (${m.indices.SP500.changePercent >= 0 ? '+' : ''}${m.indices.SP500.changePercent.toFixed(2)}% dziś, ${m.indices.SP500.change1m >= 0 ? '+' : ''}${m.indices.SP500.change1m.toFixed(1)}% 30d)`,
      `  WIG20: ${m.indices.WIG20.price.toFixed(0)} (${m.indices.WIG20.changePercent >= 0 ? '+' : ''}${m.indices.WIG20.changePercent.toFixed(2)}% dziś, ${m.indices.WIG20.change1m >= 0 ? '+' : ''}${m.indices.WIG20.change1m.toFixed(1)}% 30d)`,
      `  DAX: ${m.indices.DAX.price.toFixed(0)} (${m.indices.DAX.change1m >= 0 ? '+' : ''}${m.indices.DAX.change1m.toFixed(1)}% 30d)`,
      `  Złoto: $${m.commodities.gold.price.toFixed(0)} (${m.commodities.gold.change1m >= 0 ? '+' : ''}${m.commodities.gold.change1m.toFixed(1)}% 30d)`,
      `  Ropa: $${m.commodities.oil.price.toFixed(1)} (${m.commodities.oil.change1m >= 0 ? '+' : ''}${m.commodities.oil.change1m.toFixed(1)}% 30d)`,
      `  EUR/USD: ${m.currencies.EURUSD.price.toFixed(4)} | USD/PLN: ${usdPln.toFixed(2)}`
    )
  }

  // --- News ---
  if (news.length > 0) {
    const newsLines = news.map(n => `  [${n.pub_date?.slice(0, 10) ?? '?'}] ${n.source ?? ''}: ${n.title}${n.description ? ' — ' + n.description.slice(0, 120) : ''}`)
    sections.push('', `=== POWIĄZANE WIADOMOŚCI (${news.length}) ===`, ...newsLines)
  }

  // --- AI reports ---
  const reportLines: string[] = []
  for (const r of aiReports) {
    if (r.ticker === '__PORTFOLIO__') continue
    const truncated = r.report_text.length > 2000 ? r.report_text.slice(0, 2000) + '...' : r.report_text
    reportLines.push(`\n--- Analiza ${r.ticker} (${r.created_at.slice(0, 10)}) ---\n${truncated}`)
  }
  if (reportLines.length > 0) sections.push('', '=== RAPORTY AI (ostatnie analizy) ===', ...reportLines)

  sections.push('', '---', 'Odpowiadaj konkretnie, powołując się na powyższe dane. Nie wymyślaj liczb których nie masz w kontekście.')
  return sections.join('\n')
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Finance Portfolio Tracker',
    backgroundColor: '#111827',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  // ── portfolios ────────────────────────────────────────────────────────────
  ipcMain.handle('db:portfolios:getAll', () => getPortfolios())
  ipcMain.handle('db:portfolios:create', (_event, { name }) => createPortfolio(name))
  ipcMain.handle('db:portfolios:rename', (_event, { id, name }) => { renamePortfolio(id, name); return { success: true } })
  ipcMain.handle('db:portfolios:delete', (_event, { id }) => { deletePortfolio(id); return { success: true } })
  ipcMain.handle('db:portfolios:updateTags', (_event, { id, tags }) => { updatePortfolioTags(id, tags); return { success: true } })

  // ── cash ──────────────────────────────────────────────────────────────────
  ipcMain.handle('db:cash:getAccounts', (_event, { portfolioId } = {}) => getCashAccounts(portfolioId))
  ipcMain.handle('db:cash:addTransaction', (_event, data) => addCashTransaction(data))
  ipcMain.handle('db:cash:getTransactions', (_event, { portfolioId } = {}) => getCashTransactions(portfolioId))

  // ── portfolio_assets ──────────────────────────────────────────────────────
  ipcMain.handle('db:assets:getAll', (_event, portfolioId?: number) => {
    return getAllAssets(portfolioId)
  })

  ipcMain.handle('db:assets:add', (_event, asset) => {
    return addAsset(asset)
  })

  ipcMain.handle('db:assets:update', (_event, id, updates) => {
    return updateAsset(id, updates)
  })

  ipcMain.handle('db:assets:delete', (_event, id) => {
    deleteAsset(id)
    return { success: true }
  })

  // ── transactions ──────────────────────────────────────────────────────────
  ipcMain.handle('db:transactions:getAll', () => {
    return getAllTransactions()
  })

  ipcMain.handle('db:transactions:getByTicker', (_event, ticker) => {
    return getTransactionsByTicker(ticker)
  })

  ipcMain.handle('db:transactions:add', (_event, tx) => {
    return addTransaction(tx)
  })

  ipcMain.handle('db:transactions:update', (_event, id, updates) => {
    return updateTransaction(id, updates)
  })

  ipcMain.handle('db:transactions:delete', (_event, id) => {
    deleteTransaction(id)
    return { success: true }
  })

  // ── ai_reports ────────────────────────────────────────────────────────────
  ipcMain.handle('db:reports:getAll', () => {
    return getAllReports()
  })

  ipcMain.handle('db:reports:getLatestByTicker', (_event, ticker) => {
    return getLatestReportByTicker(ticker)
  })

  ipcMain.handle('db:reports:add', (_event, report) => {
    return addReport(report)
  })

  // ── settings ──────────────────────────────────────────────────────────────
  ipcMain.handle('db:settings:get', (_event, key) => {
    return getSetting(key)
  })

  ipcMain.handle('db:settings:set', (_event, key, value) => {
    setSetting(key, value)
    return { success: true }
  })

  ipcMain.handle('db:settings:getAll', () => {
    return getAllSettings()
  })

  // ── finance (yahoo-finance2 + technicalindicators) ─────────────────────────
  ipcMain.handle('finance:quote', (_event, ticker: string) =>
    fetchQuote(ticker)
  )

  ipcMain.handle('finance:history', (_event, ticker: string, period: HistoryPeriod) =>
    fetchHistory(ticker, period)
  )

  ipcMain.handle('finance:search', (_event, query: string) =>
    searchTickers(query)
  )

  ipcMain.handle('finance:fundamentals', (_event, ticker: string) =>
    fetchFundamentals(ticker)
  )

  ipcMain.handle('finance:dividends', (_event, ticker: string) =>
    fetchDividends(ticker)
  )

  ipcMain.handle('finance:technicals', async (_event, ticker: string, period: HistoryPeriod) => {
    const candles = await fetchHistory(ticker, period)
    return calculateTechnicals(candles)
  })

  ipcMain.handle('finance:assetMeta', (_event, ticker: string) =>
    fetchAssetMeta(ticker)
  )

  ipcMain.handle('finance:portfolioHistory', async (_event, portfolioId?: number, period?: string) => {
    const assets = getAllAssets(portfolioId)
    return fetchPortfolioHistory(assets, period ?? '1y')
  })

  // ── AI (OpenRouter) ───────────────────────────────────────────────────────
  ipcMain.handle('ai:analyzeStock', async (_, ticker: string) => {
    const apiKey = getSetting('openrouter_api_key')
    if (!apiKey) throw new Error('Brak klucza API OpenRouter. Skonfiguruj go w Ustawieniach.')

    // Sprawdź czy ticker to fizyczny metal w portfelu
    const assetInDb = getAllAssets().find(a => a.ticker === ticker)

    const [fundamentals, history, quote] = await Promise.all([
      fetchFundamentals(ticker),
      fetchHistory(ticker, '1y'),
      fetchQuote(ticker),
    ])
    const technicals = calculateTechnicals(history)

    const reportText = await analyzeStock({
      ticker,
      apiKey,
      name: quote.name,
      currentPrice: quote.price,
      currency: quote.currency,
      fundamentals,
      technicals,
      gold_grams: assetInDb?.gold_grams ?? null,
    })

    return addReport({ ticker, model: WORKER_MODEL, report_text: reportText })
  })

  // ── news (RSS) + auto-archiwizacja ────────────────────────────────────────
  ipcMain.handle('news:fetchRegion', async (_event, region: NewsRegion) => {
    const items = await fetchNewsForRegion(region)
    try {
      archiveNews(items.map(item => ({
        title: item.title,
        description: item.description,
        source: item.source,
        link: item.link,
        pubDate: item.pubDate,
      })), region)
    } catch { /* archiving best-effort — nie blokuj fetch */ }
    return items
  })

  // ── AI Chat (RAG Agent) ────────────────────────────────────────────────────
  ipcMain.handle('ai:chat', async (_event, messages: ChatMessage[]) => {
    const apiKey = getSetting('openrouter_api_key')
    if (!apiKey) throw new Error('Brak klucza API OpenRouter. Skonfiguruj go w Ustawieniach.')

    const assets = getAllAssets()
    if (assets.length === 0) throw new Error('Portfel jest pusty. Dodaj aktywa, aby korzystać z AI Agent.')

    const question = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''

    // Kursy walut
    const [usdPlnQ, eurPlnQ] = await Promise.all([
      fetchQuote('USDPLN=X').catch(() => ({ price: 4.0, currency: 'PLN', changePercent: 0 })),
      fetchQuote('EURPLN=X').catch(() => ({ price: 4.3, currency: 'PLN', changePercent: 0 })),
    ])
    const usdPln = usdPlnQ.price
    const eurPln = eurPlnQ.price
    const toPln = (amount: number, currency: string) =>
      currency === 'PLN' ? amount : currency === 'USD' ? amount * usdPln : currency === 'EUR' ? amount * eurPln : amount

    // Aktualne kursy wszystkich aktywów
    const quoteMap = new Map<string, { price: number; currency: string; changePercent: number }>()
    await Promise.all(assets.map(async a => {
      try {
        const q = await fetchQuote(a.ticker)
        quoteMap.set(a.ticker, { price: q.price, currency: q.currency, changePercent: q.changePercent })
      } catch { /* pomiń nieudane */ }
    }))

    // Wybierz tickery do historii cen: wspomniane w pytaniu + TOP 5 wg wartości
    const assetValues = assets
      .map(a => {
        const q = quoteMap.get(a.ticker)
        const price = q ? toPln(q.price, q.currency) : toPln(a.purchase_price, a.currency)
        return { ticker: a.ticker, name: a.name, valuePLN: price * a.quantity }
      })
      .sort((a, b) => b.valuePLN - a.valuePLN)

    const mentionedTickers = assets
      .map(a => a.ticker)
      .filter(t => {
        const base = t.split('.')[0].replace(/[.+^${}()|[\]\\]/g, '\\$&')
        return new RegExp(`\\b${base}\\b`, 'i').test(question)
      })
    const selectedTickers = [...new Set([...mentionedTickers, ...assetValues.slice(0, 5).map(a => a.ticker)])].slice(0, 5)

    // Historia cen (2y monthly) dla wybranych tickerów
    const priceHistories = new Map<string, ReturnType<typeof aggregateToMonthly>>()
    await Promise.all(selectedTickers.map(async ticker => {
      try {
        const candles = await fetchHistory(ticker, '2y')
        priceHistories.set(ticker, aggregateToMonthly(candles))
      } catch { /* pomiń */ }
    }))

    // Dane makro
    let globalMarket: Awaited<ReturnType<typeof fetchGlobalMarketData>> | null = null
    try { globalMarket = await fetchGlobalMarketData() } catch { /* pomiń */ }

    // Newsy z archiwum (FTS5)
    const newsQuery = buildNewsQuery(question, assetValues.slice(0, 5))
    const relevantNews = newsQuery ? searchNews(newsQuery, 15) : []

    // Raporty AI + dane DB
    const aiReports = getAllReports().slice(0, 10)
    const transactions = getAllTransactions()
    const portfolios = getPortfolios()
    const cashAccounts = getCashAccounts()

    // Zbuduj system context
    const systemContext = buildChatSystemContext({
      assets,
      quotes: quoteMap,
      portfolios,
      transactions,
      cashAccounts,
      priceHistories,
      globalMarket: globalMarket ? {
        indices: {
          VIX: globalMarket.indices.VIX,
          SP500: globalMarket.indices.SP500,
          WIG20: globalMarket.indices.WIG20,
          DAX: globalMarket.indices.DAX,
        },
        bonds: globalMarket.bonds,
        commodities: {
          gold: globalMarket.commodities.gold,
          oil: globalMarket.commodities.oil,
        },
        currencies: { EURUSD: globalMarket.currencies.EURUSD },
      } : null,
      news: relevantNews,
      aiReports,
      usdPln,
      eurPln,
      today: new Date().toISOString().split('T')[0],
    })

    // Konserwacja: usuń stare newsy
    pruneOldNews(90)

    return chatWithPortfolio(messages, systemContext, apiKey)
  })

  // ── global market ─────────────────────────────────────────────────────────
  ipcMain.handle('finance:globalMarket', async () => {
    const marketData = await fetchGlobalMarketData()
    const regime = detectMarketRegime(marketData)
    const regions = computeGlobalScores(marketData, regime)
    return { regions, marketData, computedAt: marketData.fetchedAt, regime }
  })

  ipcMain.handle('ai:analyzeRegion', async (_event, regionId: string, newsHeadlines: string[]) => {
    const apiKey = getSetting('openrouter_api_key')
    if (!apiKey) throw new Error('Brak klucza API OpenRouter. Skonfiguruj go w Ustawieniach.')
    const marketData = await fetchGlobalMarketData()
    const regime = detectMarketRegime(marketData)
    const regions = computeGlobalScores(marketData, regime)
    const region = regions.find(r => r.id === regionId)
    if (!region) throw new Error(`Nieznany region: ${regionId}`)
    const text = await analyzeRegion({ apiKey, region, marketData, newsHeadlines })
    return { text, model: WORLD_MODEL }
  })

  ipcMain.handle('ai:analyzePortfolio', async () => {
    const apiKey = getSetting('openrouter_api_key')
    if (!apiKey) throw new Error('Brak klucza API OpenRouter.')

    const assets = getAllAssets()
    if (assets.length === 0) throw new Error('Portfel jest pusty.')

    // Pobierz kursy walut — wszystkie wartości będą w PLN dla spójności
    const [usdPlnQ, eurPlnQ] = await Promise.all([
      fetchQuote('USDPLN=X').catch(() => ({ price: 4.0 } as { price: number })),
      fetchQuote('EURPLN=X').catch(() => ({ price: 4.3 } as { price: number })),
    ])
    const usdPln = usdPlnQ.price
    const eurPln = eurPlnQ.price
    const toPln = (amount: number, currency: string) =>
      currency === 'PLN' ? amount : currency === 'USD' ? amount * usdPln : currency === 'EUR' ? amount * eurPln : amount

    const enrichedAssets: Array<{
      ticker: string
      name: string
      quantity: number
      currentPrice: number
      purchasePrice: number
      currency: string
      portfolioSharePercent: number
      workerReport: string
      gold_grams: number | null
    }> = []

    for (const asset of assets) {
      let report = getLatestReportByTicker(asset.ticker)
      if (!report) {
        const [fundamentals, history, quote] = await Promise.all([
          fetchFundamentals(asset.ticker),
          fetchHistory(asset.ticker, '1y'),
          fetchQuote(asset.ticker),
        ])
        const technicals = calculateTechnicals(history)
        const reportText = await analyzeStock({
          ticker: asset.ticker,
          apiKey,
          name: quote.name,
          currentPrice: quote.price,
          currency: quote.currency,
          fundamentals,
          technicals,
          gold_grams: asset.gold_grams ?? null,
        })
        report = addReport({ ticker: asset.ticker, model: WORKER_MODEL, report_text: reportText })
      }
      const quote = await fetchQuote(asset.ticker)
      // Dla metali fizycznych: spot USD/oz → cena USD/monetę → PLN/monetę
      const ozPerCoin = asset.gold_grams ? gramsToTroyOz(asset.gold_grams) : null
      const currentPriceUSD = ozPerCoin ? quote.price * ozPerCoin : quote.price
      const currentPricePLN = toPln(currentPriceUSD, ozPerCoin ? 'USD' : quote.currency)
      const purchasePricePLN = toPln(asset.purchase_price, asset.currency)
      enrichedAssets.push({
        ticker: asset.ticker,
        name: asset.name,
        quantity: asset.quantity,
        currentPrice: currentPricePLN,
        purchasePrice: purchasePricePLN,
        currency: 'PLN',
        portfolioSharePercent: 0,
        workerReport: report.report_text,
        gold_grams: asset.gold_grams ?? null,
      })
    }

    const totalValuePLN = enrichedAssets.reduce((sum, a) => sum + a.quantity * a.currentPrice, 0)
    const totalCostPLN  = enrichedAssets.reduce((sum, a) => sum + a.quantity * a.purchasePrice, 0)
    enrichedAssets.forEach(a => {
      a.portfolioSharePercent = (a.quantity * a.currentPrice / totalValuePLN) * 100
    })

    const portfoliosList = getPortfolios()
    const reportText = await analyzePortfolio({
      apiKey,
      assets: enrichedAssets,
      totalValuePLN,
      totalPnlPercent: totalCostPLN > 0 ? ((totalValuePLN - totalCostPLN) / totalCostPLN) * 100 : 0,
      portfolios: portfoliosList.map(p => ({
        id: p.id,
        name: p.name,
        tags: p.tags ? JSON.parse(p.tags) : [],
      })),
    })

    return addReport({ ticker: '__PORTFOLIO__', model: MANAGER_MODEL, report_text: reportText })
  })
}

app.whenReady().then(() => {
  // Inicjalizuj bazę PRZED otwarciem okna
  initDatabase()
  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
