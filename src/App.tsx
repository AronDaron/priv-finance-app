// src/App.tsx
// Tymczasowy komponent demonstracyjny dla Milestone 2.
// Milestone 3+ zastąpi to właściwym UI dashboardu.

import { useState, useEffect, type JSX } from 'react'
import {
  getAssets,
  addAsset,
  deleteAsset,
  getEnvironmentInfo
} from './lib/api'
import type { PortfolioAsset, NewPortfolioAsset } from './lib/types'

function App(): JSX.Element {
  const [assets, setAssets] = useState<PortfolioAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const env = getEnvironmentInfo()

  // Formularz nowego aktywa
  const [form, setForm] = useState<NewPortfolioAsset>({
    ticker: '',
    name: '',
    quantity: 1,
    purchase_price: 0,
    currency: 'USD'
  })

  useEffect(() => {
    loadAssets()
  }, [])

  async function loadAssets() {
    try {
      setLoading(true)
      setError(null)
      const data = await getAssets()
      setAssets(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd ładowania danych')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ticker.trim() || !form.name.trim()) return
    try {
      setError(null)
      await addAsset(form)
      setForm({ ticker: '', name: '', quantity: 1, purchase_price: 0, currency: 'USD' })
      await loadAssets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd dodawania aktywa')
    }
  }

  async function handleDelete(id: number) {
    try {
      setError(null)
      await deleteAsset(id)
      await loadAssets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd usuwania aktywa')
    }
  }

  return (
    <div className="min-h-screen bg-finance-dark text-white p-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Nagłówek */}
        <div>
          <h1 className="text-3xl font-bold text-finance-green">
            Finance Portfolio Tracker
          </h1>
          <p className="text-gray-400 mt-1">Milestone 2 — Baza danych</p>
        </div>

        {/* Status środowiska */}
        <div className="bg-finance-card rounded-xl p-4 flex items-center justify-between">
          <span className="text-gray-400 text-sm">Backend:</span>
          <span className={`text-sm font-semibold ${
            env.backend === 'electron' ? 'text-finance-green' : 'text-yellow-400'
          }`}>
            {env.backend === 'electron'
              ? `Electron SQLite (v${env.version})`
              : 'localStorage (przeglądarka / dev)'}
          </span>
        </div>

        {/* Błąd */}
        {error && (
          <div className="bg-red-900/30 border border-finance-red rounded-xl p-4 text-finance-red text-sm">
            {error}
          </div>
        )}

        {/* Formularz dodawania */}
        <form onSubmit={handleAdd} className="bg-finance-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Dodaj aktywo</h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Ticker (np. AAPL)"
              value={form.ticker}
              onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
              className="bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-finance-green"
            />
            <input
              type="text"
              placeholder="Nazwa spółki"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-finance-green"
            />
            <input
              type="number"
              placeholder="Ilość"
              value={form.quantity}
              min={0}
              step="any"
              onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })}
              className="bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-finance-green"
            />
            <input
              type="number"
              placeholder="Cena zakupu"
              value={form.purchase_price}
              min={0}
              step="any"
              onChange={(e) => setForm({ ...form, purchase_price: parseFloat(e.target.value) || 0 })}
              className="bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-finance-green"
            />
          </div>
          <div className="flex gap-3">
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="bg-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-finance-green"
            >
              <option value="USD">USD</option>
              <option value="PLN">PLN</option>
              <option value="EUR">EUR</option>
            </select>
            <button
              type="submit"
              className="flex-1 bg-finance-green text-white font-semibold py-2 px-4 rounded-lg hover:bg-emerald-600 transition-colors text-sm"
            >
              Dodaj do portfela
            </button>
          </div>
        </form>

        {/* Lista aktywów */}
        <div className="bg-finance-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Portfel ({assets.length} aktywów)
          </h2>

          {loading ? (
            <p className="text-gray-500 text-sm">Ładowanie...</p>
          ) : assets.length === 0 ? (
            <p className="text-gray-500 text-sm">Brak aktywów. Dodaj pierwsze aktywo powyżej.</p>
          ) : (
            <div className="space-y-2">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3"
                >
                  <div>
                    <span className="font-semibold text-finance-green mr-2">{asset.ticker}</span>
                    <span className="text-white text-sm">{asset.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-400 text-sm">
                      {asset.quantity} szt. @ {asset.purchase_price} {asset.currency}
                    </span>
                    <button
                      onClick={() => handleDelete(asset.id)}
                      className="text-finance-red hover:text-red-400 transition-colors text-xs px-2 py-1 rounded border border-finance-red hover:border-red-400"
                    >
                      Usuń
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-gray-600 text-xs text-center">
          Milestone 2 / 6 — Gotowe do Milestone 3: Integracja danych (yahoo-finance2)
        </p>
      </div>
    </div>
  )
}

export default App
