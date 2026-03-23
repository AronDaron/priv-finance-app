import { useState, useEffect, useRef, useCallback } from 'react'
import { searchTickers } from '../lib/api'
import type { SearchResult } from '../lib/types'
import { parseBondTickerClient, BOND_TYPES } from '../lib/types'
import type { BondType } from '../lib/types'

interface Props {
  onSelect: (ticker: string, name: string) => void
  placeholder?: string
}

export function StockSearch({ onSelect, placeholder = 'Szukaj spółki (np. AAPL, Apple, PKN)...' }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setIsOpen(false); return }

    // Detect Polish bond tickers (e.g. EDO0336) — yahoo-finance2 doesn't know them
    const bondParsed = parseBondTickerClient(q.trim().toUpperCase())
    if (bondParsed) {
      const bondInfo = BOND_TYPES[bondParsed.bondType]
      setResults([{
        ticker: q.trim().toUpperCase(),
        name: bondInfo.name,
        exchange: 'MF',
        type: `Obligacja ${bondInfo.period}`,
      }])
      setIsOpen(true)
      return
    }

    setLoading(true)
    try {
      const data = await searchTickers(q)
      setResults(data)
      setIsOpen(data.length > 0)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, doSearch])

  // Zamknij dropdown po kliknięciu poza komponentem
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (r: SearchResult) => {
    onSelect(r.ticker, r.name)
    setQuery('')
    setResults([])
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-finance-green"
      />
      {loading && (
        <span className="absolute right-3 top-3.5 text-gray-500 text-xs">Szukam...</span>
      )}
      {isOpen && (
        <ul className="absolute z-50 w-full mt-1 bg-finance-card border border-gray-700 rounded-lg shadow-xl max-h-64 overflow-y-auto">
          {results.map(r => (
            <li
              key={r.ticker}
              onClick={() => handleSelect(r)}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700 last:border-0"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold text-finance-green text-sm w-20 shrink-0">{r.ticker}</span>
                <span className="text-white text-sm truncate">{r.name}</span>
              </div>
              <div className="flex flex-col items-end shrink-0 ml-2">
                <span className="text-gray-400 text-xs">{r.exchange}</span>
                <span className="text-gray-600 text-xs">{r.type}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {query.length >= 2 && !loading && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-finance-card border border-gray-700 rounded-lg px-4 py-3 text-gray-500 text-sm">
          Brak wyników dla „{query}"
        </div>
      )}
    </div>
  )
}
