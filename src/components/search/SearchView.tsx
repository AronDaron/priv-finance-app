import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { searchTickers } from '../../lib/api'
import type { SearchResult } from '../../lib/types'
import StockDetailView from '../stock/StockDetailView'

export default function SearchView() {
  const { ticker: selectedTicker } = useParams<{ ticker?: string }>()
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchTickers(query.trim())
        setResults(data.slice(0, 8))
        setIsOpen(data.length > 0)
      } catch {
        setResults([])
        setIsOpen(false)
      } finally {
        setSearching(false)
      }
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (result: SearchResult) => {
    setQuery('')
    setResults([])
    setIsOpen(false)
    navigate(`/search/${result.ticker}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* STICKY SEARCH BAR */}
      <div
        className="sticky top-0 z-10 px-6 py-4 border-b border-gray-700/40"
        style={{ background: 'rgba(17,24,39,0.97)', backdropFilter: 'blur(8px)' }}
      >
        <div ref={containerRef} className="relative max-w-2xl">
          <div className="relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Wyszukaj spółkę..."
              className="w-full bg-gray-800/80 border border-gray-600 rounded-xl pl-11 pr-10 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-finance-green focus:ring-1 focus:ring-finance-green/30 transition-colors"
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
          </div>

          {/* DROPDOWN */}
          {isOpen && results.length > 0 && (
            <ul className="absolute z-50 w-full mt-1 bg-finance-card border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
              {results.map(r => (
                <li
                  key={r.ticker}
                  onClick={() => handleSelect(r)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-gray-700/50 last:border-0 transition-colors"
                >
                  <span className="font-mono font-bold text-finance-green text-sm w-24 shrink-0">{r.ticker}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-white text-sm truncate">{r.name}</div>
                    <div className="text-gray-500 text-xs">{r.exchange}</div>
                  </div>
                  <span className="text-xs text-gray-600 shrink-0">{r.type}</span>
                </li>
              ))}
            </ul>
          )}

          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <div className="absolute z-50 w-full mt-1 bg-finance-card border border-gray-700 rounded-xl px-4 py-3 text-gray-500 text-sm">
              Brak wyników dla „{query}"
            </div>
          )}
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1">
        {selectedTicker ? (
          <StockDetailView ticker={selectedTicker} embedded={true} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center py-24 px-6">
            <svg className="w-16 h-16 text-gray-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h2 className="text-gray-400 text-lg font-medium mb-2">Wyszukaj spółkę</h2>
            <p className="text-gray-600 text-sm max-w-xs">
              Wpisz nazwę spółki lub ticker w polu powyżej, aby zobaczyć jej szczegółowe dane fundamentalne i techniczne.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
