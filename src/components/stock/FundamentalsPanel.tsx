import { formatCurrency, formatMarketCap } from '../../lib/utils'
import type { FundamentalData } from '../../lib/types'

interface Props {
  fundamentals: FundamentalData
}

function pct(val: number | null) {
  return val != null ? `${(val * 100).toFixed(1)}%` : 'N/A'
}

export default function FundamentalsPanel({ fundamentals }: Props) {
  const {
    pe, eps, dividendYield, marketCap, week52High, week52Low, beta, sector, industry,
    totalRevenue, revenueGrowth, grossMargins, profitMargins, totalDebt, totalCash,
    analystRecommendation, numberOfAnalysts, targetMeanPrice, earningsGrowth,
    recommendationTrend, nextEarningsDate, topHoldings, fundFamily,
  } = fundamentals

  const isEtf = topHoldings != null || fundFamily != null

  const baseRows: { label: string; value: string }[] = [
    { label: 'P/E Ratio',         value: pe?.toFixed(2) ?? 'N/A' },
    { label: 'EPS',               value: eps?.toFixed(2) ?? 'N/A' },
    { label: 'Stopa dywidendy',   value: dividendYield != null ? `${(dividendYield * 100).toFixed(2)}%` : '—' },
    { label: 'Market Cap',        value: formatMarketCap(marketCap) },
    { label: '52-tyg. max',       value: week52High != null ? formatCurrency(week52High) : 'N/A' },
    { label: '52-tyg. min',       value: week52Low != null ? formatCurrency(week52Low) : 'N/A' },
    { label: 'Beta',              value: beta?.toFixed(2) ?? 'N/A' },
    { label: 'Sektor',            value: sector ?? '—' },
    { label: 'Branża',            value: industry ?? '—' },
  ]

  const financialRows: { label: string; value: string }[] = totalRevenue != null ? [
    { label: 'Przychody',         value: formatMarketCap(totalRevenue) },
    { label: 'Wzrost przychodów', value: pct(revenueGrowth) },
    { label: 'Marża brutto',      value: pct(grossMargins) },
    { label: 'Marża netto',       value: pct(profitMargins) },
    { label: 'Wzrost zysku',      value: pct(earningsGrowth) },
    { label: 'Dług całkowity',    value: totalDebt != null ? formatMarketCap(totalDebt) : 'N/A' },
    { label: 'Gotówka',           value: totalCash != null ? formatMarketCap(totalCash) : 'N/A' },
  ] : []

  const analystRows: { label: string; value: string }[] = numberOfAnalysts ? [
    { label: 'Rekomendacja',      value: analystRecommendation?.toUpperCase() ?? 'N/A' },
    { label: 'Cel cenowy',        value: targetMeanPrice != null ? formatCurrency(targetMeanPrice) : 'N/A' },
    { label: 'Liczba analityków', value: String(numberOfAnalysts) },
    ...(nextEarningsDate ? [{ label: 'Następne wyniki', value: nextEarningsDate }] : []),
  ] : []

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div style={{ height: 3, background: 'linear-gradient(90deg, #6366f1, #818cf8)', boxShadow: '0 0 8px rgba(99,102,241,0.4)' }} />
      <div className="p-5 space-y-4">
        <h3 className="text-lg font-semibold text-white">Dane fundamentalne</h3>

        {/* ETF: top holdings */}
        {isEtf && topHoldings && topHoldings.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs text-gray-300 font-semibold uppercase tracking-wider">Top składniki ({fundFamily ?? 'ETF'})</p>
              <div className="flex-1 h-px bg-gray-700/50" />
            </div>
            <div className="space-y-1">
              {topHoldings.map((h, i) => (
                <div key={i} className="flex justify-between py-2 border-b border-gray-800/60 last:border-0 text-sm">
                  <span className="text-gray-300 truncate pr-2">{h.name}</span>
                  <span className="text-white font-medium shrink-0">{h.percent != null ? `${(h.percent * 100).toFixed(1)}%` : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Podstawowe */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs text-gray-300 font-semibold uppercase tracking-wider">Wycena</p>
            <div className="flex-1 h-px bg-gray-700/50" />
          </div>
          <div className="space-y-0">
            {baseRows.map(({ label, value }) => (
              <div key={label} className="flex justify-between py-2 border-b border-gray-800/60 last:border-0 text-sm">
                <span className="text-gray-400">{label}</span>
                <span className="text-white font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Finanse spółki */}
        {financialRows.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs text-gray-300 font-semibold uppercase tracking-wider">Finanse</p>
              <div className="flex-1 h-px bg-gray-700/50" />
            </div>
            <div className="space-y-0">
              {financialRows.map(({ label, value }) => (
                <div key={label} className="flex justify-between py-2 border-b border-gray-800/60 last:border-0 text-sm">
                  <span className="text-gray-400">{label}</span>
                  <span className="text-white font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analitycy */}
        {analystRows.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs text-gray-300 font-semibold uppercase tracking-wider">Konsensus analityków</p>
              <div className="flex-1 h-px bg-gray-700/50" />
            </div>
            <div className="space-y-0">
              {analystRows.map(({ label, value }) => (
                <div key={label} className="flex justify-between py-2 border-b border-gray-800/60 last:border-0 text-sm">
                  <span className="text-gray-400">{label}</span>
                  <span className="text-white font-medium">{value}</span>
                </div>
              ))}
            </div>
            {recommendationTrend && (
              <RecommendationBar trend={recommendationTrend} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function RecommendationBar({ trend }: { trend: NonNullable<FundamentalData['recommendationTrend']> }) {
  const total = trend.strongBuy + trend.buy + trend.hold + trend.sell + trend.strongSell
  if (total === 0) return null
  const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`

  return (
    <div className="mt-2">
      <div className="flex h-2 rounded-full overflow-hidden" style={{ borderRadius: 9999 }}>
        {trend.strongBuy > 0  && <div style={{ width: pct(trend.strongBuy) }}  className="bg-emerald-500" title={`Strong Buy: ${trend.strongBuy}`} />}
        {trend.buy > 0        && <div style={{ width: pct(trend.buy) }}        className="bg-green-400"   title={`Buy: ${trend.buy}`} />}
        {trend.hold > 0       && <div style={{ width: pct(trend.hold) }}       className="bg-yellow-400"  title={`Hold: ${trend.hold}`} />}
        {trend.sell > 0       && <div style={{ width: pct(trend.sell) }}       className="bg-orange-400"  title={`Sell: ${trend.sell}`} />}
        {trend.strongSell > 0 && <div style={{ width: pct(trend.strongSell) }} className="bg-red-500"     title={`Strong Sell: ${trend.strongSell}`} />}
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>SB:{trend.strongBuy} B:{trend.buy} H:{trend.hold} S:{trend.sell} SS:{trend.strongSell}</span>
        <span>{total} analityków</span>
      </div>
    </div>
  )
}
