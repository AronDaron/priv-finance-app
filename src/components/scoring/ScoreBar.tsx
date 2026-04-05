// src/components/scoring/ScoreBar.tsx
// Pasek score 0-100 z kolorem wg progu (zielony ≥65, żółty 40-64, czerwony <40)

interface ScoreBarProps {
  score: number | null
  showBar?: boolean
  compact?: boolean
  muted?: boolean
}

export function scoreColor(score: number | null): string {
  if (score == null) return 'text-gray-500'
  if (score >= 65) return 'text-finance-green'
  if (score >= 40) return 'text-yellow-400'
  return 'text-red-400'
}

export function scoreBgColor(score: number | null): string {
  if (score == null) return 'bg-gray-600'
  if (score >= 65) return 'bg-finance-green'
  if (score >= 40) return 'bg-yellow-400'
  return 'bg-red-400'
}

export default function ScoreBar({ score, showBar = true, compact = false, muted = false }: ScoreBarProps) {
  if (score == null) {
    return <span className={`text-gray-500 ${compact ? 'text-xs' : 'text-sm'}`}>—</span>
  }

  const colorClass = muted ? 'text-gray-400' : scoreColor(score)
  const bgClass = muted ? 'bg-gray-600' : scoreBgColor(score)

  return (
    <div className={`inline-flex flex-col items-center gap-0.5 ${compact ? 'w-14' : 'w-20'}`}>
      <span className={`font-semibold leading-none ${compact ? 'text-xs' : 'text-sm'} ${colorClass}`}>
        {score.toFixed(1)}
      </span>
      {showBar && (
        <div className="h-1 w-full bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${bgClass}`}
            style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
          />
        </div>
      )}
    </div>
  )
}
