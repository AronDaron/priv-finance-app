import { useState, useEffect } from 'react'
import { getTransactions, deleteTransaction } from '../../lib/api'
import type { Transaction } from '../../lib/types'
import { formatCurrency } from '../../lib/utils'
import AddTransactionModal from './AddTransactionModal'
import LoadingSpinner from '../ui/LoadingSpinner'
import ErrorMessage from '../ui/ErrorMessage'

export default function TransactionsView() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [filterTicker, setFilterTicker] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await getTransactions()
      const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date))
      setTransactions(sorted)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania transakcji')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleDelete = async (id: number) => {
    if (!window.confirm('Usunąć tę transakcję?')) return
    try {
      await deleteTransaction(id)
      await loadData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd usuwania')
    }
  }

  const filtered = transactions.filter(
    (tx) => filterTicker === '' || tx.ticker.toLowerCase().includes(filterTicker.toLowerCase())
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Transakcje</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-finance-green hover:bg-emerald-600 text-white font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Dodaj transakcję
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Filtruj po tickerze..."
          value={filterTicker}
          onChange={(e) => setFilterTicker(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green w-64"
        />
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-20 text-gray-500">Brak transakcji</div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-finance-card rounded-xl border border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700">
                <th className="px-4 py-3 text-left">Data</th>
                <th className="px-4 py-3 text-left">Ticker</th>
                <th className="px-4 py-3 text-center">Typ</th>
                <th className="px-4 py-3 text-right">Ilość</th>
                <th className="px-4 py-3 text-right">Cena</th>
                <th className="px-4 py-3 text-right">Wartość</th>
                <th className="px-4 py-3 text-left">Notatki</th>
                <th className="px-4 py-3 text-center">Akcja</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => (
                <tr key={tx.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-300">
                    {new Date(tx.date).toLocaleDateString('pl-PL')}
                  </td>
                  <td className="px-4 py-3 font-bold text-finance-green">{tx.ticker}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      tx.type === 'buy'
                        ? 'bg-green-900/50 text-finance-green'
                        : 'bg-red-900/50 text-finance-red'
                    }`}>
                      {tx.type === 'buy' ? 'KUP' : 'SPRZEDAJ'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">{tx.quantity}</td>
                  <td className="px-4 py-3 text-right text-gray-300">
                    {formatCurrency(tx.price, tx.currency)}
                  </td>
                  <td className="px-4 py-3 text-right text-white">
                    {formatCurrency(tx.quantity * tx.price, tx.currency)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 max-w-[140px] truncate">
                    {tx.notes ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDelete(tx.id)}
                      className="bg-red-900/50 hover:bg-red-800/50 text-finance-red px-3 py-1.5 rounded transition-colors"
                      title="Usuń"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddTransactionModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); loadData() }}
        />
      )}
    </div>
  )
}
