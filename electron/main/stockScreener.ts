// electron/main/stockScreener.ts
// Algorytm scoringowy dla panelu Scoring.
// Pobiera top 20 spółek per giełda (via yf.screener), następnie
// quoteSummary + chart per spółka i oblicza Profitability/Safety/Valuation → Total Score.

import type { StockScoringResult, StockSubScore, MarketRegime } from '../../src/lib/types'
import { detectMarketRegime } from './globalScore'
import { fetchGlobalMarketData } from './finance'

// Dynamic import — yahoo-finance2 jest ESM, main process to CJS
type YFInstance = InstanceType<typeof import('yahoo-finance2')['default']>
let _yf: YFInstance | null = null
async function getYF(): Promise<YFInstance> {
  if (!_yf) {
    const mod = await import('yahoo-finance2')
    _yf = new mod.default({ suppressNotices: ['ripHistorical'] })
  }
  return _yf
}

// ─── Konfiguracja giełd ───────────────────────────────────────────────────────
// yf.screener() w v3 nie obsługuje filtrowania po giełdzie (wymaga scrIds).
// Używamy hardcoded list top spółek wg market cap — stabilne dla dużych giełd.

export interface ExchangeConfig {
  label: string
  tickers: string[]
}

export const EXCHANGE_CONFIG: Record<string, ExchangeConfig> = {
  NYQ: {
    label: 'NYSE',
    tickers: [
      'BRK-B', 'JPM', 'V', 'WMT', 'XOM', 'JNJ', 'PG', 'MA',
      'CVX', 'HD', 'BAC', 'KO', 'MRK', 'PEP', 'ABBV',
      'TMO', 'ACN', 'CRM', 'MCD', 'NKE',
    ],
  },
  NMS: {
    label: 'NASDAQ',
    tickers: [
      'AAPL', 'NVDA', 'MSFT', 'AMZN', 'META', 'TSLA', 'GOOGL', 'GOOG',
      'AVGO', 'COST', 'NFLX', 'AMD', 'QCOM', 'INTC', 'CSCO',
      'ADBE', 'TXN', 'AMGN', 'INTU', 'PYPL',
    ],
  },
  LSE: {
    label: 'LSE',
    tickers: [
      'SHEL.L', 'AZN.L', 'HSBA.L', 'ULVR.L', 'BP.L',
      'RIO.L', 'GSK.L', 'BATS.L', 'DGE.L', 'LLOY.L',
      'BHP.L', 'REL.L', 'NG.L', 'LSEG.L', 'NWG.L',
      'VOD.L', 'IMB.L', 'CPG.L', 'EXPN.L', 'WPP.L',
    ],
  },
  GER: {
    label: 'XETRA',
    tickers: [
      'SAP.DE', 'SIE.DE', 'ALV.DE', 'MUV2.DE', 'DTE.DE',
      'MBG.DE', 'BAYN.DE', 'BMW.DE', 'BAS.DE', 'VOW3.DE',
      'RWE.DE', 'DB1.DE', 'HEN3.DE', 'ADS.DE', 'DBK.DE',
      'FRE.DE', 'HEI.DE', 'QIA.DE', 'CON.DE', 'MTX.DE',
    ],
  },
  JPX: {
    label: 'TSE',
    tickers: [
      '7203.T', '6758.T', '9984.T', '8306.T', '6861.T',
      '9432.T', '8035.T', '4063.T', '6367.T', '9433.T',
      '8316.T', '7267.T', '6902.T', '4502.T', '9022.T',
      '8031.T', '6981.T', '7751.T', '4661.T', '8411.T',
    ],
  },
  PAR: {
    label: 'Euronext',
    tickers: [
      'MC.PA', 'TTE.PA', 'SAN.PA', 'AIR.PA', 'OR.PA',
      'BNP.PA', 'SU.PA', 'AI.PA', 'CS.PA', 'BN.PA',
      'CAP.PA', 'DG.PA', 'VIV.PA', 'ACA.PA', 'SGO.PA',
      'RI.PA', 'RMS.PA', 'KER.PA', 'ORA.PA', 'GLE.PA',
    ],
  },
  WSE: {
    label: 'GPW',
    tickers: [
      'PKN.WA', 'PKO.WA', 'PZU.WA', 'PEKAO.WA', 'LPP.WA',
      'KGHM.WA', 'CDR.WA', 'ALE.WA', 'DNP.WA', 'KTY.WA',
      'SPL.WA', 'CPS.WA', 'MBK.WA', 'PGE.WA', 'PHN.WA',
      'JSW.WA', 'TPE.WA', 'OPL.WA', 'BDX.WA', 'VRG.WA',
    ],
  },
}

// ─── Helpery matematyczne ─────────────────────────────────────────────────────

function clamp(x: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, x))
}

// Interpolacja liniowa między punktami kotwicznymi [rawValue, score0to100]
function linearInterp(value: number, anchors: [number, number][]): number {
  if (value <= anchors[0][0]) return anchors[0][1]
  if (value >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1]
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i]
    const [x1, y1] = anchors[i + 1]
    if (value >= x0 && value <= x1) {
      return y0 + (y1 - y0) * ((value - x0) / (x1 - x0))
    }
  }
  return 50
}

// Percentyl ranku w tablicy (wyższy = lepszy)
function percentileRank(value: number, allValues: number[]): number {
  const valid = allValues.filter(v => isFinite(v))
  if (valid.length <= 1) return 50
  const sorted = [...valid].sort((a, b) => a - b)
  const rank = sorted.filter(v => v < value).length
  return clamp((rank / (sorted.length - 1)) * 100)
}

// Percentyl ranku odwrócony (niższy = lepszy, np. P/E)
function percentileRankInverted(value: number, allValues: number[]): number {
  return 100 - percentileRank(value, allValues)
}

function sub(value: number | null | undefined, score: number | null, rank?: number | null): StockSubScore {
  return {
    value: value != null ? value : null,
    score,
    rank: rank ?? null,
  }
}

// ─── Wagi kategorii z korektą MarketRegime ────────────────────────────────────

function computeRegimeAdjustedWeights(regime: MarketRegime): {
  profitability: number
  safety: number
  valuation: number
} {
  let w = { profitability: 0.40, safety: 0.30, valuation: 0.30 }

  if (regime.vixLevel === 'panic') {
    w.safety *= 2.5
    w.profitability *= 0.5
    w.valuation *= 0.3
  } else if (regime.vixLevel === 'elevated') {
    w.safety *= 1.5
    w.valuation *= 0.7
  }

  if (regime.bondStress === 'shock') {
    w.safety *= 2.0
    w.valuation *= 0.5
  } else if (regime.bondStress === 'elevated') {
    w.safety *= 1.4
  }

  if (regime.oilShock) {
    w.profitability *= 1.3
    w.safety *= 0.9
  }

  if (regime.copperCrash || regime.goldRally) {
    w.safety *= 1.6
    w.valuation *= 0.7
    w.profitability *= 0.8
  }

  const sum = w.profitability + w.safety + w.valuation
  return {
    profitability: w.profitability / sum,
    safety: w.safety / sum,
    valuation: w.valuation / sum,
  }
}

// Ważona średnia score (pomijamy null)
function weightedAvg(pairs: { score: number | null; weight: number }[]): number | null {
  const valid = pairs.filter(p => p.score !== null) as { score: number; weight: number }[]
  if (valid.length === 0) return null
  const totalW = valid.reduce((s, p) => s + p.weight, 0)
  if (totalW === 0) return null
  return valid.reduce((s, p) => s + p.score * (p.weight / totalW), 0)
}

// ─── Concurrency limiter ──────────────────────────────────────────────────────

async function withConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let i = 0
  async function run() {
    while (i < tasks.length) {
      const idx = i++
      try {
        results[idx] = { status: 'fulfilled', value: await tasks[idx]() }
      } catch (e) {
        results[idx] = { status: 'rejected', reason: e }
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, run)
  await Promise.all(workers)
  return results
}

interface RawStockData {
  ticker: string
  name: string
  exchange: string
  marketCap: number | null
  currency: string
  // quoteSummary fields
  revenueGrowth: number | null
  earningsGrowth: number | null
  grossMargins: number | null
  profitMargins: number | null
  totalDebt: number | null
  totalCash: number | null
  beta: number | null
  trailingPE: number | null
  shortPercentOfFloat: number | null
  recommendationKey: string | null
  forwardPE: number | null
  pegRatio: number | null
  fiftyTwoWeekHigh: number | null
  regularMarketPrice: number | null
  dividendYield: number | null
  forwardEpsGrowth: number | null
  // chart
  momentumReturn: number | null  // (priceEnd/priceStart - 1) * 100
}

// ─── Ticker list ─────────────────────────────────────────────────────────────

function getTickersForExchange(exchangeKey: string): string[] {
  return EXCHANGE_CONFIG[exchangeKey]?.tickers ?? []
}

async function fetchRawStockData(
  ticker: string,
  exchangeKey: string,
  lookbackDays: number
): Promise<RawStockData> {
  const yf = await getYF()

  // quoteSummary — 5 modułów
  let qsResult: any = null
  try {
    qsResult = await yf.quoteSummary(ticker, {
      modules: ['price', 'financialData', 'defaultKeyStatistics', 'summaryDetail', 'earningsTrend'],
    })
  } catch (e) {
    console.warn(`[Screener] quoteSummary failed for ${ticker}:`, e)
  }

  const price = qsResult?.price ?? {}
  const fd = qsResult?.financialData ?? {}
  const dks = qsResult?.defaultKeyStatistics ?? {}
  const sd = qsResult?.summaryDetail ?? {}
  const et = qsResult?.earningsTrend ?? {}

  const forwardEpsGrowth = et?.trend?.[0]?.growth ?? null

  // chart — price momentum
  let momentumReturn: number | null = null
  try {
    const period1 = new Date(Date.now() - lookbackDays * 86_400_000)
    const period2 = new Date()
    const hist = await yf.chart(ticker, { period1, period2, interval: '1d' })
    const quotes = hist?.quotes ?? []
    if (quotes.length >= 2) {
      const priceStart = quotes[0]?.close ?? quotes[0]?.open ?? null
      const priceEnd = quotes[quotes.length - 1]?.close ?? null
      if (priceStart && priceEnd && priceStart > 0) {
        momentumReturn = (priceEnd / priceStart - 1) * 100
      }
    }
  } catch (e) {
    // momentum niedostępne — pomijamy
  }

  const n = (v: any): number | null => (v != null && isFinite(Number(v)) ? Number(v) : null)

  return {
    ticker,
    name: price.shortName ?? price.longName ?? ticker,
    exchange: exchangeKey,
    marketCap: n(price.marketCap),
    currency: price.currency ?? 'USD',
    revenueGrowth: n(fd.revenueGrowth),
    earningsGrowth: n(fd.earningsGrowth),
    grossMargins: n(fd.grossMargins),
    profitMargins: n(fd.profitMargins),
    totalDebt: n(fd.totalDebt),
    totalCash: n(fd.totalCash),
    beta: n(sd.beta),
    trailingPE: n(sd.trailingPE),
    shortPercentOfFloat: n(dks.shortPercentOfFloat),
    recommendationKey: fd.recommendationKey ?? null,
    forwardPE: n(dks.forwardPE),
    pegRatio: n(dks.pegRatio),
    fiftyTwoWeekHigh: n(sd.fiftyTwoWeekHigh),
    regularMarketPrice: n(price.regularMarketPrice),
    dividendYield: n(sd.dividendYield),
    forwardEpsGrowth: n(forwardEpsGrowth),
    momentumReturn,
  }
}

// ─── % Danych (pokrycie wymaganych pól) ───────────────────────────────────────

const REQUIRED_FIELDS: (keyof RawStockData)[] = [
  'revenueGrowth',
  'grossMargins',
  'profitMargins',
  'totalDebt',
  'totalCash',
  'trailingPE',
  'beta',
  'forwardPE',
  'recommendationKey',
]

function computeDataCoverage(raw: RawStockData): number {
  const present = REQUIRED_FIELDS.filter(f => raw[f] != null).length
  return Math.round((present / REQUIRED_FIELDS.length) * 100)
}

// ─── Scoring per spółka ───────────────────────────────────────────────────────

function scoreDebtCash(totalDebt: number | null, totalCash: number | null): number | null {
  if (totalDebt == null || totalCash == null) return null
  if (totalCash <= 0) return totalDebt > 0 ? 0 : 50
  const ratio = totalDebt / totalCash
  return clamp(linearInterp(ratio, [[0, 100], [1, 60], [3, 30], [5, 10], [10, 0]]))
}

function scoreAnalystConsensus(key: string | null): number | null {
  if (key == null) return null
  const map: Record<string, number> = {
    strong_buy: 100,
    buy: 75,
    hold: 50,
    underperform: 30,
    sell: 25,
    strong_sell: 0,
  }
  return map[key.toLowerCase()] ?? 50
}

// ─── Główna funkcja scoringu kohorty ─────────────────────────────────────────

export function scoreStockCohort(
  rawList: RawStockData[],
  regime: MarketRegime,
  lookbackDays: number
): StockScoringResult[] {
  const weights = computeRegimeAdjustedWeights(regime)

  // Zbierz wartości do percentyli (peer comparison) — OSOBNE ZBIORY DLA KAŻDEGO METRYKI
  const allRevGrowth    = rawList.map(r => r.revenueGrowth).filter((v): v is number => v != null)
  const allTrailingPE   = rawList.map(r => r.trailingPE).filter((v): v is number => v != null && v > 0)
  const allForwardPE    = rawList.map(r => r.forwardPE).filter((v): v is number => v != null && v > 0) // OSOBNY ZBIÓR DO FORWARD PE
  return rawList.map(raw => {
    // ── Profitability ──────────────────────────────────────────────────────────
    const revenueGrowthScore = raw.revenueGrowth != null
      ? clamp(linearInterp(raw.revenueGrowth * 100, [[-20, 0], [0, 50], [20, 100]]))
      : null

    const revenueGrowthVsPeersScore = raw.revenueGrowth != null && allRevGrowth.length > 1
      ? percentileRank(raw.revenueGrowth, allRevGrowth)
      : null

    const earningsGrowthScore = raw.earningsGrowth != null
      ? clamp(linearInterp(raw.earningsGrowth * 100, [[-30, 0], [0, 50], [30, 100]]))
      : null

    const forwardEpsGrowthScore = raw.forwardEpsGrowth != null
      ? clamp(linearInterp(raw.forwardEpsGrowth * 100, [[-20, 0], [0, 50], [20, 100]]))
      : null

    const grossMarginScore = raw.grossMargins != null
      ? clamp(linearInterp(raw.grossMargins * 100, [[0, 0], [20, 50], [60, 100]]))
      : null

    const netMarginScore = raw.profitMargins != null
      ? clamp(linearInterp(raw.profitMargins * 100, [[-5, 0], [0, 30], [25, 100]]))
      : null

    const profitabilityScore = weightedAvg([
      { score: revenueGrowthScore,         weight: 0.15 },
      { score: revenueGrowthVsPeersScore,  weight: 0.10 },
      { score: earningsGrowthScore,        weight: 0.25 },
      { score: forwardEpsGrowthScore,      weight: 0.15 },
      { score: grossMarginScore,           weight: 0.15 },
      { score: netMarginScore,             weight: 0.20 },
    ])

    // ── Safety ────────────────────────────────────────────────────────────────
    const debtCashScore = scoreDebtCash(raw.totalDebt, raw.totalCash)

    const betaScore = raw.beta != null
      ? clamp(linearInterp(raw.beta, [[0, 100], [1, 70], [2, 30], [3, 0]]))
      : null

    const shortInterestScore = raw.shortPercentOfFloat != null
      ? clamp(linearInterp(raw.shortPercentOfFloat * 100, [[0, 100], [5, 70], [20, 10], [30, 0]]))
      : null

    const analystScore = scoreAnalystConsensus(raw.recommendationKey)

    // momentumScore — używany w safetyScore (weight 0.15), nie usuwamy go z weightedAvg
    const momentumScore = raw.momentumReturn != null && lookbackDays > 0
      ? clamp(linearInterp(raw.momentumReturn, [
          [-Math.min(lookbackDays / 3, 50), 20],
          [0, 50],
          [Math.min(lookbackDays / 3, 50), 80],
        ]))
      : 50

    const safetyScore = weightedAvg([
      { score: debtCashScore,       weight: 0.25 },
      { score: betaScore,           weight: 0.30 },
      { score: shortInterestScore,  weight: 0.10 },
      { score: analystScore,        weight: 0.20 },
      { score: momentumScore,       weight: 0.15 },
    ])

    // ── Valuation ─────────────────────────────────────────────────────────────
    // Valuation — ujednolicenie na percentyle dla spójności
    const trailingPEScore = raw.trailingPE != null && raw.trailingPE > 0 && allTrailingPE.length > 1
      ? percentileRankInverted(raw.trailingPE, allTrailingPE)
      : null

    // Forward PE — użycie OSOBNEGO zbioru allForwardPE dla spójności peer comparison
    const forwardPEScore = raw.forwardPE != null && raw.forwardPE > 0 && allForwardPE.length > 1
      ? percentileRankInverted(raw.forwardPE, allForwardPE)
      : null

    const pegScore = raw.pegRatio != null && raw.pegRatio > 0
      ? clamp(linearInterp(raw.pegRatio, [[0.5, 100], [1, 70], [2, 30], [3, 0]]))
      : null

    // Price vs 52-week High — neutralizacja dla liderów rynku (nie penalizujemy >1.5x)
    const priceVs52wHighScore = raw.regularMarketPrice != null && raw.fiftyTwoWeekHigh != null && raw.fiftyTwoWeekHigh > 0
      ? clamp(linearInterp(raw.regularMarketPrice / raw.fiftyTwoWeekHigh, [
          [0.3, 100],   // głęboko pod high — najlepsza wartość
          [0.7, 70],    // umiarkowany poziom
          [1.0, 50],    // na poziomie high — neutral
          [1.5, 45],    // powyżej 1.5x — minimalna penalizacja (nie zero!)
        ]))
      : null

    const divYieldScore = raw.dividendYield != null && raw.dividendYield > 0
      ? clamp(linearInterp(raw.dividendYield * 100, [[0, 20], [2, 40], [5, 60], [8, 70], [12, 50], [20, 30]]))
      : null

    const valuationScore = weightedAvg([
      { score: trailingPEScore,      weight: 0.30 },
      { score: forwardPEScore,       weight: 0.25 },
      { score: pegScore,             weight: 0.15 },
      { score: priceVs52wHighScore,  weight: 0.15 },
      { score: divYieldScore,        weight: 0.15 },
    ])

    // ── Total Score ───────────────────────────────────────────────────────────
    const totalScore = weightedAvg([
      { score: profitabilityScore, weight: weights.profitability },
      { score: safetyScore,        weight: weights.safety },
      { score: valuationScore,     weight: weights.valuation },
    ])

    // Data coverage penalty — spółka z niskim pokryciem danych dostaje niższy totalScore
    const dataCoverage = computeDataCoverage(raw)
    const dataCoveragePenalty = 1 - (1 - dataCoverage / 100) * 0.3  // max 30% redukcji
    const adjustedTotalScore = totalScore != null ? totalScore * dataCoveragePenalty : null

    return {
      ticker: raw.ticker,
      name: raw.name,
      exchange: raw.exchange,
      marketCap: raw.marketCap,
      currency: raw.currency,
      profitabilityScore: profitabilityScore != null ? Math.round(profitabilityScore * 10) / 10 : null,
      safetyScore: safetyScore != null ? Math.round(safetyScore * 10) / 10 : null,
      valuationScore: valuationScore != null ? Math.round(valuationScore * 10) / 10 : null,
      totalScore: adjustedTotalScore != null ? Math.round(adjustedTotalScore * 10) / 10 : null,
      weights,
      dataCoverage,
      sub: {
        revenueGrowth:        sub(raw.revenueGrowth != null ? raw.revenueGrowth * 100 : null, revenueGrowthScore),
        revenueGrowthVsPeers: sub(raw.revenueGrowth != null ? raw.revenueGrowth * 100 : null, revenueGrowthVsPeersScore, revenueGrowthVsPeersScore),
        earningsGrowth:       sub(raw.earningsGrowth != null ? raw.earningsGrowth * 100 : null, earningsGrowthScore),
        forwardEpsGrowth:     sub(raw.forwardEpsGrowth != null ? raw.forwardEpsGrowth * 100 : null, forwardEpsGrowthScore),
        grossMargin:          sub(raw.grossMargins != null ? raw.grossMargins * 100 : null, grossMarginScore),
        netMargin:            sub(raw.profitMargins != null ? raw.profitMargins * 100 : null, netMarginScore),
        debtCashRatio:        sub(raw.totalDebt != null && raw.totalCash != null && raw.totalCash > 0 ? raw.totalDebt / raw.totalCash : null, debtCashScore),
        beta:                 sub(raw.beta, betaScore),
        shortInterest:        sub(raw.shortPercentOfFloat != null ? raw.shortPercentOfFloat * 100 : null, shortInterestScore),
        analystConsensus:     sub(null, analystScore),
        priceMomentum:        sub(raw.momentumReturn, momentumScore ?? 50),
        trailingPE:           sub(raw.trailingPE, trailingPEScore),
        forwardPE:            sub(raw.forwardPE, forwardPEScore),
        pegRatio:             sub(raw.pegRatio, pegScore),
        priceVs52wHigh:       sub(
          raw.regularMarketPrice != null && raw.fiftyTwoWeekHigh != null && raw.fiftyTwoWeekHigh > 0
            ? Math.round((raw.regularMarketPrice / raw.fiftyTwoWeekHigh) * 100)
            : null,
          priceVs52wHighScore
        ),
        dividendYield:        sub(raw.dividendYield != null ? raw.dividendYield * 100 : null, divYieldScore),
      },
      fetchedAt: new Date().toISOString(),
      lookbackDays,
    } satisfies StockScoringResult
  })
}

// ─── Główna funkcja publiczna ─────────────────────────────────────────────────

export interface FetchAndScoreOptions {
  lookbackDays?: number
  forceRefresh?: boolean
  cachedData?: StockScoringResult[]
  cachedAt?: string | null
  cachedLookback?: number
}

export async function fetchAndScoreExchange(
  exchangeKey: string,
  options: FetchAndScoreOptions = {}
): Promise<StockScoringResult[]> {
  const lookbackDays = options.lookbackDays ?? 30

  // Pobierz listę tickerów dla giełdy
  const tickers = getTickersForExchange(exchangeKey)
  if (tickers.length === 0) return []

  // Pobierz regime
  let regime: MarketRegime
  try {
    const marketData = await fetchGlobalMarketData()
    regime = detectMarketRegime(marketData)
  } catch {
    regime = {
      vixLevel: 'calm',
      bondStress: 'normal',
      oilShock: false,
      goldRally: false,
      copperCrash: false,
      gasSpike: false,
      gasCrash: false,
    }
  }

  // Pobierz dane fundamentalne per spółka — concurrency = 5
  const quoteTasks = tickers.map(ticker => () => fetchRawStockData(ticker, exchangeKey, lookbackDays))
  const settled = await withConcurrencyLimit(quoteTasks, 5)

  const rawList: RawStockData[] = settled
    .filter((r): r is PromiseFulfilledResult<RawStockData> => r.status === 'fulfilled')
    .map(r => r.value)

  if (rawList.length === 0) return []

  return scoreStockCohort(rawList, regime, lookbackDays)
}
