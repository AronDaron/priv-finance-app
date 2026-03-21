import { useState, useEffect } from 'react'
import { getAssets, getHistory } from '../../lib/api'
import type { PortfolioAsset, HistoryPeriod } from '../../lib/types'
import { calcDailyReturns, buildCorrelationMatrix } from '../../lib/correlationMath'
import type { CorrelationResult } from '../../lib/correlationMath'
import LoadingSpinner from '../ui/LoadingSpinner'

const PERIODS: { value: HistoryPeriod; label: string }[] = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1R' },
]

function correlationToColor(value: number): string {
  const v = Math.max(-1, Math.min(1, value))
  if (v >= 0) {
    // gray (#374151) → red (#ef4444)
    const t = v
    const r = Math.round(55 + t * (239 - 55))
    const g = Math.round(65 + t * (68 - 65))
    const b = Math.round(81 + t * (68 - 81))
    return `rgb(${r},${g},${b})`
  } else {
    // green (#10b981) → gray (#374151)
    const t = -v
    const r = Math.round(55 + t * (16 - 55))
    const g = Math.round(65 + t * (185 - 65))
    const b = Math.round(81 + t * (129 - 81))
    return `rgb(${r},${g},${b})`
  }
}

function generateInsights(result: CorrelationResult): { type: 'warn' | 'good' | 'shield'; text: string }[] {
  const insights: { type: 'warn' | 'good' | 'shield'; text: string }[] = []
  const { matrix, tickers } = result
  const n = tickers.length

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const corr = matrix[i][j]
      if (corr > 0.8) {
        insights.push({ type: 'warn', text: `${tickers[i]} i ${tickers[j]}: wysoka korelacja (${corr.toFixed(2)}) — rozważ redukcję ekspozycji na jeden z nich.` })
      } else if (corr < -0.3) {
        insights.push({ type: 'shield', text: `${tickers[i]} i ${tickers[j]}: ujemna korelacja (${corr.toFixed(2)}) — para stabilizuje portfel.` })
      }
    }
  }

  // Best diversifier
  const avgAbsCorr = tickers.map((ticker, i) => {
    const others = matrix[i].filter((_, j) => j !== i)
    if (others.length === 0) return { ticker, avg: 1 }
    const avg = others.reduce((s, v) => s + Math.abs(v), 0) / others.length
    return { ticker, avg }
  })
  const best = [...avgAbsCorr].sort((a, b) => a.avg - b.avg)[0]
  if (best && best.avg < 0.4) {
    insights.push({ type: 'good', text: `${best.ticker} ma niską średnią korelację (${best.avg.toFixed(2)}) — dobry dywersyfikator portfela.` })
  }

  return insights
}

export default function CorrelationView() {
  const [assets, setAssets] = useState<PortfolioAsset[]>([])
  const [period, setPeriod] = useState<HistoryPeriod>('3mo')
  const [result, setResult] = useState<CorrelationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [hoveredCell, setHoveredCell] = useState<{ i: number; j: number } | null>(null)

  useEffect(() => {
    getAssets()
      .then(list => setAssets(list))
      .finally(() => setLoadingAssets(false))
  }, [])

  useEffect(() => {
    const uniqueTickers = [...new Set(assets.map(a => a.ticker))]
    if (uniqueTickers.length < 2) {
      setResult(null)
      return
    }

    setLoading(true)
    Promise.all(
      uniqueTickers.map(ticker =>
        getHistory(ticker, period)
          .then(candles => [ticker, candles] as const)
          .catch(() => [ticker, []] as const)
      )
    ).then(entries => {
      const returnSeries = new Map<string, number[]>()
      entries.forEach(([ticker, candles]) => {
        const closes = candles.map(c => c.close).filter(v => v > 0)
        returnSeries.set(ticker, calcDailyReturns(closes))
      })
      setResult(buildCorrelationMatrix(returnSeries, uniqueTickers))
    }).finally(() => setLoading(false))
  }, [assets, period])

  if (loadingAssets) return <div className="p-6"><LoadingSpinner /></div>

  const uniqueTickers = [...new Set(assets.map(a => a.ticker))]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Korelacja aktywów</h2>
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p.value
                  ? 'bg-finance-green text-white'
                  : 'glass-card text-gray-300 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {uniqueTickers.length < 2 && (
        <div className="glass-card rounded-xl p-10 text-center text-gray-400">
          Potrzebujesz minimum 2 aktywów do analizy korelacji.
        </div>
      )}

      {uniqueTickers.length >= 2 && loading && <LoadingSpinner />}

      {uniqueTickers.length >= 2 && !loading && result && (
        <>
          {result.insufficientData.length > 0 && (
            <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl px-4 py-3 text-sm text-amber-300">
              Niewystarczające dane historyczne dla: {result.insufficientData.join(', ')}
            </div>
          )}

          {/* Heatmapa */}
          <div className="glass-card rounded-xl p-4 overflow-x-auto">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `80px repeat(${result.tickers.length}, minmax(64px, 1fr))`,
                gap: 3,
              }}
            >
              {/* Górny lewy narożnik */}
              <div />
              {/* Nagłówki kolumn */}
              {result.tickers.map((ticker, j) => (
                <div key={j} className="text-center text-xs font-bold text-finance-green py-2 px-1 truncate">
                  {ticker}
                </div>
              ))}

              {/* Wiersze */}
              {result.tickers.map((rowTicker, i) => (
                <>
                  {/* Nagłówek wiersza */}
                  <div key={`h-${i}`} className="flex items-center text-xs font-bold text-finance-green pr-2 truncate">
                    {rowTicker}
                  </div>
                  {/* Komórki */}
                  {result.tickers.map((_, j) => {
                    const value = result.matrix[i][j]
                    const isDiag = i === j
                    const isHovered = hoveredCell?.i === i && hoveredCell?.j === j
                    if (isDiag) {
                      return (
                        <div
                          key={`${i}-${j}`}
                          className="flex items-center justify-center text-lg font-bold rounded-md select-none text-gray-500"
                          style={{ backgroundColor: '#1f2937', minHeight: 48 }}
                          title={result.tickers[i]}
                        >
                          ×
                        </div>
                      )
                    }
                    return (
                      <div
                        key={`${i}-${j}`}
                        className={`flex items-center justify-center text-xs font-semibold rounded-md cursor-default transition-opacity select-none
                          ${isHovered ? 'opacity-75' : ''}`}
                        style={{
                          backgroundColor: correlationToColor(value),
                          minHeight: 48,
                        }}
                        onMouseEnter={() => setHoveredCell({ i, j })}
                        onMouseLeave={() => setHoveredCell(null)}
                        title={`${result.tickers[i]} / ${result.tickers[j]}: ${value.toFixed(4)}`}
                      >
                        <span className="text-white drop-shadow-sm">
                          {value.toFixed(2)}
                        </span>
                      </div>
                    )
                  })}
                </>
              ))}
            </div>

            {/* Legenda */}
            <div className="mt-4 flex items-center gap-3 text-xs text-gray-400">
              <span>-1.0</span>
              <div className="flex-1 h-2 rounded-full" style={{
                background: 'linear-gradient(to right, #10b981, #374151, #ef4444)'
              }} />
              <span>+1.0</span>
            </div>
          </div>

          {/* Panel interpretacji */}
          {generateInsights(result).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-300">Interpretacja</h3>
              {generateInsights(result).map((insight, idx) => (
                <div
                  key={idx}
                  className={`glass-card rounded-xl px-4 py-3 text-sm flex items-start gap-3 ${
                    insight.type === 'warn'
                      ? 'border border-red-700/30 text-red-300'
                      : insight.type === 'shield'
                      ? 'border border-finance-green/30 text-emerald-300'
                      : 'border border-blue-700/30 text-blue-300'
                  }`}
                >
                  <span className="mt-0.5 flex-shrink-0">
                    {insight.type === 'warn' ? '⚠' : insight.type === 'shield' ? '🛡' : '✓'}
                  </span>
                  <span>{insight.text}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
