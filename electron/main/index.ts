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
