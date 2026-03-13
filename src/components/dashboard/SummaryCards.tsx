import { formatCurrency, formatPercent } from '../../lib/utils'

interface Props {
  totalValue: number
  totalPnL: number
  totalROI: number
  assetCount: number
  totalAnnualDividend?: number
  cashValuePLN?: number
}

export default function SummaryCards({ totalValue, totalPnL, totalROI, assetCount, totalAnnualDividend = 0, cashValuePLN = 0 }: Props) {
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

  if (cashValuePLN > 0) {
    cards.push({
      label: 'Gotówka (PLN)',
      value: formatCurrency(cashValuePLN, 'PLN'),
      color: 'text-gray-300',
    })
  }

  if (totalAnnualDividend > 0) {
    cards.push({
      label: 'Roczna dywidenda (est.)',
      value: formatCurrency(totalAnnualDividend, 'PLN'),
      color: 'text-finance-green',
    })
  }

  const cols = cards.length <= 4 ? 4 : cards.length <= 5 ? 5 : 6
  const gridClass = `grid grid-cols-2 lg:grid-cols-${cols} gap-4`

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
