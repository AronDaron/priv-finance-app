import { useState, useEffect, useCallback } from 'react'
import { fetchGlobalAnalysis, fetchNews } from '../../lib/api'
import type { GlobalAnalysis, RegionScore, RegionId, NewsRegion, MarketRegime, GlobalMarketData } from '../../lib/types'
import RegionCard from './RegionCard'
import RegionDetailModal from './RegionDetailModal'
import LoadingSpinner from '../ui/LoadingSpinner'
import ErrorMessage from '../ui/ErrorMessage'

function RegimeBanner({ regime, marketData }: { regime: MarketRegime; marketData: GlobalMarketData }) {
  if (regime.vixLevel === 'panic') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-finance-red/15 border border-finance-red/40 text-finance-red text-sm font-medium">
        <span>⚠</span>
        <span>Tryb Paniki — VIX: {marketData.indices.VIX.price.toFixed(1)} — wagi algorytmu przełączone na wskaźniki strachu i płynności</span>
      </div>
    )
  }
  if (regime.bondStress === 'shock') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-500/15 border border-orange-500/40 text-orange-400 text-sm font-medium">
        <span>⚡</span>
        <span>Szok Obligacyjny — US10Y: {marketData.bonds.US10Y.price.toFixed(2)}% — wagi przesunięte na USD i koszty finansowania</span>
      </div>
    )
  }
  if (regime.gasShock) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow-500/15 border border-yellow-500/40 text-yellow-400 text-sm font-medium">
        <span>🔥</span>
        <span>Szok Gazowy — Gaz 30d: {marketData.commodities.gas.change1m.toFixed(1)}% — wagi Europy i Azji przesunięte na energię</span>
      </div>
    )
  }
  if (regime.copperCrash) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-500/15 border border-blue-500/40 text-blue-400 text-sm font-medium">
        <span>📉</span>
        <span>Crash Miedzi — Miedź 30d: {marketData.commodities.copper.change1m.toFixed(1)}% — wagi przesunięte na wskaźniki recesji</span>
      </div>
    )
  }
  if (regime.oilShock) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-400 text-sm font-medium">
        <span>🛢</span>
        <span>Szok Naftowy — Ropa 30d: {marketData.commodities.oil.change1m.toFixed(1)}% — wagi eksporterów i importerów dostosowane asymetrycznie</span>
      </div>
    )
  }
  if (regime.goldRally) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow-400/10 border border-yellow-400/30 text-yellow-300 text-sm font-medium">
        <span>✨</span>
        <span>Rally Złota — Złoto 30d: +{marketData.commodities.gold.change1m.toFixed(1)}% — wagi safe haven podwyższone globalnie</span>
      </div>
    )
  }
  return null
}

// Mapowanie regionId → NewsRegion (do pobierania newsów dla AI)
const REGION_NEWS_MAP: Record<string, NewsRegion> = {
  north_america:     'us',
  europe:            'eu',
  asia:              'asia',
  latam_em:          'world',
  commodities:       'world',
  australia_oceania: 'world',
  africa:            'world',
  south_america:     'world',
  developed_markets: 'world',
}

const SECTOR_IDS: RegionId[] = ['commodities', 'developed_markets', 'latam_em']
const REGION_IDS: RegionId[] = ['north_america', 'europe', 'asia', 'south_america', 'africa', 'australia_oceania']

export default function GlobalView() {
  const [analysis, setAnalysis] = useState<GlobalAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<RegionScore | null>(null)
  const [regionNews, setRegionNews] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchGlobalAnalysis()
      setAnalysis(data)
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

  const sectors = SECTOR_IDS
    .map(id => analysis.regions.find(r => r.id === id))
    .filter(Boolean) as RegionScore[]

  const regions = REGION_IDS
    .map(id => analysis.regions.find(r => r.id === id))
    .filter(Boolean) as RegionScore[]

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

      {/* Pasek aktywnego reżimu rynkowego */}
      {analysis.regime && (
        <RegimeBanner regime={analysis.regime} marketData={analysis.marketData} />
      )}

      {/* Kafelki sektorów i regionów */}
      <div>
        <p className="text-gray-500 text-xs mb-3 uppercase tracking-wide">
          Sektory i Regiony — kliknij aby zobaczyć szczegóły i analizę AI
        </p>
        <div className="flex gap-4">
          {/* Lewa kolumna: Sektory */}
          <div className="w-[380px] flex-shrink-0 flex flex-col gap-4 border border-gray-700/60 rounded-xl p-4">
            <p className="text-gray-300 text-xs uppercase tracking-wide font-semibold border-b border-gray-700/50 pb-2">Sektory</p>
            {sectors.map(region => (
              <RegionCard
                key={region.id}
                region={region}
                onClick={() => handleSelectRegion(region)}
              />
            ))}
          </div>

          {/* Prawa siatka: Regiony */}
          <div className="flex-1 flex flex-col gap-4 border border-gray-700/60 rounded-xl p-4">
            <p className="text-gray-300 text-xs uppercase tracking-wide font-semibold border-b border-gray-700/50 pb-2">Regiony</p>
            <div className="grid grid-cols-2 gap-4">
              {regions.map(region => (
                <RegionCard
                  key={region.id}
                  region={region}
                  onClick={() => handleSelectRegion(region)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="glass-card rounded-xl p-4 space-y-3 text-xs text-gray-400">
        <div className="flex flex-wrap gap-6">
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
        <div className="border-t border-gray-700/50 pt-2 flex flex-wrap gap-x-6 gap-y-1 text-gray-500">
          <span><span className="text-gray-400 font-medium">VIX</span> — indeks strachu (zmienność rynku). &lt;15 spokój · 15–25 umiarkowany · 25–35 wysoki · &gt;35 panika. Im wyższy, tym gorzej dla wycen.</span>
          <span><span className="text-gray-400 font-medium">US10Y</span> — rentowność 10-letnich obligacji USA. Wzrost powyżej 5% oznacza zacieśnienie finansowe i presję na akcje.</span>
        </div>
      </div>

      {/* Modal szczegółów */}
      {selectedRegion && (
        <RegionDetailModal
          region={selectedRegion}
          newsHeadlines={regionNews}
          onClose={() => { setSelectedRegion(null); setRegionNews([]) }}
        />
      )}
    </div>
  )
}
