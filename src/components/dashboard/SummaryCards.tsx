import { formatCurrency, formatPercent } from '../../lib/utils'

interface Props {
  totalValue: number
  totalPnL: number
  totalROI: number
  assetCount: number
}

export default function SummaryCards({ totalValue, totalPnL, totalROI, assetCount }: Props) {
  const cards = [
    {
      label: 'Wartość portfela (PLN)',
      value: formatCurrency(totalValue, 'PLN'),
      color: 'text-white',
    },
    {
      label: 'Zysk / Strata',
      value: (totalPnL >= 0 ? '+' : '') + formatCurrency(totalPnL, 'PLN'),
      color: totalPnL >= 0 ? 'text-finance-green' : 'text-finance-red',
    },
    {
      label: 'ROI',
      value: formatPercent(totalROI),
      color: totalROI >= 0 ? 'text-finance-green' : 'text-finance-red',
    },
    {
      label: 'Spółki',
      value: String(assetCount),
      color: 'text-white',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => (
        <div key={card.label} className="glass-card-accent rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">{card.label}</p>
          <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </div>
  )
}
