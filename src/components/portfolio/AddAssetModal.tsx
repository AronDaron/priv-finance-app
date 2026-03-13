import { useState } from 'react'
import { addAsset } from '../../lib/api'
import { StockSearch } from '../StockSearch'
import { usePortfolio } from '../../contexts/PortfolioContext'
import { PHYSICAL_METAL_COINS, gramsToTroyOz } from '../../lib/types'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function AddAssetModal({ onClose, onSuccess }: Props) {
  const { activePortfolioId, portfolios } = usePortfolio()
  const defaultPortfolioId = activePortfolioId ?? portfolios[0]?.id ?? 1
  const [form, setForm] = useState({
    ticker: '',
    name: '',
    quantity: '',
    purchase_price: '',
    currency: 'USD',
    purchase_date: new Date().toISOString().split('T')[0],
    portfolio_id: defaultPortfolioId,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Złoto/srebro fizyczne
  const [selectedCoinId, setSelectedCoinId] = useState<string>('')
  const [customGrams, setCustomGrams] = useState<string>('')

  const isPhysicalMetal = form.ticker === 'GC=F' || form.ticker === 'SI=F'
  const metalCoins = PHYSICAL_METAL_COINS.filter(c => c.ticker === form.ticker)
  const selectedCoin = metalCoins.find(c => c.id === selectedCoinId) ?? null
  const isCustomCoin = selectedCoin?.pureGrams === 0

  // Efektywne gramy na monetę (do wyświetlenia i zapisania)
  const effectiveGrams = isCustomCoin
    ? parseFloat(customGrams) || 0
    : (selectedCoin?.pureGrams ?? 0)

  // Przeliczone uncje troy na monetę (do informacji dla użytkownika)
  const ozPerCoin = effectiveGrams > 0 ? gramsToTroyOz(effectiveGrams) : 0

  const handleSelect = (ticker: string, name: string) => {
    setForm((f) => ({ ...f, ticker, name }))
    setSelectedCoinId('')
    setCustomGrams('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const qty = parseFloat(form.quantity)
    const price = parseFloat(form.purchase_price)
    if (!form.ticker.trim() || qty <= 0 || price < 0) {
      setError('Wypełnij wszystkie wymagane pola poprawnie.')
      return
    }
    if (isPhysicalMetal && !selectedCoinId) {
      setError('Wybierz rodzaj monety lub giełdowy kontrakt.')
      return
    }
    if (isPhysicalMetal && isCustomCoin && effectiveGrams <= 0) {
      setError('Podaj wagę czystego metalu w gramach.')
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
        portfolio_id: form.portfolio_id,
        gold_grams: (isPhysicalMetal && selectedCoinId !== '__exchange__' && effectiveGrams > 0) ? effectiveGrams : null,
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
        <h2 className="text-lg font-semibold text-white mb-4">Dodaj aktywo do portfela</h2>
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
              onChange={(e) => {
                setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))
                setSelectedCoinId('')
                setCustomGrams('')
              }}
              placeholder="np. AAPL"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
              required
            />
          </div>

          {/* Sekcja metali fizycznych — pojawia się tylko dla GC=F i SI=F */}
          {isPhysicalMetal && (
            <div className="rounded-xl border border-yellow-600/40 bg-yellow-900/10 p-4 space-y-3">
              <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">
                {form.ticker === 'GC=F' ? 'Złoto fizyczne' : 'Srebro fizyczne'}
              </p>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Rodzaj monety / produktu *</label>
                <select
                  value={selectedCoinId}
                  onChange={(e) => {
                    const coinId = e.target.value
                    setSelectedCoinId(coinId)
                    setCustomGrams('')
                    // Automatycznie ustaw nazwę aktywa na nazwę monety
                    const coin = metalCoins.find(c => c.id === coinId)
                    if (coin) setForm(f => ({ ...f, name: coin.name }))
                    else if (coinId === '__exchange__') setForm(f => ({ ...f, name: form.ticker === 'GC=F' ? 'Gold Futures (GC=F)' : 'Silver Futures (SI=F)' }))
                  }}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
                >
                  <option value="">— wybierz —</option>
                  <option value="__exchange__">Kontrakt giełdowy (bez przeliczenia)</option>
                  {metalCoins.map(coin => (
                    <option key={coin.id} value={coin.id}>{coin.name}</option>
                  ))}
                </select>
              </div>

              {/* Pole wagi dla niestandardowej monety */}
              {isCustomCoin && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Czyste gramy metalu na monetę *</label>
                  <input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={customGrams}
                    onChange={(e) => setCustomGrams(e.target.value)}
                    placeholder="np. 31.1035"
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
                  />
                </div>
              )}

              {/* Info — przeliczenie uncji */}
              {selectedCoinId && selectedCoinId !== '__exchange__' && ozPerCoin > 0 && (
                <p className="text-xs text-gray-400">
                  {effectiveGrams.toFixed(4)} g czystego metalu = <span className="text-yellow-400 font-medium">{ozPerCoin.toFixed(4)} oz troy</span> na monetę
                </p>
              )}
            </div>
          )}
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
          {portfolios.length > 1 && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Portfel</label>
              <select
                value={form.portfolio_id}
                onChange={(e) => setForm((f) => ({ ...f, portfolio_id: Number(e.target.value) }))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
              >
                {portfolios.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
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
