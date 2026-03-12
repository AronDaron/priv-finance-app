import type {
  OHLCCandle, StockQuote, SearchResult,
  FundamentalData, TechnicalIndicators, DividendEntry, HistoryPeriod
} from '../../src/lib/types'
import * as ti from 'technicalindicators'

// Dynamic import — wymagany bo yahoo-finance2 jest ESM, a main process to CJS
// yahoo-finance2 v3: default to klasa, trzeba wywołać new YahooFinance()
type YFInstance = InstanceType<typeof import('yahoo-finance2')['default']>
let _yf: YFInstance | null = null
async function getYF(): Promise<YFInstance> {
  if (!_yf) {
    const mod = await import('yahoo-finance2')
    _yf = new mod.default()
  }
  return _yf
}

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
