import { useState, useEffect, useRef } from 'react'
import { addAsset, updateAsset, addTransaction, fetchBondYear1Rate } from '../../lib/api'
import { StockSearch } from '../StockSearch'
import { usePortfolio } from '../../contexts/PortfolioContext'
import { PHYSICAL_METAL_COINS, gramsToTroyOz, BOND_TYPES, parseBondTickerClient, SUPPORTED_CURRENCIES } from '../../lib/types'
import type { PortfolioAsset, BondType } from '../../lib/types'

interface Props {
  onClose: () => void
  onSuccess: () => void
  editAsset?: PortfolioAsset
}

export default function AddAssetModal({ onClose, onSuccess, editAsset }: Props) {
  const isEditMode = !!editAsset
  const { activePortfolioId, portfolios } = usePortfolio()
  const defaultPortfolioId = editAsset?.portfolio_id ?? activePortfolioId ?? portfolios[0]?.id ?? 1

  // Inicjalizacja stanu formularza — w trybie edycji wypełniamy wartości z editAsset
  const initCoinId = (): string => {
    if (!editAsset?.gold_grams) return ''
    const coin = PHYSICAL_METAL_COINS.find(c => c.ticker === editAsset.ticker && c.pureGrams === editAsset.gold_grams)
    if (coin) return coin.id
    if (editAsset.gold_grams > 0) return '__custom__'
    return ''
  }

  const [form, setForm] = useState({
    ticker: editAsset?.ticker ?? '',
    name: editAsset?.name ?? '',
    quantity: editAsset?.quantity?.toString() ?? '',
    purchase_price: editAsset?.purchase_price?.toString() ?? '',
    currency: editAsset?.currency ?? 'USD',
    purchase_date: editAsset?.purchase_date ?? new Date().toISOString().split('T')[0],
    portfolio_id: defaultPortfolioId,
    time: '',
    fee: '',
    feeType: 'fixed' as 'fixed' | 'percent',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Złoto/srebro fizyczne
  const [selectedCoinId, setSelectedCoinId] = useState<string>(initCoinId())
  const [customGrams, setCustomGrams] = useState<string>(
    editAsset?.gold_grams && initCoinId() === '__custom__' ? editAsset.gold_grams.toString() : ''
  )
  // Obligacje skarbowe
  const [bondYear1Rate, setBondYear1Rate] = useState<string>(
    editAsset?.bond_year1_rate?.toString() ?? ''
  )
  const [rateFetching, setRateFetching] = useState(false)
  const fetchedForRef = useRef<string>('')

  const isPhysicalMetal = form.ticker === 'GC=F' || form.ticker === 'SI=F'

  // Wykrywanie obligacji z tickera
  const bondParsed = parseBondTickerClient(form.ticker)
  const isBond = !!bondParsed && !isPhysicalMetal

  // Auto-pobierz oprocentowanie roku 1 gdy ticker pasuje do obligacji
  useEffect(() => {
    if (!isBond || isEditMode) return
    if (fetchedForRef.current === form.ticker) return
    fetchedForRef.current = form.ticker
    setRateFetching(true)
    setBondYear1Rate('')
    fetchBondYear1Rate(form.ticker).then(rate => {
      if (rate !== null) setBondYear1Rate(String(rate))
      setRateFetching(false)
    }).catch(() => setRateFetching(false))
  }, [form.ticker, isBond, isEditMode])
  const metalCoins = PHYSICAL_METAL_COINS.filter(c => c.ticker === form.ticker)
  const selectedCoin = metalCoins.find(c => c.id === selectedCoinId) ?? null
  const isCustomCoin = selectedCoinId === '__custom__' || selectedCoin?.pureGrams === 0

  // Efektywne gramy na monetę (do wyświetlenia i zapisania)
  const effectiveGrams = isCustomCoin
    ? parseFloat(customGrams) || 0
    : (selectedCoin?.pureGrams ?? 0)

  // Przeliczone uncje troy na monetę (do informacji dla użytkownika)
  const ozPerCoin = effectiveGrams > 0 ? gramsToTroyOz(effectiveGrams) : 0

  // Data zapadalności z tickera obligacji — dzień = dzień zakupu (obligacje detaliczne zapadają tego samego dnia)
  const purchaseDay = form.purchase_date.split('-')[2]
  const bondMaturityDate = bondParsed
    ? `${bondParsed.maturityYear}-${String(bondParsed.maturityMonth).padStart(2, '0')}-${purchaseDay}`
    : null

  const handleSelect = (ticker: string, name: string) => {
    setForm((f) => {
      const parsed = parseBondTickerClient(ticker)
      // Dla obligacji: auto-ustaw walutę PLN i cenę 100
      if (parsed) {
        return { ...f, ticker, name: name || ticker, currency: 'PLN', purchase_price: '100' }
      }
      return { ...f, ticker, name }
    })
    setSelectedCoinId('')
    setCustomGrams('')
    setBondYear1Rate('')
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
    if (isBond && !bondYear1Rate) {
      setError('Podaj oprocentowanie roku 1 obligacji.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const goldGrams = (isPhysicalMetal && selectedCoinId !== '__exchange__' && effectiveGrams > 0) ? effectiveGrams : undefined
      const bondFields = isBond ? {
        asset_type: 'bond' as const,
        bond_type: bondParsed!.bondType,
        bond_year1_rate: parseFloat(bondYear1Rate),
        bond_maturity_date: bondMaturityDate ?? undefined,
      } : {}
      if (isEditMode) {
        await updateAsset(editAsset.id, {
          name: form.name.trim() || form.ticker.trim().toUpperCase(),
          quantity: qty,
          purchase_price: price,
          currency: form.currency,
          purchase_date: form.purchase_date,
          gold_grams: goldGrams,
        })
      } else {
        await addAsset({
          ticker: form.ticker.trim().toUpperCase(),
          name: form.name.trim() || form.ticker.trim().toUpperCase(),
          quantity: qty,
          purchase_price: price,
          currency: form.currency,
          purchase_date: form.purchase_date,
          portfolio_id: form.portfolio_id,
          gold_grams: goldGrams,
          ...bondFields,
        })
        // Auto-zapis do historii transakcji
        try {
          await addTransaction({
            ticker: form.ticker.trim().toUpperCase(),
            type: 'buy',
            quantity: qty,
            price: price,
            currency: form.currency,
            date: form.purchase_date,
            notes: null,
            fee: parseFloat(form.fee) || 0,
            fee_type: form.feeType,
            time: form.time || null,
          })
        } catch (txErr) {
          console.warn('Auto-save transakcji nie powiódł się:', txErr)
        }
      }
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
        <h2 className="text-lg font-semibold text-white mb-4">
          {isEditMode ? 'Edytuj aktywo' : 'Dodaj aktywo do portfela'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEditMode && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Wyszukaj spółkę</label>
              <StockSearch onSelect={handleSelect} />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Ticker *</label>
            <input
              type="text"
              value={form.ticker}
              onChange={(e) => {
                if (isEditMode) return
                const newTicker = e.target.value.toUpperCase()
                const parsed = parseBondTickerClient(newTicker)
                setForm((f) => ({
                  ...f,
                  ticker: newTicker,
                  ...(parsed ? { currency: 'PLN', purchase_price: '100' } : {}),
                }))
                setSelectedCoinId('')
                setCustomGrams('')
                if (!parsed) setBondYear1Rate('')
              }}
              disabled={isEditMode}
              placeholder="np. AAPL"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green disabled:opacity-50 disabled:cursor-not-allowed"
              required
            />
          </div>

          {/* Sekcja obligacji skarbowych — pojawia się gdy ticker pasuje do wzorca np. EDO0336 */}
          {isBond && bondParsed && (
            <div className="rounded-xl border border-blue-600/40 bg-blue-900/10 p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                Obligacja skarbowa
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Typ</label>
                  <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
                    {bondParsed.bondType} — {BOND_TYPES[bondParsed.bondType as BondType]?.name}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Zapadalność</label>
                  <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
                    {String(bondParsed.maturityMonth).padStart(2, '0')}/{bondParsed.maturityYear}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Oprocentowanie roku 1 (%) *
                  {BOND_TYPES[bondParsed.bondType as BondType]?.inflationLinked && (
                    <span className="ml-1 text-blue-400">(indeksowana inflacją od roku 2)</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={bondYear1Rate}
                    onChange={(e) => setBondYear1Rate(e.target.value)}
                    placeholder={rateFetching ? 'Pobieranie...' : 'np. 6.25'}
                    disabled={rateFetching}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green disabled:opacity-60"
                  />
                  {rateFetching && (
                    <span className="absolute right-3 top-2.5 text-blue-400 text-xs">Pobieranie...</span>
                  )}
                </div>
                {!rateFetching && !bondYear1Rate && (
                  <p className="text-xs text-gray-500 mt-1">
                    Nie udało się pobrać — wpisz ręcznie (znajdziesz na obligacjeskarbowe.pl)
                  </p>
                )}
              </div>
            </div>
          )}

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
          <div className={`grid gap-3 ${isBond ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                {isBond ? 'Liczba sztuk *' : 'Ilość *'}
              </label>
              <input
                type="number"
                min={isBond ? '1' : '0.001'}
                step={isBond ? '1' : '0.001'}
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                placeholder="0"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
                required
              />
            </div>
            {!isBond && (
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
            )}
          </div>
          {!isBond && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Waluta</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
              >
                {SUPPORTED_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
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
            {!isEditMode && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Godzina (opcjonalnie)</label>
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
                />
              </div>
            )}
          </div>
          {!isEditMode && (
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
          )}
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
              {saving ? (isEditMode ? 'Zapisywanie...' : 'Dodawanie...') : (isEditMode ? 'Zapisz zmiany' : 'Dodaj')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
