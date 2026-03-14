import { useState, useEffect, useCallback } from 'react'
import { fetchGlobalAnalysis, fetchNews } from '../../lib/api'
import type { GlobalAnalysis, RegionScore, NewsRegion } from '../../lib/types'
import CommoditiesBar from './CommoditiesBar'
import RegionCard from './RegionCard'
import RegionDetailModal from './RegionDetailModal'
import LoadingSpinner from '../ui/LoadingSpinner'
import ErrorMessage from '../ui/ErrorMessage'

// Mapowanie regionId → NewsRegion (do pobierania newsów dla AI)
const REGION_NEWS_MAP: Record<string, NewsRegion> = {
  usa:        'us',
  europe:     'eu',
  poland:     'pl',
  asia:       'asia',
  latam_em:   'world',
  commodities: 'world',
}

export default function GlobalView() {
  const [analysis, setAnalysis] = useState<GlobalAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<RegionScore | null>(null)
  const [regionNews, setRegionNews] = useState<string[]>([])
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchGlobalAnalysis()
      setAnalysis(data)
      setLastUpdated(new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }))
    } catch (e: any) {
      setError(e.message ?? 'Błąd pobierania danych')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSelectRegion(region: RegionScore) {
    setSelectedRegion(region)
    // Pobierz newsy dla regionu w tle (dla AI)
    try {
      const newsRegion = REGION_NEWS_MAP[region.id] ?? 'world'
      const items = await fetchNews(newsRegion)
      setRegionNews(items.map(n => n.title).filter(Boolean))
    } catch {
      setRegionNews([])
    }
  }

  if (loading) return <LoadingSpinner />
  if (error)   return <div className="p-6"><ErrorMessage message={error} /></div>
  if (!analysis) return null

  // Posortuj regiony wg score (malejąco)
  const sorted = [...analysis.regions].sort((a, b) => b.score - a.score)

  const fetchedAt = new Date(analysis.marketData.fetchedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-white text-2xl font-bold">Globalny Rynek</h1>
          <p className="text-gray-400 text-sm mt-1">
            Ocena potencjału inwestycyjnego regionów — algorytm deterministyczny
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-xs">Dane z: {fetchedAt}</span>
          <button
            onClick={load}
            className="flex items-center gap-2 glass-card text-gray-300 hover:text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Odśwież
          </button>
        </div>
      </div>

      {/* Pasek surowców i walut */}
      <div>
        <p className="text-gray-500 text-xs mb-2 uppercase tracking-wide">Rynek na żywo</p>
        <CommoditiesBar data={analysis.marketData} />
      </div>

      {/* Kafelki regionów */}
      <div>
        <p className="text-gray-500 text-xs mb-3 uppercase tracking-wide">Regiony — kliknij aby zobaczyć szczegóły i analizę AI</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map(region => (
            <RegionCard
              key={region.id}
              region={region}
              onClick={() => handleSelectRegion(region)}
            />
          ))}
        </div>
      </div>

      {/* Legenda */}
      <div className="glass-card rounded-xl p-4 flex flex-wrap gap-6 text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-finance-green" />
          <span>Score ≥65 — niskie ryzyko</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span>Score 40–64 — średnie ryzyko</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-finance-red" />
          <span>Score &lt;40 — wysokie ryzyko</span>
        </div>
        <div className="flex items-center gap-2">
          <span>↑↓→</span>
          <span>Trend 1-dniowy indeksu regionu</span>
        </div>
        <div className="ml-auto text-gray-600">
          Ocena orientacyjna. Nie jest rekomendacją inwestycyjną.
        </div>
      </div>

      {/* Modal szczegółów */}
      {selectedRegion && (
        <RegionDetailModal
          region={selectedRegion}
          analysis={analysis}
          newsHeadlines={regionNews}
          onClose={() => { setSelectedRegion(null); setRegionNews([]) }}
        />
      )}
    </div>
  )
}
