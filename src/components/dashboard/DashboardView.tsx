import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAssets, getQuote, getAssetMeta, getFundamentals, getCashAccounts, createPortfolio as apiCreatePortfolio } from '../../lib/api'
import type { EnrichedAsset, CashAccount } from '../../lib/types'
import { usePortfolio } from '../../contexts/PortfolioContext'
import SummaryCards from './SummaryCards'
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
  const { portfolios, activePortfolioId, setActivePortfolioId, createPortfolio, refreshPortfolios } = usePortfolio()
  const [assets, setAssets] = useState<EnrichedAsset[]>([])
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([])
  const [historyData, setHistoryData] = useState<{ date: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newPortfolioName, setNewPortfolioName] = useState('')
  const [showNewPortfolioInput, setShowNewPortfolioInput] = useState(false)
  const [usdPln, setUsdPln] = useState(4.0)
  const [eurPln, setEurPln] = useState(4.3)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, usd, eur, cash] = await Promise.all([
        getAssets(activePortfolioId ?? undefined),
        getRate('USDPLN=X'),
        getRate('EURPLN=X'),
        getCashAccounts(activePortfolioId ?? undefined),
      ])
      setUsdPln(usd)
      setEurPln(eur)
      setCashAccounts(cash)

      const toPlnRate = (currency: string): number => {
        if (currency === 'PLN') return 1
        if (currency === 'USD') return usd
        if (currency === 'EUR') return eur
        return 1
      }

      const enriched = await Promise.all(
        list.map(async (asset) => {
          const [q, meta, fund] = await Promise.all([
            getQuote(asset.ticker).catch(() => null),
            getAssetMeta(asset.ticker).catch(() => ({ region: 'Inne', assetType: 'Akcje', sector: null })),
            getFundamentals(asset.ticker).catch(() => null),
          ])
          const currentPrice  = q?.price ?? asset.purchase_price
          const quoteCurrency = q?.currency ?? asset.currency

          const currentValue   = asset.quantity * currentPrice
          const valueInPLN     = currentValue * toPlnRate(quoteCurrency)
          const costBasis      = asset.quantity * asset.purchase_price
          const costBasisInPLN = costBasis * toPlnRate(asset.currency)
          const annualDividendPLN = (fund?.dividendRate ?? 0) * asset.quantity * toPlnRate(quoteCurrency)

          return {
            ...asset,
            currentPrice,
            currentValue,
            valueInPLN,
            costBasis,
            costBasisInPLN,
            pnl: valueInPLN - costBasisInPLN,
            quoteCurrency,
            annualDividendPLN,
            region: meta.region,
            assetType: meta.assetType,
            sector: meta.sector ?? undefined,
          } as EnrichedAsset
        })
      )
      setAssets(enriched)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }

    api.getPortfolioHistory(activePortfolioId ?? undefined).then(setHistoryData).catch(console.error)
  }, [activePortfolioId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const cashValuePLN = useMemo(() => {
    const toPlnRate = (cur: string) => cur === 'PLN' ? 1 : cur === 'USD' ? usdPln : cur === 'EUR' ? eurPln : 1
    return cashAccounts.reduce((sum, a) => sum + a.balance * toPlnRate(a.currency), 0)
  }, [cashAccounts, usdPln, eurPln])

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
    if (cashValuePLN > 0) map.set('Gotówka', (map.get('Gotówka') ?? 0) + cashValuePLN)
    return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [assets, cashValuePLN])

  const handleCreatePortfolio = async () => {
    const name = newPortfolioName.trim()
    if (!name) return
    await createPortfolio(name)
    setNewPortfolioName('')
    setShowNewPortfolioInput(false)
  }

  if (loading) return <LoadingSpinner />
  if (error) return <div className="p-6"><ErrorMessage message={error} /></div>

  const assetsEmpty = assets.length === 0 && cashValuePLN === 0

  if (assetsEmpty && portfolios.length === 0) {
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

  const totalAssetValuePLN = assets.reduce((s, a) => s + a.valueInPLN, 0)
  const totalValuePLN = totalAssetValuePLN + cashValuePLN
  const totalCost = assets.reduce((s, a) => s + a.costBasisInPLN, 0)
  const totalPnL = assets.reduce((s, a) => s + a.pnl, 0)
  const totalROI = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0
  const totalAnnualDividendPLN = assets.reduce((s, a) => s + a.annualDividendPLN, 0)

  const portfolioData = [...assets]
    .sort((a, b) => b.valueInPLN - a.valueInPLN)
    .map((a) => ({ name: a.ticker, value: a.valueInPLN }))

  return (
    <div className="p-6 space-y-6">
      {/* Zakładki portfeli */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActivePortfolioId(null)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activePortfolioId === null
              ? 'bg-finance-green text-white'
              : 'glass-card text-gray-300 hover:text-white'
          }`}
        >
          Wszystkie
        </button>
        {portfolios.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePortfolioId(p.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activePortfolioId === p.id
                ? 'bg-finance-green text-white'
                : 'glass-card text-gray-300 hover:text-white'
            }`}
          >
            {p.name}
          </button>
        ))}
        {showNewPortfolioInput ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newPortfolioName}
              onChange={e => setNewPortfolioName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreatePortfolio(); if (e.key === 'Escape') setShowNewPortfolioInput(false) }}
              placeholder="Nazwa portfela"
              autoFocus
              className="bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 rounded-lg w-40 focus:outline-none focus:border-finance-green"
            />
            <button onClick={handleCreatePortfolio} className="text-finance-green text-sm hover:text-emerald-400">Utwórz</button>
            <button onClick={() => setShowNewPortfolioInput(false)} className="text-gray-400 text-sm hover:text-white">Anuluj</button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewPortfolioInput(true)}
            className="px-3 py-2 rounded-lg text-sm font-medium glass-card text-gray-400 hover:text-white transition-colors"
          >
            +
          </button>
        )}
      </div>

      {assetsEmpty ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-gray-400 text-lg mb-4">Ten portfel jest pusty</p>
          <button
            onClick={() => navigate('/portfolio')}
            className="bg-finance-green hover:bg-emerald-600 text-white font-medium px-6 py-3 rounded-lg transition-colors"
          >
            Dodaj spółkę
          </button>
        </div>
      ) : (
        <>
          <SummaryCards
            totalValue={totalValuePLN}
            totalPnL={totalPnL}
            totalROI={totalROI}
            assetCount={assets.length}
            totalAnnualDividend={totalAnnualDividendPLN}
            cashValuePLN={cashValuePLN}
          />
          <div className="grid grid-cols-2 gap-4 items-start">
            <div className="grid grid-cols-2 gap-4">
              <AllocationPieChart title="Alokacja portfela" data={portfolioData} />
              <AllocationPieChart title="Alokacja Regionalna" data={regionData} />
              <AllocationPieChart title="Alokacja Sektorowa" data={sectorData} />
              <AllocationPieChart title="Rodzaj Aktywów" data={typeData} />
            </div>
            <PortfolioHistoryChart data={historyData} />
          </div>
        </>
      )}
    </div>
  )
}
