// src/lib/portfolioMetrics.ts
// Czyste funkcje matematyczne do obliczania metryk portfela inwestycyjnego.
// Zero side-effects, zero importów z React lub api — tylko czysta matematyka.

export interface PortfolioMetrics {
  maxDrawdown: number           // ujemny ułamek, np. -0.18 = -18% (peak-to-trough)
  annualizedReturn: number      // CAGR jako ułamek, np. 0.12 = +12%
  annualizedVolatility: number  // odch. std. × √252
  sharpeRatio: number | null    // null jeśli brak danych lub vol=0
  sortinoRatio: number | null   // null jeśli brak ujemnych zwrotów
  twr: number                   // Time-Weighted Return jako ułamek
  mwr: number | null            // Money-Weighted Return (XIRR), null jeśli brak zbieżności
  periodDays: number
}

export interface CashFlow {
  date: Date
  amount: number  // ujemne = outflow (zakup), dodatnie = inflow (sprzedaż lub wartość końcowa)
}

// ─── Funkcje pomocnicze ───────────────────────────────────────────────────────

export function calcMaxDrawdown(values: number[]): number {
  if (values.length < 2) return 0
  let peak = values[0]
  let maxDD = 0
  for (const v of values) {
    if (v > peak) peak = v
    if (peak > 0) {
      const dd = (v - peak) / peak
      if (dd < maxDD) maxDD = dd
    }
  }
  return maxDD  // wartość ujemna lub 0
}

export function calcDailyReturns(values: number[]): number[] {
  const returns: number[] = []
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] !== 0) {
      returns.push((values[i] - values[i - 1]) / values[i - 1])
    }
  }
  return returns
}

export function calcAnnualizedReturn(totalReturn: number, days: number): number {
  if (days <= 0) return 0
  return Math.pow(1 + totalReturn, 365 / days) - 1
}

export function calcAnnualizedVolatility(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const variance =
    dailyReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (dailyReturns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(252)
}

export function calcSharpe(
  annReturn: number,
  annVol: number,
  riskFree = 0.045
): number | null {
  if (annVol === 0) return null
  return (annReturn - riskFree) / annVol
}

export function calcSortino(
  annReturn: number,
  dailyReturns: number[],
  riskFree = 0.045
): number | null {
  const negReturns = dailyReturns.filter((r) => r < 0)
  if (negReturns.length === 0) return null
  const downsideVariance = negReturns.reduce((s, r) => s + r ** 2, 0) / negReturns.length
  const downsideVol = Math.sqrt(downsideVariance) * Math.sqrt(252)
  if (downsideVol === 0) return null
  return (annReturn - riskFree) / downsideVol
}

// TWR = produkt (1 + daily_return) dla każdego dnia
export function calcTWR(values: number[]): number {
  if (values.length < 2 || values[0] === 0) return 0
  let product = 1
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] !== 0) {
      product *= values[i] / values[i - 1]
    }
  }
  return product - 1
}

// MWR (XIRR) — Newton-Raphson, max 100 iteracji, tolerancja 1e-8
export function calcMWR(cashFlows: CashFlow[]): number | null {
  if (cashFlows.length < 2) return null

  const sorted = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime())
  const t0 = sorted[0].date.getTime()
  const years = sorted.map(
    (cf) => (cf.date.getTime() - t0) / (365.25 * 24 * 3600 * 1000)
  )

  const npv = (r: number): number =>
    sorted.reduce((s, cf, i) => s + cf.amount / Math.pow(1 + r, years[i]), 0)

  const dnpv = (r: number): number =>
    sorted.reduce(
      (s, cf, i) => s - years[i] * cf.amount / Math.pow(1 + r, years[i] + 1),
      0
    )

  let r = 0.1  // punkt startowy: 10%
  for (let iter = 0; iter < 100; iter++) {
    const f = npv(r)
    const df = dnpv(r)
    if (Math.abs(df) < 1e-10) return null
    const rNew = r - f / df
    if (Math.abs(rNew - r) < 1e-8) return rNew
    r = rNew
    if (r < -0.999 || r > 100) return null  // dywergencja
  }
  return null
}

// ─── Główna funkcja ───────────────────────────────────────────────────────────

export function computePortfolioMetrics(
  history: { date: string; value: number }[],
  transactions: { type: 'buy' | 'sell'; quantity: number; price: number; currency: string; date: string }[],
  currentPortfolioValuePLN: number
): PortfolioMetrics {
  const empty: PortfolioMetrics = {
    maxDrawdown: 0,
    annualizedReturn: 0,
    annualizedVolatility: 0,
    sharpeRatio: null,
    sortinoRatio: null,
    twr: 0,
    mwr: null,
    periodDays: 0,
  }

  if (history.length < 2) return empty

  const values = history.map((h) => h.value)
  const firstDate = new Date(history[0].date + 'T12:00:00')
  const lastDate = new Date(history[history.length - 1].date + 'T12:00:00')
  const days = (lastDate.getTime() - firstDate.getTime()) / (24 * 3600 * 1000)

  if (days <= 0) return empty

  const dailyReturns = calcDailyReturns(values)
  const twr = calcTWR(values)
  const annReturn = calcAnnualizedReturn(twr, days)
  const annVol = calcAnnualizedVolatility(dailyReturns)

  // Przepływy pieniężne dla XIRR — przybliżenie (ceny transakcji w oryginalnych walutach)
  const cashFlows: CashFlow[] = transactions.map((tx) => ({
    date: new Date(tx.date + 'T12:00:00'),
    amount: tx.type === 'buy'
      ? -(tx.quantity * tx.price)
      : (tx.quantity * tx.price),
  }))
  // Aktualna wartość portfela = inflow dziś
  cashFlows.push({ date: new Date(), amount: currentPortfolioValuePLN })

  return {
    maxDrawdown: calcMaxDrawdown(values),
    annualizedReturn: annReturn,
    annualizedVolatility: annVol,
    sharpeRatio: calcSharpe(annReturn, annVol),
    sortinoRatio: calcSortino(annReturn, dailyReturns),
    twr,
    mwr: cashFlows.length >= 2 ? calcMWR(cashFlows) : null,
    periodDays: Math.round(days),
  }
}
