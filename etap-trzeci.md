# Etap 3 — Integracja Danych

## Cel

Zintegrować trzy biblioteki do obsługi danych rynkowych i wykresów:
- **`yahoo-finance2`** — pobieranie cen, OHLC, danych fundamentalnych, dywidend, wyszukiwarka spółek (działa wyłącznie w Node.js — main process)
- **`lightweight-charts`** (TradingView) — wykres świecowy candlestick w React (działa wyłącznie w renderer/przeglądarce)
- **`technicalindicators`** — obliczanie RSI, MACD, SMA lokalnie z danych historycznych (main process)

W trybie dev (`npm run dev`, przeglądarka bez Electron) — mock dane zastępują prawdziwe API.

---

## Pliki do modyfikacji / stworzenia

| Plik | Akcja |
|---|---|
| `package.json` | Modyfikacja — nowe zależności |
| `src/lib/types.ts` | Modyfikacja — 7 nowych typów |
| `electron/main/finance.ts` | **NOWY** — logika yahoo-finance2 i technicalindicators |
| `electron/main/index.ts` | Modyfikacja — 6 nowych IPC handlerów |
| `electron/preload/index.ts` | Modyfikacja — obiekt `finance` w contextBridge |
| `src/lib/api.ts` | Modyfikacja — typy + 6 funkcji z mock danymi |
| `src/components/charts/CandlestickChart.tsx` | **NOWY** — komponent wykresu świecowego |
| `src/components/StockSearch.tsx` | **NOWY** — wyszukiwarka spółek z dropdownem |
| `src/App.tsx` | Modyfikacja — zastąpić demo Milestone 2 widokiem testowym |

---

## Krok 1 — Instalacja zależności

```bash
npm install yahoo-finance2 technicalindicators lightweight-charts
npm install --save-dev @types/technicalindicators
```

**Uwaga ESM/CJS:** `yahoo-finance2` v2+ jest czystym ESM. Plik `electron/main/` kompilowany jest przez `tsconfig.node.json` do CommonJS. Standardowy `import` nie zadziała — wymagany jest lazy dynamic import (patrz Krok 3).

`postinstall` wykona automatycznie `electron-rebuild` dla `better-sqlite3` — to poprawne.

---

## Krok 2 — Nowe typy (`src/lib/types.ts`)

Dopisać na końcu pliku, po istniejących typach:

```typescript
// ─── Typy danych rynkowych ────────────────────────────────────────────────────

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
```

**Krytyczna uwaga:** Pole `time` w `OHLCCandle` musi być w **sekundach** (nie milisekundach). Yahoo Finance zwraca obiekty `Date`. Konwersja obowiązkowa: `Math.floor(date.getTime() / 1000)`.

---

## Krok 3 — Logika danych rynkowych (NOWY plik `electron/main/finance.ts`)

Plik działa wyłącznie w main process (Node.js). Nigdy nie importowany przez renderer.

### Lazy loader dla yahoo-finance2 (obejście problemu ESM/CJS)

```typescript
import type {
  OHLCCandle, StockQuote, SearchResult,
  FundamentalData, TechnicalIndicators, DividendEntry, HistoryPeriod
} from '../../src/lib/types'

// Dynamic import — wymagany bo yahoo-finance2 jest ESM, a main process to CJS
let _yf: typeof import('yahoo-finance2')['default'] | null = null
async function getYF() {
  if (!_yf) {
    const mod = await import('yahoo-finance2')
    _yf = mod.default
  }
  return _yf
}
```

### `fetchQuote(ticker: string): Promise<StockQuote>`

```typescript
export async function fetchQuote(ticker: string): Promise<StockQuote> {
  const yf = await getYF()
  const result = await yf.quoteSummary(ticker, { modules: ['price'] })
  const p = result.price!
  return {
    ticker,
    name: p.shortName ?? p.longName ?? ticker,
    price: p.regularMarketPrice ?? 0,
    change: p.regularMarketChange ?? 0,
    changePercent: (p.regularMarketChangePercent ?? 0) * 100,
    currency: p.currency ?? 'USD',
    volume: p.regularMarketVolume ?? 0,
    marketCap: p.marketCap ?? null,
  }
}
```

### `fetchHistory(ticker: string, period: HistoryPeriod): Promise<OHLCCandle[]>`

```typescript
const PERIOD_DAYS: Record<HistoryPeriod, number> = {
  '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730, '5y': 1825,
}

export async function fetchHistory(ticker: string, period: HistoryPeriod): Promise<OHLCCandle[]> {
  const yf = await getYF()
  const now = new Date()
  const period1 = new Date(now.getTime() - PERIOD_DAYS[period] * 86_400_000)
  const rows = await yf.historical(ticker, { period1, period2: now })
  return rows
    .filter(r => r.open != null && r.high != null && r.low != null && r.close != null)
    .map(r => ({
      time: Math.floor(r.date.getTime() / 1000),
      open: r.open!,
      high: r.high!,
      low: r.low!,
      close: r.close!,
      volume: r.volume ?? 0,
    }))
    .sort((a, b) => a.time - b.time)  // lightweight-charts wymaga kolejności rosnącej
}
```

### `searchTickers(query: string): Promise<SearchResult[]>`

```typescript
export async function searchTickers(query: string): Promise<SearchResult[]> {
  const yf = await getYF()
  const result = await yf.search(query)
  return (result.quotes ?? []).slice(0, 10).map(q => ({
    ticker: q.symbol ?? '',
    name: (q as any).shortname ?? (q as any).longname ?? q.symbol ?? '',
    exchange: (q as any).exchange ?? '',
    type: q.quoteType ?? 'EQUITY',
  }))
}
```

### `fetchFundamentals(ticker: string): Promise<FundamentalData>`

```typescript
export async function fetchFundamentals(ticker: string): Promise<FundamentalData> {
  const yf = await getYF()
  const result = await yf.quoteSummary(ticker, {
    modules: ['summaryDetail', 'defaultKeyStatistics', 'assetProfile'],
  })
  const sd = result.summaryDetail
  const ks = result.defaultKeyStatistics
  const ap = result.assetProfile
  return {
    pe: (sd as any)?.trailingPE ?? null,
    eps: (ks as any)?.trailingEps ?? null,
    dividendYield: (sd as any)?.dividendYield ?? null,
    marketCap: (sd as any)?.marketCap ?? null,
    week52High: (sd as any)?.fiftyTwoWeekHigh ?? null,
    week52Low: (sd as any)?.fiftyTwoWeekLow ?? null,
    beta: (sd as any)?.beta ?? null,
    sector: (ap as any)?.sector ?? null,
    industry: (ap as any)?.industry ?? null,
  }
}
```

### `fetchDividends(ticker: string): Promise<DividendEntry[]>`

```typescript
export async function fetchDividends(ticker: string): Promise<DividendEntry[]> {
  const yf = await getYF()
  const rows = await yf.historical(ticker, {
    period1: '2015-01-01',
    events: 'dividends',
  })
  return rows
    .filter(r => (r as any).dividends != null)
    .map(r => ({
      date: r.date.toISOString().split('T')[0],
      amount: (r as any).dividends as number,
      currency: 'USD',
    }))
}
```

### `calculateTechnicals(candles: OHLCCandle[]): TechnicalIndicators`

```typescript
import * as ti from 'technicalindicators'

export function calculateTechnicals(candles: OHLCCandle[]): TechnicalIndicators {
  const closes = candles.map(c => c.close)

  const rsiResult = ti.RSI.calculate({ values: closes, period: 14 })
  const macdResult = ti.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  })
  const sma20 = ti.SMA.calculate({ values: closes, period: 20 })
  const sma50 = ti.SMA.calculate({ values: closes, period: 50 })
  const sma200 = ti.SMA.calculate({ values: closes, period: 200 })

  const lastMacd = macdResult.at(-1) ?? null

  return {
    rsi14: rsiResult.at(-1) ?? null,
    macd: {
      value: lastMacd?.MACD ?? null,
      signal: lastMacd?.signal ?? null,
      histogram: lastMacd?.histogram ?? null,
    },
    sma20: sma20.at(-1) ?? null,
    sma50: sma50.at(-1) ?? null,
    sma200: sma200.at(-1) ?? null,  // null gdy historia < 200 świec
  }
}
```

**Uwaga:** SMA(200) wymaga co najmniej 200 świec. Przy `period = '1mo'` (~22 dni) zwróci `null` — to poprawne zachowanie, UI powinien obsługiwać `null`.

---

## Krok 4 — Nowe IPC handlery (`electron/main/index.ts`)

Na górze pliku dodać import:

```typescript
import {
  fetchQuote,
  fetchHistory,
  searchTickers,
  fetchFundamentals,
  fetchDividends,
  calculateTechnicals,
} from './finance'
import type { HistoryPeriod } from '../../src/lib/types'
```

W funkcji rejestrującej handlery dodać nową sekcję po `settings`:

```typescript
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
```

---

## Krok 5 — Rozszerzenie contextBridge (`electron/preload/index.ts`)

W wywołaniu `contextBridge.exposeInMainWorld('electronAPI', { ... })` dodać pole `finance` na tym samym poziomie co `assets`, `transactions`, `reports`, `settings`:

```typescript
finance: {
  quote: (ticker: string) =>
    ipcRenderer.invoke('finance:quote', ticker),
  history: (ticker: string, period: string) =>
    ipcRenderer.invoke('finance:history', ticker, period),
  search: (query: string) =>
    ipcRenderer.invoke('finance:search', query),
  fundamentals: (ticker: string) =>
    ipcRenderer.invoke('finance:fundamentals', ticker),
  dividends: (ticker: string) =>
    ipcRenderer.invoke('finance:dividends', ticker),
  technicals: (ticker: string, period: string) =>
    ipcRenderer.invoke('finance:technicals', ticker, period),
},
```

Parametry są typowane jako `string` w preload — preload nie importuje typów z `src/`. Walidacja typów odbywa się w `finance.ts`.

---

## Krok 6 — Rozszerzenie `src/lib/api.ts`

### 6A: Import nowych typów

Dodać do importu z `./types`:

```typescript
import type {
  // ... istniejące typy ...
  OHLCCandle, StockQuote, SearchResult, FundamentalData,
  TechnicalIndicators, DividendEntry, HistoryPeriod,
} from './types'
```

### 6B: Rozszerzenie deklaracji `Window.electronAPI`

W bloku `declare global { interface Window { electronAPI?: { ... } } }` dodać:

```typescript
finance: {
  quote(ticker: string): Promise<StockQuote>
  history(ticker: string, period: HistoryPeriod): Promise<OHLCCandle[]>
  search(query: string): Promise<SearchResult[]>
  fundamentals(ticker: string): Promise<FundamentalData>
  dividends(ticker: string): Promise<DividendEntry[]>
  technicals(ticker: string, period: HistoryPeriod): Promise<TechnicalIndicators>
}
```

### 6C: Mock dane dla trybu dev/przeglądarka

```typescript
// ─── Mock dane dla trybu przeglądarka (bez Electron) ─────────────────────────

const MOCK_QUOTES: Record<string, StockQuote> = {
  AAPL:   { ticker: 'AAPL',   name: 'Apple Inc.',        price: 189.30, change: 2.15,  changePercent: 1.15,  currency: 'USD', volume: 52_400_000, marketCap: 2_950_000_000_000 },
  MSFT:   { ticker: 'MSFT',   name: 'Microsoft Corp.',   price: 415.50, change: -1.20, changePercent: -0.29, currency: 'USD', volume: 18_700_000, marketCap: 3_090_000_000_000 },
  TSLA:   { ticker: 'TSLA',   name: 'Tesla, Inc.',       price: 242.80, change: -5.20, changePercent: -2.10, currency: 'USD', volume: 98_700_000, marketCap: 773_000_000_000  },
  NVDA:   { ticker: 'NVDA',   name: 'NVIDIA Corporation',price: 875.40, change: 18.30, changePercent: 2.14,  currency: 'USD', volume: 41_200_000, marketCap: 2_160_000_000_000 },
  'PKN.WA': { ticker: 'PKN.WA', name: 'PKN Orlen SA',   price: 58.40,  change: 0.80,  changePercent: 1.39,  currency: 'PLN', volume: 1_200_000,  marketCap: 72_000_000_000   },
  'CDR.WA': { ticker: 'CDR.WA', name: 'CD Projekt SA',  price: 148.60, change: -2.40, changePercent: -1.59, currency: 'PLN', volume: 320_000,    marketCap: 14_500_000_000   },
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
```

### 6D: Nowe funkcje eksportowane

```typescript
// ─── Finance API (dane rynkowe) ───────────────────────────────────────────────

export async function getQuote(ticker: string): Promise<StockQuote> {
  if (isElectron()) {
    return window.electronAPI!.finance.quote(ticker)
  }
  await new Promise(r => setTimeout(r, 200 + Math.random() * 300))  // symulacja opóźnienia
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
```

---

## Krok 7 — Komponent wykresu świecowego (`src/components/charts/CandlestickChart.tsx`)

Stworzyć katalog `src/components/charts/` (tworzy się automatycznie przy tworzeniu pliku).

```typescript
import { useEffect, useRef } from 'react'
import { createChart } from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import type { OHLCCandle } from '../../lib/types'

interface Props {
  data: OHLCCandle[]
  ticker: string
  height?: number
}

export function CandlestickChart({ data, ticker, height = 400 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  // Efekt #1: tworzenie/niszczenie wykresu (zależność: height)
  useEffect(() => {
    if (!containerRef.current) return

    chartRef.current = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: '#1f2937' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#374151' },
        horzLines: { color: '#374151' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#374151' },
      timeScale: { borderColor: '#374151', timeVisible: true },
    })

    seriesRef.current = chartRef.current.addCandlestickSeries({
      upColor:        '#10b981',  // finance-green
      downColor:      '#ef4444',  // finance-red
      borderUpColor:  '#10b981',
      borderDownColor:'#ef4444',
      wickUpColor:    '#10b981',
      wickDownColor:  '#ef4444',
    })

    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && chartRef.current) chartRef.current.applyOptions({ width: w })
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chartRef.current?.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [height])

  // Efekt #2: aktualizacja danych (zależność: data, ticker)
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return
    seriesRef.current.setData(data)
    chartRef.current?.timeScale().fitContent()
  }, [data, ticker])

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden"
      style={{ height }}
    />
  )
}
```

**Kluczowe:** Dwa oddzielne `useEffect` — bez tego wykres byłby niszczony i tworzony od nowa przy każdej zmianie danych, co powoduje migotanie.

---

## Krok 8 — Komponent wyszukiwarki (`src/components/StockSearch.tsx`)

```typescript
import { useState, useEffect, useRef, useCallback } from 'react'
import { searchTickers } from '../lib/api'
import type { SearchResult } from '../lib/types'

interface Props {
  onSelect: (ticker: string, name: string) => void
  placeholder?: string
}

export function StockSearch({ onSelect, placeholder = 'Szukaj spółki (np. AAPL, Apple, PKN)...' }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setIsOpen(false); return }
    setLoading(true)
    try {
      const data = await searchTickers(q)
      setResults(data)
      setIsOpen(data.length > 0)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, doSearch])

  // Zamknij dropdown po kliknięciu poza komponentem
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (r: SearchResult) => {
    onSelect(r.ticker, r.name)
    setQuery('')
    setResults([])
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-finance-green"
      />
      {loading && (
        <span className="absolute right-3 top-3.5 text-gray-500 text-xs">Szukam...</span>
      )}
      {isOpen && (
        <ul className="absolute z-50 w-full mt-1 bg-finance-card border border-gray-700 rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {results.map(r => (
            <li
              key={r.ticker}
              onClick={() => handleSelect(r)}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-0"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold text-finance-green text-sm w-20 shrink-0">{r.ticker}</span>
                <span className="text-white text-sm truncate">{r.name}</span>
              </div>
              <div className="flex flex-col items-end shrink-0 ml-2">
                <span className="text-gray-400 text-xs">{r.exchange}</span>
                <span className="text-gray-600 text-xs">{r.type}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {query.length >= 2 && !loading && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-finance-card border border-gray-700 rounded-lg px-4 py-3 text-gray-500 text-sm">
          Brak wyników dla „{query}"
        </div>
      )}
    </div>
  )
}
```

---

## Krok 9 — Aktualizacja `src/App.tsx`

Zastąpić cały plik nowym widokiem testowym Milestone 3. Komponent powinien demonstrować działanie wszystkich zintegrowanych funkcji.

**Struktura komponentu:**

```typescript
import { useState, useEffect } from 'react'
import { getQuote, getHistory, getTechnicals, getEnvironmentInfo } from './lib/api'
import { CandlestickChart } from './components/charts/CandlestickChart'
import { StockSearch } from './components/StockSearch'
import type { StockQuote, OHLCCandle, TechnicalIndicators, HistoryPeriod } from './lib/types'

const PERIODS: HistoryPeriod[] = ['1mo', '3mo', '6mo', '1y', '2y', '5y']

export default function App() {
  const [activeTicker, setActiveTicker] = useState<string | null>(null)
  const [period, setPeriod] = useState<HistoryPeriod>('6mo')
  const [quote, setQuote] = useState<StockQuote | null>(null)
  const [candles, setCandles] = useState<OHLCCandle[]>([])
  const [technicals, setTechnicals] = useState<TechnicalIndicators | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const env = getEnvironmentInfo()

  useEffect(() => {
    if (!activeTicker) return
    setLoading(true)
    setError(null)
    Promise.all([
      getQuote(activeTicker),
      getHistory(activeTicker, period),
      getTechnicals(activeTicker, period),
    ])
      .then(([q, h, t]) => { setQuote(q); setCandles(h); setTechnicals(t) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [activeTicker, period])

  const handleSelect = (ticker: string) => setActiveTicker(ticker)

  return (
    <div className="min-h-screen bg-finance-dark text-white p-6">
      {/* Nagłówek */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-finance-green">Finance Tracker — Milestone 3</h1>
        <span className={`text-xs px-3 py-1 rounded-full ${env.backend === 'electron' ? 'bg-finance-green/20 text-finance-green' : 'bg-yellow-500/20 text-yellow-400'}`}>
          {env.backend === 'electron' ? 'Electron (SQLite)' : 'Dev (Mock data)'}
        </span>
      </div>

      {/* Wyszukiwarka */}
      <div className="mb-6">
        <StockSearch onSelect={handleSelect} />
      </div>

      {/* Manual input */}
      <div className="flex gap-3 mb-8">
        <input
          type="text"
          placeholder="lub wpisz ticker ręcznie (np. GC=F)"
          className="flex-1 bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-finance-green"
          onKeyDown={e => { if (e.key === 'Enter') setActiveTicker((e.target as HTMLInputElement).value.toUpperCase().trim()) }}
        />
        <button
          onClick={(e) => {
            const input = (e.currentTarget.previousElementSibling as HTMLInputElement)
            if (input.value) setActiveTicker(input.value.toUpperCase().trim())
          }}
          className="px-5 py-2.5 bg-finance-green hover:bg-emerald-500 rounded-lg text-sm font-semibold transition-colors"
        >
          Pobierz dane
        </button>
      </div>

      {/* Stany */}
      {loading && (
        <div className="text-center py-16 text-gray-400">Ładowanie danych dla {activeTicker}...</div>
      )}
      {error && (
        <div className="bg-red-900/30 border border-finance-red rounded-lg p-4 text-finance-red mb-6">
          Błąd: {error}
        </div>
      )}

      {/* Dane spółki */}
      {!loading && quote && (
        <div className="space-y-6">
          {/* Quote card */}
          <div className="bg-finance-card rounded-xl p-6 flex items-start justify-between">
            <div>
              <div className="text-gray-400 text-sm font-mono">{quote.ticker}</div>
              <div className="text-white text-lg font-semibold mt-0.5">{quote.name}</div>
              <div className="text-4xl font-bold mt-3">
                {quote.currency} {quote.price.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
              </div>
              <div className={`text-lg font-semibold mt-1 ${quote.changePercent >= 0 ? 'text-finance-green' : 'text-finance-red'}`}>
                {quote.changePercent >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%)
              </div>
            </div>
            <div className="text-right text-sm text-gray-400">
              <div>Wolumen: {quote.volume.toLocaleString('pl-PL')}</div>
              {quote.marketCap && <div>Market Cap: {(quote.marketCap / 1e9).toFixed(1)}B {quote.currency}</div>}
            </div>
          </div>

          {/* Selektor okresu */}
          <div className="flex gap-2">
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === p ? 'bg-finance-green text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Wykres świecowy */}
          {candles.length > 0 && (
            <div className="bg-finance-card rounded-xl p-4">
              <CandlestickChart data={candles} ticker={quote.ticker} height={400} />
            </div>
          )}

          {/* Wskaźniki techniczne */}
          {technicals && (
            <div className="bg-finance-card rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Wskaźniki Techniczne</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-gray-400 text-xs mb-1">RSI(14)</div>
                  <div className={`text-xl font-bold ${!technicals.rsi14 ? 'text-gray-500' : technicals.rsi14 > 70 ? 'text-finance-red' : technicals.rsi14 < 30 ? 'text-finance-green' : 'text-white'}`}>
                    {technicals.rsi14?.toFixed(1) ?? 'N/A'}
                  </div>
                  {technicals.rsi14 && (
                    <div className="text-xs text-gray-500">
                      {technicals.rsi14 > 70 ? 'Wykupiony' : technicals.rsi14 < 30 ? 'Wyprzedany' : 'Neutralny'}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-gray-400 text-xs mb-1">MACD</div>
                  <div className="text-xl font-bold text-white">{technicals.macd.value?.toFixed(3) ?? 'N/A'}</div>
                  <div className="text-xs text-gray-500">Signal: {technicals.macd.signal?.toFixed(3) ?? 'N/A'}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs mb-1">SMA20 / SMA50</div>
                  <div className="text-white text-sm">{technicals.sma20?.toFixed(2) ?? 'N/A'}</div>
                  <div className="text-gray-400 text-sm">{technicals.sma50?.toFixed(2) ?? 'N/A'}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs mb-1">SMA200</div>
                  <div className={`text-xl font-bold ${!technicals.sma200 ? 'text-gray-500' : 'text-white'}`}>
                    {technicals.sma200?.toFixed(2) ?? 'N/A (za mało danych)'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!activeTicker && !loading && (
        <div className="text-center py-20 text-gray-500">
          Wyszukaj spółkę lub wpisz ticker, aby zobaczyć dane
        </div>
      )}
    </div>
  )
}
```

---

## Kolejność wykonania (zależności)

```
Krok 1 (npm install)
  └── Krok 2 (typy)
       ├── Krok 3 (finance.ts)
       │    ├── Krok 4 (IPC handlery)
       │    └── Krok 5 (preload)
       ├── Krok 6 (api.ts)
       ├── Krok 7 (CandlestickChart)
       └── Krok 8 (StockSearch)
            └── Krok 9 (App.tsx) ← wymaga wszystkich powyższych
```

Optymalna kolejność: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9**

---

## Znane pułapki

1. **ESM/CJS (`yahoo-finance2`):** Nie używać statycznego `import yahooFinance from 'yahoo-finance2'` w `electron/main/`. Używać lazy dynamic import jak opisano w Kroku 3.

2. **`time` w sekundach:** `lightweight-charts` wymaga Unix timestamp w sekundach. `Date.getTime()` zwraca milisekundy — zawsze dzielić przez 1000.

3. **Sortowanie historii rosnąco:** `lightweight-charts` rzuci błąd jeśli dane nie są posortowane rosnąco po `time`. Sortować w `fetchHistory` i `generateMockCandles`.

4. **SMA(200) = null przy krótkich periodach:** `'1mo'` to ~22 świece, `'3mo'` ~66 świec — SMA(200) zwróci `null`. UI musi to obsługiwać.

5. **`lightweight-charts` wersja:** Zablokować na `^4.x` w `package.json`. API v5 może się różnić.

6. **Ticker złota `GC=F`:** Poprawnie obsługiwany przez `yahoo-finance2` jako kontrakt futures. Nie jest to akcja, więc `fetchFundamentals` i `fetchDividends` mogą zwrócić puste/null dane — to poprawne.

7. **Polskie spółki `.WA`:** Ticker `PKN.WA` jest poprawny dla Yahoo Finance. Zwraca ceny w PLN.

---

## Weryfikacja po implementacji

### Tryb dev (`npm run dev`, przeglądarka)

1. Otworzyć `http://[IP]:5173` — aplikacja się ładuje bez błędów.
2. Wpisać "Apple" w wyszukiwarce → dropdown z AAPL (i innymi).
3. Kliknąć AAPL → wykres świecowy + karta ceny ($189.30) + wskaźniki.
4. Zmienić okres `6mo` → `1y` → wykres odświeża się (więcej świec).
5. Wpisać "GC=F" ręcznie → dane dla złota w USD, typ FUTURE.
6. Wpisać "PKN.WA" → cena w PLN.
7. Sprawdzić że SMA200 przy `1mo` = "N/A".

### Tryb Electron (docelowo `.exe`)

1. Prawdziwe ceny z Yahoo Finance (nie mock).
2. Wyszukiwarka zwraca rzeczywiste wyniki (nie statyczna lista).
3. RSI/MACD/SMA obliczone z rzeczywistych danych historycznych.
4. Przy błędnym tickerze (np. "XXXX") → error state w UI, nie crash.

### Weryfikacja kodu

```bash
npm run build   # musi przejść bez błędów TypeScript
```

- Brak importów Node.js w `src/` (tylko `import type` dozwolone).
- Brak bezpośrednich wywołań `window.electronAPI` w komponentach React.
