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
    _yf = new mod.default({ suppressNotices: ['ripHistorical'] })
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
  const rows = await yf.historical(ticker, { period1, period2: now }, { validateResult: false })
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
    ticker: (q.symbol ?? '') as string,
    name: (q as any).shortname ?? (q as any).longname ?? q.symbol ?? '',
    exchange: (q as any).exchange ?? '',
    type: (q.quoteType ?? 'EQUITY') as string,
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
    dividendRate: (sd as any)?.dividendRate ?? null,
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
  let currency = 'USD'
  try {
    const quoteResult = await yf.quoteSummary(ticker, { modules: ['price'] })
    currency = (quoteResult.price as any)?.currency ?? 'USD'
  } catch {}
  const rows = await yf.historical(ticker, {
    period1: '2015-01-01',
    period2: new Date(),
    events: 'dividends',
  })
  return rows
    .filter(r => (r as any).dividends != null)
    .map(r => ({
      date: r.date.toISOString().split('T')[0],
      amount: (r as any).dividends as number,
      currency,
    }))
}

const EXCHANGE_TO_REGION: Record<string, string> = {
  'NMS': 'Ameryka', 'NGM': 'Ameryka', 'NCM': 'Ameryka',
  'NYQ': 'Ameryka', 'NYSEArca': 'Ameryka',
  'PCX': 'Ameryka', 'BATS': 'Ameryka', 'CBOE': 'Ameryka',
  'TSX': 'Ameryka', 'MEX': 'Ameryka',
  'WSE': 'Europa', 'GPW': 'Europa',
  'GER': 'Europa', 'XETRA': 'Europa', 'FRA': 'Europa',
  'LSE': 'Europa', 'IOB': 'Europa',
  'PAR': 'Europa', 'AMS': 'Europa', 'BRU': 'Europa',
  'STO': 'Europa', 'HEL': 'Europa', 'CPH': 'Europa',
  'VIE': 'Europa', 'ZUR': 'Europa', 'MIL': 'Europa',
  'MCE': 'Europa', 'LIS': 'Europa',
  'TYO': 'Azja', 'OSA': 'Azja',
  'HKG': 'Azja', 'HKSE': 'Azja',
  'SHH': 'Azja', 'SHZ': 'Azja',
  'KSC': 'Azja', 'KOE': 'Azja',
  'SGX': 'Azja', 'BSE': 'Azja', 'NSE': 'Azja',
  'TAI': 'Azja', 'BKK': 'Azja',
}

export async function fetchAssetMeta(ticker: string): Promise<{ region: string; assetType: string; sector: string | null }> {
  try {
    const yf = await getYF()
    const result = await yf.quoteSummary(ticker, { modules: ['price', 'assetProfile'] })
    const quote: any = result.price ?? {}
    const ap: any = result.assetProfile ?? {}

    let region = 'Inne'
    if (quote.quoteType === 'FUTURE') {
      region = 'Surowce'
    } else if (quote.quoteType === 'ETF') {
      const name = (quote.longName ?? quote.shortName ?? '').toLowerCase()
      region = /world|global|international|msci world|all country|emerging/i.test(name)
        ? 'Świat'
        : (EXCHANGE_TO_REGION[quote.fullExchangeName ?? ''] ?? EXCHANGE_TO_REGION[quote.exchange ?? ''] ?? 'Inne')
    } else {
      region = EXCHANGE_TO_REGION[quote.fullExchangeName ?? ''] ?? EXCHANGE_TO_REGION[quote.exchange ?? ''] ?? 'Inne'
    }

    let assetType = 'Akcje'
    if (quote.quoteType === 'FUTURE') {
      if (ticker === 'GC=F') assetType = 'Złoto'
      else if (ticker === 'SI=F') assetType = 'Srebro'
      else if (ticker === 'CL=F') assetType = 'Ropa'
      else assetType = 'Surowiec'
    } else if (quote.quoteType === 'ETF') assetType = 'ETF'
    else if (quote.quoteType === 'MUTUALFUND') assetType = 'Fundusz'
    else if (quote.quoteType === 'CRYPTOCURRENCY') assetType = 'Krypto'

    const sector: string | null = ap.sector ?? (quote.quoteType === 'ETF' ? 'ETF' : null)

    return { region, assetType, sector }
  } catch {
    return { region: 'Inne', assetType: 'Akcje', sector: null }
  }
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

export async function fetchPortfolioHistory(
  assets: Array<{ ticker: string; quantity: number; currency: string; purchase_date?: string; gold_grams?: number | null }>,
  period: string = '1y'
): Promise<{ date: string; value: number }[]> {
  if (assets.length === 0) return []

  const yf = await getYF()
  const now = new Date()
  const periodDays = PERIOD_DAYS[period as HistoryPeriod] ?? 365
  const period1 = new Date(now.getTime() - periodDays * 86_400_000)

  const histories = await Promise.all(
    assets.map(async (asset) => {
      try {
        const hist = await yf.historical(
          asset.ticker,
          { period1, period2: now },
          { validateResult: false }
        )
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

  // Zbierz wszystkie daty z historii
  const dateSet = new Set<string>()
  histories.forEach(({ hist }) =>
    hist.forEach((h: any) => dateSet.add(h.date.toISOString().split('T')[0]))
  )
  const dates = Array.from(dateSet).sort()

  // Dla benchmarku: zawsze używaj aktualnych ilości dla wszystkich dat historycznych.
  // Nie filtrujemy po purchase_date — to daje "jak by wyglądał portfel w aktualnym składzie".
  const result = dates.map(date => {
    let totalPLN = 0
    histories.forEach(({ asset, hist }) => {
      const entry = hist
        .filter((h: any) => h.date.toISOString().split('T')[0] <= date)
        .at(-1)
      if (entry?.close) {
        // Dla metali fizycznych: cena spot to USD/oz troy → przelicz przez wagę monety
        const ozPerCoin = asset.gold_grams ? asset.gold_grams / 31.1035 : null
        const pricePerUnit = ozPerCoin ? entry.close * ozPerCoin : entry.close
        totalPLN += asset.quantity * pricePerUnit * toPlnRate(asset.currency)
      }
    })
    return { date, value: totalPLN }
  })

  // Odcinamy wiodące zera (brak danych na początku okresu dla niektórych tickerów)
  const firstNonZero = result.findIndex(r => r.value > 0)
  return firstNonZero >= 0 ? result.slice(firstNonZero) : result
}
