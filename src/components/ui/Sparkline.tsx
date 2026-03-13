interface Props {
  data: number[]
  width?: number
  height?: number
}

export default function Sparkline({ data, width = 80, height = 32 }: Props) {
  if (data.length < 2) return <div style={{ width, height }} />

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const pad = 2
  const points = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (width - pad * 2)
      const y = pad + (1 - (v - min) / range) * (height - pad * 2)
      return `${x},${y}`
    })
    .join(' ')

  const isUp = data[data.length - 1] >= data[0]
  const color = isUp ? '#10b981' : '#ef4444'

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', margin: '0 auto' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
