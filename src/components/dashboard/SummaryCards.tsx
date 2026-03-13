import { formatCurrency, formatPercent } from '../../lib/utils'

interface Props {
  totalValue: number
  totalPnL: number
  totalROI: number
  assetCount: number
  totalAnnualDividend?: number
}

export default function SummaryCards({ totalValue, totalPnL, totalROI, assetCount, totalAnnualDividend = 0 }: Props) {
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

  if (totalAnnualDividend > 0) {
    cards.push({
      label: 'Roczna dywidenda (est.)',
      value: formatCurrency(totalAnnualDividend, 'PLN'),
      color: 'text-finance-green',
    })
  }

  const gridClass = cards.length === 5
    ? 'grid grid-cols-2 lg:grid-cols-5 gap-4'
    : 'grid grid-cols-2 lg:grid-cols-4 gap-4'

  return (
    <div className={gridClass}>
      {cards.map(card => (
        <div key={card.label} className="glass-card-accent rounded-xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wider">{card.label}</p>
          <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
        </div>
      ))}
    </div>
  )
}
