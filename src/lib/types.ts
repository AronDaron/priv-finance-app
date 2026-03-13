// src/lib/types.ts
// Centralne typy danych dla całej aplikacji.
// Używane przez: src/lib/api.ts, src/components/**, src/App.tsx

export interface PortfolioAsset {
  id: number
  ticker: string        // np. "AAPL", "PKOBP.WA", "GC=F"
  name: string          // pełna nazwa: "Apple Inc."
  quantity: number      // ilość jednostek/akcji
  purchase_price: number // średnia cena zakupu (PLN lub USD)
  currency: string      // "USD" | "PLN" | "EUR"
  purchase_date?: string // format: "YYYY-MM-DD"
  created_at: string    // ISO 8601: "2024-01-15T10:30:00Z"
}

export interface Transaction {
  id: number
  ticker: string
  type: 'buy' | 'sell'
  quantity: number
  price: number         // cena jednostkowa w momencie transakcji
  currency: string
  date: string          // ISO 8601
  notes: string | null
}

export interface AIReport {
  id: number
  ticker: string
  model: string         // np. "meta-llama/llama-3-8b-instruct:free"
  report_text: string
  created_at: string    // ISO 8601
}

export interface Setting {
  key: string
  value: string
}

// Typy pomocnicze dla operacji API

export type NewPortfolioAsset = Omit<PortfolioAsset, 'id' | 'created_at'>
export type NewTransaction = Omit<Transaction, 'id'>
export type NewAIReport = Omit<AIReport, 'id' | 'created_at'>

// ─── Typy danych rynkowych ────────────────────────────────────────────────────

// Wzbogacony asset z danymi rynkowymi i konwersją walut
export interface EnrichedAsset extends PortfolioAsset {
  currentPrice: number
  currentValue: number
  valueInPLN: number
  costBasis: number
  pnl: number
  region?: string
  sector?: string
  assetType?: string
}

export type HistoryPeriod = '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y'

export interface OHLCCandle {
  time: number        // Unix timestamp w SEKUNDACH (wymóg lightweight-charts!)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface StockQuote {
  ticker: string
  name: string
  price: number
  change: number          // zmiana absolutna
  changePercent: number   // zmiana procentowa (np. 1.15 = +1.15%)
  currency: string        // 'USD' | 'PLN' | 'EUR' itp.
  volume: number
  marketCap: number | null
}

export interface SearchResult {
  ticker: string
  name: string
  exchange: string
  type: string   // 'EQUITY' | 'ETF' | 'FUTURE' | 'CURRENCY' itp.
}

export interface FundamentalData {
  pe: number | null              // P/E ratio
  eps: number | null             // Earnings Per Share
  dividendYield: number | null   // ułamek dziesiętny, np. 0.015 = 1.5%
  marketCap: number | null
  week52High: number | null
  week52Low: number | null
  beta: number | null
  sector: string | null
  industry: string | null
}

export interface TechnicalIndicators {
  rsi14: number | null
  macd: {
    value: number | null
    signal: number | null
    histogram: number | null
  }
  sma20: number | null
  sma50: number | null
  sma200: number | null
}

export interface DividendEntry {
  date: string    // ISO 8601, np. '2024-02-15'
  amount: number
  currency: string
}
