import { useState, useEffect, useCallback } from 'react'
import { getAssets, deleteAsset, getQuote, getHistory, getCashAccounts, getCashTransactions, getBondValues, getFxRates } from '../../lib/api'
import type { PortfolioAsset, StockQuote, CashAccount, CashTransaction, BondValueResult, SupportedCurrency } from '../../lib/types'
import type { BondValuesResult } from '../../lib/api'
import { usePortfolio } from '../../contexts/PortfolioContext'
import AssetRow from './AssetRow'
import AddAssetModal from './AddAssetModal'
import CashTransactionModal from './CashTransactionModal'
import PortfolioTagEditor from './PortfolioTagEditor'
import LoadingSpinner from '../ui/LoadingSpinner'
import ErrorMessage from '../ui/ErrorMessage'
import { formatCurrency } from '../../lib/utils'


export default function PortfolioView() {
  const { portfolios, refreshPortfolios, renamePortfolio, deletePortfolio } = usePortfolio()
  const [assets, setAssets] = useState<PortfolioAsset[]>([])
  const [quotes, setQuotes] = useState<Map<string, StockQuote>>(new Map())
  const [sparklines, setSparklines] = useState<Map<string, number[]>>(new Map())
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([])
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [cashModalPortfolioId, setCashModalPortfolioId] = useState<number | null>(null)
  const [fxRates, setFxRates] = useState<Map<SupportedCurrency, number>>(new Map([['PLN', 1]]))
  const [bondValuesMap, setBondValuesMap] = useState<Map<number, BondValueResult>>(new Map())
  const [bondPendingMap, setBondPendingMap] = useState<Map<number, string>>(new Map())
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, rates, cash, cashTxs] = await Promise.all([
        getAssets(),
        getFxRates(),
        getCashAccounts(),
        getCashTransactions(),
      ])
      setFxRates(rates)
      setAssets(list)
      setCashAccounts(cash)
      setCashTransactions(cashTxs)
      const stockAssets = list.filter(a => a.asset_type !== 'bond')
      const bondAssets = list.filter(a => a.asset_type === 'bond')

      const [quoteEntries, sparkEntries, bondValues] = await Promise.all([
        Promise.all(
          stockAssets.map(async (a) => {
            try {
              const q = await getQuote(a.ticker)
              return [a.ticker, q] as [string, StockQuote]
            } catch {
              return null
            }
          })
        ),
        Promise.all(
          stockAssets.map(async (a) => {
            try {
              const candles = await getHistory(a.ticker, '1mo')
              return [a.ticker, candles.map(c => c.close)] as [string, number[]]
            } catch {
              return null
            }
          })
        ),
        getBondValues(bondAssets),
      ])
      const qMap = new Map<string, StockQuote>()
      quoteEntries.forEach((e) => { if (e) qMap.set(e[0], e[1]) })
      setQuotes(qMap)
      const sMap = new Map<string, number[]>()
      sparkEntries.forEach((e) => { if (e) sMap.set(e[0], e[1]) })
      setSparklines(sMap)
      setBondValuesMap(bondValues.values)
      setBondPendingMap(bondValues.pending)
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

  const startRename = (id: number, currentName: string) => {
    setRenamingId(id)
    setRenameValue(currentName)
  }

  const commitRename = async (id: number) => {
    const name = renameValue.trim()
    if (name) await renamePortfolio(id, name)
    setRenamingId(null)
  }

  const handleDeletePortfolio = async (id: number) => {
    await deletePortfolio(id)
    setConfirmDeleteId(null)
    await loadData()
  }

  const toPlnRate = (cur: string) => fxRates.get(cur as SupportedCurrency) ?? 1

  // Dane do P&L: tylko wpłaty z podanym kursem
  const cashPnlData = (portfolioId: number, currency: string): { avgRate: number; trackedAmount: number } | null => {
    if (currency === 'PLN') return null
    const deposits = cashTransactions.filter(
      t => t.portfolio_id === portfolioId && t.currency === currency && t.type === 'deposit' && t.purchase_rate != null
    )
    if (deposits.length === 0) return null
    const trackedAmount = deposits.reduce((s, t) => s + t.amount, 0)
    const totalCost = deposits.reduce((s, t) => s + t.amount * (t.purchase_rate ?? 0), 0)
    return trackedAmount > 0 ? { avgRate: totalCost / trackedAmount, trackedAmount } : null
  }

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
                  {renamingId === portfolio.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(portfolio.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(portfolio.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      className="bg-gray-800 border border-indigo-500 text-white text-sm font-semibold uppercase tracking-wider px-2 py-0.5 rounded focus:outline-none w-40"
                    />
                  ) : (
                    <button
                      onClick={() => startRename(portfolio.id, portfolio.name)}
                      className="text-sm font-semibold text-gray-300 uppercase tracking-wider hover:text-white transition-colors"
                      title="Kliknij aby zmienić nazwę"
                    >
                      {portfolio.name}
                    </button>
                  )}
                  <div className="flex-1 h-px bg-gray-700/50" />
                  <PortfolioTagEditor
                    portfolioId={portfolio.id}
                    currentTags={portfolio.tags ?? []}
                    onUpdate={(tags) => handleTagsUpdate(portfolio.id, tags)}
                  />
                  {/* Usuń portfel */}
                  {confirmDeleteId === portfolio.id ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-gray-400">Usunąć?</span>
                      <button onClick={() => handleDeletePortfolio(portfolio.id)} className="text-finance-red hover:text-red-400 font-medium">Tak</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-gray-400 hover:text-white">Nie</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(portfolio.id)}
                      className="text-gray-600 hover:text-finance-red transition-colors p-1"
                      title="Usuń portfel"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
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

                    const pnlInfo = cashPnlData(portfolio.id, acc.currency)
                    const currentRate = toPlnRate(acc.currency)
                    const currentValuePLN = acc.balance * currentRate
                    const hasPnl = pnlInfo !== null
                    // P&L tylko na kwocie z podanym kursem (nie na całym saldzie)
                    const pnl = hasPnl ? pnlInfo!.trackedAmount * (currentRate - pnlInfo!.avgRate) : null
                    const pnlPct = hasPnl ? ((currentRate / pnlInfo!.avgRate) - 1) * 100 : null
                    const pnlPositive = pnl !== null && pnl >= 0

                    return (
                      <div key={acc.id} className="glass-card rounded-xl overflow-hidden">
                        <div style={{ height: 3, background: barColor, boxShadow: barShadow }} />
                        <div className="p-5 flex gap-5 items-start">
                          {/* Lewa strona */}
                          <div className="min-w-0">
                            <div className="flex gap-3 mb-3">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: iconColor }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <p className="text-xs uppercase tracking-widest text-gray-500 mt-1">Gotówka {acc.currency}</p>
                            </div>
                            <p className="text-2xl font-bold tabular-nums text-gray-200">{formatCurrency(acc.balance, acc.currency)}</p>
                            <p className="text-xs text-gray-500 mt-1">≈ {formatCurrency(currentValuePLN, 'PLN')} PLN</p>
                          </div>

                          {/* Prawa strona — P&L (tylko dla walut obcych z kursem zakupu) */}
                          {hasPnl && pnl !== null && pnlPct !== null && (
                            <div className="border-l border-gray-700 pl-5 min-w-[110px]">
                              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">P&L</p>
                              <p className={`text-lg font-bold tabular-nums ${pnlPositive ? 'text-finance-green' : 'text-finance-red'}`}>
                                {pnlPositive ? '+' : ''}{formatCurrency(pnl, 'PLN')}
                              </p>
                              <p className={`text-xs font-medium tabular-nums ${pnlPositive ? 'text-finance-green' : 'text-finance-red'}`}>
                                {pnlPositive ? '+' : ''}{pnlPct.toFixed(2)}%
                              </p>
                              <div className="mt-2 space-y-0.5">
                                <p className="text-xs text-gray-600">Zakup: {pnlInfo!.avgRate.toFixed(4)}</p>
                                <p className="text-xs text-gray-600">Obecny: {currentRate.toFixed(4)}</p>
                              </div>
                            </div>
                          )}
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
                          fxRates={fxRates}
                          onDelete={() => handleDelete(asset.id)}
                          bondValue={bondValuesMap.get(asset.id)}
                          bondPendingMonth={bondPendingMap.get(asset.id)}
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
                        fxRates={fxRates}
                        onDelete={() => handleDelete(asset.id)}
                        bondValue={bondValuesMap.get(asset.id)}
                        bondPendingMonth={bondPendingMap.get(asset.id)}
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
