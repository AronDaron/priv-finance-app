import { useState, useEffect } from 'react'
import { getSetting, setSetting, getEnvironmentInfo } from '../../lib/api'

export default function SettingsView() {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const env = getEnvironmentInfo()

  useEffect(() => {
    getSetting('openrouter_api_key')
      .then((val) => setApiKey(val ?? ''))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = () => {
    setSetting('openrouter_api_key', apiKey)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-white mb-6">Ustawienia</h2>

      {/* OpenRouter API Key */}
      <div className="bg-finance-card rounded-xl border border-gray-700 p-5 mb-4">
        <h3 className="text-base font-semibold text-white mb-1">OpenRouter API Key</h3>
        <p className="text-xs text-gray-400 mb-4">
          Klucz wymagany do funkcji AI (Milestone 5). Przechowywany lokalnie w SQLite.
        </p>
        {!loading && (
          <>
            <div className="flex gap-2 mb-3">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-..."
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-2 rounded-lg transition-colors text-sm"
              >
                {showKey ? 'Ukryj' : 'Pokaż'}
              </button>
            </div>
            <button
              onClick={handleSave}
              className="bg-finance-green hover:bg-emerald-600 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Zapisz
            </button>
            {saved && (
              <p className="text-finance-green text-sm mt-2">Zapisano pomyślnie</p>
            )}
          </>
        )}
      </div>

      {/* Informacje o aplikacji */}
      <div className="bg-finance-card rounded-xl border border-gray-700 p-5">
        <h3 className="text-base font-semibold text-white mb-3">Informacje o aplikacji</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Wersja</span>
            <span className="text-white">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Środowisko</span>
            <span className={env.backend === 'electron' ? 'text-finance-green' : 'text-yellow-400'}>
              {env.backend === 'electron' ? 'Electron (SQLite)' : 'Przeglądarka (localStorage)'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
