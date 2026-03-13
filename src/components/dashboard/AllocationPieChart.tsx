import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

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
      <h3 className="text-sm font-medium text-gray-400 mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
               dataKey="value" nameKey="name">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(val) => [`${(((val as number) / total) * 100).toFixed(1)}%`, '']}
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
            labelStyle={{ color: '#e5e7eb' }}
          />
          <Legend iconType="circle" iconSize={8}
                  formatter={(v) => <span className="text-xs text-gray-300">{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
