import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAssets, getQuote, getAssetMeta } from '../../lib/api'
import type { EnrichedAsset } from '../../lib/types'
import SummaryCards from './SummaryCards'
import PortfolioPieChart from './PortfolioPieChart'
import AllocationPieChart from './AllocationPieChart'
import PortfolioHistoryChart from './PortfolioHistoryChart'
import LoadingSpinner from '../ui/LoadingSpinner'
import ErrorMessage from '../ui/ErrorMessage'
import * as api from '../../lib/api'

async function getRate(ticker: string): Promise<number> {
  try {
    const q = await getQuote(ticker)
    return q.price ?? 1
  } catch {
    return 1
  }
}

export default function DashboardView() {
  const navigate = useNavigate()
  const [assets, setAssets] = useState<EnrichedAsset[]>([])
  const [historyData, setHistoryData] = useState<{ date: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      getAssets(),
      getRate('USDPLN=X'),
      getRate('EURPLN=X'),
    ])
      .then(async ([list, usdPln, eurPln]) => {
        const toPlnRate = (currency: string): number => {
          if (currency === 'PLN') return 1
          if (currency === 'USD') return usdPln
          if (currency === 'EUR') return eurPln
          return 1
        }

        const enriched = await Promise.all(
          list.map(async (asset) => {
            let currentPrice = asset.purchase_price
            try {
              const q = await getQuote(asset.ticker)
              currentPrice = q.price
            } catch {
              // fallback do ceny zakupu
            }
            const meta = await getAssetMeta(asset.ticker).catch(() => ({ region: 'Inne', assetType: 'Akcje', sector: null }))
            const currentValue = asset.quantity * currentPrice
            const valueInPLN = currentValue * toPlnRate(asset.currency)
            const costBasis = asset.quantity * asset.purchase_price
            return {
              ...asset,
              currentPrice,
              currentValue,
              valueInPLN,
              costBasis,
              pnl: currentValue - costBasis,
              region: meta.region,
              assetType: meta.assetType,
              sector: meta.sector ?? undefined,
            } as EnrichedAsset
          })
        )
        setAssets(enriched)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))

    api.getPortfolioHistory().then(setHistoryData).catch(console.error)
  }, [])

  const regionData = useMemo(() => {
    const map = new Map<string, number>()
    assets.forEach(a => {
      const key = a.region ?? 'Inne'
      map.set(key, (map.get(key) ?? 0) + a.valueInPLN)
    })
    return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [assets])

  const sectorData = useMemo(() => {
    const map = new Map<string, number>()
    assets.forEach(a => {
      const key = a.sector ?? 'Inne'
      map.set(key, (map.get(key) ?? 0) + a.valueInPLN)
    })
    return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [assets])

  const typeData = useMemo(() => {
    const map = new Map<string, number>()
    assets.forEach(a => {
      const key = a.assetType ?? 'Akcje'
      map.set(key, (map.get(key) ?? 0) + a.valueInPLN)
    })
    return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [assets])

  if (loading) return <LoadingSpinner />
  if (error) return <div className="p-6"><ErrorMessage message={error} /></div>

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-32 text-center">
        <p className="text-gray-400 text-lg mb-4">Portfolio jest puste</p>
        <p className="text-gray-600 text-sm mb-6">Dodaj pierwszą spółkę, aby zobaczyć statystyki</p>
        <button
          onClick={() => navigate('/portfolio')}
          className="bg-finance-green hover:bg-emerald-600 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        >
          Dodaj pierwszą spółkę
        </button>
      </div>
    )
  }

  const totalValuePLN = assets.reduce((s, a) => s + a.valueInPLN, 0)
  const totalCost = assets.reduce((s, a) => s + a.costBasis, 0)
  const totalPnL = assets.reduce((s, a) => s + a.pnl, 0)
  const totalROI = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0

  const sorted = [...assets].sort((a, b) => b.valueInPLN - a.valueInPLN)
  const slices = sorted.map((a) => ({
    ticker: a.ticker,
    value: a.valueInPLN,
    percentage: totalValuePLN > 0 ? (a.valueInPLN / totalValuePLN) * 100 : 0,
  }))

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-semibold text-white">Dashboard</h2>
      <SummaryCards
        totalValue={totalValuePLN}
        totalPnL={totalPnL}
        totalROI={totalROI}
        assetCount={assets.length}
      />
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-lg font-semibold text-white mb-4">Alokacja portfela</h3>
        <PortfolioPieChart slices={slices} />
      </div>
      <PortfolioHistoryChart data={historyData} />
      <div className="grid grid-cols-3 gap-4">
        <AllocationPieChart title="Alokacja Regionalna" data={regionData} />
        <AllocationPieChart title="Alokacja Sektorowa" data={sectorData} />
        <AllocationPieChart title="Rodzaj Aktywów" data={typeData} />
      </div>
    </div>
  )
}
