import { useState, useEffect, useCallback } from 'react'
import { getAssets, deleteAsset, getQuote, getHistory, getCashAccounts } from '../../lib/api'
import type { PortfolioAsset, StockQuote, CashAccount } from '../../lib/types'
import { usePortfolio } from '../../contexts/PortfolioContext'
import AssetRow from './AssetRow'
import AddAssetModal from './AddAssetModal'
import CashTransactionModal from './CashTransactionModal'
import PortfolioTagEditor from './PortfolioTagEditor'
import LoadingSpinner from '../ui/LoadingSpinner'
import ErrorMessage from '../ui/ErrorMessage'
import { formatCurrency } from '../../lib/utils'

async function getRate(ticker: string): Promise<number> {
  try {
    const q = await getQuote(ticker)
    return q.price ?? 1
  } catch {
    return 1
  }
}

export default function PortfolioView() {
  const { portfolios, refreshPortfolios } = usePortfolio()
  const [assets, setAssets] = useState<PortfolioAsset[]>([])
  const [quotes, setQuotes] = useState<Map<string, StockQuote>>(new Map())
  const [sparklines, setSparklines] = useState<Map<string, number[]>>(new Map())
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editAsset, setEditAsset] = useState<PortfolioAsset | null>(null)
  const [cashModalPortfolioId, setCashModalPortfolioId] = useState<number | null>(null)
  const [usdPln, setUsdPln] = useState(4.0)
  const [eurPln, setEurPln] = useState(4.3)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, usdRate, eurRate, cash] = await Promise.all([
        getAssets(), // wszystkie — bez filtra
        getRate('USDPLN=X'),
        getRate('EURPLN=X'),
        getCashAccounts(), // wszystkie
      ])
      setUsdPln(usdRate)
      setEurPln(eurRate)
      setAssets(list)
      setCashAccounts(cash)
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
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = async (id: number) => {
    try {
      await deleteAsset(id)
      await loadData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd usuwania')
    }
  }

  const handleTagsUpdate = (_portfolioId: number, _tags: string[]) => {
    refreshPortfolios()
  }

  const toPlnRate = (cur: string) => cur === 'PLN' ? 1 : cur === 'USD' ? usdPln : cur === 'EUR' ? eurPln : 1

  // Grupuj po portfelach; aktywa bez portfolio_id trafiają do portfolio 1
  const groups = portfolios.map(portfolio => ({
    portfolio,
    assets: assets.filter(a => (a.portfolio_id ?? 1) === portfolio.id),
    cashAccounts: cashAccounts.filter(c => c.portfolio_id === portfolio.id),
  }))

  // Aktywa nieprzpisane do żadnego portfela (stare dane)
  const knownIds = new Set(portfolios.map(p => p.id))
  const orphaned = assets.filter(a => a.portfolio_id !== undefined && !knownIds.has(a.portfolio_id))

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Portfel</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-finance-green hover:bg-emerald-600 text-white font-medium px-4 py-2 rounded-full ring-2 ring-finance-green/20 hover:ring-finance-green/40 transition-all"
        >
          + Dodaj spółkę
        </button>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && (
        <>
          {groups.map(({ portfolio, assets: pfAssets, cashAccounts: pfCash }) => (
            <div key={portfolio.id} className="mb-8 glass-card rounded-xl">
              {/* Kolorowy pasek indigo na górze */}
              <div className="rounded-t-xl" style={{ height: 3, background: 'linear-gradient(90deg, #6366f1, #818cf8)', boxShadow: '0 0 8px rgba(99,102,241,0.4)' }} />
              <div className="p-4">
              {/* Nagłówek portfela — zawsze widoczny */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{portfolio.name}</h3>
                  <div className="flex-1 h-px bg-gray-700/50" />
                  <PortfolioTagEditor
                    portfolioId={portfolio.id}
                    currentTags={portfolio.tags ?? []}
                    onUpdate={(tags) => handleTagsUpdate(portfolio.id, tags)}
                  />
                </div>
                <button
                  onClick={() => setCashModalPortfolioId(portfolio.id)}
                  className="px-4 py-1.5 rounded-full text-sm font-medium glass-card text-gray-400 hover:text-white transition-all duration-200 flex-shrink-0 ml-3"
                >
                  Wpłata / Wypłata
                </button>
              </div>

              {/* Gotówka portfela */}
              {pfCash.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-3">
                  {pfCash.map(acc => {
                    const isUsd = acc.currency === 'USD'
                    const barColor = isUsd ? 'linear-gradient(90deg, #6366f1, #818cf8)' : 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                    const barShadow = isUsd ? '0 0 8px rgba(99,102,241,0.4)' : '0 0 8px rgba(245,158,11,0.4)'
                    const iconBg = isUsd ? 'rgba(99,102,241,0.12)' : 'rgba(245,158,11,0.12)'
                    const iconColor = isUsd ? '#818cf8' : '#f59e0b'
                    return (
                      <div key={acc.id} className="glass-card rounded-xl overflow-hidden">
                        <div style={{ height: 3, background: barColor, boxShadow: barShadow }} />
                        <div className="p-5">
                          <div className="flex gap-3 mb-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: iconColor }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <p className="text-xs uppercase tracking-widest text-gray-500 mt-1">Gotówka {acc.currency}</p>
                          </div>
                          <p className="text-2xl font-bold tabular-nums text-gray-200">{formatCurrency(acc.balance, acc.currency)}</p>
                          <p className="text-xs text-gray-500 mt-1">≈ {formatCurrency(acc.balance * toPlnRate(acc.currency), 'PLN')} PLN</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Tabela aktywów */}
              {pfAssets.length === 0 ? (
                <div className="text-center py-10 text-gray-500 glass-card rounded-xl">
                  Brak spółek w tym portfelu.
                </div>
              ) : (
                <div className="glass-card rounded-xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase tracking-widest border-b border-gray-700/70">
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
                      {pfAssets.map((asset) => (
                        <AssetRow
                          key={asset.id}
                          asset={asset}
                          quote={quotes.get(asset.ticker) ?? null}
                          sparkline={sparklines.get(asset.ticker)}
                          usdPln={usdPln}
                          eurPln={eurPln}
                          onDelete={() => handleDelete(asset.id)}
                          onEdit={() => setEditAsset(asset)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </div>{/* /p-4 */}
            </div>
          ))}

          {/* Aktywa bez portfela (stare dane) */}
          {orphaned.length > 0 && (
            <div className="mb-8">
              <h3 className="text-base font-semibold text-gray-400 mb-3">Nieprzypisane</h3>
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
                    {orphaned.map((asset) => (
                      <AssetRow
                        key={asset.id}
                        asset={asset}
                        quote={quotes.get(asset.ticker) ?? null}
                        sparkline={sparklines.get(asset.ticker)}
                        usdPln={usdPln}
                        eurPln={eurPln}
                        onDelete={() => handleDelete(asset.id)}
                        onEdit={() => setEditAsset(asset)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stan pusty — żadnych portfeli i żadnych aktywów */}
          {portfolios.length === 0 && assets.length === 0 && (
            <div className="text-center py-20 text-gray-500">
              Brak spółek w portfelu. Dodaj pierwszą!
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <AddAssetModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); loadData() }}
        />
      )}

      {editAsset !== null && (
        <AddAssetModal
          editAsset={editAsset}
          onClose={() => setEditAsset(null)}
          onSuccess={() => { setEditAsset(null); loadData() }}
        />
      )}

      {cashModalPortfolioId !== null && (
        <CashTransactionModal
          portfolioId={cashModalPortfolioId}
          onClose={() => setCashModalPortfolioId(null)}
          onSuccess={() => { setCashModalPortfolioId(null); loadData() }}
        />
      )}
    </div>
  )
}
