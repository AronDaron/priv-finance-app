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
      label: 'Wartość portfela',
      value: formatCurrency(totalValue),
      color: 'text-white',
    },
    {
      label: 'Zysk / Strata',
      value: (totalPnL >= 0 ? '+' : '') + formatCurrency(totalPnL),
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
        <div key={card.label} className="bg-finance-card rounded-xl p-5 border border-gray-700">
          <p className="text-xs text-gray-400 uppercase tracking-wider">{card.label}</p>
          <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </div>
  )
}
