import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatCurrency, formatPercent } from '../../lib/utils'
import type { PortfolioAsset, StockQuote, BondValueResult, SupportedCurrency } from '../../lib/types'
import { gramsToTroyOz } from '../../lib/types'
import Sparkline from '../ui/Sparkline'
import BondDetailModal from './BondDetailModal'

interface Props {
  asset: PortfolioAsset
  quote: StockQuote | null
  sparkline?: number[]
  fxRates?: Map<SupportedCurrency, number>
  onDelete: () => void
  bondValue?: BondValueResult
  bondPendingMonth?: string  // np. '2026-01' gdy CPI jeszcze nie opublikowane
}

export default function AssetRow({ asset, quote, sparkline, fxRates, onDelete, bondValue, bondPendingMonth }: Props) {
  const navigate = useNavigate()
  const [showBondDetail, setShowBondDetail] = useState(false)
  const isBond = asset.asset_type === 'bond'

  const toPlnRate = (currency: string) => fxRates?.get(currency as SupportedCurrency) ?? 1

  // Obliczenia dla obligacji
  const bondCurrentValuePerBond = bondValue?.currentValuePerBond ?? null
  const bondTotalValue = bondValue?.totalValue ?? null
  const bondCostBasis = asset.quantity * 100  // zawsze 100 PLN/szt
  const bondPnl = bondTotalValue !== null ? bondTotalValue - bondCostBasis : null
  const bondPnlPercent = bondCostBasis > 0 && bondPnl !== null ? (bondPnl / bondCostBasis) * 100 : 0

  // Obliczenia dla akcji/ETF/metali
  const spotPrice       = quote?.price ?? asset.purchase_price
  const quoteCurrency   = quote?.currency ?? asset.currency
  const ozPerCoin       = asset.gold_grams ? gramsToTroyOz(asset.gold_grams) : null
  const currentPrice    = ozPerCoin ? spotPrice * ozPerCoin : spotPrice
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

  const handleRowClick = () => {
    if (isBond) {
      setShowBondDetail(true)
    } else {
      navigate(`/portfolio/${asset.ticker}`)
    }
  }

  return (
    <>
      <tr
        className="border-b border-gray-800 hover:bg-white/[0.03] border-l-2 border-l-transparent hover:border-l-finance-green/40 transition-colors cursor-pointer"
        onClick={handleRowClick}
      >
        <td className="px-4 py-3 font-bold text-finance-green">
          {asset.ticker}
          {isBond && <span className="ml-1 text-xs text-blue-400 font-normal">OBL</span>}
        </td>
        <td className="px-4 py-3 text-gray-300 max-w-[160px] truncate">{asset.name}</td>
        <td className="px-4 py-3 text-right text-gray-300">
          {isBond ? `${asset.quantity} szt.` : asset.quantity}
        </td>
        <td className="px-4 py-3 text-right text-gray-300">
          {isBond
            ? formatCurrency(100, 'PLN')
            : formatCurrency(asset.purchase_price, asset.currency)
          }
        </td>
        <td className="px-4 py-3 text-right text-white">
          {isBond ? (
            bondCurrentValuePerBond !== null
              ? <span title={`Rok ${bondValue?.bondYearNum}, stopa ${((bondValue?.currentYearRate ?? 0) * 100).toFixed(2)}%`}>
                  {formatCurrency(bondCurrentValuePerBond, 'PLN')}
                  <span className="text-xs text-gray-500 ml-1">/szt</span>
                </span>
              : bondPendingMonth
                ? <span className="text-yellow-500 text-xs" title={`Oczekiwanie na dane GUS za ${bondPendingMonth}`}>CPI pending</span>
                : <span className="text-gray-600">—</span>
          ) : (
            quote ? (
              <span title={ozPerCoin ? `Spot: ${formatCurrency(spotPrice, quote.currency)}/oz` : undefined}>
                {formatCurrency(currentPrice, quote.currency)}
                {ozPerCoin && <span className="text-xs text-gray-500 ml-1">/szt</span>}
              </span>
            ) : '—'
          )}
        </td>
        <td className="px-4 py-3 text-right text-white">
          {isBond
            ? (bondTotalValue !== null ? formatCurrency(bondTotalValue, 'PLN') : bondPendingMonth ? <span className="text-yellow-500 text-xs">pending</span> : '—')
            : formatCurrency(valueInPLN, 'PLN')
          }
        </td>
        <td className={`px-4 py-3 text-right font-medium ${
          isBond
            ? (bondPnl !== null && bondPnl >= 0 ? 'text-finance-green' : 'text-finance-red')
            : (pnl >= 0 ? 'text-finance-green' : 'text-finance-red')
        }`}>
          {isBond
            ? (bondPnl !== null ? (bondPnl >= 0 ? '+' : '') + formatCurrency(bondPnl, 'PLN') : bondPendingMonth ? <span className="text-yellow-500 text-xs">pending</span> : '—')
            : (pnl >= 0 ? '+' : '') + formatCurrency(pnl, 'PLN')
          }
        </td>
        <td className={`px-4 py-3 text-right font-medium ${
          isBond
            ? (bondPnlPercent >= 0 ? 'text-finance-green' : 'text-finance-red')
            : (pnlPercent >= 0 ? 'text-finance-green' : 'text-finance-red')
        }`}>
          {isBond ? (bondTotalValue !== null ? formatPercent(bondPnlPercent) : bondPendingMonth ? '' : '—') : formatPercent(pnlPercent)}
        </td>
        <td className="px-4 py-3 text-center">
          {isBond ? (
            <span className="text-gray-600 text-xs">—</span>
          ) : sparkline && sparkline.length >= 2 ? (
            <Sparkline data={sparkline} width={80} height={32} />
          ) : (
            <span className="text-gray-600 text-xs">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          <button
            onClick={handleDelete}
            className="text-gray-600 hover:text-finance-red hover:bg-finance-red/10 rounded-lg p-1.5 transition-all"
            title="Usuń"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </td>
      </tr>

      {showBondDetail && bondValue && (
        <BondDetailModal
          asset={asset}
          bondValue={bondValue}
          onClose={() => setShowBondDetail(false)}
        />
      )}
    </>
  )
}
