import { useState, useEffect } from 'react'
import { getAssets, getHistory } from '../../lib/api'
import type { PortfolioAsset, HistoryPeriod } from '../../lib/types'
import { calcDailyReturns, buildCorrelationMatrix } from '../../lib/correlationMath'
import type { CorrelationResult } from '../../lib/correlationMath'
import LoadingSpinner from '../ui/LoadingSpinner'

// ─── Kolory heatmapy ──────────────────────────────────────────────────────────

function correlationToColor(value: number): string {
  const v = Math.max(-1, Math.min(1, value))
  if (v >= 0) {
    const t = v
    return `rgb(${Math.round(55 + t * 184)},${Math.round(65 + t * 3)},${Math.round(81 - t * 13)})`
  } else {
    const t = -v
    return `rgb(${Math.round(55 - t * 39)},${Math.round(65 + t * 120)},${Math.round(81 + t * 48)})`
  }
}

// ─── Interpretacja ────────────────────────────────────────────────────────────

type InsightType = 'warn' | 'good' | 'shield'

function generateInsights(result: CorrelationResult): { type: InsightType; text: string }[] {
  const { matrix, tickers } = result
  const n = tickers.length
  const out: { type: InsightType; text: string }[] = []

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = matrix[i][j]
      if (c > 0.8)
        out.push({ type: 'warn',   text: `${tickers[i]} i ${tickers[j]}: wysoka korelacja (${c.toFixed(2)}) — rozważ redukcję ekspozycji na jeden z nich.` })
      else if (c < -0.3)
        out.push({ type: 'shield', text: `${tickers[i]} i ${tickers[j]}: ujemna korelacja (${c.toFixed(2)}) — para stabilizuje portfel w czasie spadków.` })
    }
  }

  const avgAbsCorr = tickers.map((ticker, i) => {
    const others = matrix[i].filter((_, j) => j !== i)
    return { ticker, avg: others.length ? others.reduce((s, v) => s + Math.abs(v), 0) / others.length : 1 }
  })
  const best = [...avgAbsCorr].sort((a, b) => a.avg - b.avg)[0]
  if (best && best.avg < 0.4)
    out.push({ type: 'good', text: `${best.ticker} ma niską średnią korelację (${best.avg.toFixed(2)}) — dobry dywersyfikator portfela.` })

  return out
}

// ─── Ikony ────────────────────────────────────────────────────────────────────

const INSIGHT_STYLES: Record<InsightType, { border: string; text: string; icon: string }> = {
  warn:   { border: 'border-red-700/30',          text: 'text-red-300',      icon: '⚠' },
  shield: { border: 'border-finance-green/30',    text: 'text-emerald-300',  icon: '↔' },
  good:   { border: 'border-indigo-700/30',       text: 'text-indigo-300',   icon: '✓' },
}

const PERIODS: { value: HistoryPeriod; label: string }[] = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y',  label: '1R' },
]

// ─── Komponent ────────────────────────────────────────────────────────────────

export default function CorrelationView() {
  const [assets, setAssets]           = useState<PortfolioAsset[]>([])
  const [period, setPeriod]           = useState<HistoryPeriod>('3mo')
  const [result, setResult]           = useState<CorrelationResult | null>(null)
  const [loading, setLoading]         = useState(false)
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [hoveredCell, setHoveredCell] = useState<{ i: number; j: number } | null>(null)

  useEffect(() => {
    getAssets().then(setAssets).finally(() => setLoadingAssets(false))
  }, [])

  useEffect(() => {
    const tickers = [...new Set(assets.map(a => a.ticker))]
    if (tickers.length < 2) { setResult(null); return }
    setLoading(true)
    Promise.all(
      tickers.map(ticker =>
        getHistory(ticker, period)
          .then(candles => [ticker, candles] as const)
          .catch(() => [ticker, []] as const)
      )
    ).then(entries => {
      const returnSeries = new Map<string, number[]>()
      entries.forEach(([ticker, candles]) => {
        returnSeries.set(ticker, calcDailyReturns(candles.map(c => c.close).filter(v => v > 0)))
      })
      setResult(buildCorrelationMatrix(returnSeries, tickers))
    }).finally(() => setLoading(false))
  }, [assets, period])

  if (loadingAssets) return <div className="p-6"><LoadingSpinner /></div>

  const tickers = [...new Set(assets.map(a => a.ticker))]
  const insights = result ? generateInsights(result) : []

  return (
    <div className="p-6 space-y-6">

      {/* ── Nagłówek + selektor okresu ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Korelacja aktywów</h2>
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                period === p.value
                  ? 'bg-finance-green text-white shadow-sm shadow-finance-green/30 ring-2 ring-finance-green/20'
                  : 'glass-card text-gray-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Empty state ── */}
      {tickers.length < 2 && (
        <div className="glass-card rounded-xl p-12 text-center text-gray-500"
             style={{ border: '1px solid rgba(75,85,99,0.25)' }}>
          Potrzebujesz minimum 2 aktywów do analizy korelacji.
        </div>
      )}

      {tickers.length >= 2 && loading && <LoadingSpinner />}

      {tickers.length >= 2 && !loading && result && (
        <>
          {/* ── Ostrzeżenie o brakujących danych ── */}
          {result.insufficientData.length > 0 && (
            <div className="flex items-center gap-3 glass-card rounded-xl px-4 py-3 text-sm text-amber-300 border border-amber-700/30">
              <span>⚠</span>
              <span>Niewystarczające dane historyczne dla: <strong>{result.insufficientData.join(', ')}</strong></span>
            </div>
          )}

          {/* ── Heatmapa ── */}
          <div className="glass-card rounded-xl overflow-hidden" style={{ border: '1px solid rgba(75,85,99,0.25)' }}>
            <div style={{ height: 3, background: 'linear-gradient(90deg,#6366f1,#818cf8)', boxShadow: '0 2px 12px rgba(99,102,241,0.4)' }} />
            <div className="p-5">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-4">
                Pearson — dzienne stopy zwrotu ({PERIODS.find(p => p.value === period)?.label})
              </p>
              <div className="overflow-x-auto">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `88px repeat(${result.tickers.length}, minmax(68px, 1fr))`,
                    gap: 3,
                  }}
                >
                  {/* Lewy górny narożnik */}
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
                      <div key={`lbl-${i}`} className="flex items-center text-xs font-bold text-finance-green pr-2 truncate">
                        {rowTicker}
                      </div>
                      {result.tickers.map((_, j) => {
                        const isDiag = i === j
                        if (isDiag) {
                          return (
                            <div key={`${i}-${j}`}
                                 className="flex items-center justify-center text-base font-bold text-gray-600 rounded-lg select-none"
                                 style={{ backgroundColor: '#1a2236', minHeight: 52 }}
                                 title={result.tickers[i]}>
                              ×
                            </div>
                          )
                        }
                        const value = result.matrix[i][j]
                        const isHovered = hoveredCell?.i === i && hoveredCell?.j === j
                        return (
                          <div
                            key={`${i}-${j}`}
                            className={`flex items-center justify-center text-xs font-semibold rounded-lg
                                        cursor-default select-none transition-opacity ${isHovered ? 'opacity-70' : ''}`}
                            style={{ backgroundColor: correlationToColor(value), minHeight: 52 }}
                            onMouseEnter={() => setHoveredCell({ i, j })}
                            onMouseLeave={() => setHoveredCell(null)}
                            title={`${result.tickers[i]} / ${result.tickers[j]}: ${value.toFixed(4)}`}
                          >
                            <span className="text-white drop-shadow-sm">{value.toFixed(2)}</span>
                          </div>
                        )
                      })}
                    </>
                  ))}
                </div>
              </div>

              {/* Legenda */}
              <div className="mt-5 flex items-center gap-3">
                <span className="text-xs text-gray-500 tabular-nums">−1.0</span>
                <div className="flex-1 h-1.5 rounded-full"
                     style={{ background: 'linear-gradient(to right,#10b981,#374151,#ef4444)' }} />
                <span className="text-xs text-gray-500 tabular-nums">+1.0</span>
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-gray-600">
                <span>Ujemna (stabilizuje)</span>
                <span>Brak korelacji</span>
                <span>Dodatnia (ryzyko skupienia)</span>
              </div>
            </div>
          </div>

          {/* ── Interpretacja ── */}
          {insights.length > 0 && (
            <div className="glass-card rounded-xl overflow-hidden" style={{ border: '1px solid rgba(75,85,99,0.25)' }}>
              <div style={{ height: 3, background: 'linear-gradient(90deg,#10b981,#34d399)', boxShadow: '0 2px 12px rgba(16,185,129,0.4)' }} />
              <div className="p-5 space-y-2">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Interpretacja</p>
                {insights.map((insight, idx) => {
                  const s = INSIGHT_STYLES[insight.type]
                  return (
                    <div key={idx} className={`glass-card rounded-xl px-4 py-3 text-sm flex items-start gap-3 border ${s.border} ${s.text}`}>
                      <span className="flex-shrink-0 mt-0.5 text-base leading-none">{s.icon}</span>
                      <span>{insight.text}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
