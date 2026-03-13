import { useState, useEffect } from 'react'
import { getAssets, deleteAsset, getQuote, getHistory } from '../../lib/api'
import type { PortfolioAsset, StockQuote } from '../../lib/types'
import AssetRow from './AssetRow'
import AddAssetModal from './AddAssetModal'
import LoadingSpinner from '../ui/LoadingSpinner'
import ErrorMessage from '../ui/ErrorMessage'

export default function PortfolioView() {
  const [assets, setAssets] = useState<PortfolioAsset[]>([])
  const [quotes, setQuotes] = useState<Map<string, StockQuote>>(new Map())
  const [sparklines, setSparklines] = useState<Map<string, number[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await getAssets()
      setAssets(list)
      const [quoteEntries, sparkEntries] = await Promise.all([
        Promise.all(
          list.map(async (a) => {
            try {
              const q = await getQuote(a.ticker)
              return [a.ticker, q] as [string, StockQuote]
            } catch {
              return null
            }
          })
        ),
        Promise.all(
          list.map(async (a) => {
            try {
              const candles = await getHistory(a.ticker, '1mo')
              return [a.ticker, candles.map(c => c.close)] as [string, number[]]
            } catch {
              return null
            }
          })
        ),
      ])
      const qMap = new Map<string, StockQuote>()
      quoteEntries.forEach((e) => { if (e) qMap.set(e[0], e[1]) })
      setQuotes(qMap)
      const sMap = new Map<string, number[]>()
      sparkEntries.forEach((e) => { if (e) sMap.set(e[0], e[1]) })
      setSparklines(sMap)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania danych')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleDelete = async (id: number) => {
    try {
      await deleteAsset(id)
      await loadData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd usuwania')
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Portfel</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-finance-green hover:bg-emerald-600 text-white font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Dodaj spółkę
        </button>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && assets.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          Brak spółek w portfelu. Dodaj pierwszą!
        </div>
      )}

      {!loading && assets.length > 0 && (
        <div className="glass-card rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700">
                <th className="px-4 py-3 text-left">Ticker</th>
                <th className="px-4 py-3 text-left">Nazwa</th>
                <th className="px-4 py-3 text-right">Ilość</th>
                <th className="px-4 py-3 text-right">Śr. cena zakupu</th>
                <th className="px-4 py-3 text-right">Aktualna cena</th>
                <th className="px-4 py-3 text-right">Wartość</th>
                <th className="px-4 py-3 text-right">P&L</th>
                <th className="px-4 py-3 text-right">P&L %</th>
                <th className="px-4 py-3 text-center">Trend (1M)</th>
                <th className="px-4 py-3 text-center">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  quote={quotes.get(asset.ticker) ?? null}
                  sparkline={sparklines.get(asset.ticker)}
                  onDelete={() => handleDelete(asset.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddAssetModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); loadData() }}
        />
      )}
    </div>
  )
}
