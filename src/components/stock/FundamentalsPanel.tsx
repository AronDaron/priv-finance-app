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
    <div className="glass-card rounded-xl p-5 space-y-4">
      <h3 className="text-lg font-semibold text-white">Dane fundamentalne</h3>

      {/* ETF: top holdings */}
      {isEtf && topHoldings && topHoldings.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Top składniki ({fundFamily ?? 'ETF'})</p>
          <div className="space-y-1">
            {topHoldings.map((h, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-300 truncate pr-2">{h.name}</span>
                <span className="text-white font-medium shrink-0">{h.percent != null ? `${(h.percent * 100).toFixed(1)}%` : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Podstawowe */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {baseRows.map(({ label, value }) => (
          <Row key={label} label={label} value={value} />
        ))}
      </div>

      {/* Finanse spółki */}
      {financialRows.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Finanse</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {financialRows.map(({ label, value }) => (
              <Row key={label} label={label} value={value} />
            ))}
          </div>
        </div>
      )}

      {/* Analitycy */}
      {analystRows.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Konsensus analityków</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {analystRows.map(({ label, value }) => (
              <Row key={label} label={label} value={value} />
            ))}
          </div>
          {recommendationTrend && (
            <RecommendationBar trend={recommendationTrend} />
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium text-right">{value}</span>
    </>
  )
}

function RecommendationBar({ trend }: { trend: NonNullable<FundamentalData['recommendationTrend']> }) {
  const total = trend.strongBuy + trend.buy + trend.hold + trend.sell + trend.strongSell
  if (total === 0) return null
  const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`

  return (
    <div className="mt-2">
      <div className="flex h-2 rounded-full overflow-hidden">
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
