// src/lib/api.ts
// Jedyna warstwa dostępu do danych dla komponentów React.
//
// Dual-backend:
//   - brak window.electronAPI  → localStorage (dev: przeglądarka/Vite)
//   - window.electronAPI       → SQLite przez IPC (produkcja: Electron .exe)
//
// ZASADA: Żaden komponent React nie wywołuje window.electronAPI bezpośrednio.
//         Wszystkie operacje przechodzą przez ten plik.

import type {
  PortfolioAsset,
  Transaction,
  AIReport,
  NewPortfolioAsset,
  NewTransaction,
  NewAIReport,
  OHLCCandle,
  StockQuote,
  SearchResult,
  FundamentalData,
  TechnicalIndicators,
  DividendEntry,
  HistoryPeriod,
  Portfolio,
  CashAccount,
  CashTransaction,
  NewCashTransaction,
} from './types'

// ─── Deklaracja typów dla window.electronAPI ─────────────────────────────────
// TypeScript renderer nie importuje typów Electrona — deklarujemy ręcznie.

declare global {
  interface Window {
    electronAPI?: {
      version: string
      portfolioHistory(portfolioId?: number, period?: string): Promise<{ date: string; value: number }[]>
      portfolios: {
        getAll(): Promise<Portfolio[]>
        create(name: string): Promise<Portfolio>
        rename(id: number, name: string): Promise<{ success: boolean }>
        delete(id: number): Promise<{ success: boolean }>
      }
      cash: {
        getAccounts(portfolioId?: number): Promise<CashAccount[]>
        addTransaction(data: NewCashTransaction): Promise<CashTransaction>
        getTransactions(portfolioId?: number): Promise<CashTransaction[]>
      }
      assets: {
        getAll(portfolioId?: number): Promise<PortfolioAsset[]>
        add(asset: NewPortfolioAsset): Promise<PortfolioAsset>
        update(id: number, updates: Partial<NewPortfolioAsset>): Promise<PortfolioAsset | null>
        delete(id: number): Promise<{ success: boolean }>
      }
      transactions: {
        getAll(): Promise<Transaction[]>
        getByTicker(ticker: string): Promise<Transaction[]>
        add(tx: NewTransaction): Promise<Transaction>
        delete(id: number): Promise<{ success: boolean }>
      }
      reports: {
        getAll(): Promise<AIReport[]>
        getLatestByTicker(ticker: string): Promise<AIReport | null>
        add(report: NewAIReport): Promise<AIReport>
      }
      settings: {
        get(key: string): Promise<string | null>
        set(key: string, value: string): Promise<{ success: boolean }>
        getAll(): Promise<Record<string, string>>
      }
      finance: {
        quote(ticker: string): Promise<StockQuote>
        history(ticker: string, period: HistoryPeriod): Promise<OHLCCandle[]>
        search(query: string): Promise<SearchResult[]>
        fundamentals(ticker: string): Promise<FundamentalData>
        dividends(ticker: string): Promise<DividendEntry[]>
        technicals(ticker: string, period: HistoryPeriod): Promise<TechnicalIndicators>
        assetMeta(ticker: string): Promise<{ region: string; assetType: string; sector: string | null }>
      }
      ai: {
        analyzeStock(ticker: string): Promise<AIReport>
        analyzePortfolio(): Promise<AIReport>
      }
    }
  }
}

// ─── Detekcja środowiska ──────────────────────────────────────────────────────

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI
}

// ─── localStorage helpers ────────────────────────────────────────────────────

const LS_KEYS = {
  ASSETS: 'fp_assets',
  TRANSACTIONS: 'fp_transactions',
  REPORTS: 'fp_reports',
  SETTINGS: 'fp_settings',
  PORTFOLIOS: 'fp_portfolios',
  CASH_ACCOUNTS: 'fp_cash_accounts',
  CASH_TRANSACTIONS: 'fp_cash_transactions',
} as const

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function lsSet(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function nextId(items: Array<{ id: number }>): number {
  return items.length === 0 ? 1 : Math.max(...items.map((i) => i.id)) + 1
}

function nowIso(): string {
  return new Date().toISOString()
}

// ─── API: portfolios ──────────────────────────────────────────────────────────

function lsEnsureDefaultPortfolio(): Portfolio[] {
  const portfolios = lsGet<Portfolio[]>(LS_KEYS.PORTFOLIOS, [])
  if (portfolios.length === 0) {
    const defaultPortfolio: Portfolio = { id: 1, name: 'Główny portfel', created_at: nowIso() }
    lsSet(LS_KEYS.PORTFOLIOS, [defaultPortfolio])
    return [defaultPortfolio]
  }
  return portfolios
}

export async function getPortfolios(): Promise<Portfolio[]> {
  if (isElectron()) return window.electronAPI!.portfolios.getAll()
  return lsEnsureDefaultPortfolio()
}

export async function createPortfolio(name: string): Promise<Portfolio> {
  if (isElectron()) return window.electronAPI!.portfolios.create(name)
  const portfolios = lsEnsureDefaultPortfolio()
  const newPortfolio: Portfolio = { id: nextId(portfolios), name, created_at: nowIso() }
  lsSet(LS_KEYS.PORTFOLIOS, [...portfolios, newPortfolio])
  return newPortfolio
}

export async function renamePortfolio(id: number, name: string): Promise<void> {
  if (isElectron()) { await window.electronAPI!.portfolios.rename(id, name); return }
  const portfolios = lsGet<Portfolio[]>(LS_KEYS.PORTFOLIOS, [])
  lsSet(LS_KEYS.PORTFOLIOS, portfolios.map(p => p.id === id ? { ...p, name } : p))
}

export async function deletePortfolio(id: number): Promise<void> {
  if (isElectron()) { await window.electronAPI!.portfolios.delete(id); return }
  const portfolios = lsGet<Portfolio[]>(LS_KEYS.PORTFOLIOS, [])
  lsSet(LS_KEYS.PORTFOLIOS, portfolios.filter(p => p.id !== id))
  const assets = lsGet<PortfolioAsset[]>(LS_KEYS.ASSETS, [])
  lsSet(LS_KEYS.ASSETS, assets.filter(a => a.portfolio_id !== id))
  const cashAccounts = lsGet<CashAccount[]>(LS_KEYS.CASH_ACCOUNTS, [])
  lsSet(LS_KEYS.CASH_ACCOUNTS, cashAccounts.filter(c => c.portfolio_id !== id))
  const cashTxs = lsGet<CashTransaction[]>(LS_KEYS.CASH_TRANSACTIONS, [])
  lsSet(LS_KEYS.CASH_TRANSACTIONS, cashTxs.filter(c => c.portfolio_id !== id))
}

// ─── API: cash ────────────────────────────────────────────────────────────────

export async function getCashAccounts(portfolioId?: number): Promise<CashAccount[]> {
  if (isElectron()) return window.electronAPI!.cash.getAccounts(portfolioId)
  const accounts = lsGet<CashAccount[]>(LS_KEYS.CASH_ACCOUNTS, [])
  return portfolioId !== undefined ? accounts.filter(a => a.portfolio_id === portfolioId) : accounts
}

export async function addCashTransaction(data: NewCashTransaction): Promise<CashTransaction> {
  if (isElectron()) return window.electronAPI!.cash.addTransaction(data)
  const txs = lsGet<CashTransaction[]>(LS_KEYS.CASH_TRANSACTIONS, [])
  const newTx: CashTransaction = { ...data, id: nextId(txs), created_at: nowIso() }
  lsSet(LS_KEYS.CASH_TRANSACTIONS, [...txs, newTx])
  // Zaktualizuj saldo
  const accounts = lsGet<CashAccount[]>(LS_KEYS.CASH_ACCOUNTS, [])
  const idx = accounts.findIndex(a => a.portfolio_id === data.portfolio_id && a.currency === data.currency)
  const delta = data.type === 'deposit' ? data.amount : -data.amount
  if (idx >= 0) {
    accounts[idx] = { ...accounts[idx], balance: accounts[idx].balance + delta }
    lsSet(LS_KEYS.CASH_ACCOUNTS, accounts)
  } else {
    const newAccount: CashAccount = {
      id: nextId(accounts),
      portfolio_id: data.portfolio_id,
      currency: data.currency as 'PLN' | 'USD' | 'EUR',
      balance: delta,
      created_at: nowIso()
    }
    lsSet(LS_KEYS.CASH_ACCOUNTS, [...accounts, newAccount])
  }
  return newTx
}

export async function getCashTransactions(portfolioId?: number): Promise<CashTransaction[]> {
  if (isElectron()) return window.electronAPI!.cash.getTransactions(portfolioId)
  const txs = lsGet<CashTransaction[]>(LS_KEYS.CASH_TRANSACTIONS, [])
  return portfolioId !== undefined ? txs.filter(t => t.portfolio_id === portfolioId) : txs
}

// ─── API: portfolio_assets ────────────────────────────────────────────────────

export async function getAssets(portfolioId?: number): Promise<PortfolioAsset[]> {
  if (isElectron()) {
    return window.electronAPI!.assets.getAll(portfolioId)
  }
  const assets = lsGet<PortfolioAsset[]>(LS_KEYS.ASSETS, [])
  return portfolioId !== undefined ? assets.filter(a => a.portfolio_id === portfolioId) : assets
}

export async function addAsset(asset: NewPortfolioAsset): Promise<PortfolioAsset> {
  if (isElectron()) {
    return window.electronAPI!.assets.add(asset)
  }
  const assets = lsGet<PortfolioAsset[]>(LS_KEYS.ASSETS, [])
  const targetPfId = asset.portfolio_id ?? 1
  const existing = assets.find((a) => a.ticker === asset.ticker && (a.portfolio_id ?? 1) === targetPfId)
  if (existing) {
    const totalQty = existing.quantity + asset.quantity
    const avgPrice =
      (existing.quantity * existing.purchase_price + asset.quantity * asset.purchase_price) /
      totalQty
    const updated = { ...existing, quantity: totalQty, purchase_price: avgPrice }
    lsSet(LS_KEYS.ASSETS, assets.map((a) => (a.id === existing.id ? updated : a)))
    return updated
  }
  const newAsset: PortfolioAsset = {
    ...asset,
    id: nextId(assets),
    created_at: nowIso()
  }
  lsSet(LS_KEYS.ASSETS, [...assets, newAsset])
  return newAsset
}

export async function updateAsset(
  id: number,
  updates: Partial<NewPortfolioAsset>
): Promise<PortfolioAsset | null> {
  if (isElectron()) {
    return window.electronAPI!.assets.update(id, updates)
  }
  const assets = lsGet<PortfolioAsset[]>(LS_KEYS.ASSETS, [])
  const idx = assets.findIndex((a) => a.id === id)
  if (idx === -1) return null
  assets[idx] = { ...assets[idx], ...updates }
  lsSet(LS_KEYS.ASSETS, assets)
  return assets[idx]
}

export async function deleteAsset(id: number): Promise<void> {
  if (isElectron()) {
    await window.electronAPI!.assets.delete(id)
    return
  }
  const assets = lsGet<PortfolioAsset[]>(LS_KEYS.ASSETS, [])
  lsSet(LS_KEYS.ASSETS, assets.filter((a) => a.id !== id))
}

// ─── API: transactions ────────────────────────────────────────────────────────

export async function getTransactions(): Promise<Transaction[]> {
  if (isElectron()) {
    return window.electronAPI!.transactions.getAll()
  }
  return lsGet<Transaction[]>(LS_KEYS.TRANSACTIONS, [])
}

export async function getTransactionsByTicker(ticker: string): Promise<Transaction[]> {
  if (isElectron()) {
    return window.electronAPI!.transactions.getByTicker(ticker)
  }
  const txs = lsGet<Transaction[]>(LS_KEYS.TRANSACTIONS, [])
  return txs.filter((t) => t.ticker === ticker)
}

export async function addTransaction(tx: NewTransaction): Promise<Transaction> {
  if (isElectron()) {
    return window.electronAPI!.transactions.add(tx)
  }
  const txs = lsGet<Transaction[]>(LS_KEYS.TRANSACTIONS, [])
  const newTx: Transaction = { ...tx, id: nextId(txs) }
  lsSet(LS_KEYS.TRANSACTIONS, [...txs, newTx])
  return newTx
}

export async function deleteTransaction(id: number): Promise<void> {
  if (isElectron()) {
    await window.electronAPI!.transactions.delete(id)
    return
  }
  const txs = lsGet<Transaction[]>(LS_KEYS.TRANSACTIONS, [])
  lsSet(LS_KEYS.TRANSACTIONS, txs.filter((t) => t.id !== id))
}

// ─── API: ai_reports ──────────────────────────────────────────────────────────

export async function getReports(): Promise<AIReport[]> {
  if (isElectron()) {
    return window.electronAPI!.reports.getAll()
  }
  return lsGet<AIReport[]>(LS_KEYS.REPORTS, [])
}

export async function getLatestReportByTicker(ticker: string): Promise<AIReport | null> {
  if (isElectron()) {
    return window.electronAPI!.reports.getLatestByTicker(ticker)
  }
  const reports = lsGet<AIReport[]>(LS_KEYS.REPORTS, [])
  const filtered = reports
    .filter((r) => r.ticker === ticker)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return filtered[0] ?? null
}

export async function addReport(report: NewAIReport): Promise<AIReport> {
  if (isElectron()) {
    return window.electronAPI!.reports.add(report)
  }
  const reports = lsGet<AIReport[]>(LS_KEYS.REPORTS, [])
  const newReport: AIReport = {
    ...report,
    id: nextId(reports),
    created_at: nowIso()
  }
  lsSet(LS_KEYS.REPORTS, [...reports, newReport])
  return newReport
}

// ─── API: settings ────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  if (isElectron()) {
    return window.electronAPI!.settings.get(key)
  }
  const settings = lsGet<Record<string, string>>(LS_KEYS.SETTINGS, {})
  return settings[key] ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (isElectron()) {
    await window.electronAPI!.settings.set(key, value)
    return
  }
  const settings = lsGet<Record<string, string>>(LS_KEYS.SETTINGS, {})
  lsSet(LS_KEYS.SETTINGS, { ...settings, [key]: value })
}

export async function getAllSettings(): Promise<Record<string, string>> {
  if (isElectron()) {
    return window.electronAPI!.settings.getAll()
  }
  return lsGet<Record<string, string>>(LS_KEYS.SETTINGS, {})
}

// ─── Helper: info o środowisku ────────────────────────────────────────────────

export function getEnvironmentInfo(): { backend: 'electron' | 'localStorage'; version?: string } {
  if (isElectron()) {
    return { backend: 'electron', version: window.electronAPI!.version }
  }
  return { backend: 'localStorage' }
}

// ─── Finance API (dane rynkowe) ───────────────────────────────────────────────
// Tryb dev (przeglądarka): fetch do Vite dev server z pluginem financeDevApiPlugin
// Tryb produkcja (Electron): IPC → main process → yahoo-finance2

async function devApiFetch<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`/api${endpoint}`, window.location.origin)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new Error(body.error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export async function getQuote(ticker: string): Promise<StockQuote> {
  if (isElectron()) return window.electronAPI!.finance.quote(ticker)
  return devApiFetch('/quote', { ticker })
}

export async function getHistory(ticker: string, period: HistoryPeriod): Promise<OHLCCandle[]> {
  if (isElectron()) return window.electronAPI!.finance.history(ticker, period)
  return devApiFetch('/history', { ticker, period })
}

export async function searchTickers(query: string): Promise<SearchResult[]> {
  if (isElectron()) return window.electronAPI!.finance.search(query)
  return devApiFetch('/search', { query })
}

export async function getFundamentals(ticker: string): Promise<FundamentalData> {
  if (isElectron()) return window.electronAPI!.finance.fundamentals(ticker)
  return devApiFetch('/fundamentals', { ticker })
}

export async function getDividends(ticker: string): Promise<DividendEntry[]> {
  if (isElectron()) return window.electronAPI!.finance.dividends(ticker)
  return devApiFetch('/dividends', { ticker })
}

export async function getTechnicals(ticker: string, period: HistoryPeriod): Promise<TechnicalIndicators> {
  if (isElectron()) return window.electronAPI!.finance.technicals(ticker, period)
  return devApiFetch('/technicals', { ticker, period })
}

// ─── AI API ───────────────────────────────────────────────────────────────────

async function devApiPost<T>(endpoint: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(`/api${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
    throw new Error(err.error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export async function getAssetMeta(ticker: string): Promise<{ region: string; assetType: string; sector: string | null }> {
  if (isElectron()) return window.electronAPI!.finance.assetMeta(ticker)
  return devApiFetch('/asset-meta', { ticker })
}

export async function getPortfolioHistory(portfolioId?: number, period: string = '1y'): Promise<{ date: string; value: number }[]> {
  if (isElectron()) return window.electronAPI!.portfolioHistory(portfolioId, period)
  const allAssets = lsGet<PortfolioAsset[]>(LS_KEYS.ASSETS, [])
  const assets = portfolioId !== undefined ? allAssets.filter(a => a.portfolio_id === portfolioId) : allAssets
  if (assets.length === 0) return []
  return devApiPost('/portfolio-history', { assets: JSON.stringify(assets), period })
}

export async function analyzeStock(ticker: string): Promise<AIReport> {
  if (isElectron()) return window.electronAPI!.ai.analyzeStock(ticker)
  const apiKey = await getSetting('openrouter_api_key')
  const result = await devApiPost<{ report_text: string; model: string; ticker: string }>(
    '/ai/analyze-stock', { ticker, apiKey: apiKey ?? '' }
  )
  return addReport({ ticker, model: result.model, report_text: result.report_text })
}

export async function analyzePortfolio(): Promise<AIReport> {
  if (isElectron()) return window.electronAPI!.ai.analyzePortfolio()
  const apiKey = await getSetting('openrouter_api_key')
  const assets = await getAssets()
  const tickers = assets.map(a => a.ticker).join(',')
  const result = await devApiPost<{ report_text: string; model: string }>(
    '/ai/analyze-portfolio', { tickers, apiKey: apiKey ?? '' }
  )
  return addReport({ ticker: '__PORTFOLIO__', model: result.model, report_text: result.report_text })
}
