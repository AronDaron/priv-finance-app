import { useState, useEffect, useRef } from 'react'
import { getHistory, getPortfolioHistory, searchTickers } from '../../lib/api'
import type { HistoryPeriod } from '../../lib/types'
import { usePortfolio } from '../../contexts/PortfolioContext'
import BenchmarkChart from './BenchmarkChart'
import LoadingSpinner from '../ui/LoadingSpinner'

const PRESET_BENCHMARKS = [
  { label: 'S&P 500', ticker: '^GSPC'   },
  { label: 'NASDAQ',  ticker: '^IXIC'   },
  { label: 'DAX',     ticker: '^GDAXI'  },
  { label: 'Złoto',   ticker: 'GC=F'    },
  { label: 'Bitcoin', ticker: 'BTC-USD' },
]

const PERIODS: { label: string; value: HistoryPeriod }[] = [
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '1R', value: '1y' },
  { label: '2L', value: '2y' },
  { label: '5L', value: '5y' },
]

interface SeriesData {
  id: string
  label: string
  data: { date: string; value: number }[]
  color: string
}

const COLOR_MAP: Record<string, string> = {
  '__portfolio__': '#10b981',
  '^GSPC': '#3b82f6',
  '^IXIC': '#f59e0b',
  '^GDAXI': '#a855f7',
  'GC=F': '#eab308',
  'BTC-USD': '#06b6d4',
}

function calcStats(data: { date: string; value: number }[]) {
  if (!data.length) return { ret: 0, maxGain: 0, maxDrop: 0 }
  const base = data[0].value
  if (!base) return { ret: 0, maxGain: 0, maxDrop: 0 }
  const normalized = data.map(d => (d.value / base) * 100)
  const ret = (normalized[normalized.length - 1] ?? 100) - 100
  const maxGain = Math.max(...normalized) - 100
  const minVal = Math.min(...normalized)
  const maxDrop = minVal - 100
  return { ret, maxGain, maxDrop }
}

export default function BenchmarkView() {
  const { activePortfolioId } = usePortfolio()
  const [period, setPeriod] = useState<HistoryPeriod>('1y')
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<string[]>(['^GSPC', '^IXIC'])
  const [customBenchmarks, setCustomBenchmarks] = useState<{ ticker: string; label: string }[]>([])
  const [series, setSeries] = useState<SeriesData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedTickers, setFailedTickers] = useState<string[]>([])

  // Wyszukiwarka własnych tickerów
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ ticker: string; name: string }[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const allBenchmarks = [
    ...PRESET_BENCHMARKS,
    ...customBenchmarks.filter(c => !PRESET_BENCHMARKS.find(p => p.ticker === c.ticker)),
  ]

  const toggleBenchmark = (ticker: string) => {
    setSelectedBenchmarks(prev =>
      prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]
    )
  }

  const addCustomTicker = (ticker: string, label: string) => {
    if (!customBenchmarks.find(c => c.ticker === ticker) && !PRESET_BENCHMARKS.find(p => p.ticker === ticker)) {
      setCustomBenchmarks(prev => [...prev, { ticker, label }])
    }
    if (!selectedBenchmarks.includes(ticker)) {
      setSelectedBenchmarks(prev => [...prev, ticker])
    }
    setSearchQuery('')
    setSearchResults([])
  }

  const removeCustom = (ticker: string) => {
    setCustomBenchmarks(prev => prev.filter(c => c.ticker !== ticker))
    setSelectedBenchmarks(prev => prev.filter(t => t !== ticker))
  }

  // Live search z debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const results = await searchTickers(searchQuery.trim())
        setSearchResults(results.slice(0, 6).map(r => ({ ticker: r.ticker, name: r.name || r.ticker })))
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 350)
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }
  }, [searchQuery])

  // Zamknij dropdown po kliknięciu poza
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([])
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setFailedTickers([])

    const fetchAll = async () => {
      const results: SeriesData[] = []
      const failed: string[] = []

      // Portfel użytkownika — z aktualnym period
      try {
        const portfolioHistory = await getPortfolioHistory(activePortfolioId ?? undefined, period)
        if (portfolioHistory.length > 0) {
          results.push({
            id: '__portfolio__',
            label: 'Twój portfel',
            data: portfolioHistory,
            color: '#10b981',
          })
        }
      } catch (e) {
        console.error('Portfolio history error:', e)
      }

      // Benchmarki
      await Promise.all(
        selectedBenchmarks.map(async ticker => {
          try {
            const candles = await getHistory(ticker, period)
            if (candles.length === 0) {
              failed.push(ticker)
              return
            }
            const data = candles.map(c => ({
              date: new Date(c.time * 1000).toISOString().split('T')[0],
              value: c.close,
            }))
            const preset = allBenchmarks.find(b => b.ticker === ticker)
            results.push({
              id: ticker,
              label: preset?.label ?? ticker,
              data,
              color: COLOR_MAP[ticker] ?? '#6b7280',
            })
          } catch (e) {
            console.error(`Benchmark ${ticker} error:`, e)
            failed.push(ticker)
          }
        })
      )

      setSeries(results)
      setFailedTickers(failed)
    }

    fetchAll().catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [period, selectedBenchmarks, activePortfolioId])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Benchmark</h2>
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

      {/* Wybór benchmarków */}
      <div className="flex flex-wrap gap-2 items-center">
        {allBenchmarks.map(b => (
          <div key={b.ticker} className="flex items-center">
            <button
              onClick={() => toggleBenchmark(b.ticker)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                selectedBenchmarks.includes(b.ticker)
                  ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                  : 'glass-card border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {b.label} {selectedBenchmarks.includes(b.ticker) ? '✓' : ''}
            </button>
            {customBenchmarks.find(c => c.ticker === b.ticker) && (
              <button
                onClick={() => removeCustom(b.ticker)}
                className="ml-0.5 px-1 text-gray-500 hover:text-finance-red text-sm"
                title="Usuń"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Wyszukiwarka własnych tickerów */}
      <div ref={searchRef} className="relative max-w-xs">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Dodaj ticker lub indeks..."
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-finance-green"
        />
        {searchLoading && (
          <span className="absolute right-3 top-2.5 text-gray-400 text-xs">...</span>
        )}
        {searchResults.length > 0 && (
          <div className="absolute z-20 top-full mt-1 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
            {searchResults.map(r => (
              <button
                key={r.ticker}
                onClick={() => addCustomTicker(r.ticker, r.name)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-700 flex items-center justify-between gap-2"
              >
                <span className="font-medium text-white shrink-0">{r.ticker}</span>
                <span className="text-gray-400 text-xs truncate">{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {failedTickers.length > 0 && !loading && (
        <div className="text-yellow-400 text-xs glass-card rounded-lg px-4 py-2">
          Brak danych dla: {failedTickers.map(t => allBenchmarks.find(b => b.ticker === t)?.label ?? t).join(', ')}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="text-finance-red text-sm">{error}</div>
      ) : (
        <BenchmarkChart series={series} />
      )}

      {/* Tabela porównawcza */}
      {!loading && series.length > 0 && (
        <div className="glass-card rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700">
                <th className="px-4 py-3 text-left">Instrument</th>
                <th className="px-4 py-3 text-right">Zwrot %</th>
                <th className="px-4 py-3 text-right">Maks. wzrost</th>
                <th className="px-4 py-3 text-right">Maks. spadek</th>
              </tr>
            </thead>
            <tbody>
              {series.map(s => {
                const stats = calcStats(s.data)
                return (
                  <tr key={s.id} className="border-b border-gray-800 hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: s.color }} />
                      <span className="text-white font-medium">{s.label}</span>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${stats.ret >= 0 ? 'text-finance-green' : 'text-finance-red'}`}>
                      {stats.ret >= 0 ? '+' : ''}{stats.ret.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right text-finance-green">
                      +{stats.maxGain.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right text-finance-red">
                      {stats.maxDrop.toFixed(1)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
