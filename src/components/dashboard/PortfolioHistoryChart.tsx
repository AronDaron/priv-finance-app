import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatCurrency } from '../../lib/utils'

interface DataPoint {
  date: string
  value: number
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const val = payload[0].value as number
  const date = new Date(label + 'T12:00:00').toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <div style={{
      background: '#0d1117',
      border: '1px solid rgba(16,185,129,0.35)',
      borderRadius: 10,
      padding: '10px 14px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>{date}</p>
      <p style={{ color: '#10b981', fontSize: 15, fontWeight: 700, margin: 0 }}>{formatCurrency(val, 'PLN')}</p>
    </div>
  )
}

export default function PortfolioHistoryChart({ data, fillHeight = false }: { data: DataPoint[], fillHeight?: boolean }) {
  if (data.length === 0) return null

  return (
    <div className={`glass-card rounded-xl p-5 ${fillHeight ? 'h-full flex flex-col' : ''}`}>
      <h3 className="text-sm font-semibold text-gray-200 mb-4">Historia wartości portfela (PLN)</h3>
      <div className={fillHeight ? 'flex-1 min-h-0' : ''}>
      <ResponsiveContainer width="100%" height={fillHeight ? '100%' : 460}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(75,85,99,0.15)" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickFormatter={d => new Date(d + 'T12:00:00').toLocaleDateString('pl-PL', { month: 'short', day: 'numeric' })}
            tickCount={6}
            axisLine={{ stroke: 'rgba(75,85,99,0.2)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
            width={50}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#10b981"
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="url(#portfolioGradient)"
            dot={false}
            activeDot={{ r: 5, fill: '#10b981', stroke: '#ffffff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>
    </div>
  )
}
