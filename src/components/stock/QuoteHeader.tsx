import { formatCurrency, formatPercent, formatMarketCap } from '../../lib/utils'
import type { StockQuote } from '../../lib/types'

interface Props {
  quote: StockQuote
}

export default function QuoteHeader({ quote }: Props) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-3xl font-bold">{quote.ticker}</h1>
        <p className="text-gray-400 mt-1">{quote.name}</p>
      </div>
      <div className="text-right">
        <p className="text-4xl font-bold">{formatCurrency(quote.price, quote.currency)}</p>
        <p className={`text-lg ${quote.change >= 0 ? 'text-finance-green' : 'text-finance-red'}`}>
          {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({formatPercent(quote.changePercent)})
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Vol: {quote.volume?.toLocaleString('pl-PL')} · MCap: {formatMarketCap(quote.marketCap)}
        </p>
      </div>
    </div>
  )
}
