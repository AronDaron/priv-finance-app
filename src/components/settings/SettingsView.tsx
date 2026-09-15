import { useState, useEffect, useMemo } from 'react'
import { getAllSettings, setSetting, getEnvironmentInfo, listAIModels } from '../../lib/api'
import { DEFAULT_LOCAL_IDLE_TIMEOUT_S, DEFAULT_OPENROUTER_MODELS, OPENROUTER_BASE_URL, type AIProvider, type RemoteModel } from '../../lib/types'

/** Cena OpenRoutera: USD za 1 mln tokenów; null = brak danych (serwer lokalny) */
function priceLabel(m: RemoteModel): string {
  if (m.free) return 'darmowy'
  if (m.promptPricePerM == null || m.completionPricePerM == null) return ''
  const f = (v: number) => (v < 1 ? v.toFixed(2) : v.toFixed(v < 10 ? 1 : 0))
  return `$${f(m.promptPricePerM)} / $${f(m.completionPricePerM)} za 1M`
}

function ctxLabel(n: number | null): string {
  if (!n) return ''
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M ctx` : `${Math.round(n / 1000)}k ctx`
}

function openRouterOptionLabel(m: RemoteModel): string {
  return [m.displayName, ctxLabel(m.contextLength), priceLabel(m)].filter(Boolean).join(' · ')
}

const REFRESH_ICON = (spinning: boolean) => (
  <svg className={`w-3 h-3 ${spinning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)

export default function SettingsView() {
  const env = getEnvironmentInfo()
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  // Provider
  const [provider, setProvider] = useState<AIProvider>('openrouter')

  // OpenRouter
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [orModel, setOrModel] = useState('')
  const [orManagerModel, setOrManagerModel] = useState('')
  const [orModels, setOrModels] = useState<RemoteModel[]>([])
  const [loadingOrModels, setLoadingOrModels] = useState(false)
  const [orModelsError, setOrModelsError] = useState<string | null>(null)
  const [orFilter, setOrFilter] = useState('')
  const [orFreeOnly, setOrFreeOnly] = useState(false)

  // Serwer lokalny
  const [localUrl, setLocalUrl] = useState('')
  const [localKey, setLocalKey] = useState('')
  const [showLocalKey, setShowLocalKey] = useState(false)
  const [localModel, setLocalModel] = useState('')
  const [managerModel, setManagerModel] = useState('')
  const [idleTimeout, setIdleTimeout] = useState(String(DEFAULT_LOCAL_IDLE_TIMEOUT_S))
  const [maxTokensWorker, setMaxTokensWorker] = useState('20000')
  const [maxTokensChat, setMaxTokensChat] = useState('12000')

  // Lista modeli
  const [models, setModels] = useState<RemoteModel[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  useEffect(() => {
    getAllSettings()
      .then(s => {
        setProvider(s.ai_provider === 'local' ? 'local' : 'openrouter')
        setApiKey(s.openrouter_api_key ?? '')
        setOrModel(s.openrouter_model ?? '')
        setOrManagerModel(s.openrouter_model_manager ?? '')
        setLocalUrl(s.local_ai_url ?? '')
        setLocalKey(s.local_ai_key ?? '')
        setLocalModel(s.local_ai_model ?? '')
        setManagerModel(s.local_ai_model_manager ?? '')
        setIdleTimeout(s.local_ai_idle_timeout_s ?? String(DEFAULT_LOCAL_IDLE_TIMEOUT_S))
        setMaxTokensWorker(s.local_ai_max_tokens_worker ?? '20000')
        setMaxTokensChat(s.local_ai_max_tokens_chat ?? '12000')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleRefreshOrModels = async () => {
    setLoadingOrModels(true)
    setOrModelsError(null)
    try {
      // Lista modeli OpenRoutera jest publiczna — klucz nie jest wymagany, ale przekazujemy go, jeśli jest
      const result = await listAIModels(OPENROUTER_BASE_URL, apiKey.trim())
      if (result.ok) setOrModels(result.models)
      else { setOrModels([]); setOrModelsError(result.error ?? 'Nie udało się pobrać listy modeli.') }
    } catch (e) {
      setOrModels([])
      setOrModelsError(e instanceof Error ? e.message : 'Błąd połączenia.')
    } finally {
      setLoadingOrModels(false)
    }
  }

  // Filtr listy OpenRoutera (445+ modeli). Aktualnie wybrany model zawsze zostaje na liście,
  // żeby <select> nie pokazywał pustej wartości po zawężeniu filtra.
  const orVisible = useMemo(() => {
    const q = orFilter.trim().toLowerCase()
    const base = orModels.filter(m =>
      (!orFreeOnly || m.free) &&
      (!q || m.id.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q))
    )
    const keep = (id: string) => {
      if (!id || base.some(m => m.id === id)) return
      const full = orModels.find(m => m.id === id)
      if (full) base.unshift(full)
    }
    keep(orManagerModel)
    keep(orModel)
    return base
  }, [orModels, orFilter, orFreeOnly, orModel, orManagerModel])

  const handleRefreshModels = async () => {
    if (!localUrl.trim()) {
      setModelsError('Najpierw podaj adres serwera.')
      return
    }
    setLoadingModels(true)
    setModelsError(null)
    try {
      const result = await listAIModels(localUrl.trim(), localKey.trim())
      if (result.ok) {
        setModels(result.models)
        // Auto-wybór pierwszego załadowanego modelu, gdy nic jeszcze nie wybrano
        if (!localModel && result.models.length > 0) setLocalModel(result.models[0].id)
      } else {
        setModels([])
        setModelsError(result.error ?? 'Nie udało się pobrać listy modeli.')
      }
    } catch (e) {
      setModels([])
      setModelsError(e instanceof Error ? e.message : 'Błąd połączenia.')
    } finally {
      setLoadingModels(false)
    }
  }

  const handleSave = async () => {
    await Promise.all([
      setSetting('ai_provider', provider),
      setSetting('openrouter_api_key', apiKey),
      setSetting('openrouter_model', orModel.trim()),
      setSetting('openrouter_model_manager', orManagerModel.trim()),
      setSetting('local_ai_url', localUrl.trim()),
      setSetting('local_ai_key', localKey.trim()),
      setSetting('local_ai_model', localModel.trim()),
      setSetting('local_ai_model_manager', managerModel.trim()),
      setSetting('local_ai_idle_timeout_s', idleTimeout),
      setSetting('local_ai_max_tokens_worker', maxTokensWorker),
      setSetting('local_ai_max_tokens_chat', maxTokensChat),
    ])
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputClass =
    'w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm ' +
    'placeholder-gray-500 focus:outline-none focus:border-finance-green'

  if (loading) {
    return <div className="p-6 max-w-2xl text-gray-400 text-sm">Wczytywanie ustawień…</div>
  }

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-white mb-6">Ustawienia</h2>

      {/* ── Silnik AI ── */}
      <div className="glass-card rounded-xl p-5 mb-4">
        <h3 className="text-base font-semibold text-white mb-1">Silnik AI</h3>
        <p className="text-xs text-gray-400 mb-4">
          Wybierz, skąd aplikacja bierze model do analiz. Serwer lokalny działa bez opłat i bez
          wysyłania danych portfela na zewnątrz.
        </p>

        {/* Przełącznik providera */}
        <div className="flex gap-1 p-1 bg-gray-800/60 rounded-lg w-fit mb-5">
          <button
            onClick={() => setProvider('openrouter')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              provider === 'openrouter' ? 'bg-finance-green text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            OpenRouter
          </button>
          <button
            onClick={() => setProvider('local')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              provider === 'local' ? 'bg-finance-green text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Serwer lokalny
          </button>
        </div>

        {provider === 'openrouter' ? (
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Klucz API OpenRouter</label>
            <div className="flex gap-2 mb-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-or-..."
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-2 rounded-lg transition-colors text-sm flex-shrink-0"
              >
                {showKey ? 'Ukryj' : 'Pokaż'}
              </button>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs text-gray-400">Model</label>
                <button
                  type="button"
                  onClick={handleRefreshOrModels}
                  disabled={loadingOrModels}
                  className="flex items-center gap-1.5 text-xs text-gray-300 bg-gray-700 hover:bg-gray-600 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                >
                  {REFRESH_ICON(loadingOrModels)}
                  Pobierz listę modeli
                </button>
              </div>

              {orModels.length > 0 && (
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={orFilter}
                    onChange={e => setOrFilter(e.target.value)}
                    placeholder="Szukaj: gemini, claude, gpt, deepseek…"
                    className={inputClass}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-gray-400 whitespace-nowrap cursor-pointer">
                    <input type="checkbox" checked={orFreeOnly} onChange={e => setOrFreeOnly(e.target.checked)} className="accent-finance-green" />
                    tylko darmowe
                  </label>
                </div>
              )}

              {orModels.length > 0 ? (
                <select value={orModel} onChange={e => setOrModel(e.target.value)} className={inputClass}>
                  <option value="">— domyślny ({DEFAULT_OPENROUTER_MODELS.worker}) —</option>
                  {orVisible.map(m => (
                    <option key={m.id} value={m.id}>{openRouterOptionLabel(m)}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={orModel}
                  onChange={e => setOrModel(e.target.value)}
                  placeholder={`domyślny: ${DEFAULT_OPENROUTER_MODELS.worker}`}
                  className={inputClass}
                />
              )}

              {orModelsError && <p className="text-xs text-red-400 mt-1.5">{orModelsError}</p>}
              <p className="text-xs text-gray-600 mt-1">
                {orModels.length > 0
                  ? `${orVisible.length} z ${orModels.length} modeli · ceny w USD za 1 mln tokenów wejścia / wyjścia`
                  : 'Raporty spółek, regiony i czat. Pobierz listę albo wpisz identyfikator ręcznie (np. anthropic/claude-sonnet-5).'}
              </p>
            </div>

            <div className="mt-4">
              <label className="block text-xs text-gray-400 mb-1.5">
                Model do analizy portfela i Doradcy <span className="text-gray-600">(opcjonalnie)</span>
              </label>
              {orModels.length > 0 ? (
                <select value={orManagerModel} onChange={e => setOrManagerModel(e.target.value)} className={inputClass}>
                  <option value="">
                    {orModel ? '— ten sam co wyżej —' : `— domyślny (${DEFAULT_OPENROUTER_MODELS.manager}) —`}
                  </option>
                  {orVisible.map(m => (
                    <option key={m.id} value={m.id}>{openRouterOptionLabel(m)}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={orManagerModel}
                  onChange={e => setOrManagerModel(e.target.value)}
                  placeholder={orModel ? '— ten sam co wyżej —' : `domyślny: ${DEFAULT_OPENROUTER_MODELS.manager}`}
                  className={inputClass}
                />
              )}
              <p className="text-xs text-gray-600 mt-1">
                Analiza całego portfela i Doradca to najtrudniejsze zadania — warto dać im mocniejszy model.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Adres serwera</label>
              <input
                type="text"
                value={localUrl}
                onChange={e => setLocalUrl(e.target.value)}
                placeholder="http://192.168.1.50:8888/v1"
                className={inputClass}
              />
              <p className="text-xs text-gray-600 mt-1">
                Ollama, LM Studio, llama.cpp, vLLM, Unsloth Studio — wszystko, co wystawia API zgodne z OpenAI.
              </p>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                Klucz API <span className="text-gray-600">(jeśli serwer go wymaga)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type={showLocalKey ? 'text' : 'password'}
                  value={localKey}
                  onChange={e => setLocalKey(e.target.value)}
                  placeholder="sk-..."
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setShowLocalKey(!showLocalKey)}
                  className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-2 rounded-lg transition-colors text-sm flex-shrink-0"
                >
                  {showLocalKey ? 'Ukryj' : 'Pokaż'}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs text-gray-400">Model</label>
                <button
                  type="button"
                  onClick={handleRefreshModels}
                  disabled={loadingModels}
                  className="flex items-center gap-1.5 text-xs text-gray-300 bg-gray-700 hover:bg-gray-600 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                >
                  {REFRESH_ICON(loadingModels)}
                  Odśwież listę modeli
                </button>
              </div>

              {models.length > 0 ? (
                <select
                  value={localModel}
                  onChange={e => setLocalModel(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— wybierz model —</option>
                  {models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                      {m.quant ? ` · ${m.quant}` : ''}
                      {m.loaded ? ' · załadowany' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={localModel}
                  onChange={e => setLocalModel(e.target.value)}
                  placeholder="np. unsloth/gemma-4-31B-it-GGUF"
                  className={inputClass}
                />
              )}

              {modelsError && <p className="text-xs text-red-400 mt-1.5">{modelsError}</p>}
              {models.length > 0 && !modelsError && (
                <p className="text-xs text-gray-600 mt-1">
                  Znaleziono {models.length} modeli. Niezaładowany model oznacza dłuższe pierwsze zapytanie.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">
                Model do analizy portfela <span className="text-gray-600">(opcjonalnie)</span>
              </label>
              {models.length > 0 ? (
                <select
                  value={managerModel}
                  onChange={e => setManagerModel(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— ten sam co wyżej —</option>
                  {models.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}{m.loaded ? ' · załadowany' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={managerModel}
                  onChange={e => setManagerModel(e.target.value)}
                  placeholder="— ten sam co wyżej —"
                  className={inputClass}
                />
              )}
              <p className="text-xs text-gray-600 mt-1">
                Analiza całego portfela jest najtrudniejszym zadaniem — możesz użyć do niej mocniejszego modelu.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Limit bezczynności (s)</label>
                <input
                  type="number"
                  min={30}
                  value={idleTimeout}
                  onChange={e => setIdleTimeout(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Tokeny — raport spółki</label>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={maxTokensWorker}
                  onChange={e => setMaxTokensWorker(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Tokeny — czat i portfel</label>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={maxTokensChat}
                  onChange={e => setMaxTokensChat(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="bg-amber-900/15 border border-amber-700/30 rounded-lg p-3 space-y-1.5">
              <p className="text-xs text-amber-300/90">
                <strong>Limit bezczynności</strong> nie ogranicza czasu generowania — liczy się tylko przerwa
                bez ani jednego tokenu. Model może pracować godzinę, byle strumień płynął.
              </p>
              <p className="text-xs text-amber-300/90">
                <strong>Limity tokenów</strong> obejmują też rozumowanie modelu, które potrafi zająć
                większość budżetu. Zbyt niska wartość kończy się pustym raportem — jeśli to zobaczysz, zwiększ limit.
              </p>
            </div>
          </div>
        )}

        <button
          onClick={handleSave}
          className="mt-5 bg-finance-green hover:bg-emerald-600 text-white font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Zapisz
        </button>
        {saved && <p className="text-finance-green text-sm mt-2">Zapisano pomyślnie</p>}
      </div>

      {/* ── Informacje o aplikacji ── */}
      <div className="glass-card rounded-xl p-5">
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
          <div className="flex justify-between">
            <span className="text-gray-400">Silnik AI</span>
            <span className="text-white">
              {provider === 'local'
                ? (localModel || 'serwer lokalny — brak modelu')
                : `OpenRouter · ${orModel || DEFAULT_OPENROUTER_MODELS.worker}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
