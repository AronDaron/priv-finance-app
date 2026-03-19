import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import { formatCurrency, formatMarketCap } from '../../lib/utils'
import type { FundamentalData } from '../../lib/types'

interface Props {
  fundamentals: FundamentalData
}

function pct(val: number | null) {
  return val != null ? `${(val * 100).toFixed(1)}%` : 'N/A'
}

const DONUT_COLORS: Record<string, string> = {
  strongBuy:  '#10b981',
  buy:        '#34d399',
  hold:       '#fbbf24',
  sell:       '#f97316',
  strongSell: '#ef4444',
}

function RecommendationDonut({ trend }: { trend: NonNullable<FundamentalData['recommendationTrend']> }) {
  const data = [
    { key: 'strongBuy',  label: 'Strong Buy',  value: trend.strongBuy },
    { key: 'buy',        label: 'Buy',          value: trend.buy },
    { key: 'hold',       label: 'Hold',         value: trend.hold },
    { key: 'sell',       label: 'Sell',         value: trend.sell },
    { key: 'strongSell', label: 'Strong Sell',  value: trend.strongSell },
  ].filter(d => d.value > 0)

  if (data.length === 0) return null

  return (
    <div className="mt-3 flex items-center gap-3">
      <PieChart width={110} height={110}>
        <Pie
          data={data}
          cx={50}
          cy={50}
          innerRadius={30}
          outerRadius={48}
          paddingAngle={2}
          dataKey="value"
          strokeWidth={0}
        >
          {data.map(d => (
            <Cell key={d.key} fill={DONUT_COLORS[d.key]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(val: number, name: string) => [val, name]}
          contentStyle={{
            background: '#111827',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 8,
            fontSize: 11,
          }}
          itemStyle={{ color: '#e5e7eb' }}
        />
      </PieChart>
      <div className="space-y-1 flex-1">
        {data.map(d => (
          <div key={d.key} className="flex items-center gap-2 text-xs">
            <span
              className="w-2 h-2 rounded-sm flex-shrink-0"
              style={{ background: DONUT_COLORS[d.key] }}
            />
            <span className="text-gray-400">{d.label}</span>
            <span className="text-white font-medium ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
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

        {/* Wycena + Finanse obok siebie */}
        <div className={`grid gap-4 ${financialRows.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {/* Wycena */}
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

          {/* Finanse */}
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
        </div>

        {/* Konsensus analityków — pełna szerokość */}
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
              <RecommendationDonut trend={recommendationTrend} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
