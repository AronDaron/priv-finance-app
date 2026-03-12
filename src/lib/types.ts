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
