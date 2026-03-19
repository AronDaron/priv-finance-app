interface Props {
  label: string
  value: string
  subtext?: string
  color?: 'green' | 'red' | 'neutral' | 'yellow'
}

export default function PortfolioMetricsCard({ label, value, subtext, color = 'neutral' }: Props) {
  const colorClass = {
    green: 'text-finance-green',
    red: 'text-finance-red',
    neutral: 'text-white',
    yellow: 'text-yellow-400',
  }[color]

  return (
    <div className="glass-card rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      <span className={`text-xl font-bold ${colorClass}`}>{value}</span>
      {subtext && <span className="text-xs text-gray-500">{subtext}</span>}
    </div>
  )
}
