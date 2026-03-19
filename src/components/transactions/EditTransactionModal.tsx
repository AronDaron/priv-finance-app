import { useState } from 'react'
import { updateTransaction } from '../../lib/api'
import type { Transaction } from '../../lib/types'

interface Props {
  transaction: Transaction
  onClose: () => void
  onSuccess: () => void
}

export default function EditTransactionModal({ transaction, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    type: transaction.type,
    quantity: transaction.quantity.toString(),
    price: transaction.price.toString(),
    currency: transaction.currency,
    date: transaction.date,
    time: transaction.time ?? '',
    fee: (transaction.fee ?? 0).toString(),
    feeType: (transaction.fee_type ?? 'fixed') as 'fixed' | 'percent',
    notes: transaction.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const qty = parseFloat(form.quantity)
    const price = parseFloat(form.price)
    if (qty <= 0 || price < 0 || !form.date) {
      setError('Wypełnij wszystkie wymagane pola poprawnie.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateTransaction(transaction.id, {
        type: form.type,
        quantity: qty,
        price: price,
        currency: form.currency,
        date: form.date,
        notes: form.notes.trim() || null,
        fee: parseFloat(form.fee) || 0,
        fee_type: form.feeType,
        time: form.time || null,
      })
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd podczas zapisywania')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-finance-card rounded-2xl p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-white mb-1">Edytuj transakcję</h2>
        <p className="text-sm text-gray-400 mb-4">
          Ticker: <span className="text-white font-medium">{transaction.ticker}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Typ transakcji */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Typ</label>
            <div className="flex gap-2">
              {(['buy', 'sell'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.type === t
                      ? t === 'buy'
                        ? 'bg-finance-green text-white'
                        : 'bg-finance-red text-white'
                      : 'bg-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {t === 'buy' ? 'Kupno' : 'Sprzedaż'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ilość *</label>
              <input
                type="number"
                min="0.000001"
                step="0.000001"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Cena *</label>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Waluta</label>
            <select
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
            >
              <option value="USD">USD</option>
              <option value="PLN">PLN</option>
              <option value="EUR">EUR</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Data *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Godzina (opcjonalnie)</label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Prowizja (opcjonalnie)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.fee}
                onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))}
                placeholder="0.00"
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, feeType: f.feeType === 'fixed' ? 'percent' : 'fixed' }))}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors min-w-[48px]"
              >
                {form.feeType === 'fixed' ? 'PLN' : '%'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Notatki</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Opcjonalne"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
            />
          </div>

          {error && <p className="text-finance-red text-sm">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-finance-green hover:bg-emerald-600 text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Zapisywanie...' : 'Zapisz zmiany'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
