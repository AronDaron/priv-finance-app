import { useNavigate } from 'react-router-dom'
import { formatCurrency, formatPercent } from '../../lib/utils'
import type { PortfolioAsset, StockQuote } from '../../lib/types'
import Sparkline from '../ui/Sparkline'

interface Props {
  asset: PortfolioAsset
  quote: StockQuote | null
  sparkline?: number[]
  usdPln?: number
  eurPln?: number
  onDelete: () => void
}

export default function AssetRow({ asset, quote, sparkline, usdPln = 4.0, eurPln = 4.3, onDelete }: Props) {
  const navigate = useNavigate()
  const toPlnRate = (currency: string) =>
    currency === 'PLN' ? 1 : currency === 'USD' ? usdPln : currency === 'EUR' ? eurPln : 1

  const currentPrice    = quote?.price ?? asset.purchase_price
  const quoteCurrency   = quote?.currency ?? asset.currency
  const currentValue    = asset.quantity * currentPrice
  const valueInPLN      = currentValue * toPlnRate(quoteCurrency)
  const costBasisInPLN  = asset.quantity * asset.purchase_price * toPlnRate(asset.currency)
  const pnl             = valueInPLN - costBasisInPLN
  const pnlPercent      = costBasisInPLN > 0 ? (pnl / costBasisInPLN) * 100 : 0

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm(`Usunąć ${asset.ticker} z portfela?`)) {
      onDelete()
    }
  }

  return (
    <tr
      className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors cursor-pointer"
      onClick={() => navigate(`/portfolio/${asset.ticker}`)}
    >
      <td className="px-4 py-3 font-bold text-finance-green">{asset.ticker}</td>
      <td className="px-4 py-3 text-gray-300 max-w-[160px] truncate">{asset.name}</td>
      <td className="px-4 py-3 text-right text-gray-300">{asset.quantity}</td>
      <td className="px-4 py-3 text-right text-gray-300">
        {formatCurrency(asset.purchase_price, asset.currency)}
      </td>
      <td className="px-4 py-3 text-right text-white">
        {quote ? formatCurrency(currentPrice, quote.currency) : '—'}
      </td>
      <td className="px-4 py-3 text-right text-white">
        {formatCurrency(valueInPLN, 'PLN')}
      </td>
      <td className={`px-4 py-3 text-right font-medium ${pnl >= 0 ? 'text-finance-green' : 'text-finance-red'}`}>
        {(pnl >= 0 ? '+' : '') + formatCurrency(pnl, 'PLN')}
      </td>
      <td className={`px-4 py-3 text-right font-medium ${pnlPercent >= 0 ? 'text-finance-green' : 'text-finance-red'}`}>
        {formatPercent(pnlPercent)}
      </td>
      <td className="px-4 py-3 text-center">
        {sparkline && sparkline.length >= 2
          ? <Sparkline data={sparkline} width={80} height={32} />
          : <span className="text-gray-600 text-xs">—</span>
        }
      </td>
      <td className="px-4 py-3 text-center">
        <button
          onClick={handleDelete}
          className="bg-red-900/50 hover:bg-red-800/50 text-finance-red px-3 py-1.5 rounded transition-colors"
          title="Usuń"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </td>
    </tr>
  )
}
