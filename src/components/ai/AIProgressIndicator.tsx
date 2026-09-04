// src/components/ai/AIProgressIndicator.tsx
// Pokazuje, co robi model podczas generowania. Przy serwerze lokalnym raport potrafi
// powstawać kilkanaście minut, więc sama kręcąca się kropka to za mało informacji.

import type { AIProgress } from '../../lib/types'

interface Props {
  progress: AIProgress | null
  elapsedMs: number
  onCancel?: () => void
  /** Tekst pokazywany zanim przyjdzie pierwszy sygnał postępu */
  idleLabel?: string
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s} s`
}

function phaseLabel(progress: AIProgress | null, idleLabel: string): string {
  if (!progress) return idleLabel
  if (progress.stage) return progress.stage
  if (progress.phase === 'reasoning') return 'Model analizuje dane…'
  if (progress.phase === 'writing') return 'Model pisze raport…'
  return idleLabel
}

export default function AIProgressIndicator({
  progress,
  elapsedMs,
  onCancel,
  idleLabel = 'Przygotowuję dane…',
}: Props) {
  const label = phaseLabel(progress, idleLabel)
  const tps = progress?.tokensPerSec
  const written = progress?.contentTokens ?? 0
  const thought = progress?.reasoningTokens ?? 0

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex gap-1 items-center flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
        <div className="min-w-0">
          <span className="text-xs text-gray-300">{label}</span>
          <div className="text-[11px] text-gray-600 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>{formatDuration(elapsedMs)}</span>
            {written > 0 && (
              <>
                <span>·</span>
                <span>{written.toLocaleString('pl-PL')} tok.</span>
              </>
            )}
            {thought > 0 && written === 0 && (
              <>
                <span>·</span>
                <span>rozumowanie: {thought.toLocaleString('pl-PL')} tok.</span>
              </>
            )}
            {tps != null && tps > 0 && (
              <>
                <span>·</span>
                <span>{tps.toFixed(0)} tok./s</span>
              </>
            )}
          </div>
        </div>
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          className="flex-shrink-0 text-xs text-gray-400 hover:text-red-300 hover:bg-red-500/10
            border border-gray-700 hover:border-red-500/40 px-3 py-1 rounded-lg transition-colors"
        >
          Anuluj
        </button>
      )}
    </div>
  )
}
