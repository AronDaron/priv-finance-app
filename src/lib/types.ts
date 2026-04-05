// src/lib/types.ts
// Centralne typy danych dla całej aplikacji.
// Używane przez: src/lib/api.ts, src/components/**, src/App.tsx

// ─── Obligacje skarbowe ───────────────────────────────────────────────────────

export type BondType = 'OTS' | 'ROR' | 'DOR' | 'TOS' | 'COI' | 'EDO' | 'ROS' | 'ROD'

export const BOND_TYPES: Record<BondType, { name: string; period: string; inflationLinked: boolean }> = {
  OTS: { name: 'Trzymiesięczne',    period: '3M',  inflationLinked: false },
  ROR: { name: 'Roczne',            period: '1Y',  inflationLinked: false },
  DOR: { name: 'Dwuletnie',         period: '2Y',  inflationLinked: false },
  TOS: { name: 'Trzyletnie',        period: '3Y',  inflationLinked: false },
  COI: { name: 'Czteroletnie',      period: '4Y',  inflationLinked: true  },
  EDO: { name: 'Dziesięcioletnie',  period: '10Y', inflationLinked: true  },
  ROS: { name: 'Sześcioletnie',     period: '6Y',  inflationLinked: true  },
  ROD: { name: 'Dwunastoletnie',    period: '12Y', inflationLinked: true  },
}

export interface BondValueResult {
  currentValuePerBond: number  // PLN — wartość jednej obligacji
  totalValue: number           // PLN — wartość całej pozycji
  baseValue: number            // nominał + odsetki z zakończonych lat
  accruedInterest: number      // odsetki narosłe w bieżącym roku
  bondYearNum: number          // aktualny rok obligacji (1, 2, …)
  currentYearRate: number      // stopa bieżącego roku (ułamek, np. 0.0625)
  maturityDate: string         // 'YYYY-MM-DD'
  isMatured: boolean           // czy obligacja zapadła
}

// Parsuje ticker obligacji: 'EDO0336' → { bondType: 'EDO', maturityMonth: 3, maturityYear: 2036 }
export function parseBondTickerClient(ticker: string): { bondType: BondType; maturityMonth: number; maturityYear: number } | null {
  const match = ticker.match(/^([A-Z]{3})(\d{2})(\d{2})$/)
  if (!match) return null
  const bondType = match[1] as BondType
  if (!(bondType in BOND_TYPES)) return null
  return {
    bondType,
    maturityMonth: parseInt(match[2], 10),
    maturityYear: 2000 + parseInt(match[3], 10),
  }
}

export interface PortfolioAsset {
  id: number
  ticker: string        // np. "AAPL", "PKOBP.WA", "GC=F", "EDO0336"
  name: string          // pełna nazwa: "Apple Inc."
  quantity: number      // ilość jednostek/akcji (dla metali fizycznych: liczba monet; dla obligacji: liczba sztuk)
  purchase_price: number // średnia cena zakupu (PLN lub USD); dla obligacji zawsze 100 PLN
  currency: string      // "USD" | "PLN" | "EUR"
  purchase_date?: string // format: "YYYY-MM-DD"
  created_at: string    // ISO 8601: "2024-01-15T10:30:00Z"
  portfolio_id?: number
  gold_grams?: number   // gramy czystego metalu na monetę (dla GC=F i SI=F fizycznych); null = giełdowy kontrakt
  asset_type?: 'stock' | 'bond'         // domyślnie 'stock'
  bond_type?: BondType                  // np. 'EDO', 'COI'
  bond_year1_rate?: number              // stopa roku 1 w %, np. 6.25
  bond_maturity_date?: string           // 'YYYY-MM-DD' — data zapadalności
}

export interface Portfolio {
  id: number
  name: string
  created_at: string
  tags?: string[]
}

export const PORTFOLIO_TAGS = [
  'IKE', 'IKZE', 'Akumulujący', 'Dywidendowy', 'Spekulacyjny',
  'Emerytalny', 'Krótkoterminowy', 'Długoterminowy', 'Obligacje',
  'Surowce', 'Kryptowaluty', 'Zagraniczny', 'Krajowy', 'ESG',
] as const
export type PortfolioTag = typeof PORTFOLIO_TAGS[number]

// ─── Waluty ───────────────────────────────────────────────────────────────────

export const SUPPORTED_CURRENCIES = ['PLN', 'USD', 'EUR', 'CHF', 'GBP', 'JPY', 'NOK', 'SEK'] as const
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]

/** Yahoo Finance ticker dla kursu waluty → PLN */
export const FX_TICKERS: Partial<Record<SupportedCurrency, string>> = {
  USD: 'USDPLN=X',
  EUR: 'EURPLN=X',
  CHF: 'CHFPLN=X',
  GBP: 'GBPPLN=X',
  JPY: 'JPYPLN=X',
  NOK: 'NOKPLN=X',
  SEK: 'SEKPLN=X',
}

export interface CashAccount {
  id: number
  portfolio_id: number
  currency: SupportedCurrency
  balance: number
  created_at: string
}

export interface CashTransaction {
  id: number
  portfolio_id: number
  type: 'deposit' | 'withdrawal'
  amount: number
  currency: SupportedCurrency
  date: string
  time?: string | null
  purchase_rate?: number | null      // kurs 1 jednostki → PLN w chwili zakupu
  purchase_currency?: string | null  // waluta zakupu (metadane)
  notes?: string
  created_at: string
}

export type NewCashTransaction = Omit<CashTransaction, 'id' | 'created_at'>

export interface Transaction {
  id: number
  ticker: string
  type: 'buy' | 'sell'
  quantity: number
  price: number         // cena jednostkowa w momencie transakcji
  currency: string
  date: string          // ISO 8601
  notes: string | null
  fee?: number
  fee_type?: string     // 'fixed' | 'percent'
  time?: string | null  // "HH:MM"
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
  costBasisInPLN: number    // koszt zakupu przeliczony na PLN wg asset.currency
  quoteCurrency: string     // waluta notowania (np. USD dla GC=F)
  pnl: number               // zawsze w PLN
  annualDividendPLN: number // szacowana roczna dywidenda w PLN
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
  pe: number | null              // P/E ratio (trailing)
  eps: number | null             // Earnings Per Share (trailing)
  dividendYield: number | null   // ułamek dziesiętny, np. 0.015 = 1.5%
  dividendRate: number | null    // roczna dywidenda na akcję w walucie quote
  marketCap: number | null
  week52High: number | null
  week52Low: number | null
  beta: number | null
  sector: string | null
  industry: string | null
  // defaultKeyStatistics — wycena forward
  forwardPE: number | null
  pegRatio: number | null
  // defaultKeyStatistics — short interest
  shortRatio: number | null           // dni do pokrycia
  shortPercentOfFloat: number | null  // % free float sprzedanych krótko
  // financialData (akcje)
  totalRevenue: number | null
  revenueGrowth: number | null
  grossMargins: number | null
  profitMargins: number | null
  totalDebt: number | null
  totalCash: number | null
  analystRecommendation: string | null   // 'buy' | 'hold' | 'sell' | 'strong_buy' | 'none'
  numberOfAnalysts: number | null
  targetMeanPrice: number | null
  earningsGrowth: number | null
  // recommendationTrend
  recommendationTrend: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null
  // calendarEvents
  nextEarningsDate: string | null        // 'YYYY-MM-DD'
  // earningsHistory — historia wyników EPS (ostatnie 4 kwartały)
  earningsHistory: Array<{
    date: string              // 'YYYY-MM-DD' — koniec kwartału
    period: string            // np. '3Q2024'
    epsEstimate: number | null
    epsActual: number | null
    surprisePercent: number | null  // ułamek: 0.015 = +1.5%
  }> | null
  // earningsTrend — prognozy analityków
  earningsTrend: Array<{
    period: string            // '0q' | '+1q' | '0y' | '+1y'
    endDate: string | null    // 'YYYY-MM-DD'
    epsEstimate: number | null
    revenueEstimate: number | null
    growth: number | null     // ułamek wzrostu EPS r/r
  }> | null
  // upgradeDowngradeHistory — zmiany ratingów (ostatnie 5)
  upgradeDowngradeHistory: Array<{
    date: string              // 'YYYY-MM-DD'
    firm: string
    toGrade: string
    fromGrade: string | null
    action: string            // 'up' | 'down' | 'init' | 'main' | 'reit'
  }> | null
  // insiderTransactions — transakcje insiderów (ostatnie 10)
  insiderTransactions: Array<{
    date: string              // 'YYYY-MM-DD'
    name: string
    relation: string
    transactionText: string
    shares: number | null
    value: number | null
  }> | null
  // ETF (topHoldings + fundProfile)
  topHoldings: Array<{ name: string; percent: number | null }> | null
  fundFamily: string | null
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
  bollingerBands: {
    upper: number
    middle: number
    lower: number
    bandwidth: number  // (upper - lower) / middle * 100
  } | null
  atr14: number | null
  adx14: {
    adx: number
    pdi: number  // +DI
    mdi: number  // -DI
  } | null
}

export interface DividendEntry {
  date: string    // ISO 8601, np. '2024-02-15'
  amount: number
  currency: string
}

// ─── Złoto i srebro fizyczne ──────────────────────────────────────────────────

export interface PhysicalMetalCoin {
  id: string          // unikalny klucz
  name: string        // wyświetlana nazwa
  metal: 'gold' | 'silver'
  ticker: string      // GC=F lub SI=F
  pureGrams: number   // gramy czystego metalu w jednej monecie
}

// Czyste gramy = waga monety × próba
// 1 troy oz = 31.1035 g
export const PHYSICAL_METAL_COINS: PhysicalMetalCoin[] = [
  // Złoto
  { id: 'gold_philharmonic_1oz', name: 'Wiedeński Filharmonik 1 oz (Au)', metal: 'gold', ticker: 'GC=F', pureGrams: 31.1035 },
  { id: 'gold_krugerrand_1oz',   name: 'Krugerrand 1 oz (Au)',            metal: 'gold', ticker: 'GC=F', pureGrams: 31.1035 },
  { id: 'gold_maple_1oz',        name: 'Kanadyjski Liść Klonu 1 oz (Au)', metal: 'gold', ticker: 'GC=F', pureGrams: 31.1035 },
  { id: 'gold_britannia_1oz',    name: 'Britannia 1 oz (Au)',             metal: 'gold', ticker: 'GC=F', pureGrams: 31.1035 },
  { id: 'gold_eagle_1oz',        name: 'Złoty Orzeł USA 1 oz (Au)',       metal: 'gold', ticker: 'GC=F', pureGrams: 30.0935 },
  { id: 'gold_dukat_austria',    name: 'Austriacki Dukat (Au)',           metal: 'gold', ticker: 'GC=F', pureGrams: 3.4909  },
  { id: 'gold_custom',           name: 'Inna moneta / sztabka (Au)',      metal: 'gold', ticker: 'GC=F', pureGrams: 0       },
  // Srebro
  { id: 'silver_philharmonic_1oz', name: 'Wiedeński Filharmonik 1 oz (Ag)', metal: 'silver', ticker: 'SI=F', pureGrams: 31.1035 },
  { id: 'silver_britannia_1oz',    name: 'Britannia 1 oz (Ag)',              metal: 'silver', ticker: 'SI=F', pureGrams: 31.1035 },
  { id: 'silver_maple_1oz',        name: 'Kanadyjski Liść Klonu 1 oz (Ag)', metal: 'silver', ticker: 'SI=F', pureGrams: 31.1035 },
  { id: 'silver_eagle_1oz',        name: 'Srebrny Orzeł USA 1 oz (Ag)',      metal: 'silver', ticker: 'SI=F', pureGrams: 31.1035 },
  { id: 'silver_nbp_1oz',          name: 'Moneta NBP 1 oz (Ag)',             metal: 'silver', ticker: 'SI=F', pureGrams: 31.1035 },
  { id: 'silver_custom',           name: 'Inna moneta / sztabka (Ag)',       metal: 'silver', ticker: 'SI=F', pureGrams: 0       },
]

// Przelicza gramy na uncje troy
export function gramsToTroyOz(grams: number): number {
  return grams / 31.1035
}

// ── Globalny rynek — dane i score regionów ────────────────────────────────────

export interface MarketTickerData {
  ticker: string
  name: string
  price: number
  change: number         // zmiana 1-dniowa (absolutna)
  changePercent: number  // zmiana 1-dniowa (%)
  change1m: number       // zmiana 30-dniowa (%), 0 jeśli niedostępna
}

export interface GlobalMarketData {
  commodities: {
    oil: MarketTickerData     // CL=F (WTI)
    brent: MarketTickerData   // BZ=F (Brent)
    gas: MarketTickerData     // NG=F
    wheat: MarketTickerData   // ZW=F
    copper: MarketTickerData  // HG=F
    gold: MarketTickerData    // GC=F
  }
  currencies: {
    EURUSD: MarketTickerData
    GBPUSD: MarketTickerData
    CHFUSD: MarketTickerData
    CADUSD: MarketTickerData
    AUDUSD: MarketTickerData
    JPYUSD: MarketTickerData
    CNYUSD: MarketTickerData
  }
  indices: {
    SP500: MarketTickerData   // ^GSPC
    DAX: MarketTickerData     // ^GDAXI
    Nikkei: MarketTickerData  // ^N225
    WIG20: MarketTickerData   // WIG20.WA
    FTSE: MarketTickerData    // ^FTSE
    VIX: MarketTickerData     // ^VIX
    FXI: MarketTickerData     // China Large Cap ETF
    ASX200: MarketTickerData  // ^AXJO — Australia ASX 200
    EZA: MarketTickerData     // iShares MSCI South Africa ETF
    BVSP: MarketTickerData    // ^BVSP — Bovespa (Brazil/South America)
    VWO: MarketTickerData     // Vanguard FTSE Emerging Markets ETF (szeroki proxy EM)
    INDA: MarketTickerData    // iShares MSCI India ETF
    EWJ: MarketTickerData     // iShares MSCI Japan ETF (USD-denominated)
  }
  bonds: {
    US10Y: MarketTickerData   // ^TNX (US 10-year yield)
  }
  fetchedAt: string
}

export interface RegionScoreComponent {
  name: string
  rawValue: number       // wartość surowa (np. changePercent)
  contribution: number   // wkład w score: od -25 do +25
  weight: number         // waga składnika (suma = 1.0)
}

export type RegionId = 'north_america' | 'europe' | 'asia' | 'latam_em' | 'commodities' | 'australia_oceania' | 'africa' | 'south_america' | 'developed_markets'

export interface RegionScore {
  id: RegionId
  name: string
  flag: string           // emoji flagi
  score: number          // 0-100
  risk: 'low' | 'medium' | 'high'  // >65 low, 40-65 medium, <40 high
  trend: 'up' | 'down' | 'neutral' // 1-day trend
  components: RegionScoreComponent[]
}

export interface MarketRegime {
  vixLevel:    'calm' | 'elevated' | 'panic'      // calm: VIX<20, elevated: 20-30, panic: >30
  bondStress:  'normal' | 'elevated' | 'shock'    // normal: <4%, elevated: 4-5%, shock: >5%
  oilShock:    boolean                             // |oil.change1m| > 15%
  goldRally:   boolean                             // gold.change1m > 10%
  copperCrash: boolean                             // copper.change1m < -10% — sygnał recesji
  gasSpike:    boolean                             // gas.change1m > +20% — kryzys energetyczny (drogi gaz)
  gasCrash:    boolean                             // gas.change1m < -20% — załamanie popytu na gaz
}

export interface GlobalAnalysis {
  regions:    RegionScore[]
  marketData: GlobalMarketData
  computedAt: string
  regime?:    MarketRegime
}

// ── News ─────────────────────────────────────────────────────────────────────

export type NewsRegion = 'pl' | 'eu' | 'asia' | 'us' | 'world'

export interface NewsItem {
  title: string
  link: string
  description: string
  pubDate: string
  thumbnail: string | null
  source: string
}

// ── AI Chat ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ── Stock Scoring System ──────────────────────────────────────────────────────

export interface StockSubScore {
  value: number | null   // surowa wartość (do wyświetlenia)
  score: number | null   // znormalizowany score 0-100
  rank?: number | null   // percentyl w kohortcie giełdy (dla metryk peer)
}

export interface StockScoringResult {
  ticker: string
  name: string
  exchange: string
  marketCap: number | null
  currency: string

  // Wyniki kategorii
  profitabilityScore: number | null
  safetyScore: number | null
  valuationScore: number | null
  totalScore: number | null

  // Wagi użyte (po korekcie regime)
  weights: { profitability: number; safety: number; valuation: number }

  // Pokrycie danych (0-100%)
  dataCoverage: number

  // Sub-score dla Extended View
  sub: {
    // Profitability
    revenueGrowth: StockSubScore
    revenueGrowthVsPeers: StockSubScore
    earningsGrowth: StockSubScore
    forwardEpsGrowth: StockSubScore
    grossMargin: StockSubScore
    netMargin: StockSubScore
    // Safety
    debtCashRatio: StockSubScore
    beta: StockSubScore
    shortInterest: StockSubScore
    analystConsensus: StockSubScore
    priceMomentum: StockSubScore
    // Valuation
    trailingPE: StockSubScore
    forwardPE: StockSubScore
    pegRatio: StockSubScore
    priceVs52wHigh: StockSubScore
    dividendYield: StockSubScore
  }

  fetchedAt: string
  lookbackDays: number
}

export interface ScreenerExchangeResult {
  exchange: string
  exchangeLabel: string
  stocks: StockScoringResult[]
  lastFetchedAt: string | null
  isLoading: boolean
  error: string | null
}

export type ScreenerViewMode = 'simple' | 'extended'
