import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAssets, getQuote, getAssetMeta, getFundamentals, getCashAccounts } from '../../lib/api'
import type { EnrichedAsset, CashAccount } from '../../lib/types'
import { gramsToTroyOz } from '../../lib/types'
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
  const { portfolios, activePortfolioId, setActivePortfolioId, createPortfolio } = usePortfolio()
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
          const spotPrice     = q?.price ?? asset.purchase_price
          const quoteCurrency = q?.currency ?? asset.currency
          const ozPerCoin     = asset.gold_grams ? gramsToTroyOz(asset.gold_grams) : null
          const currentPrice  = ozPerCoin ? spotPrice * ozPerCoin : spotPrice

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
    .map((a) => ({ name: a.name, value: a.valueInPLN }))

  return (
    <div className="p-6 space-y-6">
      {/* Zakładki portfeli */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActivePortfolioId(null)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
            activePortfolioId === null
              ? 'bg-finance-green text-white shadow-sm shadow-finance-green/30 ring-2 ring-finance-green/20'
              : 'glass-card text-gray-400 hover:text-white hover:border-gray-500'
          }`}
        >
          Wszystkie
        </button>
        {portfolios.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePortfolioId(p.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
              activePortfolioId === p.id
                ? 'bg-finance-green text-white shadow-sm shadow-finance-green/30 ring-2 ring-finance-green/20'
                : 'glass-card text-gray-400 hover:text-white hover:border-gray-500'
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
              className="bg-gray-800 border border-gray-600 text-white text-sm px-3 py-2 rounded-full w-40 focus:outline-none focus:border-finance-green focus:ring-1 focus:ring-finance-green/30"
            />
            <button onClick={handleCreatePortfolio} className="text-finance-green text-sm hover:text-emerald-400 transition-colors">Utwórz</button>
            <button onClick={() => setShowNewPortfolioInput(false)} className="text-gray-500 text-sm hover:text-white transition-colors">Anuluj</button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewPortfolioInput(true)}
            className="px-3 py-1.5 rounded-full text-sm font-medium glass-card text-gray-500 hover:text-white border border-dashed border-gray-600 hover:border-finance-green/50 transition-all duration-200"
          >
            + nowy
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
          {/* Górna sekcja: karty (lewa połowa) + historia (prawa połowa) */}
          <div className="grid grid-cols-2 gap-6">
            <SummaryCards
              totalValue={totalValuePLN}
              totalPnL={totalPnL}
              totalROI={totalROI}
              assetCount={assets.length}
              totalAnnualDividend={totalAnnualDividendPLN}
              cashValuePLN={cashValuePLN}
              compact
            />
            <div className="flex flex-col" style={{ minHeight: 300 }}>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Historia</h2>
                <div className="flex-1 h-px bg-gray-700/50" />
              </div>
              <div className="flex-1" style={{ minHeight: 240 }}>
                <PortfolioHistoryChart data={historyData} fillHeight />
              </div>
            </div>
          </div>

          {/* Dolna sekcja: alokacja (portfel+regiony) + sektory+rodzaj aktywów */}
          <div className="grid grid-cols-2 gap-6 items-start">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Alokacja</h2>
                <div className="flex-1 h-px bg-gray-700/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <AllocationPieChart title="Portfel" data={portfolioData} />
                <AllocationPieChart title="Regiony" data={regionData} />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Struktura</h2>
                <div className="flex-1 h-px bg-gray-700/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <AllocationPieChart title="Sektory" data={sectorData} />
                <AllocationPieChart title="Rodzaj aktywów" data={typeData} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
