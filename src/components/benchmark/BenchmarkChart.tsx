import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

interface Series {
  id: string
  label: string
  data: { date: string; value: number }[]
  color: string
}

interface Props {
  series: Series[]
}

const PALETTE = ['#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#84cc16']

// Sanitize ticker IDs for use as Recharts dataKey (^ and other special chars cause issues)
function safeKey(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

function normalize(data: { date: string; value: number }[]): { date: string; value: number }[] {
  if (!data.length) return []
  const base = data[0].value
  if (!base) return data
  return data.map(d => ({ date: d.date, value: parseFloat(((d.value / base) * 100).toFixed(2)) }))
}

export default function BenchmarkChart({ series }: Props) {
  if (series.length === 0) return (
    <div className="glass-card rounded-xl p-8 text-center text-gray-500">
      Brak danych do wyświetlenia
    </div>
  )

  // Zbierz wszystkie daty
  const allDates = Array.from(
    new Set(series.flatMap(s => s.data.map(d => d.date)))
  ).sort()

  // Normalizuj każdą serię + oblicz bezpieczny klucz dla Recharts
  const normalizedSeries = series.map(s => ({
    ...s,
    key: safeKey(s.id),
    normalized: normalize(s.data),
  }))

  // Zbuduj dane do wykresu: { date, [safeKey]: value }
  const chartData = allDates.map(date => {
    const point: Record<string, any> = { date }
    normalizedSeries.forEach(s => {
      const entry = s.normalized.find(d => d.date === date)
      if (entry) point[s.key] = entry.value
    })
    return point
  })

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`
  }

  const portfolioColor = '#10b981' // finance-green

  return (
    <div className="glass-card rounded-xl p-4">
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#374151' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `${v}`}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#9ca3af', fontSize: 11 }}
            formatter={(value, name) => {
              const num = typeof value === 'number' ? value : 0
              const nameStr = String(name ?? '')
              const s = normalizedSeries.find(s => s.key === nameStr)
              const label = s?.label ?? nameStr
              const diff = num - 100
              return [`${num.toFixed(1)} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%)`, label]
            }}
          />
          <Legend
            wrapperStyle={{ paddingTop: 16, color: '#9ca3af', fontSize: 12 }}
            formatter={(value) => normalizedSeries.find(s => s.key === value)?.label ?? value}
          />
          <ReferenceLine y={100} stroke="#6b7280" strokeDasharray="4 4" />
          {normalizedSeries.map((s, i) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.key}
              stroke={s.id === '__portfolio__' ? portfolioColor : (PALETTE[i % PALETTE.length])}
              strokeWidth={s.id === '__portfolio__' ? 2.5 : 1.5}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
