// electron/main/index.ts
import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join, dirname } from 'path'

// Tryb portable — dane obok .exe w folderze "Data/" zamiast %APPDATA%
if (app.isPackaged) {
  app.setPath('userData', join(dirname(app.getPath('exe')), 'Data'))
}
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
import { computeGlobalScores, detectMarketRegime, buildRegimeSummary } from './globalScore'
import type { HistoryPeriod, GlobalMarketData, MarketRegime, FundamentalData } from '../../src/lib/types'
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
  deleteTransactionsByTicker,
  getTransactionById,
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
  deleteCashTransaction,
  archiveNews,
  searchNews,
  pruneOldNews,
  getAssetById,
  upsertCpi,
  getCpiForYear,
  getNbpRateForDate,
  upsertNbpRate,
  getCachedBondRate,
  cacheBondRate,
  getCachedBondMargin,
  cacheBondMargin,
  getCpiForMonth,
  upsertMonthlyCpi,
  getStooqMarkedMonthlyCpi,
  getScreenerCache,
  upsertScreenerEntry,
  clearScreenerCache,
  getScreenerMetadata,
  upsertScreenerMetadata,
  type DBNewsItem,
  type DBPortfolioAsset,
  type DBPortfolio,
  type DBCashAccount,
  type DBCashTransaction,
  type DBTransaction,
  type DBAIReport,
} from './database'
import { analyzeStock, analyzePortfolio, analyzeRegion, chatWithPortfolio, WORKER_MODEL, MANAGER_MODEL, WORLD_MODEL, type ChatMessage, type GlobalMacroContext } from './ai'
import { calculateBondValue, fetchNbpRates, fetchBondYear1Rate, fetchGusAnnualCpi, fetchGusMonthCpi, fetchStooqMonthCpi } from './bonds'
import { fetchAndScoreExchange, EXCHANGE_CONFIG } from './stockScreener'
import type { StockScoringResult } from '../../src/lib/types'
import { fetchNewsForRegion } from './news'
import type { NewsRegion } from './news'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMacroContext(m: GlobalMarketData, regime: MarketRegime): GlobalMacroContext {
  return {
    vix: m.indices.VIX.price,
    us10y: m.bonds.US10Y.price,
    sp500Change1m: m.indices.SP500.change1m,
    oil: { price: m.commodities.oil.price, change1m: m.commodities.oil.change1m },
    brent: { price: m.commodities.brent.price, change1m: m.commodities.brent.change1m },
    gold: { price: m.commodities.gold.price, change1m: m.commodities.gold.change1m },
    copper: { change1m: m.commodities.copper.change1m },
    gas: { change1m: m.commodities.gas.change1m },
    nikkeiChange1m: m.indices.Nikkei.change1m,
    ftseChange1m: m.indices.FTSE.change1m,
    regimeSummary: buildRegimeSummary(regime),
  }
}

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

/** Liczy średni ważony kurs zakupu i P&L dla konta gotówkowego */
function calcCashPnl(
  cashTxs: DBCashTransaction[],
  portfolioId: number,
  currency: string,
  currentRatePln: number
): { avgRate: number; trackedAmount: number; pnl: number; pnlPct: number } | null {
  if (currency === 'PLN') return null
  const deposits = cashTxs.filter(
    t => t.portfolio_id === portfolioId && t.currency === currency && t.type === 'deposit' && t.purchase_rate != null
  )
  if (deposits.length === 0) return null
  const trackedAmount = deposits.reduce((s, t) => s + t.amount, 0)
  const totalCost = deposits.reduce((s, t) => s + t.amount * (t.purchase_rate ?? 0), 0)
  const avgRate = totalCost / trackedAmount
  const pnl = trackedAmount * (currentRatePln - avgRate)
  const pnlPct = ((currentRatePln / avgRate) - 1) * 100
  return { avgRate, trackedAmount, pnl, pnlPct }
}

/** Buduje system prompt z pełnym kontekstem portfela dla AI Agenta */
function buildChatSystemContext(params: {
  assets: DBPortfolioAsset[]
  quotes: Map<string, { price: number; currency: string; changePercent: number }>
  portfolios: DBPortfolio[]
  transactions: DBTransaction[]
  cashAccounts: DBCashAccount[]
  cashTransactions: DBCashTransaction[]
  priceHistories: Map<string, ReturnType<typeof aggregateToMonthly>>
  globalMarket: GlobalMarketData | null
  regime: MarketRegime | null
  news: DBNewsItem[]
  aiReports: DBAIReport[]
  usdPln: number
  eurPln: number
  today: string
  bondValues?: Map<number, { totalValue: number; bondYearNum: number; currentYearRate: number; maturityDate: string; isMatured: boolean }>
  fundamentals?: Map<string, FundamentalData>
}): string {
  const { assets, quotes, portfolios, transactions, cashAccounts, cashTransactions, priceHistories, globalMarket, regime, news, aiReports, usdPln, eurPln, today, bondValues, fundamentals } = params
  const toPln = (amount: number, currency: string) =>
    currency === 'PLN' ? amount : currency === 'USD' ? amount * usdPln : currency === 'EUR' ? amount * eurPln : amount

  // --- Portfolio snapshot ---
  let totalValuePLN = 0
  const assetLines: string[] = []
  for (const a of assets) {
    if (a.asset_type === 'bond') continue  // obligacje obsługiwane osobno poniżej
    const q = quotes.get(a.ticker)
    if (!q) continue
    // Dla metali fizycznych: cena spot USD/oz × oz/monetę → cena USD/monetę
    const ozPerCoin = a.gold_grams ? gramsToTroyOz(a.gold_grams) : null
    const priceInCurrency = ozPerCoin ? q.price * ozPerCoin : q.price
    const pricePLN = toPln(priceInCurrency, ozPerCoin ? 'USD' : q.currency)
    const valuePLN = pricePLN * a.quantity
    totalValuePLN += valuePLN
    const purchasePLN = toPln(a.purchase_price, a.currency)
    const pnl = purchasePLN > 0 ? ((pricePLN - purchasePLN) / purchasePLN * 100).toFixed(1) : '0.0'
    const ch = q.changePercent >= 0 ? `+${q.changePercent.toFixed(2)}%` : `${q.changePercent.toFixed(2)}%`
    const pnlStr = parseFloat(pnl) >= 0 ? `+${pnl}%` : `${pnl}%`
    assetLines.push(`  ${a.ticker} (${a.name}): ${a.quantity} szt. × ${priceInCurrency.toFixed(2)} ${ozPerCoin ? 'USD' : q.currency} = ${valuePLN.toFixed(0)} PLN | P&L: ${pnlStr} | Dziś: ${ch}${a.purchase_date ? ` | Zakup: ${a.purchase_date}` : ''}`)
  }

  // Obligacje skarbowe — brak kwotowań Yahoo Finance, wycena z DB
  const bondAssets = assets.filter(a => a.asset_type === 'bond')
  const bondLines: string[] = []
  for (const a of bondAssets) {
    const bv = bondValues?.get(a.id)
    const costBasis = a.quantity * 100
    if (bv) {
      totalValuePLN += bv.totalValue
      const pnlPLN = bv.totalValue - costBasis
      bondLines.push(`  ${a.ticker} (${a.name}): ${a.quantity} szt. × 100 PLN = ${bv.totalValue.toFixed(0)} PLN | P&L: ${pnlPLN >= 0 ? '+' : ''}${pnlPLN.toFixed(2)} PLN | Rok ${bv.bondYearNum}, stopa ${(bv.currentYearRate * 100).toFixed(2)}%, zapada ${bv.maturityDate}${bv.isMatured ? ' [ZAPADŁA]' : ''}`)
    } else {
      totalValuePLN += costBasis
      bondLines.push(`  ${a.ticker} (${a.name}): ${a.quantity} szt. × 100 PLN = ${costBasis} PLN nominał, zakup ${a.purchase_date ?? '?'}, zapada ${a.bond_maturity_date ?? '?'}, opr. roku 1: ${a.bond_year1_rate?.toFixed(2) ?? '?'}% [CPI pending]`)
    }
  }

  const sections: string[] = [
    `Jesteś asystentem finansowym z pełnym dostępem do portfela inwestycyjnego użytkownika. Odpowiadaj WYŁĄCZNIE po polsku. Używaj markdown do formatowania. Data: ${today}.`,
    '',
    `=== PORTFEL (${today}) ===`,
    `Łączna wartość aktywów: ~${totalValuePLN.toFixed(0)} PLN | USD/PLN: ${usdPln.toFixed(2)} | EUR/PLN: ${eurPln.toFixed(2)}`,
    ...assetLines,
    ...(bondLines.length > 0 ? ['', `OBLIGACJE SKARBOWE (${bondLines.length} poz.):`, ...bondLines] : []),
  ]

  const pfLines = portfolios.map(p => {
    const tags = p.tags ? JSON.parse(p.tags) as string[] : []
    return `  ${p.name}${tags.length ? ' [' + tags.join(', ') + ']' : ''}`
  })
  if (pfLines.length > 0) sections.push('', 'PORTFELE:', ...pfLines)

  let cashTotalPLN = 0
  const cashLines = cashAccounts
    .filter(c => c.balance !== 0)
    .map(c => {
      const currentRatePln = toPln(1, c.currency)
      const valuePLN = c.balance * currentRatePln
      cashTotalPLN += valuePLN
      const plnNote = c.currency !== 'PLN' ? ` (~${valuePLN.toFixed(0)} PLN)` : ''
      const pnl = calcCashPnl(cashTransactions, c.portfolio_id, c.currency, currentRatePln)
      const pnlNote = pnl
        ? ` | P&L: ${pnl.pnl >= 0 ? '+' : ''}${pnl.pnl.toFixed(2)} PLN (${pnl.pnlPct >= 0 ? '+' : ''}${pnl.pnlPct.toFixed(2)}%, kurs zakupu: ${pnl.avgRate.toFixed(4)}, obecny: ${currentRatePln.toFixed(4)}, śledzone: ${pnl.trackedAmount.toFixed(2)} ${c.currency})`
        : ''
      return `  ${c.currency}: ${c.balance.toFixed(2)}${plnNote}${pnlNote}`
    })
  sections.push('', 'GOTÓWKA (konta gotówkowe):',
    ...(cashLines.length > 0 ? cashLines : ['  brak depozytów gotówkowych']),
    `  Razem gotówka: ~${cashTotalPLN.toFixed(0)} PLN`,
    `ŁĄCZNIE (aktywa + gotówka): ~${(totalValuePLN + cashTotalPLN).toFixed(0)} PLN`,
  )

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
    const ch = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
    const regimeLine = regime ? buildRegimeSummary(regime) : null
    sections.push(
      '', '=== MAKROEKONOMIA ===',
      `  VIX: ${m.indices.VIX.price.toFixed(1)} (${vixLevel}) | US10Y: ${m.bonds.US10Y.price.toFixed(2)}%`,
      `  S&P500: ${m.indices.SP500.price.toFixed(0)} (${m.indices.SP500.changePercent >= 0 ? '+' : ''}${m.indices.SP500.changePercent.toFixed(2)}% dziś, ${ch(m.indices.SP500.change1m)} 30d) | WIG20: ${m.indices.WIG20.price.toFixed(0)} (${ch(m.indices.WIG20.change1m)} 30d)`,
      `  DAX: ${m.indices.DAX.price.toFixed(0)} (${ch(m.indices.DAX.change1m)} 30d) | Nikkei: ${m.indices.Nikkei.price.toFixed(0)} (${ch(m.indices.Nikkei.change1m)} 30d) | FTSE: ${m.indices.FTSE.price.toFixed(0)} (${ch(m.indices.FTSE.change1m)} 30d)`,
      `  Ropa WTI: $${m.commodities.oil.price.toFixed(1)} (${ch(m.commodities.oil.change1m)} 30d) | Ropa Brent: $${m.commodities.brent.price.toFixed(1)} (${ch(m.commodities.brent.change1m)} 30d) | Złoto: $${m.commodities.gold.price.toFixed(0)} (${ch(m.commodities.gold.change1m)} 30d) | Miedź 30d: ${ch(m.commodities.copper.change1m)} | Gaz 30d: ${ch(m.commodities.gas.change1m)}`,
      `  EUR/USD: ${m.currencies.EURUSD.price.toFixed(4)} | USD/PLN: ${usdPln.toFixed(2)}`,
      ...(regimeLine ? [`  Reżim rynkowy: ${regimeLine}`] : [])
    )
  }

  // --- News ---
  if (news.length > 0) {
    const newsLines = news.map(n => `  [${n.pub_date?.slice(0, 10) ?? '?'}] ${n.source ?? ''}: ${n.title}${n.description ? ' — ' + n.description.slice(0, 120) : ''}`)
    sections.push('', `=== POWIĄZANE WIADOMOŚCI (${news.length}) ===`, ...newsLines)
  }

  // --- AI reports ---
  const portfolioTickers = new Set(assets.map(a => a.ticker))
  const reportLines: string[] = []
  for (const r of aiReports) {
    if (r.ticker === '__PORTFOLIO__') continue
    const inPortfolio = portfolioTickers.has(r.ticker)
    const label = inPortfolio ? '(w portfelu)' : '(NIE w portfelu — tylko analiza)'
    const truncated = r.report_text.length > 2000 ? r.report_text.slice(0, 2000) + '...' : r.report_text
    reportLines.push(`\n--- Analiza ${r.ticker} ${label} (${r.created_at.slice(0, 10)}) ---\n${truncated}`)
  }
  if (reportLines.length > 0) sections.push('', '=== RAPORTY AI (ostatnie analizy) ===', ...reportLines)

  // --- Fundamentals per ticker ---
  if (fundamentals && fundamentals.size > 0) {
    const fmtPct = (v: number | null) => v != null ? `${(v * 100).toFixed(1)}%` : 'brak'
    const fmtMc = (v: number | null) => {
      if (v == null) return 'brak'
      if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`
      if (v >= 1e9)  return `${(v / 1e9).toFixed(2)}B`
      if (v >= 1e6)  return `${(v / 1e6).toFixed(2)}M`
      return v.toFixed(0)
    }
    const fundLines: string[] = []
    for (const [ticker, f] of fundamentals.entries()) {
      const q = quotes.get(ticker)
      const lines: string[] = [`${ticker}:`]
      if (q) lines.push(`  Cena bieżąca: ${q.price.toFixed(2)} ${q.currency} (${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}% dziś)`)
      if (f.pe != null || f.forwardPE != null || f.pegRatio != null)
        lines.push(`  P/E: ${f.pe?.toFixed(2) ?? 'brak'} | Forward P/E: ${f.forwardPE?.toFixed(2) ?? 'brak'} | PEG: ${f.pegRatio?.toFixed(2) ?? 'brak'}`)
      if (f.eps != null)
        lines.push(`  EPS: ${f.eps.toFixed(2)} | Dywidenda: ${f.dividendYield != null ? fmtPct(f.dividendYield) : 'brak'}`)
      if (f.totalRevenue != null)
        lines.push(`  Przychody: ${fmtMc(f.totalRevenue)} (wzrost: ${fmtPct(f.revenueGrowth)}) | Marża netto: ${fmtPct(f.profitMargins)}`)
      if (f.totalDebt != null || f.totalCash != null)
        lines.push(`  Dług: ${fmtMc(f.totalDebt)} | Gotówka: ${fmtMc(f.totalCash)}`)
      if (f.shortPercentOfFloat != null || f.shortRatio != null)
        lines.push(`  Short: ${fmtPct(f.shortPercentOfFloat)} float | ratio: ${f.shortRatio?.toFixed(1) ?? 'brak'} dni`)
      if (f.numberOfAnalysts)
        lines.push(`  Analitycy: ${f.analystRecommendation?.toUpperCase() ?? 'brak'} | cel: ${f.targetMeanPrice?.toFixed(2) ?? 'brak'} | n=${f.numberOfAnalysts}`)
      if (f.earningsHistory?.length) {
        const last = f.earningsHistory[f.earningsHistory.length - 1]
        const surp = last.surprisePercent != null ? ` surprise ${last.surprisePercent >= 0 ? '+' : ''}${(last.surprisePercent * 100).toFixed(1)}%` : ''
        lines.push(`  Ostatni EPS: ${last.period} est.${last.epsEstimate ?? '?'} wynik ${last.epsActual ?? '?'}${surp}`)
      }
      if (f.earningsTrend?.length) {
        const t = f.earningsTrend[0]
        lines.push(`  Prognoza (${t.period}): EPS ~${t.epsEstimate ?? 'brak'}${t.growth != null ? ` wzrost ${t.growth >= 0 ? '+' : ''}${(t.growth * 100).toFixed(1)}%` : ''}`)
      }
      if (f.upgradeDowngradeHistory?.length) {
        const u = f.upgradeDowngradeHistory[0]
        lines.push(`  Ostatni rating: ${u.date} ${u.firm} ${u.fromGrade ? u.fromGrade + '→' : ''}${u.toGrade}`)
      }
      if (f.insiderTransactions?.length) {
        const t = f.insiderTransactions[0]
        lines.push(`  Ostatni insider: ${t.date} ${t.name} (${t.relation}): ${t.transactionText}`)
      }
      fundLines.push(lines.join('\n'))
    }
    sections.push('', '=== DANE FUNDAMENTALNE PER SPÓŁKA ===', ...fundLines)
  }

  sections.push('', '---', 'Odpowiadaj konkretnie, powołując się na powyższe dane. Nie wymyślaj liczb których nie masz w kontekście. Na końcu KAŻDEJ odpowiedzi dołącz obowiązkowo w osobnym akapicie: "---\\n⚠️ *Informacje generowane przez AI mają charakter wyłącznie informacyjny i nie stanowią porady inwestycyjnej ani rekomendacji w rozumieniu przepisów prawa. Decyzje inwestycyjne podejmuj na własną odpowiedzialność — w razie wątpliwości skonsultuj się z licencjonowanym doradcą finansowym.*"')
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
      preload: join(__dirname, '../preload/index.cjs'),
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
  ipcMain.handle('db:cash:deleteTransaction', (_event, { id }) => { deleteCashTransaction(id); return { success: true } })

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
    const assets = getAllAssets()
    const asset = assets.find(a => a.id === id)
    deleteAsset(id)
    if (asset) deleteTransactionsByTicker(asset.ticker)
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
    const tx = getTransactionById(id)
    const result = updateTransaction(id, updates)
    if (tx) {
      const allTxs = getTransactionsByTicker(tx.ticker)
      const buyTxs = allTxs.filter(t => t.type === 'buy')
      const sellTxs = allTxs.filter(t => t.type === 'sell')
      const totalQty = buyTxs.reduce((s, t) => s + t.quantity, 0) - sellTxs.reduce((s, t) => s + t.quantity, 0)
      const totalBuyQty = buyTxs.reduce((s, t) => s + t.quantity, 0)
      const avgPrice = totalBuyQty > 0 ? buyTxs.reduce((s, t) => s + t.quantity * t.price, 0) / totalBuyQty : 0
      const assets = getAllAssets()
      const asset = assets.find(a => a.ticker === tx.ticker)
      if (asset) {
        if (totalQty <= 0.000001) {
          deleteAsset(asset.id)
        } else {
          updateAsset(asset.id, { quantity: totalQty, purchase_price: avgPrice })
        }
      }
    }
    return result
  })

  ipcMain.handle('db:transactions:delete', (_event, id) => {
    const tx = getTransactionById(id)
    deleteTransaction(id)
    if (tx) {
      const assets = getAllAssets()
      const asset = assets.find(a => a.ticker === tx.ticker)
      if (asset) {
        const delta = tx.type === 'buy' ? -tx.quantity : tx.quantity
        const newQty = asset.quantity + delta
        if (newQty <= 0.000001) {
          deleteAsset(asset.id)
        } else {
          updateAsset(asset.id, { quantity: newQty })
        }
      }
    }
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
    const cashTxs = getCashTransactions(portfolioId)
    const bondCalc = (asset: any, date: string): number => {
      try {
        const lookupMargin = () => getCachedBondMargin(asset.ticker)
        return calculateBondValue(asset, date, getCpiForYear, getNbpRateForDate, lookupMargin, getCpiForMonth).totalValue
      } catch {
        return asset.quantity * 100
      }
    }
    return fetchPortfolioHistory(assets, period ?? '1y', cashTxs, bondCalc)
  })

  // ── AI (OpenRouter) ───────────────────────────────────────────────────────
  ipcMain.handle('ai:analyzeStock', async (_, ticker: string) => {
    const apiKey = getSetting('openrouter_api_key')
    if (!apiKey) throw new Error('Brak klucza API OpenRouter. Skonfiguruj go w Ustawieniach.')

    const assetInDb = getAllAssets().find(a => a.ticker === ticker)

    const [fundamentals, history, quote, marketData] = await Promise.all([
      fetchFundamentals(ticker),
      fetchHistory(ticker, '1y'),
      fetchQuote(ticker),
      fetchGlobalMarketData().catch(() => null),
    ])
    const technicals = calculateTechnicals(history)
    const regime = marketData ? detectMarketRegime(marketData) : null
    const newsItems = searchNews(ticker, 8)
    const newsHeadlines = newsItems.map(n => `[${n.pub_date?.slice(0, 10) ?? '?'}] ${n.source ?? ''}: ${n.title}`)

    const reportText = await analyzeStock({
      ticker,
      apiKey,
      name: quote.name,
      currentPrice: quote.price,
      currency: quote.currency,
      fundamentals,
      technicals,
      gold_grams: assetInDb?.gold_grams ?? null,
      marketContext: marketData && regime ? buildMacroContext(marketData, regime) : null,
      newsHeadlines,
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
    const FX_PAIRS_CHAT: [string, string, number][] = [
      ['USD', 'USDPLN=X', 4.0], ['EUR', 'EURPLN=X', 4.3],
      ['CHF', 'CHFPLN=X', 4.5], ['GBP', 'GBPPLN=X', 5.1],
      ['JPY', 'JPYPLN=X', 0.027], ['NOK', 'NOKPLN=X', 0.37], ['SEK', 'SEKPLN=X', 0.38],
    ]
    const chatFxRates = new Map<string, number>([['PLN', 1]])
    await Promise.all(FX_PAIRS_CHAT.map(async ([cur, ticker, fallback]) => {
      try {
        const q = await fetchQuote(ticker)
        chatFxRates.set(cur, q.price ?? fallback)
      } catch { chatFxRates.set(cur, fallback) }
    }))
    const usdPln = chatFxRates.get('USD') ?? 4.0
    const eurPln = chatFxRates.get('EUR') ?? 4.3
    const toPln = (amount: number, currency: string) => amount * (chatFxRates.get(currency) ?? 1)

    // Aktualne kursy aktywów (obligacje pomijamy — brak kwotowań Yahoo Finance)
    const quoteMap = new Map<string, { price: number; currency: string; changePercent: number }>()
    await Promise.all(assets.filter(a => a.asset_type !== 'bond').map(async a => {
      try {
        const q = await fetchQuote(a.ticker)
        quoteMap.set(a.ticker, { price: q.price, currency: q.currency, changePercent: q.changePercent })
      } catch { /* pomiń nieudane */ }
    }))

    // Wartości bieżące obligacji (obliczane lokalnie z DB)
    const bondValuesMap = new Map<number, { totalValue: number; bondYearNum: number; currentYearRate: number; maturityDate: string; isMatured: boolean }>()
    const todayForBonds = new Date().toISOString().split('T')[0]
    for (const bond of assets.filter(a => a.asset_type === 'bond')) {
      try {
        const bv = calculateBondValue(bond, todayForBonds, getCpiForYear, getNbpRateForDate, () => getCachedBondMargin(bond.ticker), getCpiForMonth)
        bondValuesMap.set(bond.id, bv)
      } catch { /* PENDING_GUS_DATA lub brak danych */ }
    }

    // Wybierz tickery do historii cen: wspomniane w pytaniu + TOP 5 wg wartości (bez obligacji)
    const assetValues = assets
      .filter(a => a.asset_type !== 'bond')
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

    // Historia cen (2y monthly) + dane fundamentalne dla wybranych tickerów
    const priceHistories = new Map<string, ReturnType<typeof aggregateToMonthly>>()
    const fundamentalsMap = new Map<string, FundamentalData>()
    const stockTickers = selectedTickers.filter(t => !assets.find(a => a.ticker === t && a.asset_type === 'bond'))
    await Promise.all([
      ...stockTickers.map(async ticker => {
        try {
          const candles = await fetchHistory(ticker, '2y')
          priceHistories.set(ticker, aggregateToMonthly(candles))
        } catch { /* pomiń */ }
      }),
      ...stockTickers.map(async ticker => {
        try {
          const f = await fetchFundamentals(ticker)
          fundamentalsMap.set(ticker, f)
        } catch { /* pomiń */ }
      }),
    ])

    // Wykryj dodatkowe tickery spoza portfela wspomniane w pytaniu
    const portfolioTickerSet = new Set(assets.map(a => a.ticker))
    const extraTickers = new Set<string>()

    // 1. Regex: wzorce tickerów pisanych wielkimi literami (np. NVDA, PKN.WA, TSLA)
    const upperMatches = [...question.matchAll(/\b([A-Z]{2,6}(?:\.[A-Z]{1,4})?)\b/g)].map(m => m[1])
    for (const t of upperMatches) {
      if (!portfolioTickerSet.has(t) && !fundamentalsMap.has(t)) extraTickers.add(t)
    }

    // 2. Wyodrębnij pisane wielką literą słowa jako potencjalne nazwy spółek (np. "Apple", "Microsoft", "Orlen")
    //    i wyszukaj każde z osobna w Yahoo Finance
    const IGNORED_WORDS = new Set(['Czy', 'Co', 'Jak', 'Jaka', 'Jakie', 'Jaką', 'Ile', 'Po', 'Na', 'Do', 'Od', 'Ze', 'We', 'To', 'Ten', 'Ta', 'Te', 'Nie', 'Się', 'Jest', 'Są', 'Był', 'Była', 'By', 'Mi', 'Go', 'Jej', 'Jego', 'Ich', 'My', 'Ty', 'Pan', 'Pani', 'Pro', 'Ltd', 'Inc', 'Corp'])
    const capitalizedWords = [...question.matchAll(/\b([A-ZŁŚŻŹĆĄĘÓ][a-złśżźćąęóńA-ZŁŚŻŹĆĄĘÓ]{2,})\b/g)]
      .map(m => m[1])
      .filter(w => !IGNORED_WORDS.has(w))
    const searchCandidates = [...new Set(capitalizedWords)].slice(0, 3)
    await Promise.all(searchCandidates.map(async word => {
      try {
        const searchRes = await searchTickers(word)
        for (const r of searchRes.slice(0, 2)) {
          if (r.ticker && !portfolioTickerSet.has(r.ticker) && !fundamentalsMap.has(r.ticker) && !extraTickers.has(r.ticker)) {
            extraTickers.add(r.ticker)
            break
          }
        }
      } catch { /* pomiń */ }
    }))

    // Fetch fundamentałów + aktualnej ceny dla wykrytych tickerów spoza portfela (max 3)
    await Promise.all([...extraTickers].slice(0, 3).map(async ticker => {
      try {
        const [f, q] = await Promise.all([fetchFundamentals(ticker), fetchQuote(ticker)])
        fundamentalsMap.set(ticker, f)
        quoteMap.set(ticker, { price: q.price, currency: q.currency, changePercent: q.changePercent })
      } catch { /* nieznany ticker — pomiń */ }
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
    const cashTransactions = getCashTransactions()

    const chatRegime = globalMarket ? detectMarketRegime(globalMarket) : null

    // Zbuduj system context
    const systemContext = buildChatSystemContext({
      assets,
      quotes: quoteMap,
      portfolios,
      transactions,
      cashAccounts,
      cashTransactions,
      priceHistories,
      globalMarket,
      regime: chatRegime,
      news: relevantNews,
      aiReports,
      usdPln,
      eurPln,
      today: new Date().toISOString().split('T')[0],
      bondValues: bondValuesMap,
      fundamentals: fundamentalsMap.size > 0 ? fundamentalsMap : undefined,
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

    const allAssets = getAllAssets()
    if (allAssets.length === 0) throw new Error('Portfel jest pusty.')

    // Obligacje nie są analizowane przez Worker AI — mają deterministyczną wycenę
    const bondAssets = allAssets.filter(a => a.asset_type === 'bond')
    const assets = allAssets.filter(a => a.asset_type !== 'bond')

    // Podsumowanie obligacji dla Manager AI
    const todayBonds = new Date().toISOString().split('T')[0]
    let bondTotalPLN = 0
    const bondSummaryLines: string[] = []
    for (const a of bondAssets) {
      const costBasis = a.quantity * 100
      try {
        const bv = calculateBondValue(a, todayBonds, getCpiForYear, getNbpRateForDate, () => getCachedBondMargin(a.ticker), getCpiForMonth)
        bondTotalPLN += bv.totalValue
        const pnlPLN = bv.totalValue - costBasis
        bondSummaryLines.push(`- ${a.ticker} (${a.bond_type}, ${a.name}): ${a.quantity} szt., wartość ${bv.totalValue.toFixed(0)} PLN | P&L: ${pnlPLN >= 0 ? '+' : ''}${pnlPLN.toFixed(2)} PLN | Rok ${bv.bondYearNum}, stopa ${(bv.currentYearRate * 100).toFixed(2)}%, zapada ${bv.maturityDate}`)
      } catch {
        bondTotalPLN += costBasis
        bondSummaryLines.push(`- ${a.ticker} (${a.bond_type}, ${a.name}): ${a.quantity} szt., nominał ${costBasis} PLN [CPI pending]`)
      }
    }
    const bondsSummary = bondSummaryLines.length > 0 ? bondSummaryLines.join('\n') : undefined

    // Pobierz kursy walut — wszystkie wartości będą w PLN dla spójności
    const FX_PAIRS_AI: [string, string, number][] = [
      ['USD', 'USDPLN=X', 4.0], ['EUR', 'EURPLN=X', 4.3],
      ['CHF', 'CHFPLN=X', 4.5], ['GBP', 'GBPPLN=X', 5.1],
      ['JPY', 'JPYPLN=X', 0.027], ['NOK', 'NOKPLN=X', 0.37], ['SEK', 'SEKPLN=X', 0.38],
    ]
    const fxRatesAI = new Map<string, number>([['PLN', 1]])
    await Promise.all(FX_PAIRS_AI.map(async ([cur, ticker, fallback]) => {
      try {
        const q = await fetchQuote(ticker)
        fxRatesAI.set(cur, q.price ?? fallback)
      } catch { fxRatesAI.set(cur, fallback) }
    }))
    const toPln = (amount: number, currency: string) => amount * (fxRatesAI.get(currency) ?? 1)

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

    const stocksValuePLN = enrichedAssets.reduce((sum, a) => sum + a.quantity * a.currentPrice, 0)
    const stocksCostPLN  = enrichedAssets.reduce((sum, a) => sum + a.quantity * a.purchasePrice, 0)

    // Gotówka na kontach
    const cashAccounts = getCashAccounts()
    const cashTxsForAI = getCashTransactions()
    let cashTotalPLN = 0
    const cashSummaryLines: string[] = []
    for (const acc of cashAccounts.filter(c => c.balance !== 0)) {
      const currentRatePln = fxRatesAI.get(acc.currency) ?? 1
      const valuePLN = acc.balance * currentRatePln
      cashTotalPLN += valuePLN
      const plnNote = acc.currency !== 'PLN' ? ` (~${valuePLN.toFixed(0)} PLN)` : ''
      const pnl = calcCashPnl(cashTxsForAI, acc.portfolio_id, acc.currency, currentRatePln)
      const pnlNote = pnl
        ? ` | P&L: ${pnl.pnl >= 0 ? '+' : ''}${pnl.pnl.toFixed(2)} PLN (${pnl.pnlPct >= 0 ? '+' : ''}${pnl.pnlPct.toFixed(2)}%, kurs zakupu: ${pnl.avgRate.toFixed(4)}, obecny: ${currentRatePln.toFixed(4)})`
        : ''
      cashSummaryLines.push(`- ${acc.currency}: ${acc.balance.toFixed(2)}${plnNote}${pnlNote}`)
    }
    const cashSummary = cashSummaryLines.length > 0 ? cashSummaryLines.join('\n') : undefined

    const totalValuePLN = stocksValuePLN + bondTotalPLN + cashTotalPLN
    const totalCostPLN  = stocksCostPLN + bondAssets.reduce((sum, a) => sum + a.quantity * 100, 0)
    // portfolioSharePercent odnosi się do całości (akcje + obligacje + gotówka)
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
      bondsSummary,
      cashSummary,
    })

    return addReport({ ticker: '__PORTFOLIO__', model: MANAGER_MODEL, report_text: reportText })
  })

  // ── obligacje skarbowe ─────────────────────────────────────────────────────
  ipcMain.handle('bonds:getBatchValues', async (_event, assetIds: number[]) => {
    const today = new Date().toISOString().split('T')[0]
    const results = []
    for (const id of assetIds) {
      const asset = getAssetById(id)
      if (!asset || asset.asset_type !== 'bond') { results.push({ id, error: 'not_a_bond' }); continue }
      let attempts = 0
      while (attempts < 4) {
        try {
          const lookupMargin = () => getCachedBondMargin(asset.ticker)
          results.push({ id, ...calculateBondValue(asset, today, getCpiForYear, getNbpRateForDate, lookupMargin, getCpiForMonth) })
          break
        } catch (err) {
          const msg = String(err)
          const pending = msg.match(/PENDING_GUS_DATA:(\d{4})-(\d{2})/)
          if (pending && attempts < 3) {
            if (attempts > 0) await new Promise(r => setTimeout(r, 1000 * attempts))
            const yr = parseInt(pending[1]), mo = parseInt(pending[2])
            const cpi = await fetchGusMonthCpi(yr, mo)
            if (cpi !== null) {
              upsertMonthlyCpi(yr, mo, cpi, 'gus_sdp')
            } else {
              // GUS SDP jeszcze nie ma danych — tymczasowy fallback do stooq
              const stooqCpi = await fetchStooqMonthCpi(yr, mo)
              if (stooqCpi !== null) upsertMonthlyCpi(yr, mo, stooqCpi, 'stooq')
            }
            attempts++
          } else {
            results.push({ id, error: msg }); break
          }
        }
      }
    }
    return results
  })

  ipcMain.handle('bonds:syncNbpRate', async () => {
    const rates = await fetchNbpRates()
    for (const { date, rate } of rates) upsertNbpRate(date, rate)
    return { success: true }
  })

  ipcMain.handle('bonds:updateCpi', (_event, year: number, value: number) => {
    upsertCpi(year, value)
    return { success: true }
  })

  ipcMain.handle('bonds:fetchYear1Rate', async (_event, ticker: string) => {
    const t = ticker.toUpperCase()
    const cachedRate = getCachedBondRate(t)
    const cachedMargin = getCachedBondMargin(t)

    // Dla obligacji indeksowanych inflacją wymagamy też marży w cache
    const needsMargin = /^(COI|EDO|ROS|ROD)/.test(t)
    if (cachedRate !== null && (!needsMargin || cachedMargin !== null)) return cachedRate

    // Pobierz z obligacjeskarbowe.pl (rate + margin zawsze razem)
    const { year1Rate, margin } = await fetchBondYear1Rate(t)
    if (year1Rate !== null) cacheBondRate(t, year1Rate)
    if (margin !== null) cacheBondMargin(t, margin)
    return cachedRate ?? year1Rate
  })

  // ─── Screener (Stock Scoring) ─────────────────────────────────────────────

  ipcMain.handle('screener:fetch', async (_event, { exchange, lookbackDays = 30, forceRefresh = false }: {
    exchange: string
    lookbackDays?: number
    forceRefresh?: boolean
  }) => {
    const cfg = EXCHANGE_CONFIG[exchange]
    if (!cfg) return { exchange, exchangeLabel: exchange, stocks: [], lastFetchedAt: null, isLoading: false, error: `Unknown exchange: ${exchange}` }

    const meta = getScreenerMetadata(exchange)
    const now = Date.now()

    // Sprawdź TTL cache (4h w ciągu dnia, 24h poza godzinami)
    const hour = new Date().getUTCHours()
    const isMarketHours = hour >= 9 && hour < 22
    const ttlMs = isMarketHours ? 4 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
    const cacheStale = !meta
      || meta.lookback_days !== lookbackDays
      || (now - new Date(meta.last_full_fetch).getTime()) > ttlMs

    // Zwróć cache jeśli świeży
    if (!forceRefresh && !cacheStale) {
      const cached = getScreenerCache(exchange)
      if (cached.length > 0) {
        const stocks = cached.map(row => JSON.parse(row.data_json) as StockScoringResult)
        return {
          exchange,
          exchangeLabel: cfg.label,
          stocks,
          lastFetchedAt: meta?.last_full_fetch ?? null,
          isLoading: false,
          error: null,
        }
      }
    }

    // Fetch fresh
    try {
      const stocks = await fetchAndScoreExchange(exchange, { lookbackDays, forceRefresh })

      // Zapisz do cache
      clearScreenerCache(exchange)
      for (const s of stocks) {
        upsertScreenerEntry(exchange, s.ticker, s.name, s.marketCap, JSON.stringify(s))
      }
      upsertScreenerMetadata(exchange, lookbackDays)

      return {
        exchange,
        exchangeLabel: cfg.label,
        stocks,
        lastFetchedAt: new Date().toISOString(),
        isLoading: false,
        error: null,
      }
    } catch (e: any) {
      // Przy błędzie zwróć stary cache jeśli istnieje
      const cached = getScreenerCache(exchange)
      const stocks = cached.map(row => JSON.parse(row.data_json) as StockScoringResult)
      return {
        exchange,
        exchangeLabel: cfg.label,
        stocks,
        lastFetchedAt: meta?.last_full_fetch ?? null,
        isLoading: false,
        error: e?.message ?? 'Fetch failed',
      }
    }
  })
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  // Inicjalizuj bazę PRZED otwarciem okna
  initDatabase()
  registerIpcHandlers()
  createWindow()
  // Synchronizuj stopę NBP asynchronicznie — nie blokuje startu
  fetchNbpRates().then(rates => {
    for (const { date, rate } of rates) upsertNbpRate(date, rate)
  }).catch(() => {})

  // Synchronizuj roczne CPI z GUS BDL — aktualizuje historyczne dane inflacji
  fetchGusAnnualCpi().then(cpiData => {
    for (const { year, value } of cpiData) upsertCpi(year, value)
  }).catch(() => {})

  // Odśwież tymczasowe dane CPI ze stooq gdy GUS SDP już je opublikował
  ;(async () => {
    for (const { year, month } of getStooqMarkedMonthlyCpi()) {
      const cpi = await fetchGusMonthCpi(year, month)
      if (cpi !== null) upsertMonthlyCpi(year, month, cpi, 'gus_sdp')
    }
  })().catch(() => {})


  // Usuń obligacje po dacie zapadalności
  const today = new Date().toISOString().slice(0, 10)
  getAllAssets()
    .filter(a => a.asset_type === 'bond' && a.bond_maturity_date != null && a.bond_maturity_date <= today)
    .forEach(a => deleteAsset(a.id))

  // Pobierz brakujące marże dla obligacji indeksowanych inflacją (np. po upgradezie)
  const INFLATION_TYPES = new Set(['COI', 'EDO', 'ROS', 'ROD'])
  getAllAssets()
    .filter(a => a.asset_type === 'bond' && INFLATION_TYPES.has(a.bond_type ?? '') && getCachedBondMargin(a.ticker) === null)
    .forEach(bond => {
      fetchBondYear1Rate(bond.ticker)
        .then(({ margin }) => { if (margin !== null) cacheBondMargin(bond.ticker, margin) })
        .catch(() => {})
    })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
