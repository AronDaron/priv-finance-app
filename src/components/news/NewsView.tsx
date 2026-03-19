import { useState, useEffect, useCallback } from 'react'
import type { NewsItem, NewsRegion } from '../../lib/types'
import { fetchNews } from '../../lib/api'

const REGIONS: Array<{ id: NewsRegion; label: string; flagSvg: string }> = [
  {
    id: 'pl', label: 'Polska',
    flagSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><rect width="60" height="20" fill="#fff"/><rect y="20" width="60" height="20" fill="#dc143c"/></svg>`
  },
  {
    id: 'eu', label: 'Europa',
    flagSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><rect width="60" height="40" fill="#003399"/><g fill="#fc0" transform="translate(30,20)">
      <polygon points="0,-8 1.9,-2.6 7.6,-2.6 3.1,1 4.7,6.6 0,3.4 -4.7,6.6 -3.1,1 -7.6,-2.6 -1.9,-2.6" transform="translate(0,-13) scale(0.45)"/>
      <polygon points="0,-8 1.9,-2.6 7.6,-2.6 3.1,1 4.7,6.6 0,3.4 -4.7,6.6 -3.1,1 -7.6,-2.6 -1.9,-2.6" transform="rotate(30) translate(0,-13) scale(0.45)"/>
      <polygon points="0,-8 1.9,-2.6 7.6,-2.6 3.1,1 4.7,6.6 0,3.4 -4.7,6.6 -3.1,1 -7.6,-2.6 -1.9,-2.6" transform="rotate(60) translate(0,-13) scale(0.45)"/>
      <polygon points="0,-8 1.9,-2.6 7.6,-2.6 3.1,1 4.7,6.6 0,3.4 -4.7,6.6 -3.1,1 -7.6,-2.6 -1.9,-2.6" transform="rotate(90) translate(0,-13) scale(0.45)"/>
      <polygon points="0,-8 1.9,-2.6 7.6,-2.6 3.1,1 4.7,6.6 0,3.4 -4.7,6.6 -3.1,1 -7.6,-2.6 -1.9,-2.6" transform="rotate(120) translate(0,-13) scale(0.45)"/>
      <polygon points="0,-8 1.9,-2.6 7.6,-2.6 3.1,1 4.7,6.6 0,3.4 -4.7,6.6 -3.1,1 -7.6,-2.6 -1.9,-2.6" transform="rotate(150) translate(0,-13) scale(0.45)"/>
      <polygon points="0,-8 1.9,-2.6 7.6,-2.6 3.1,1 4.7,6.6 0,3.4 -4.7,6.6 -3.1,1 -7.6,-2.6 -1.9,-2.6" transform="rotate(180) translate(0,-13) scale(0.45)"/>
      <polygon points="0,-8 1.9,-2.6 7.6,-2.6 3.1,1 4.7,6.6 0,3.4 -4.7,6.6 -3.1,1 -7.6,-2.6 -1.9,-2.6" transform="rotate(210) translate(0,-13) scale(0.45)"/>
      <polygon points="0,-8 1.9,-2.6 7.6,-2.6 3.1,1 4.7,6.6 0,3.4 -4.7,6.6 -3.1,1 -7.6,-2.6 -1.9,-2.6" transform="rotate(240) translate(0,-13) scale(0.45)"/>
      <polygon points="0,-8 1.9,-2.6 7.6,-2.6 3.1,1 4.7,6.6 0,3.4 -4.7,6.6 -3.1,1 -7.6,-2.6 -1.9,-2.6" transform="rotate(270) translate(0,-13) scale(0.45)"/>
      <polygon points="0,-8 1.9,-2.6 7.6,-2.6 3.1,1 4.7,6.6 0,3.4 -4.7,6.6 -3.1,1 -7.6,-2.6 -1.9,-2.6" transform="rotate(300) translate(0,-13) scale(0.45)"/>
      <polygon points="0,-8 1.9,-2.6 7.6,-2.6 3.1,1 4.7,6.6 0,3.4 -4.7,6.6 -3.1,1 -7.6,-2.6 -1.9,-2.6" transform="rotate(330) translate(0,-13) scale(0.45)"/>
    </g></svg>`
  },
  {
    id: 'us', label: 'Ameryka',
    flagSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40">
      <rect width="60" height="40" fill="#B22234"/>
      <rect y="3.08" width="60" height="3.08" fill="#fff"/>
      <rect y="9.23" width="60" height="3.08" fill="#fff"/>
      <rect y="15.38" width="60" height="3.08" fill="#fff"/>
      <rect y="21.54" width="60" height="3.08" fill="#fff"/>
      <rect y="27.69" width="60" height="3.08" fill="#fff"/>
      <rect y="33.85" width="60" height="3.08" fill="#fff"/>
      <rect width="24" height="21.54" fill="#3C3B6E"/>
    </svg>`
  },
  {
    id: 'asia', label: 'Azja',
    flagSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><rect width="60" height="40" fill="#1a0a28"/><circle cx="30" cy="20" r="14" fill="none" stroke="#c084fc" stroke-width="1.5"/><ellipse cx="30" cy="20" rx="7" ry="14" fill="none" stroke="#c084fc" stroke-width="1"/><line x1="16" y1="20" x2="44" y2="20" stroke="#c084fc" stroke-width="1"/><line x1="18" y1="13" x2="42" y2="13" stroke="#c084fc" stroke-width="0.8"/><line x1="18" y1="27" x2="42" y2="27" stroke="#c084fc" stroke-width="0.8"/></svg>`
  },
  {
    id: 'world', label: 'Świat',
    flagSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><rect width="60" height="40" fill="#0a1628"/><circle cx="30" cy="20" r="14" fill="none" stroke="#4a9eff" stroke-width="1.5"/><ellipse cx="30" cy="20" rx="7" ry="14" fill="none" stroke="#4a9eff" stroke-width="1"/><line x1="16" y1="20" x2="44" y2="20" stroke="#4a9eff" stroke-width="1"/><line x1="18" y1="13" x2="42" y2="13" stroke="#4a9eff" stroke-width="0.8"/><line x1="18" y1="27" x2="42" y2="27" stroke="#4a9eff" stroke-width="0.8"/></svg>`
  },
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
      className="flex gap-2 p-3 glass-card rounded-xl border-l-2 border-transparent hover:border-finance-green/30 hover:bg-white/[0.02] transition-all duration-200 group"
    >
      {/* Miniatura */}
      {item.thumbnail && !imgError ? (
        <img
          src={item.thumbnail}
          alt=""
          onError={() => setImgError(true)}
          className="w-16 h-12 object-cover rounded-md flex-shrink-0 bg-gray-800"
        />
      ) : (
        <div className="w-16 h-12 flex-shrink-0 rounded-md bg-gray-800/60 flex items-center justify-center">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
        </div>
      )}

      {/* Treść */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-medium leading-snug group-hover:text-finance-green transition-colors line-clamp-2">
          {item.title}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-finance-green text-xs font-medium truncate">{item.source}</span>
          {item.pubDate && (
            <>
              <span className="text-gray-700 text-xs">·</span>
              <span className="text-gray-600 text-xs whitespace-nowrap">{formatDate(item.pubDate)}</span>
            </>
          )}
        </div>
      </div>
    </a>
  )
}

function FlagImg({ svg }: { svg: string }) {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return <img src={url} alt="" className="w-10 h-7 rounded object-cover" />
}

function RegionColumn({ region, refreshTick }: { region: typeof REGIONS[number]; refreshTick: number }) {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const news = await fetchNews(region.id)
      setItems(news)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [region.id])

  useEffect(() => {
    load()
  }, [load, refreshTick])

  return (
    <div className="flex flex-col min-w-0 flex-1" style={{ minWidth: '220px' }}>
      {/* Nagłówek kolumny */}
      <div className="flex flex-col items-center gap-1.5 mb-3 pb-2 border-b border-white/10">
        <FlagImg svg={region.flagSvg} />
        <div className="flex items-center gap-1.5">
          <span className="text-white text-sm font-semibold">{region.label}</span>
          {loading && (
            <svg className="w-3 h-3 text-gray-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </div>
      </div>

      {/* Scrollowalna lista */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ maxHeight: 'calc(100vh - 160px)' }}>
        {/* Skeleton */}
        {loading && [...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-2 p-3 glass-card rounded-lg animate-pulse">
            <div className="w-16 h-12 bg-gray-700/50 rounded-md flex-shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 bg-gray-700/50 rounded w-full" />
              <div className="h-3 bg-gray-700/40 rounded w-2/3" />
            </div>
          </div>
        ))}

        {/* Błąd */}
        {!loading && error && (
          <div className="p-3 bg-red-900/20 border border-red-800/50 rounded-lg text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Wyniki */}
        {!loading && !error && items.map((item, i) => (
          <NewsCard key={`${item.link}-${i}`} item={item} />
        ))}

        {/* Brak wyników */}
        {!loading && !error && items.length === 0 && (
          <div className="text-gray-600 text-xs italic px-1">Brak newsów.</div>
        )}
      </div>
    </div>
  )
}

export default function NewsView() {
  const [refreshTick, setRefreshTick] = useState(0)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const handleRefresh = () => {
    setRefreshTick(t => t + 1)
    setLastRefreshed(new Date())
  }

  useEffect(() => {
    setLastRefreshed(new Date())
  }, [])

  return (
    <div className="flex flex-col h-full p-6" style={{ height: '100vh' }}>
      {/* Nagłówek */}
      <div className="flex items-center justify-between gap-4 mb-5 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Wiadomości</h1>
            <div className="flex-1 h-px bg-gray-700/50" />
          </div>
          <p className="text-gray-500 text-xs mt-0.5">
            Źródła RSS · {lastRefreshed ? `Odświeżono ${lastRefreshed.toLocaleTimeString('pl-PL', { timeStyle: 'short' })}` : 'Ładowanie...'}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium glass-card text-gray-400 hover:text-white transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Odśwież wszystkie
        </button>
      </div>

      {/* Kolumny regionów */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-x-auto">
        {REGIONS.map(r => (
          <RegionColumn key={r.id} region={r} refreshTick={refreshTick} />
        ))}
      </div>
    </div>
  )
}
