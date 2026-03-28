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

const ACTION_COLORS: Record<string, string> = {
  up:   '#10b981',
  down: '#ef4444',
  init: '#6366f1',
  main: '#9ca3af',
  reit: '#9ca3af',
}

const ACTION_LABELS: Record<string, string> = {
  up:   'Podwyżka',
  down: 'Obniżka',
  init: 'Inicjacja',
  main: 'Utrzymanie',
  reit: 'Ponowne',
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <p className="text-xs text-gray-300 font-semibold uppercase tracking-wider">{title}</p>
      <div className="flex-1 h-px bg-gray-700/50" />
    </div>
  )
}

function DataRow({ label, value, valueClass, valueColor }: { label: string; value: string; valueClass?: string; valueColor?: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-800/60 last:border-0 text-sm">
      <span className="text-gray-400">{label}</span>
      <span className={`font-medium ${valueClass ?? 'text-white'}`} style={valueColor ? { color: valueColor } : undefined}>{value}</span>
    </div>
  )
}

function RecommendationDonut({ trend }: { trend: NonNullable<FundamentalData['recommendationTrend']> }) {
  const data = [
    { key: 'strongBuy',  label: 'Mocny zakup',    value: trend.strongBuy },
    { key: 'buy',        label: 'Zakup',           value: trend.buy },
    { key: 'hold',       label: 'Trzymaj',         value: trend.hold },
    { key: 'sell',       label: 'Sprzedaj',        value: trend.sell },
    { key: 'strongSell', label: 'Mocna sprzedaż',  value: trend.strongSell },
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
          formatter={(val, name) => [val as number, name as string] as any}
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
    forwardPE, pegRatio, shortRatio, shortPercentOfFloat,
    totalRevenue, revenueGrowth, grossMargins, profitMargins, totalDebt, totalCash,
    analystRecommendation, numberOfAnalysts, targetMeanPrice, earningsGrowth,
    recommendationTrend, nextEarningsDate, topHoldings, fundFamily,
    earningsHistory, earningsTrend, upgradeDowngradeHistory, insiderTransactions,
  } = fundamentals

  const isEtf = topHoldings != null || fundFamily != null

  const baseRows: { label: string; value: string }[] = [
    { label: 'P/E (trailing)',   value: pe?.toFixed(2) ?? 'N/A' },
    { label: 'Forward P/E',      value: forwardPE?.toFixed(2) ?? 'N/A' },
    { label: 'PEG Ratio',        value: pegRatio?.toFixed(2) ?? 'N/A' },
    { label: 'EPS (trailing)',   value: eps?.toFixed(2) ?? 'N/A' },
    { label: 'Stopa dywidendy',  value: dividendYield != null ? `${(dividendYield * 100).toFixed(2)}%` : '—' },
    { label: 'Market Cap',       value: formatMarketCap(marketCap) },
    { label: '52-tyg. max',      value: week52High != null ? formatCurrency(week52High) : 'N/A' },
    { label: '52-tyg. min',      value: week52Low != null ? formatCurrency(week52Low) : 'N/A' },
    { label: 'Beta',             value: beta?.toFixed(2) ?? 'N/A' },
    { label: 'Sektor',           value: sector ?? '—' },
    { label: 'Branża',           value: industry ?? '—' },
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

  const shortRows: { label: string; value: string; hint: string }[] = (shortRatio != null || shortPercentOfFloat != null) ? [
    { label: '% akcji sprzedanych krótko', value: shortPercentOfFloat != null ? `${(shortPercentOfFloat * 100).toFixed(1)}%` : 'N/A', hint: 'Procent dostępnych akcji objętych krótką sprzedażą' },
    { label: 'Dni do pokrycia',            value: shortRatio != null ? `${shortRatio.toFixed(1)} dni` : 'N/A', hint: 'Ile dni zajęłoby zamknięcie wszystkich krótkich pozycji przy obecnym wolumenie' },
  ] : []

  const RECOMMENDATION_COLOR: Record<string, string> = {
    'Mocny zakup':    '#10b981',
    'Zakup':          '#34d399',
    'Trzymaj':        '#fbbf24',
    'Sprzedaj':       '#f97316',
    'Mocna sprzedaż': '#ef4444',
  }

  const analystRows: { label: string; value: string; valueColor?: string }[] = numberOfAnalysts ? [
    { label: 'Rekomendacja',      value: analystRecommendation ?? 'N/A', valueColor: analystRecommendation ? RECOMMENDATION_COLOR[analystRecommendation] : undefined },
    { label: 'Cel cenowy',        value: targetMeanPrice != null ? formatCurrency(targetMeanPrice) : 'N/A' },
    { label: 'Liczba analityków', value: String(numberOfAnalysts) },
    ...(nextEarningsDate ? [{ label: 'Następne wyniki', value: nextEarningsDate }] : []),
  ] : []

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div style={{ height: 3, background: 'linear-gradient(90deg, #6366f1, #818cf8)', boxShadow: '0 0 8px rgba(99,102,241,0.4)' }} />
      <div className="p-5 space-y-5">
        <h3 className="text-lg font-semibold text-white">Dane fundamentalne</h3>

        {/* ETF: top holdings */}
        {isEtf && topHoldings && topHoldings.length > 0 && (
          <div>
            <SectionHeader title={`Top składniki (${fundFamily ?? 'ETF'})`} />
            <div className="space-y-0">
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
            <SectionHeader title="Wycena" />
            <div className="space-y-0">
              {baseRows.map(({ label, value }) => (
                <DataRow key={label} label={label} value={value} />
              ))}
            </div>
          </div>

          {/* Finanse */}
          {financialRows.length > 0 && (
            <div>
              <SectionHeader title="Finanse" />
              <div className="space-y-0">
                {financialRows.map(({ label, value }) => (
                  <DataRow key={label} label={label} value={value} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Rząd 2: Short Interest + Konsensus analityków */}
        {(shortRows.length > 0 || analystRows.length > 0) && (
          <div className="grid grid-cols-2 gap-4">
            {/* Short interest */}
            {shortRows.length > 0 ? (
              <div>
                <SectionHeader title="Krótka sprzedaż" />
                <p className="text-xs text-gray-500 mb-2">
                  Obstawianie spadku ceny — im wyższy wskaźnik, tym więcej inwestorów zakłada się przeciwko spółce.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {shortRows.map(({ label, value, hint }) => (
                    <div key={label} className="bg-gray-800/40 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-gray-400 mb-1">{label}</p>
                      <p className="text-sm font-bold text-white">{value}</p>
                      <p className="text-xs text-gray-500 mt-1 leading-tight">{hint}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div />}

            {/* Konsensus analityków */}
            {analystRows.length > 0 ? (
              <div>
                <SectionHeader title="Konsensus analityków" />
                <div className="space-y-0">
                  {analystRows.map(({ label, value, valueColor }) => (
                    <DataRow key={label} label={label} value={value} valueColor={valueColor} />
                  ))}
                </div>
                {recommendationTrend && (
                  <RecommendationDonut trend={recommendationTrend} />
                )}
              </div>
            ) : <div />}
          </div>
        )}

        {/* Rząd 3: Historia EPS + Prognozy analityków */}
        {(earningsHistory?.length || earningsTrend?.length) ? (
          <div className="grid grid-cols-2 gap-4">
            {/* Historia EPS */}
            {earningsHistory && earningsHistory.length > 0 ? (
              <div>
                <SectionHeader title="Historia wyników EPS" />
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700/60">
                      <th className="text-left py-1.5 pr-2 font-medium">Kwartał</th>
                      <th className="text-right py-1.5 pr-2 font-medium">Est.</th>
                      <th className="text-right py-1.5 pr-2 font-medium">Wynik</th>
                      <th className="text-right py-1.5 font-medium">Surprise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earningsHistory.map((h, i) => {
                      const surpColor = h.surprisePercent == null ? 'text-gray-400'
                        : h.surprisePercent >= 0 ? 'text-emerald-400' : 'text-red-400'
                      const surpStr = h.surprisePercent != null
                        ? `${h.surprisePercent >= 0 ? '+' : ''}${(h.surprisePercent * 100).toFixed(1)}%`
                        : '—'
                      return (
                        <tr key={i} className="border-b border-gray-800/40 last:border-0">
                          <td className="py-1.5 pr-2 text-gray-300">{h.period}</td>
                          <td className="py-1.5 pr-2 text-right text-gray-300">{h.epsEstimate ?? '—'}</td>
                          <td className="py-1.5 pr-2 text-right text-white font-medium">{h.epsActual ?? '—'}</td>
                          <td className={`py-1.5 text-right font-medium ${surpColor}`}>{surpStr}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : <div />}

            {/* Prognozy analityków */}
            {earningsTrend && earningsTrend.length > 0 ? (
              <div>
                <SectionHeader title="Prognozy analityków" />
                <div className="space-y-0">
                  {earningsTrend.map((t, i) => (
                    <div key={i} className="py-1.5 border-b border-gray-800/60 last:border-0 text-xs">
                      <div className="flex justify-between mb-0.5">
                        <span className="text-gray-300 font-medium">{t.period}</span>
                        {t.endDate && <span className="text-gray-500">do {t.endDate}</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-gray-400">
                        {t.epsEstimate != null && (
                          <span>EPS: <span className="text-white font-medium">{t.epsEstimate.toFixed(2)}</span></span>
                        )}
                        {t.revenueEstimate != null && (
                          <span>Przych.: <span className="text-white font-medium">{formatMarketCap(t.revenueEstimate)}</span></span>
                        )}
                        {t.growth != null && (
                          <span className={`font-medium ${t.growth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.growth >= 0 ? '+' : ''}{(t.growth * 100).toFixed(1)}% EPS r/r
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div />}
          </div>
        ) : null}

        {/* Rząd 4: Zmiany ratingów + Transakcje insiderów */}
        {(upgradeDowngradeHistory?.length || insiderTransactions?.length) ? (
          <div className="grid grid-cols-2 gap-4">
            {/* Zmiany ratingów */}
            {upgradeDowngradeHistory && upgradeDowngradeHistory.length > 0 ? (
              <div>
                <SectionHeader title="Ostatnie zmiany ratingów" />
                <div className="space-y-0">
                  {upgradeDowngradeHistory.map((u, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-800/60 last:border-0 text-xs">
                      <span
                        className="px-1.5 py-0.5 rounded text-xs font-bold shrink-0"
                        style={{
                          background: (ACTION_COLORS[u.action] ?? '#9ca3af') + '22',
                          color: ACTION_COLORS[u.action] ?? '#9ca3af',
                        }}
                      >
                        {ACTION_LABELS[u.action] ?? u.action}
                      </span>
                      <span className="text-gray-300 font-medium truncate">{u.firm}</span>
                      <span className="text-gray-400 ml-auto shrink-0">
                        {u.fromGrade ? `${u.fromGrade} → ` : ''}<span className="text-white">{u.toGrade}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div />}

            {/* Transakcje insiderów */}
            {insiderTransactions && insiderTransactions.length > 0 ? (
              <div>
                <SectionHeader title="Transakcje insiderów" />
                <div className="space-y-0">
                  {insiderTransactions.map((t, i) => {
                    const isSale = /sale|sold|sell/i.test(t.transactionText)
                    const isBuy  = /purchase|bought|buy/i.test(t.transactionText)
                    const typeColor = isSale ? 'text-red-400' : isBuy ? 'text-emerald-400' : 'text-gray-400'
                    return (
                      <div key={i} className="py-1.5 border-b border-gray-800/60 last:border-0 text-xs">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-gray-300 font-medium truncate pr-2">{t.name}</span>
                          <span className="text-gray-500 shrink-0">{t.date}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span className="truncate pr-2">
                            <span className="text-gray-500">{t.relation}</span>
                            {t.transactionText && <span className={` ml-1 ${typeColor}`}>{t.transactionText}</span>}
                          </span>
                          <span className="shrink-0 text-right">
                            {t.shares != null && <span className="text-white font-medium">{t.shares.toLocaleString()}</span>}
                            {t.value != null && <span className="text-gray-400 ml-1">({formatMarketCap(t.value)})</span>}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : <div />}
          </div>
        ) : null}
      </div>
    </div>
  )
}
