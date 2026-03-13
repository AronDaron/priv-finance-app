import { useState } from 'react'
import { addCashTransaction } from '../../lib/api'
import type { NewCashTransaction } from '../../lib/types'

interface Props {
  portfolioId: number
  onClose: () => void
  onSuccess: () => void
}

export default function CashTransactionModal({ portfolioId, onClose, onSuccess }: Props) {
  const [type, setType] = useState<'deposit' | 'withdrawal'>('deposit')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<'PLN' | 'USD' | 'EUR'>('PLN')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Podaj prawidłową kwotę'); return }
    setLoading(true)
    setError(null)
    try {
      const data: NewCashTransaction = {
        portfolio_id: portfolioId,
        type,
        amount: amt,
        currency,
        date,
        notes: notes.trim() || undefined,
      }
      await addCashTransaction(data)
      onSuccess()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass-card rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-semibold text-lg">Operacja gotówkowa</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Typ */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setType('deposit')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                type === 'deposit' ? 'bg-finance-green text-white' : 'glass-card text-gray-300 hover:text-white'
              }`}
            >
              Wpłata
            </button>
            <button
              type="button"
              onClick={() => setType('withdrawal')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                type === 'withdrawal' ? 'bg-finance-red text-white' : 'glass-card text-gray-300 hover:text-white'
              }`}
            >
              Wypłata
            </button>
          </div>

          {/* Kwota + Waluta */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Kwota</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-finance-green"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Waluta</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value as 'PLN' | 'USD' | 'EUR')}
                className="bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-finance-green"
              >
                <option value="PLN">PLN</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          {/* Data */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Data</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-finance-green"
            />
          </div>

          {/* Notatki */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Notatki (opcjonalne)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-finance-green"
            />
          </div>

          {error && <p className="text-finance-red text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm text-gray-300 glass-card hover:text-white transition-colors"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-finance-green text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Zapisywanie...' : 'Zapisz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
