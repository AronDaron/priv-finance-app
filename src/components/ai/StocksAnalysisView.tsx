import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { PortfolioAsset, AIReport, SearchResult } from '../../lib/types'
import { getAssets, getReports, analyzeStock, searchTickers } from '../../lib/api'
import StockAnalysisCard from './StockAnalysisCard'

type Mode = 'portfolio' | 'search'

export default function StocksAnalysisView() {
  const [mode, setMode] = useState<Mode>('portfolio')
  const [assets, setAssets] = useState<PortfolioAsset[]>([])
  const [stockReports, setStockReports] = useState<Record<string, AIReport | null>>({})
  const [selected, setSelected] = useState<{ ticker: string; name: string } | null>(null)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Wyszukiwarka
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getAssets().then(setAssets)
    getReports().then(reports => {
      const byTicker: Record<string, AIReport> = {}
      reports.forEach(r => {
        if (!byTicker[r.ticker] || r.created_at > byTicker[r.ticker].created_at) {
          byTicker[r.ticker] = r
        }
      })
      setStockReports(byTicker)
    })
  }, [])

  // Debounce wyszukiwarki
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (query.trim().length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchTickers(query.trim())
        setSearchResults(results.slice(0, 8))
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
    }
  }, [query])

  const handleAnalyze = async (ticker: string) => {
    setAnalyzing(ticker)
    setError(null)
    try {
      const report = await analyzeStock(ticker)
      setStockReports(prev => ({ ...prev, [ticker]: report }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd analizy')
    } finally {
      setAnalyzing(null)
    }
  }

  const handleSelect = (ticker: string, name: string) => {
    setSelected({ ticker, name })
    if (mode === 'search') {
      setQuery('')
      setSearchResults([])
    }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Nagłówek */}
      <div>
        <h1 className="text-white text-xl font-bold">Analiza Spółek</h1>
        <p className="text-gray-500 text-xs mt-0.5">Model: google/gemini-3-flash-preview</p>
      </div>

      {/* Błąd */}
      {error && (
        <div className="bg-red-900/30 border border-red-600 rounded-lg p-4 flex items-center justify-between gap-4">
          <span className="text-red-300 text-sm">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 text-lg leading-none">×</button>
        </div>
      )}

      {/* Toggle trybu */}
      <div className="flex gap-1 p-1 glass-card rounded-lg w-fit">
        <button
          onClick={() => { setMode('portfolio'); setSelected(null) }}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === 'portfolio' ? 'bg-finance-green text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Z portfela
        </button>
        <button
          onClick={() => { setMode('search'); setSelected(null) }}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === 'search' ? 'bg-finance-green text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Wyszukaj dowolną
        </button>
      </div>

      {/* Tryb: Z portfela */}
      {mode === 'portfolio' && (
        <div>
          {assets.length === 0 ? (
            <p className="text-gray-500 text-sm italic">Brak spółek w portfelu.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {assets.filter(a => a.asset_type !== 'bond').map(asset => {
                const hasReport = !!stockReports[asset.ticker]
                const isSelected = selected?.ticker === asset.ticker
                return (
                  <button
                    key={asset.ticker}
                    onClick={() => handleSelect(asset.ticker, asset.name)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? 'border-finance-green bg-finance-green/10'
                        : 'border-gray-700 glass-card hover:border-gray-500'
                    }`}
                  >
                    <div className="text-sm font-bold text-finance-green">{asset.ticker}</div>
                    <div className="text-xs text-gray-400 truncate mt-0.5">{asset.name}</div>
                    <div className={`text-xs mt-1.5 ${hasReport ? 'text-emerald-400' : 'text-gray-600'}`}>
                      {hasReport ? '● raport' : '○ brak raportu'}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tryb: Wyszukiwarka */}
      {mode === 'search' && (
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Wpisz nazwę spółki lub ticker..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-finance-green"
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              </div>
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="glass-card rounded-lg overflow-hidden">
              {searchResults.map(result => (
                <button
                  key={result.ticker}
                  onClick={() => handleSelect(result.ticker, result.name)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 border-b border-gray-700/50 last:border-0 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-finance-green font-bold text-sm">{result.ticker}</span>
                    <span className="text-gray-400 text-xs ml-2">{result.exchange}</span>
                    <div className="text-gray-300 text-xs truncate mt-0.5">{result.name}</div>
                  </div>
                  <span className="text-xs text-gray-600 flex-shrink-0">{result.type}</span>
                </button>
              ))}
            </div>
          )}

          {query.trim().length >= 2 && !searching && searchResults.length === 0 && (
            <p className="text-gray-500 text-sm italic">Brak wyników dla „{query}".</p>
          )}
        </div>
      )}

      {/* StockAnalysisCard dla wybranej spółki */}
      {selected && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-gray-400 text-sm font-medium">
              Analiza:{' '}
              <span className="text-finance-green font-bold">{selected.ticker}</span>
              <span className="text-gray-400 ml-1">{selected.name}</span>
            </h2>
            {/* Info o portfelu jeśli spółka jest z portfela */}
            {assets.some(a => a.ticker === selected.ticker) &&
              stockReports[selected.ticker] &&
              analyzing !== selected.ticker && (
              <span className="text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 px-2 py-0.5 rounded-full">
                Raport gotowy — portfel można analizować
              </span>
            )}
            {assets.some(a => a.ticker === selected.ticker) &&
              analyzing === selected.ticker && (
              <span className="text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 px-2 py-0.5 rounded-full">
                Po analizie przejdź do{' '}
                <Link to="/ai/portfolio" className="underline">Analizy Portfela</Link>
              </span>
            )}
          </div>
          <StockAnalysisCard
            ticker={selected.ticker}
            name={selected.name}
            report={stockReports[selected.ticker] ?? null}
            isAnalyzing={analyzing === selected.ticker}
            onAnalyze={() => handleAnalyze(selected.ticker)}
          />
        </div>
      )}
    </div>
  )
}
