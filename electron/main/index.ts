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
} from './database'
import { analyzeStock, analyzePortfolio, analyzeRegion, WORKER_MODEL, MANAGER_MODEL, WORLD_MODEL } from './ai'
import { fetchNewsForRegion } from './news'
import type { NewsRegion } from './news'

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

  // ── news (RSS) ────────────────────────────────────────────────────────────
  ipcMain.handle('news:fetchRegion', (_event, region: NewsRegion) =>
    fetchNewsForRegion(region)
  )

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
