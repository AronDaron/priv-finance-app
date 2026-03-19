import type { RegionScore } from '../../lib/types'

function RiskBadge({ risk }: { risk: RegionScore['risk'] }) {
  const cfg = {
    low:    { label: 'Niskie ryzyko',   cls: 'bg-finance-green/20 text-finance-green border border-finance-green/30' },
    medium: { label: 'Średnie ryzyko',  cls: 'bg-yellow-500/20  text-yellow-400  border border-yellow-500/30' },
    high:   { label: 'Wysokie ryzyko',  cls: 'bg-finance-red/20 text-finance-red  border border-finance-red/30' },
  }
  const { label, cls } = cfg[risk]
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

function ScoreArc({ score }: { score: number }) {
  // Prosta kołowa wizualizacja score
  const color = score >= 65 ? '#10b981' : score >= 40 ? '#eab308' : '#ef4444'
  const r = 28
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#374151" strokeWidth="6" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-white leading-none">{score}</span>
        <span className="text-xs text-gray-400">/100</span>
      </div>
    </div>
  )
}

function TrendArrow({ trend }: { trend: RegionScore['trend'] }) {
  if (trend === 'up')   return <span className="text-finance-green text-lg">↑</span>
  if (trend === 'down') return <span className="text-finance-red   text-lg">↓</span>
  return <span className="text-gray-500 text-lg">→</span>
}

interface Props {
  region: RegionScore
  onClick: () => void
}

export default function RegionCard({ region, onClick }: Props) {
  const barColor = region.risk === 'low'
    ? { bg: 'linear-gradient(90deg, #10b981, #34d399)', shadow: '0 0 8px rgba(16,185,129,0.4)' }
    : region.risk === 'medium'
    ? { bg: 'linear-gradient(90deg, #eab308, #facc15)', shadow: '0 0 8px rgba(234,179,8,0.4)' }
    : { bg: 'linear-gradient(90deg, #ef4444, #f87171)', shadow: '0 0 8px rgba(239,68,68,0.4)' }

  return (
    <button
      onClick={onClick}
      className="glass-card rounded-xl overflow-hidden text-left w-full transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-black/30 active:scale-100"
    >
      <div style={{ height: 3, background: barColor.bg, boxShadow: barColor.shadow }} />
      <div className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{region.flag}</span>
            <span className="text-white font-semibold text-base leading-tight">{region.name}</span>
            <TrendArrow trend={region.trend} />
          </div>
          <RiskBadge risk={region.risk} />

          {/* Top 2 składowe */}
          <div className="mt-3 space-y-1">
            {region.components.slice(0, 2).map(c => (
              <div key={c.name} className="flex items-center justify-between text-xs">
                <span className="text-gray-400 truncate mr-2">{c.name}</span>
                <span className={c.contribution >= 0 ? 'text-finance-green' : 'text-finance-red'}>
                  {c.contribution >= 0 ? '+' : ''}{c.contribution.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <ScoreArc score={region.score} />
      </div>

      <div className="mt-3 pt-3 border-t border-gray-700/50 text-xs text-gray-700 text-center" style={{ fontSize: 10 }}>
        Kliknij aby zobaczyć szczegóły
      </div>
      </div>{/* /p-5 */}
    </button>
  )
}
