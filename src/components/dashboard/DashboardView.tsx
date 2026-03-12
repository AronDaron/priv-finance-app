import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAssets, getQuote } from '../../lib/api'
import type { PortfolioAsset, StockQuote } from '../../lib/types'
import SummaryCards from './SummaryCards'
import PortfolioPieChart from './PortfolioPieChart'
import LoadingSpinner from '../ui/LoadingSpinner'
import ErrorMessage from '../ui/ErrorMessage'

interface AssetWithQuote extends PortfolioAsset {
  currentPrice: number
  currentValue: number
  costBasis: number
  pnl: number
}

export default function DashboardView() {
  const navigate = useNavigate()
  const [assets, setAssets] = useState<AssetWithQuote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getAssets()
      .then(async (list) => {
        const withQuotes = await Promise.all(
          list.map(async (asset) => {
            let currentPrice = asset.purchase_price
            try {
              const q: StockQuote = await getQuote(asset.ticker)
              currentPrice = q.price
            } catch {
              // fallback do ceny zakupu
            }
            const currentValue = asset.quantity * currentPrice
            const costBasis = asset.quantity * asset.purchase_price
            return {
              ...asset,
              currentPrice,
              currentValue,
              costBasis,
              pnl: currentValue - costBasis,
            }
          })
        )
        setAssets(withQuotes)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

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

  const totalValue = assets.reduce((s, a) => s + a.currentValue, 0)
  const totalCost = assets.reduce((s, a) => s + a.costBasis, 0)
  const totalPnL = totalValue - totalCost
  const totalROI = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0

  const sorted = [...assets].sort((a, b) => b.currentValue - a.currentValue)
  const slices = sorted.map((a) => ({
    ticker: a.ticker,
    value: a.currentValue,
    percentage: totalValue > 0 ? (a.currentValue / totalValue) * 100 : 0,
  }))

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-semibold text-white">Dashboard</h2>
      <SummaryCards
        totalValue={totalValue}
        totalPnL={totalPnL}
        totalROI={totalROI}
        assetCount={assets.length}
      />
      <div className="bg-finance-card rounded-xl border border-gray-700 p-5">
        <h3 className="text-lg font-semibold text-white mb-4">Alokacja portfela</h3>
        <PortfolioPieChart slices={slices} />
      </div>
    </div>
  )
}
