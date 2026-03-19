import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

interface AllocationPieChartProps {
  title: string
  data: { name: string; value: number }[]
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16']

export default function AllocationPieChart({ title, data }: AllocationPieChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (data.length === 0) return null

  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={78}
            paddingAngle={3}
            dataKey="value"
            nameKey="name"
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(val) => [`${(((val as number) / total) * 100).toFixed(1)}%`, '']}
            contentStyle={{
              background: '#111827',
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: '#9ca3af', marginBottom: 2 }}
            itemStyle={{ color: '#e5e7eb', fontWeight: 600 }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Custom legenda z procentami */}
      <div className="mt-2 space-y-1">
        {data.slice(0, 4).map((d, i) => {
          const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0.0'
          return (
            <div key={d.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <span className="text-gray-400 truncate">{d.name}</span>
              </div>
              <span className="text-gray-300 font-medium ml-2 flex-shrink-0">{pct}%</span>
            </div>
          )
        })}
        {data.length > 4 && (
          <p className="text-xs text-gray-600 text-right">+{data.length - 4} więcej</p>
        )}
      </div>
    </div>
  )
}
