// src/components/ai/AIEngineBadge.tsx
// Pokazuje, którym silnikiem AI aplikacja generuje AKTUALNIE.
//
// Bez tego łatwo o pomyłkę: raporty przechowują nazwę modelu z chwili wygenerowania,
// więc stary raport z OpenRoutera wyświetla tę nazwę nawet po przełączeniu na serwer lokalny.

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { ActiveAIConfig, AIRole } from '../../lib/types'
import { getActiveAIConfig } from '../../lib/api'

interface Props {
  /** Rola, której model pokazujemy — różne widoki używają różnych modeli */
  role: AIRole
}

export default function AIEngineBadge({ role }: Props) {
  const [cfg, setCfg] = useState<ActiveAIConfig | null>(null)

  useEffect(() => {
    getActiveAIConfig().then(setCfg).catch(() => setCfg(null))
  }, [])

  if (!cfg) return null

  const isLocal = cfg.provider === 'local'
  const model = cfg.models[role]

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
          isLocal
            ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
            : 'bg-gray-700/40 border-gray-600/50 text-gray-300'
        }`}
        title={isLocal ? `Serwer lokalny: ${cfg.baseUrl}` : 'OpenRouter (chmura)'}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isLocal ? 'bg-indigo-400' : 'bg-gray-400'}`} />
        {isLocal ? 'Serwer lokalny' : 'OpenRouter'}
      </span>
      <span className="text-gray-500">{model || <Link to="/settings" className="underline">wybierz model</Link>}</span>
    </div>
  )
}

/**
 * Adnotacja przy raporcie, który powstał na innym modelu niż aktualnie wybrany.
 * Zwraca null, gdy modele się zgadzają albo konfiguracji nie udało się odczytać.
 */
export function ReportModelNote({ reportModel, role }: { reportModel: string; role: AIRole }) {
  const [cfg, setCfg] = useState<ActiveAIConfig | null>(null)

  useEffect(() => {
    getActiveAIConfig().then(setCfg).catch(() => setCfg(null))
  }, [])

  if (!cfg) return null
  const current = cfg.models[role]
  if (!current || current === reportModel) return null

  return (
    <span className="text-amber-400/80" title={`Aktualnie wybrany model: ${current}`}>
      · wygenerowano innym modelem niż obecnie wybrany
    </span>
  )
}
