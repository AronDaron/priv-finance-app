import { formatCurrency, formatMarketCap } from '../../lib/utils'
import type { FundamentalData } from '../../lib/types'

interface Props {
  fundamentals: FundamentalData
}

export default function FundamentalsPanel({ fundamentals }: Props) {
  const { pe, eps, dividendYield, marketCap, week52High, week52Low, beta, sector, industry } = fundamentals

  const rows: { label: string; value: string }[] = [
    { label: 'P/E Ratio', value: pe?.toFixed(2) ?? 'N/A' },
    { label: 'EPS', value: eps?.toFixed(2) ?? 'N/A' },
    { label: 'Stopa dywidendy', value: dividendYield != null ? `${(dividendYield * 100).toFixed(2)}%` : '—' },
    { label: 'Market Cap', value: formatMarketCap(marketCap) },
    { label: '52-tyg. max', value: week52High != null ? formatCurrency(week52High) : 'N/A' },
    { label: '52-tyg. min', value: week52Low != null ? formatCurrency(week52Low) : 'N/A' },
    { label: 'Beta', value: beta?.toFixed(2) ?? 'N/A' },
    { label: 'Sektor', value: sector ?? '—' },
    { label: 'Branża', value: industry ?? '—' },
  ]

  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="text-lg font-semibold text-white mb-4">Dane fundamentalne</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map(({ label, value }) => (
          <>
            <span key={label + '-label'} className="text-gray-400">{label}</span>
            <span key={label + '-value'} className="text-white font-medium text-right">{value}</span>
          </>
        ))}
      </div>
    </div>
  )
}
