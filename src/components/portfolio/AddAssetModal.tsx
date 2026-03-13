import { useState } from 'react'
import { addAsset } from '../../lib/api'
import { StockSearch } from '../StockSearch'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function AddAssetModal({ onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    ticker: '',
    name: '',
    quantity: '',
    purchase_price: '',
    currency: 'USD',
    purchase_date: new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelect = (ticker: string, name: string) => {
    setForm((f) => ({ ...f, ticker, name }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const qty = parseFloat(form.quantity)
    const price = parseFloat(form.purchase_price)
    if (!form.ticker.trim() || qty <= 0 || price < 0) {
      setError('Wypełnij wszystkie wymagane pola poprawnie.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await addAsset({
        ticker: form.ticker.trim().toUpperCase(),
        name: form.name.trim() || form.ticker.trim().toUpperCase(),
        quantity: qty,
        purchase_price: price,
        currency: form.currency,
        purchase_date: form.purchase_date,
      })
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Błąd podczas dodawania')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-finance-card rounded-2xl p-6 w-full max-w-md mx-4">
        <h2 className="text-lg font-semibold text-white mb-4">Dodaj spółkę do portfela</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Wyszukaj spółkę</label>
            <StockSearch onSelect={handleSelect} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Ticker *</label>
            <input
              type="text"
              value={form.ticker}
              onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value }))}
              placeholder="np. AAPL"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nazwa</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="np. Apple Inc."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Ilość *</label>
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                placeholder="0"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Śr. cena zakupu *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.purchase_price}
                onChange={(e) => setForm((f) => ({ ...f, purchase_price: e.target.value }))}
                placeholder="0.00"
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
          <div>
            <label className="block text-xs text-gray-400 mb-1">Data zakupu</label>
            <input
              type="date"
              value={form.purchase_date}
              onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))}
              max={new Date().toISOString().split('T')[0]}
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
              {saving ? 'Dodawanie...' : 'Dodaj'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
