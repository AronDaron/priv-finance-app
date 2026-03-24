import type {
  OHLCCandle, StockQuote, SearchResult,
  FundamentalData, TechnicalIndicators, DividendEntry, HistoryPeriod,
  GlobalMarketData, MarketTickerData,
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
  try {
    const result = await yf.chart(ticker, { period1, period2: now, interval: '1d' })
    return (result.quotes ?? [])
      .filter(r => r.open != null && r.high != null && r.low != null && r.close != null)
      .map(r => ({
        time: Math.floor(r.date.getTime() / 1000),
        open: r.open!,
        high: r.high!,
        low: r.low!,
        close: r.close!,
        volume: r.volume ?? 0,
      }))
      .sort((a, b) => a.time - b.time)
  } catch {
    return []
  }
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

  const [baseResult, stockResult, etfResult] = await Promise.all([
    yf.quoteSummary(ticker, { modules: ['summaryDetail', 'defaultKeyStatistics', 'assetProfile'] }),
    yf.quoteSummary(ticker, { modules: ['financialData', 'recommendationTrend', 'calendarEvents'] }).catch(() => ({})),
    yf.quoteSummary(ticker, { modules: ['topHoldings', 'fundProfile'] }).catch(() => ({})),
  ])

  const sd = (baseResult as any).summaryDetail
  const ks = (baseResult as any).defaultKeyStatistics
  const ap = (baseResult as any).assetProfile
  const fd = (stockResult as any).financialData ?? null
  const rt = (stockResult as any).recommendationTrend ?? null
  const ce = (stockResult as any).calendarEvents ?? null
  const th = (etfResult as any).topHoldings ?? null
  const fp = (etfResult as any).fundProfile ?? null

  const trend0 = rt?.trend?.[0] ?? null

  const rawDate = ce?.earnings?.earningsDate?.[0]
  const nextEarningsDate = rawDate ? new Date(rawDate).toISOString().split('T')[0] : null

  return {
    pe: sd?.trailingPE ?? null,
    eps: ks?.trailingEps ?? null,
    dividendYield: sd?.dividendYield ?? null,
    dividendRate: sd?.dividendRate ?? null,
    marketCap: sd?.marketCap ?? null,
    week52High: sd?.fiftyTwoWeekHigh ?? null,
    week52Low: sd?.fiftyTwoWeekLow ?? null,
    beta: sd?.beta ?? null,
    sector: ap?.sector ?? null,
    industry: ap?.industry ?? null,
    totalRevenue: fd?.totalRevenue ?? null,
    revenueGrowth: fd?.revenueGrowth ?? null,
    grossMargins: fd?.grossMargins ?? null,
    profitMargins: fd?.profitMargins ?? null,
    totalDebt: fd?.totalDebt ?? null,
    totalCash: fd?.totalCash ?? null,
    analystRecommendation: fd?.recommendationKey ?? null,
    numberOfAnalysts: fd?.numberOfAnalystOpinions ?? null,
    targetMeanPrice: fd?.targetMeanPrice ?? null,
    earningsGrowth: fd?.earningsGrowth ?? null,
    recommendationTrend: trend0 ? {
      strongBuy: trend0.strongBuy ?? 0,
      buy: trend0.buy ?? 0,
      hold: trend0.hold ?? 0,
      sell: trend0.sell ?? 0,
      strongSell: trend0.strongSell ?? 0,
    } : null,
    nextEarningsDate,
    topHoldings: th?.holdings?.length
      ? th.holdings.slice(0, 5).map((h: any) => ({ name: h.holdingName ?? '', percent: h.holdingPercent?.raw ?? null }))
      : null,
    fundFamily: fp?.family ?? null,
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
      region = 'Świat'
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

    const SECTOR_PL: Record<string, string> = {
      'Basic Materials': 'Surowce podstawowe',
      'Communication Services': 'Usługi komunikacyjne',
      'Consumer Cyclical': 'Dobra cykliczne',
      'Consumer Defensive': 'Dobra podstawowe',
      'Energy': 'Energetyka',
      'Financial Services': 'Usługi finansowe',
      'Healthcare': 'Ochrona zdrowia',
      'Industrials': 'Przemysł',
      'Real Estate': 'Nieruchomości',
      'Technology': 'Technologia',
      'Utilities': 'Usługi komunalne',
    }
    const rawSector: string | null = ap.sector ?? (quote.quoteType === 'ETF' ? 'ETF' : null)
    const sector = rawSector ? (SECTOR_PL[rawSector] ?? rawSector) : null

    return { region, assetType, sector }
  } catch {
    return { region: 'Inne', assetType: 'Akcje', sector: null }
  }
}

export function calculateTechnicals(candles: OHLCCandle[]): TechnicalIndicators {
  const closes = candles.map(c => c.close)
  const highs  = candles.map(c => c.high)
  const lows   = candles.map(c => c.low)

  const rsiResult  = ti.RSI.calculate({ values: closes, period: 14 })
  const macdResult = ti.MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  })
  const sma20  = ti.SMA.calculate({ values: closes, period: 20 })
  const sma50  = ti.SMA.calculate({ values: closes, period: 50 })
  const sma200 = ti.SMA.calculate({ values: closes, period: 200 })

  const bbResult  = ti.BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 })
  const atrResult = ti.ATR.calculate({ high: highs, low: lows, close: closes, period: 14 })
  const adxResult = ti.ADX.calculate({ high: highs, low: lows, close: closes, period: 14 })

  const lastMacd = macdResult.at(-1) ?? null
  const lastBB   = bbResult.at(-1) ?? null
  const lastADX  = adxResult.at(-1) ?? null

  return {
    rsi14: rsiResult.at(-1) ?? null,
    macd: {
      value: lastMacd?.MACD ?? null,
      signal: lastMacd?.signal ?? null,
      histogram: lastMacd?.histogram ?? null,
    },
    sma20:  sma20.at(-1)  ?? null,
    sma50:  sma50.at(-1)  ?? null,
    sma200: sma200.at(-1) ?? null,
    bollingerBands: lastBB ? {
      upper:     lastBB.upper,
      middle:    lastBB.middle,
      lower:     lastBB.lower,
      bandwidth: ((lastBB.upper - lastBB.lower) / lastBB.middle) * 100,
    } : null,
    atr14: atrResult.at(-1) ?? null,
    adx14: lastADX ? {
      adx: lastADX.adx,
      pdi: lastADX.pdi,
      mdi: lastADX.mdi,
    } : null,
  }
}

export async function fetchPortfolioHistory(
  assets: Array<{ ticker: string; quantity: number; currency: string; purchase_date?: string; gold_grams?: number | null; asset_type?: string; bond_year1_rate?: number | null }>,
  period: string = '1y',
  cashTransactions: Array<{ type: 'deposit' | 'withdrawal'; amount: number; currency: string; date: string }> = [],
  bondValueCalc?: (asset: any, date: string) => number
): Promise<{ date: string; value: number }[]> {
  if (assets.length === 0) return []

  const bondAssets = assets.filter(a => a.asset_type === 'bond')
  const stockAssets = assets.filter(a => a.asset_type !== 'bond')

  const yf = await getYF()
  const now = new Date()
  const periodDays = PERIOD_DAYS[period as HistoryPeriod] ?? 365
  const period1 = new Date(now.getTime() - periodDays * 86_400_000)

  const histories = await Promise.all(
    stockAssets.map(async (asset) => {
      try {
        const result = await yf.chart(asset.ticker, { period1, period2: now, interval: '1d' })
        const quoteCurrency: string = (result.meta as any)?.currency ?? asset.currency
        return { asset, hist: result.quotes ?? [], quoteCurrency }
      } catch {
        return { asset, hist: [] as any[], quoteCurrency: asset.currency }
      }
    })
  )

  const FX_PAIRS: [string, string, number][] = [
    ['USD', 'USDPLN=X', 4.0], ['EUR', 'EURPLN=X', 4.3],
    ['CHF', 'CHFPLN=X', 4.5], ['GBP', 'GBPPLN=X', 5.1],
    ['JPY', 'JPYPLN=X', 0.027], ['NOK', 'NOKPLN=X', 0.37], ['SEK', 'SEKPLN=X', 0.38],
  ]
  const fxRates = new Map<string, number>([['PLN', 1]])
  await Promise.all(FX_PAIRS.map(async ([cur, ticker, fallback]) => {
    try {
      const res = await yf.quoteSummary(ticker, { modules: ['price'] })
      fxRates.set(cur, (res.price as any)?.regularMarketPrice ?? fallback)
    } catch {
      fxRates.set(cur, fallback)
    }
  }))

  const toPlnRate = (cur: string) => fxRates.get(cur) ?? 1

  // Zbierz wszystkie daty z historii
  const dateSet = new Set<string>()
  histories.forEach(({ hist }) =>
    hist.forEach((h: any) => dateSet.add(h.date.toISOString().split('T')[0]))
  )
  // Gdy brak danych rynkowych (np. sam portfel obligacji), generuj zakres dat dla okresu
  if (dateSet.size === 0 && bondAssets.length > 0) {
    for (let d = new Date(period1); d <= now; d.setDate(d.getDate() + 1)) {
      dateSet.add(d.toISOString().split('T')[0])
    }
  }
  const dates = Array.from(dateSet).sort()

  // Dla benchmarku: zawsze używaj aktualnych ilości dla wszystkich dat historycznych.
  // Nie filtrujemy po purchase_date — to daje "jak by wyglądał portfel w aktualnym składzie".
  const result = dates.map(date => {
    let totalPLN = 0
    histories.forEach(({ asset, hist, quoteCurrency }) => {
      const entry = hist
        .filter((h: any) => h.date.toISOString().split('T')[0] <= date)
        .at(-1)
      if (entry?.close) {
        // Dla metali fizycznych: cena spot to USD/oz troy → przelicz przez wagę monety
        const ozPerCoin = asset.gold_grams ? asset.gold_grams / 31.1035 : null
        const pricePerUnit = ozPerCoin ? entry.close * ozPerCoin : entry.close
        totalPLN += asset.quantity * pricePerUnit * toPlnRate(quoteCurrency)
      }
    })
    // Obligacje: faktyczna wartość przez bondValueCalc (z narosłymi odsetkami), fallback: nominał
    bondAssets.forEach(bond => {
      const purchaseDate = bond.purchase_date ? bond.purchase_date.split('T')[0] : ''
      if (!purchaseDate || purchaseDate <= date) {
        totalPLN += bondValueCalc ? bondValueCalc(bond, date) : bond.quantity * 100
      }
    })
    // Saldo gotówki na dany dzień
    const cashByCurrency = new Map<string, number>()
    cashTransactions
      .filter(t => t.date <= date)
      .forEach(t => {
        const prev = cashByCurrency.get(t.currency) ?? 0
        cashByCurrency.set(t.currency, prev + (t.type === 'deposit' ? t.amount : -t.amount))
      })
    cashByCurrency.forEach((balance, currency) => {
      if (balance > 0) totalPLN += balance * toPlnRate(currency)
    })
    return { date, value: totalPLN }
  })

  // Odcinamy wiodące zera (brak danych na początku okresu dla niektórych tickerów)
  const firstNonZero = result.findIndex(r => r.value > 0)
  return firstNonZero >= 0 ? result.slice(firstNonZero) : result
}

// ─── Globalny rynek — dane surowców, walut, indeksów ─────────────────────────

async function safeQuote(ticker: string): Promise<MarketTickerData> {
  try {
    const q = await fetchQuote(ticker)
    return {
      ticker,
      name: q.name,
      price: q.price,
      change: q.change,
      changePercent: q.changePercent,
      change1m: 0,
    }
  } catch {
    return { ticker, name: ticker, price: 0, change: 0, changePercent: 0, change1m: 0 }
  }
}

async function get1mChange(ticker: string): Promise<number> {
  try {
    const history = await fetchHistory(ticker, '1mo')
    if (history.length < 2) return 0
    const first = history[0].close
    const last  = history[history.length - 1].close
    return first > 0 ? ((last - first) / first) * 100 : 0
  } catch {
    return 0
  }
}

// ─── Cache globalMarket (TTL 5 min) ──────────────────────────────────────────
let _globalMarketCache: { data: GlobalMarketData; expiresAt: number } | null = null
const GLOBAL_MARKET_TTL = 5 * 60 * 1000

export async function fetchGlobalMarketData(): Promise<GlobalMarketData> {
  if (_globalMarketCache && Date.now() < _globalMarketCache.expiresAt) {
    return _globalMarketCache.data
  }

  // Krok 1: wszystkie cytaty równolegle
  const [
    oil, brent, gas, wheat, copper, gold,
    eurusd, gbpusd, chfusd, cadusd, audusd, jpyusd, cnyusd,
    sp500, dax, nikkei, wig20, ftse, vix, fxi,
    asx200, eza, bvsp, vwo, inda, ewj,
    us10y,
  ] = await Promise.all([
    safeQuote('CL=F'),
    safeQuote('BZ=F'),
    safeQuote('NG=F'),
    safeQuote('ZW=F'),
    safeQuote('HG=F'),
    safeQuote('GC=F'),
    safeQuote('EURUSD=X'),
    safeQuote('GBPUSD=X'),
    safeQuote('CHFUSD=X'),
    safeQuote('CADUSD=X'),
    safeQuote('AUDUSD=X'),
    safeQuote('JPYUSD=X'),
    safeQuote('CNYUSD=X'),
    safeQuote('^GSPC'),
    safeQuote('^GDAXI'),
    safeQuote('^N225'),
    safeQuote('WIG20.WA'),
    safeQuote('^FTSE'),
    safeQuote('^VIX'),
    safeQuote('FXI'),
    safeQuote('^AXJO'),   // Australia ASX 200
    safeQuote('EZA'),     // iShares MSCI South Africa
    safeQuote('^BVSP'),   // Bovespa (Brazylia / Ameryka Łacińska)
    safeQuote('VWO'),     // Vanguard FTSE Emerging Markets ETF (szeroki proxy EM)
    safeQuote('INDA'),    // iShares MSCI India ETF
    safeQuote('EWJ'),     // iShares MSCI Japan ETF (USD-denominated)
    safeQuote('^TNX'),
  ])

  // Krok 2: zmiana 30-dniowa dla kluczowych indeksów (równolegle)
  const monthlyKey = ['^GSPC', '^GDAXI', '^N225', 'WIG20.WA', '^FTSE', 'FXI', 'CL=F', 'BZ=F', 'GC=F', 'HG=F', 'NG=F', 'ZW=F', '^AXJO', 'EZA', '^BVSP', 'VWO', 'INDA', 'EWJ']
  const monthly = await Promise.all(monthlyKey.map(t => get1mChange(t)))
  const m: Record<string, number> = {}
  monthlyKey.forEach((t, i) => { m[t] = monthly[i] })

  sp500.change1m   = m['^GSPC']    ?? 0
  dax.change1m     = m['^GDAXI']   ?? 0
  nikkei.change1m  = m['^N225']    ?? 0
  wig20.change1m   = m['WIG20.WA'] ?? 0
  ftse.change1m    = m['^FTSE']    ?? 0
  fxi.change1m     = m['FXI']      ?? 0
  oil.change1m     = m['CL=F']     ?? 0
  brent.change1m   = m['BZ=F']     ?? 0
  gold.change1m    = m['GC=F']     ?? 0
  copper.change1m  = m['HG=F']     ?? 0
  asx200.change1m  = m['^AXJO']    ?? 0
  eza.change1m     = m['EZA']      ?? 0
  bvsp.change1m    = m['^BVSP']    ?? 0
  gas.change1m     = m['NG=F']     ?? 0
  wheat.change1m   = m['ZW=F']     ?? 0
  vwo.change1m     = m['VWO']      ?? 0
  inda.change1m    = m['INDA']     ?? 0
  ewj.change1m     = m['EWJ']      ?? 0

  const result: GlobalMarketData = {
    commodities: { oil, brent, gas, wheat, copper, gold },
    currencies:  { EURUSD: eurusd, GBPUSD: gbpusd, CHFUSD: chfusd, CADUSD: cadusd, AUDUSD: audusd, JPYUSD: jpyusd, CNYUSD: cnyusd },
    indices:     { SP500: sp500, DAX: dax, Nikkei: nikkei, WIG20: wig20, FTSE: ftse, VIX: vix, FXI: fxi, ASX200: asx200, EZA: eza, BVSP: bvsp, VWO: vwo, INDA: inda, EWJ: ewj },
    bonds:       { US10Y: us10y },
    fetchedAt:   new Date().toISOString(),
  }
  _globalMarketCache = { data: result, expiresAt: Date.now() + GLOBAL_MARKET_TTL }
  return result
}
