import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatCurrency } from '../../lib/utils'

interface DataPoint {
  date: string
  value: number
}

export default function PortfolioHistoryChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) return null

  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="text-sm font-medium text-gray-400 mb-4">Historia wartości portfela (PLN)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(75,85,99,0.3)" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickFormatter={d => new Date(d + 'T12:00:00').toLocaleDateString('pl-PL', { month: 'short', day: 'numeric' })}
            tickCount={6}
          />
          <YAxis
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
            width={50}
          />
          <Tooltip
            formatter={(val) => [formatCurrency(val as number, 'PLN'), 'Wartość portfela']}
            labelFormatter={l => new Date(l + 'T12:00:00').toLocaleDateString('pl-PL')}
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#e5e7eb' }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#portfolioGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#10b981' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
