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
} from './finance'
import type { HistoryPeriod } from '../../src/lib/types'
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
  getAllSettings
} from './database'
import { analyzeStock, analyzePortfolio, WORKER_MODEL, MANAGER_MODEL } from './ai'

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
  // ── portfolio_assets ──────────────────────────────────────────────────────
  ipcMain.handle('db:assets:getAll', () => {
    return getAllAssets()
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

  ipcMain.handle('finance:portfolioHistory', async () => {
    const assets = getAllAssets()
    if (assets.length === 0) return []

    const mod = await import('yahoo-finance2')
    const yf = new mod.default()

    const now = new Date()
    const histories = await Promise.all(
      assets.map(async (asset) => {
        try {
          const hist = await yf.historical(asset.ticker, {
            period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
            period2: now,
          })
          return { asset, hist }
        } catch {
          return { asset, hist: [] as any[] }
        }
      })
    )

    let usdPln = 4.0
    let eurPln = 4.3
    try {
      const [u, e] = await Promise.all([
        yf.quoteSummary('USDPLN=X', { modules: ['price'] }),
        yf.quoteSummary('EURPLN=X', { modules: ['price'] }),
      ])
      usdPln = (u.price as any)?.regularMarketPrice ?? 4.0
      eurPln = (e.price as any)?.regularMarketPrice ?? 4.3
    } catch {}

    const toPlnRate = (cur: string) => cur === 'PLN' ? 1 : cur === 'EUR' ? eurPln : usdPln

    const dateSet = new Set<string>()
    histories.forEach(({ hist }) =>
      hist.forEach((h: any) => dateSet.add(h.date.toISOString().split('T')[0]))
    )
    const dates = Array.from(dateSet).sort()

    return dates.map(date => {
      let totalPLN = 0
      histories.forEach(({ asset, hist }) => {
        const purchaseDate = (asset as any).purchase_date ?? (asset.created_at ?? '').split('T')[0]
        if (date < purchaseDate) return
        const entry = hist
          .filter((h: any) => h.date.toISOString().split('T')[0] <= date)
          .at(-1)
        if (entry?.close) {
          totalPLN += asset.quantity * entry.close * toPlnRate(asset.currency)
        }
      })
      return { date, value: totalPLN }
    })
  })

  // ── AI (OpenRouter) ───────────────────────────────────────────────────────
  ipcMain.handle('ai:analyzeStock', async (_, ticker: string) => {
    const apiKey = getSetting('openrouter_api_key')
    if (!apiKey) throw new Error('Brak klucza API OpenRouter. Skonfiguruj go w Ustawieniach.')

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
    })

    return addReport({ ticker, model: WORKER_MODEL, report_text: reportText })
  })

  ipcMain.handle('ai:analyzePortfolio', async () => {
    const apiKey = getSetting('openrouter_api_key')
    if (!apiKey) throw new Error('Brak klucza API OpenRouter.')

    const assets = getAllAssets()
    if (assets.length === 0) throw new Error('Portfel jest pusty.')

    const enrichedAssets: Array<{
      ticker: string
      name: string
      quantity: number
      currentPrice: number
      purchasePrice: number
      currency: string
      portfolioSharePercent: number
      workerReport: string
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
        })
        report = addReport({ ticker: asset.ticker, model: WORKER_MODEL, report_text: reportText })
      }
      const quote = await fetchQuote(asset.ticker)
      enrichedAssets.push({
        ticker: asset.ticker,
        name: asset.name,
        quantity: asset.quantity,
        currentPrice: quote.price,
        purchasePrice: asset.purchase_price,
        currency: quote.currency,
        portfolioSharePercent: 0,
        workerReport: report.report_text,
      })
    }

    const totalValue = enrichedAssets.reduce((sum, a) => sum + a.quantity * a.currentPrice, 0)
    const totalCost  = enrichedAssets.reduce((sum, a) => sum + a.quantity * a.purchasePrice, 0)
    enrichedAssets.forEach(a => {
      a.portfolioSharePercent = (a.quantity * a.currentPrice / totalValue) * 100
    })

    const reportText = await analyzePortfolio({
      apiKey,
      assets: enrichedAssets,
      totalValueUSD: totalValue,
      totalPnlPercent: ((totalValue - totalCost) / totalCost) * 100,
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
