import { useState, useEffect, useCallback } from 'react'
import type { NewsItem, NewsRegion } from '../../lib/types'
import { fetchNews } from '../../lib/api'

const REGIONS: Array<{ id: NewsRegion; label: string; flag: string }> = [
  { id: 'pl',    label: 'Polska',  flag: '🇵🇱' },
  { id: 'eu',    label: 'Europa',  flag: '🇪🇺' },
  { id: 'us',    label: 'Ameryka', flag: '🇺🇸' },
  { id: 'asia',  label: 'Azja',    flag: '🌏' },
  { id: 'world', label: 'Świat',   flag: '🌍' },
]

function formatDate(pubDate: string): string {
  if (!pubDate) return ''
  try {
    const d = new Date(pubDate)
    return d.toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return ''
  }
}

function NewsCard({ item }: { item: NewsItem }) {
  const [imgError, setImgError] = useState(false)

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-4 glass-card rounded-lg hover:bg-white/5 transition-colors group"
    >
      {/* Miniatura */}
      {item.thumbnail && !imgError ? (
        <img
          src={item.thumbnail}
          alt=""
          onError={() => setImgError(true)}
          className="w-20 h-16 object-cover rounded-md flex-shrink-0 bg-gray-800"
        />
      ) : (
        <div className="w-20 h-16 flex-shrink-0 rounded-md bg-gray-800/60 flex items-center justify-center">
          <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
        </div>
      )}

      {/* Treść */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium leading-snug group-hover:text-finance-green transition-colors line-clamp-2">
          {item.title}
        </p>
        {item.description && (
          <p className="text-gray-500 text-xs mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-finance-green text-xs font-medium">{item.source}</span>
          {item.pubDate && (
            <>
              <span className="text-gray-700 text-xs">·</span>
              <span className="text-gray-600 text-xs">{formatDate(item.pubDate)}</span>
            </>
          )}
        </div>
      </div>

      {/* Strzałka */}
      <svg className="w-4 h-4 text-gray-700 group-hover:text-finance-green flex-shrink-0 self-center transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  )
}

export default function NewsView() {
  const [region, setRegion] = useState<NewsRegion>('pl')
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async (r: NewsRegion) => {
    setLoading(true)
    setError(null)
    try {
      const news = await fetchNews(r)
      setItems(news)
      setLastUpdated(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania newsów')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(region)
  }, [region, load])

  const handleRegion = (r: NewsRegion) => {
    setRegion(r)
    setItems([])
  }

  return (
    <div className="p-6 space-y-5">
      {/* Nagłówek */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-xl font-bold">Wiadomości</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            Źródła RSS · {lastUpdated ? `Odświeżono ${lastUpdated.toLocaleTimeString('pl-PL', { timeStyle: 'short' })}` : 'Ładowanie...'}
          </p>
        </div>
        <button
          onClick={() => load(region)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium glass-card text-gray-300 hover:text-white disabled:opacity-50 transition-colors"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Odśwież
        </button>
      </div>

      {/* Zakładki regionów */}
      <div className="flex gap-1.5 flex-wrap">
        {REGIONS.map(r => (
          <button
            key={r.id}
            onClick={() => handleRegion(r.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              region === r.id
                ? 'bg-finance-green text-white'
                : 'glass-card text-gray-400 hover:text-white'
            }`}
          >
            <span>{r.flag}</span>
            <span>{r.label}</span>
          </button>
        ))}
      </div>

      {/* Błąd */}
      {error && (
        <div className="bg-red-900/30 border border-red-600 rounded-lg p-4 flex items-center justify-between gap-4">
          <span className="text-red-300 text-sm">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 text-lg leading-none">×</button>
        </div>
      )}

      {/* Spinner */}
      {loading && (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-3 p-4 glass-card rounded-lg animate-pulse">
              <div className="w-20 h-16 bg-gray-700/50 rounded-md flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-700/50 rounded w-3/4" />
                <div className="h-3 bg-gray-700/40 rounded w-full" />
                <div className="h-3 bg-gray-700/30 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lista newsów */}
      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, i) => (
            <NewsCard key={`${item.link}-${i}`} item={item} />
          ))}
        </div>
      )}

      {/* Brak wyników */}
      {!loading && !error && items.length === 0 && (
        <div className="text-gray-500 text-sm italic">Brak newsów dla wybranego regionu.</div>
      )}
    </div>
  )
}
