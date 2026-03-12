interface AssetSlice {
  ticker: string
  value: number
  percentage: number
}

interface Props {
  slices: AssetSlice[]
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4']

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}

export default function PortfolioPieChart({ slices }: Props) {
  if (slices.length === 0) return null

  const cx = 100, cy = 100, r = 80
  let currentAngle = 0

  return (
    <div className="flex items-center gap-8">
      <svg viewBox="0 0 200 200" className="w-48 h-48 flex-shrink-0">
        {slices.length === 1 ? (
          <circle cx={cx} cy={cy} r={r} fill={COLORS[0]}>
            <title>{slices[0].ticker}: {slices[0].percentage.toFixed(1)}%</title>
          </circle>
        ) : (
          slices.map((slice, i) => {
            const startAngle = currentAngle
            const endAngle = currentAngle + (slice.percentage / 100) * 360
            currentAngle = endAngle
            return (
              <path
                key={slice.ticker}
                d={arcPath(cx, cy, r, startAngle, endAngle)}
                fill={COLORS[i % COLORS.length]}
                stroke="#111827"
                strokeWidth="1"
              >
                <title>{slice.ticker}: {slice.percentage.toFixed(1)}%</title>
              </path>
            )
          })
        )}
      </svg>
      <div className="flex flex-col gap-2">
        {slices.map((slice, i) => (
          <div key={slice.ticker} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span className="text-white font-medium">{slice.ticker}</span>
            <span className="text-gray-400">{slice.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
