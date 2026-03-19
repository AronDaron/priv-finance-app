import { formatCurrency, formatPercent, formatMarketCap } from '../../lib/utils'
import type { StockQuote } from '../../lib/types'

interface Props {
  quote: StockQuote
}

export default function QuoteHeader({ quote }: Props) {
  const isPositive = quote.change >= 0
  const barColor = isPositive
    ? 'linear-gradient(90deg, #10b981, #34d399)'
    : 'linear-gradient(90deg, #ef4444, #f87171)'
  const barShadow = isPositive
    ? '0 0 8px rgba(16,185,129,0.4)'
    : '0 0 8px rgba(239,68,68,0.4)'
  const priceColor = isPositive ? 'text-finance-green' : 'text-finance-red'
  const badgeBg = isPositive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'
  const badgeBorder = isPositive ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'
  const badgeColor = isPositive ? '#10b981' : '#ef4444'

  return (
    <div className="glass-card rounded-xl overflow-hidden mb-6">
      <div style={{ height: 3, background: barColor, boxShadow: barShadow }} />
      <div className="p-5 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">{quote.ticker}</h1>
          <p className="text-gray-400 mt-1">{quote.name}</p>
        </div>
        <div className="text-right">
          <p className={`text-4xl font-bold tabular-nums ${priceColor}`}>
            {formatCurrency(quote.price, quote.currency)}
          </p>
          <div className="flex items-center justify-end gap-2 mt-2">
            <span
              className="rounded-full px-3 py-1 text-sm font-semibold"
              style={{ background: badgeBg, border: `1px solid ${badgeBorder}`, color: badgeColor }}
            >
              {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({formatPercent(quote.changePercent)})
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Vol: {quote.volume?.toLocaleString('pl-PL')} · MCap: {formatMarketCap(quote.marketCap)}
          </p>
        </div>
      </div>
    </div>
  )
}
