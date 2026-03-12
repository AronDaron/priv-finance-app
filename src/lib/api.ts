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
} from './types'

// ─── Deklaracja typów dla window.electronAPI ─────────────────────────────────
// TypeScript renderer nie importuje typów Electrona — deklarujemy ręcznie.

declare global {
  interface Window {
    electronAPI?: {
      version: string
      assets: {
        getAll(): Promise<PortfolioAsset[]>
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
  SETTINGS: 'fp_settings'
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

// ─── API: portfolio_assets ────────────────────────────────────────────────────

export async function getAssets(): Promise<PortfolioAsset[]> {
  if (isElectron()) {
    return window.electronAPI!.assets.getAll()
  }
  return lsGet<PortfolioAsset[]>(LS_KEYS.ASSETS, [])
}

export async function addAsset(asset: NewPortfolioAsset): Promise<PortfolioAsset> {
  if (isElectron()) {
    return window.electronAPI!.assets.add(asset)
  }
  const assets = lsGet<PortfolioAsset[]>(LS_KEYS.ASSETS, [])
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

// ─── Mock dane dla trybu przeglądarka (bez Electron) ─────────────────────────

const MOCK_QUOTES: Record<string, StockQuote> = {
  AAPL:   { ticker: 'AAPL',   name: 'Apple Inc.',        price: 189.30, change: 2.15,  changePercent: 1.15,  currency: 'USD', volume: 52_400_000, marketCap: 2_950_000_000_000 },
  MSFT:   { ticker: 'MSFT',   name: 'Microsoft Corp.',   price: 415.50, change: -1.20, changePercent: -0.29, currency: 'USD', volume: 18_700_000, marketCap: 3_090_000_000_000 },
  TSLA:   { ticker: 'TSLA',   name: 'Tesla, Inc.',       price: 242.80, change: -5.20, changePercent: -2.10, currency: 'USD', volume: 98_700_000, marketCap: 773_000_000_000  },
  NVDA:   { ticker: 'NVDA',   name: 'NVIDIA Corporation',price: 875.40, change: 18.30, changePercent: 2.14,  currency: 'USD', volume: 41_200_000, marketCap: 2_160_000_000_000 },
  'PKN.WA': { ticker: 'PKN.WA', name: 'PKN Orlen SA',   price: 131.80, change: 1.40,  changePercent: 1.07,  currency: 'PLN', volume: 1_200_000,  marketCap: 168_000_000_000  },
  'CDR.WA': { ticker: 'CDR.WA', name: 'CD Projekt SA',  price: 148.60, change: -2.40, changePercent: -1.59, currency: 'PLN', volume: 320_000,    marketCap: 14_500_000_000   },
  'KGH.WA': { ticker: 'KGH.WA', name: 'KGHM Polska Miedź SA', price: 162.40, change: -1.80, changePercent: -1.10, currency: 'PLN', volume: 480_000, marketCap: 32_000_000_000 },
  'PZU.WA': { ticker: 'PZU.WA', name: 'PZU SA',         price: 47.20,  change: 0.30,  changePercent: 0.64,  currency: 'PLN', volume: 850_000,    marketCap: 57_000_000_000   },
  'ALE.WA': { ticker: 'ALE.WA', name: 'Allegro.eu SA',  price: 36.50,  change: -0.50, changePercent: -1.35, currency: 'PLN', volume: 2_100_000,  marketCap: 36_000_000_000   },
  'GC=F':   { ticker: 'GC=F',   name: 'Gold Futures',   price: 2650.50, change: 12.30, changePercent: 0.47, currency: 'USD', volume: 185_000,    marketCap: null             },
  SPY:    { ticker: 'SPY',    name: 'SPDR S&P 500 ETF',  price: 524.80, change: 3.20,  changePercent: 0.61,  currency: 'USD', volume: 68_400_000, marketCap: null             },
}

function generateMockCandles(ticker: string, period: HistoryPeriod): OHLCCandle[] {
  const periodDays: Record<HistoryPeriod, number> = {
    '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730, '5y': 1825,
  }
  const basePrice = MOCK_QUOTES[ticker]?.price ?? 100
  const days = periodDays[period]
  const candles: OHLCCandle[] = []
  let price = basePrice * 0.8   // start 20% poniżej aktualnej ceny
  const now = Math.floor(Date.now() / 1000)
  const DAY = 86_400
  const volatility = basePrice * 0.02   // 2% dzienna zmienność

  for (let i = days; i >= 0; i--) {
    const open = price
    const change = (Math.random() - 0.48) * volatility  // lekki upward bias
    price = Math.max(price + change, 0.01)
    const high = Math.max(open, price) + Math.random() * volatility * 0.5
    const low = Math.min(open, price) - Math.random() * volatility * 0.5
    candles.push({
      time: now - i * DAY,
      open:   parseFloat(open.toFixed(2)),
      high:   parseFloat(high.toFixed(2)),
      low:    parseFloat(Math.max(low, 0.01).toFixed(2)),
      close:  parseFloat(price.toFixed(2)),
      volume: Math.floor(50_000 + Math.random() * 200_000),
    })
  }
  return candles
}

const MOCK_SEARCH_DB: SearchResult[] = [
  { ticker: 'AAPL',   name: 'Apple Inc.',              exchange: 'NASDAQ', type: 'EQUITY' },
  { ticker: 'MSFT',   name: 'Microsoft Corporation',   exchange: 'NASDAQ', type: 'EQUITY' },
  { ticker: 'TSLA',   name: 'Tesla, Inc.',              exchange: 'NASDAQ', type: 'EQUITY' },
  { ticker: 'AMZN',   name: 'Amazon.com Inc.',          exchange: 'NASDAQ', type: 'EQUITY' },
  { ticker: 'GOOGL',  name: 'Alphabet Inc.',            exchange: 'NASDAQ', type: 'EQUITY' },
  { ticker: 'NVDA',   name: 'NVIDIA Corporation',       exchange: 'NASDAQ', type: 'EQUITY' },
  { ticker: 'META',   name: 'Meta Platforms Inc.',      exchange: 'NASDAQ', type: 'EQUITY' },
  { ticker: 'PKN.WA', name: 'PKN Orlen SA',             exchange: 'WSE',    type: 'EQUITY' },
  { ticker: 'PKO.WA', name: 'PKO Bank Polski SA',       exchange: 'WSE',    type: 'EQUITY' },
  { ticker: 'CDR.WA', name: 'CD Projekt SA',            exchange: 'WSE',    type: 'EQUITY' },
  { ticker: 'LPP.WA', name: 'LPP SA',                  exchange: 'WSE',    type: 'EQUITY' },
  { ticker: 'KGH.WA', name: 'KGHM Polska Miedź SA',    exchange: 'WSE',    type: 'EQUITY' },
  { ticker: 'PZU.WA', name: 'PZU SA',                  exchange: 'WSE',    type: 'EQUITY' },
  { ticker: 'ALE.WA', name: 'Allegro.eu SA',            exchange: 'WSE',    type: 'EQUITY' },
  { ticker: 'PEO.WA', name: 'Bank Pekao SA',            exchange: 'WSE',    type: 'EQUITY' },
  { ticker: 'DNP.WA', name: 'Dino Polska SA',           exchange: 'WSE',    type: 'EQUITY' },
  { ticker: 'GC=F',   name: 'Gold Futures',             exchange: 'COMEX',  type: 'FUTURE' },
  { ticker: 'SPY',    name: 'SPDR S&P 500 ETF',         exchange: 'NYSE',   type: 'ETF'    },
]

const MOCK_FUNDAMENTALS: Record<string, FundamentalData> = {
  AAPL: {
    pe: 28.5, eps: 6.64, dividendYield: 0.0055,
    marketCap: 2_950_000_000_000, week52High: 199.62, week52Low: 164.08,
    beta: 1.24, sector: 'Technology', industry: 'Consumer Electronics',
  },
  MSFT: {
    pe: 36.2, eps: 11.48, dividendYield: 0.0072,
    marketCap: 3_090_000_000_000, week52High: 468.35, week52Low: 362.90,
    beta: 0.90, sector: 'Technology', industry: 'Software—Infrastructure',
  },
  'GC=F': {
    pe: null, eps: null, dividendYield: null,
    marketCap: null, week52High: 2_790.10, week52Low: 1_987.40,
    beta: null, sector: null, industry: null,
  },
}

function mockFundamentals(ticker: string): FundamentalData {
  return MOCK_FUNDAMENTALS[ticker] ?? {
    pe: 20 + Math.random() * 30, eps: 2 + Math.random() * 10,
    dividendYield: Math.random() > 0.5 ? Math.random() * 0.05 : null,
    marketCap: 1_000_000_000 + Math.random() * 100_000_000_000,
    week52High: null, week52Low: null, beta: 0.8 + Math.random() * 1.2,
    sector: 'Industrials', industry: null,
  }
}

// ─── Finance API (dane rynkowe) ───────────────────────────────────────────────

export async function getQuote(ticker: string): Promise<StockQuote> {
  if (isElectron()) {
    return window.electronAPI!.finance.quote(ticker)
  }
  await new Promise(r => setTimeout(r, 200 + Math.random() * 300))
  return MOCK_QUOTES[ticker] ?? {
    ticker, name: ticker, price: 50 + Math.random() * 200,
    change: (Math.random() - 0.5) * 5, changePercent: (Math.random() - 0.5) * 3,
    currency: 'USD', volume: Math.floor(Math.random() * 10_000_000), marketCap: null,
  }
}

export async function getHistory(ticker: string, period: HistoryPeriod): Promise<OHLCCandle[]> {
  if (isElectron()) {
    return window.electronAPI!.finance.history(ticker, period)
  }
  await new Promise(r => setTimeout(r, 300 + Math.random() * 400))
  return generateMockCandles(ticker, period)
}

export async function searchTickers(query: string): Promise<SearchResult[]> {
  if (isElectron()) {
    return window.electronAPI!.finance.search(query)
  }
  await new Promise(r => setTimeout(r, 150 + Math.random() * 200))
  const q = query.toLowerCase()
  return MOCK_SEARCH_DB.filter(
    r => r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
  ).slice(0, 8)
}

export async function getFundamentals(ticker: string): Promise<FundamentalData> {
  if (isElectron()) {
    return window.electronAPI!.finance.fundamentals(ticker)
  }
  await new Promise(r => setTimeout(r, 200))
  return mockFundamentals(ticker)
}

export async function getDividends(ticker: string): Promise<DividendEntry[]> {
  if (isElectron()) {
    return window.electronAPI!.finance.dividends(ticker)
  }
  if (['AAPL', 'MSFT', 'PKN.WA', 'PKO.WA'].includes(ticker)) {
    return [
      { date: '2024-11-15', amount: 0.25, currency: 'USD' },
      { date: '2024-08-15', amount: 0.25, currency: 'USD' },
      { date: '2024-05-17', amount: 0.24, currency: 'USD' },
      { date: '2024-02-16', amount: 0.24, currency: 'USD' },
    ]
  }
  return []
}

export async function getTechnicals(ticker: string, period: HistoryPeriod): Promise<TechnicalIndicators> {
  if (isElectron()) {
    return window.electronAPI!.finance.technicals(ticker, period)
  }
  await new Promise(r => setTimeout(r, 250))
  const base = MOCK_QUOTES[ticker]?.price ?? 100
  return {
    rsi14: parseFloat((35 + Math.random() * 45).toFixed(2)),
    macd: {
      value: parseFloat(((Math.random() - 0.4) * 5).toFixed(3)),
      signal: parseFloat(((Math.random() - 0.4) * 4).toFixed(3)),
      histogram: parseFloat(((Math.random() - 0.5) * 2).toFixed(3)),
    },
    sma20:  parseFloat((base * (0.96 + Math.random() * 0.08)).toFixed(2)),
    sma50:  parseFloat((base * (0.92 + Math.random() * 0.10)).toFixed(2)),
    sma200: parseFloat((base * (0.82 + Math.random() * 0.15)).toFixed(2)),
  }
}
