import { useState } from 'react'
import { addCashTransaction, getQuote } from '../../lib/api'
import type { NewCashTransaction } from '../../lib/types'
import { SUPPORTED_CURRENCIES } from '../../lib/types'

interface Props {
  portfolioId: number
  onClose: () => void
  onSuccess: () => void
}

const nowTime = () => new Date().toTimeString().slice(0, 5)
const todayStr = () => new Date().toISOString().split('T')[0]

export default function CashTransactionModal({ portfolioId, onClose, onSuccess }: Props) {
  const [type, setType] = useState<'deposit' | 'withdrawal'>('deposit')
  const [currency, setCurrency] = useState<typeof SUPPORTED_CURRENCIES[number]>('USD')
  const [purchaseCurrency, setPurchaseCurrency] = useState<typeof SUPPORTED_CURRENCIES[number]>('PLN')
  const [amount, setAmount] = useState('')
  // purchase_rate zawsze w PLN (ile PLN = 1 unit waluty docelowej)
  const [purchaseRatePln, setPurchaseRatePln] = useState('')
  const [date, setDate] = useState(todayStr())
  const [time, setTime] = useState(nowTime())
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetchingRate, setFetchingRate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isNonPln = currency !== 'PLN'

  const fetchCurrentRate = async () => {
    if (!isNonPln) return
    setFetchingRate(true)
    setError(null)
    try {
      // Zawsze pobieramy [currency]/PLN — bo P&L liczymy w PLN
      const result = await getQuote(`${currency}PLN=X`)
      if (result?.price) {
        setPurchaseRatePln(result.price.toFixed(4))
      } else {
        setError('Nie udało się pobrać kursu')
      }
    } catch {
      setError('Błąd pobierania kursu')
    } finally {
      setFetchingRate(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Podaj prawidłową kwotę'); return }

    let ratePln: number | null = null
    if (type === 'deposit' && isNonPln && purchaseRatePln) {
      const r = parseFloat(purchaseRatePln)
      if (r > 0) ratePln = r
    }

    setLoading(true)
    setError(null)
    try {
      const data: NewCashTransaction = {
        portfolio_id: portfolioId,
        type,
        amount: amt,
        currency,
        date,
        time,
        purchase_rate: ratePln,
        purchase_currency: type === 'deposit' && isNonPln ? purchaseCurrency : null,
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

          {/* Waluta kupowana + Kwota */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              {type === 'deposit' ? 'Waluta którą kupujesz' : 'Waluta którą wypłacasz'}
            </label>
            <div className="flex gap-3">
              <select
                value={currency}
                onChange={e => {
                  setCurrency(e.target.value as typeof SUPPORTED_CURRENCIES[number])
                  setPurchaseRatePln('')
                }}
                className="bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-finance-green"
              >
                {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Kwota"
                required
                className="flex-1 bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-finance-green"
              />
            </div>
          </div>

          {/* Waluta zakupu — tylko przy wpłacie w walucie obcej */}
          {type === 'deposit' && isNonPln && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Za walutę (czym płacisz)</label>
              <select
                value={purchaseCurrency}
                onChange={e => setPurchaseCurrency(e.target.value as typeof SUPPORTED_CURRENCIES[number])}
                className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-finance-green"
              >
                {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Kurs zakupu w PLN — tylko przy wpłacie w walucie obcej */}
          {type === 'deposit' && isNonPln && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                Kurs zakupu <span className="text-gray-500">(ile PLN = 1 {currency}) — opcjonalne, potrzebne do P&L</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={purchaseRatePln}
                  onChange={e => setPurchaseRatePln(e.target.value)}
                  placeholder="np. 4.9400"
                  className="flex-1 bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-finance-green"
                />
                <button
                  type="button"
                  onClick={fetchCurrentRate}
                  disabled={fetchingRate}
                  className="px-3 py-2 rounded-lg text-xs font-medium glass-card text-gray-300 hover:text-white transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {fetchingRate ? '...' : 'Bieżący kurs'}
                </button>
              </div>
            </div>
          )}

          {/* Data + Godzina */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Data</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-finance-green"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Godzina</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="bg-gray-800 border border-gray-600 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-finance-green"
              />
            </div>
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
