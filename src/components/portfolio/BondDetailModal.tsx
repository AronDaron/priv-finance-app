import { createPortal } from 'react-dom'
import { formatCurrency } from '../../lib/utils'
import type { PortfolioAsset, BondValueResult } from '../../lib/types'
import { BOND_TYPES } from '../../lib/types'
import type { BondType } from '../../lib/types'

interface Props {
  asset: PortfolioAsset
  bondValue: BondValueResult
  onClose: () => void
}

export default function BondDetailModal({ asset, bondValue, onClose }: Props) {
  const bondTypeMeta = asset.bond_type ? BOND_TYPES[asset.bond_type as BondType] : null
  const costBasis = asset.quantity * 100
  const totalPnl = bondValue.totalValue - costBasis
  const pnlPercent = costBasis > 0 ? (totalPnl / costBasis) * 100 : 0

  const formatRate = (rate: number) => `${(rate * 100).toFixed(2)}%`
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-finance-card rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Nagłówek */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-finance-green">{asset.ticker}</h2>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium border border-blue-500/20">
                {bondTypeMeta?.name ?? asset.bond_type} · {bondTypeMeta?.period}
              </span>
              {bondValue.isMatured && (
                <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-xs font-medium border border-orange-500/20">
                  Zapadła
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400">{asset.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Kluczowe wartości */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-gray-800/60 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Wartość całkowita</p>
            <p className="text-xl font-bold text-white tabular-nums">{formatCurrency(bondValue.totalValue, 'PLN')}</p>
            <p className="text-xs text-gray-500 mt-1">{asset.quantity} szt. × {formatCurrency(bondValue.currentValuePerBond, 'PLN')}</p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">Zysk / Strata</p>
            <p className={`text-xl font-bold tabular-nums ${totalPnl >= 0 ? 'text-finance-green' : 'text-finance-red'}`}>
              {totalPnl >= 0 ? '+' : ''}{formatCurrency(totalPnl, 'PLN')}
            </p>
            <p className={`text-xs mt-1 ${pnlPercent >= 0 ? 'text-finance-green' : 'text-finance-red'}`}>
              {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}% vs nominał
            </p>
          </div>
        </div>

        {/* Szczegóły */}
        <div className="space-y-2 mb-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Szczegóły pozycji</h3>
          {[
            ['Liczba sztuk', `${asset.quantity} szt.`],
            ['Wartość nominalna', formatCurrency(costBasis, 'PLN')],
            ['Wartość bazowa (bez narosłych odsetek)', formatCurrency(bondValue.baseValue * asset.quantity, 'PLN')],
            ['Narosłe odsetki', formatCurrency(bondValue.accruedInterest * asset.quantity, 'PLN')],
            ['Data zakupu', asset.purchase_date ? formatDate(asset.purchase_date) : '—'],
            ['Data zapadalności', formatDate(bondValue.maturityDate)],
            ['Rok obligacji', `${bondValue.bondYearNum}`],
            ['Stopa bieżącego roku', formatRate(bondValue.currentYearRate)],
            ['Oprocentowanie roku 1', asset.bond_year1_rate !== undefined ? `${asset.bond_year1_rate?.toFixed(2)}%` : '—'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-gray-700/40">
              <span className="text-sm text-gray-400">{label}</span>
              <span className="text-sm text-white font-medium tabular-nums">{value}</span>
            </div>
          ))}
        </div>

        {/* Informacja o typie */}
        {bondTypeMeta?.inflationLinked && (
          <div className="rounded-xl bg-blue-900/10 border border-blue-500/20 p-3 text-xs text-blue-400">
            Obligacja indeksowana inflacją — oprocentowanie od roku 2 = marża + CPI poprzedniego roku
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
