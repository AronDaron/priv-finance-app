// Pure math utilities for correlation analysis.
// No React or API imports — standalone computation only.

export interface CorrelationResult {
  matrix: number[][]
  tickers: string[]
  insufficientData: string[]
}

export function calcDailyReturns(closes: number[]): number[] {
  const returns: number[] = []
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] !== 0) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1])
    }
  }
  return returns
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return NaN

  let sumA = 0, sumB = 0
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i] }
  const meanA = sumA / n
  const meanB = sumB / n

  let cov = 0, varA = 0, varB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    cov += da * db
    varA += da * da
    varB += db * db
  }
  const denom = Math.sqrt(varA * varB)
  if (denom === 0) return NaN
  return cov / denom
}

export function buildCorrelationMatrix(
  returnSeries: Map<string, number[]>,
  tickers: string[]
): CorrelationResult {
  const n = tickers.length
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  const insufficientData: string[] = []

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0
    const seriesI = returnSeries.get(tickers[i]) ?? []
    if (seriesI.length < 2) insufficientData.push(tickers[i])

    for (let j = i + 1; j < n; j++) {
      const seriesJ = returnSeries.get(tickers[j]) ?? []
      const len = Math.min(seriesI.length, seriesJ.length)
      const corr = pearson(seriesI.slice(0, len), seriesJ.slice(0, len))
      matrix[i][j] = isNaN(corr) ? 0 : corr
      matrix[j][i] = matrix[i][j]
    }
  }

  return { matrix, tickers, insufficientData }
}
