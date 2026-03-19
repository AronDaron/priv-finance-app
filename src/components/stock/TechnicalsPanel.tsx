import type { TechnicalIndicators } from '../../lib/types'

interface Props {
  technicals: TechnicalIndicators
  currentPrice: number
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{title}</h4>
      <div className="flex-1 h-px bg-gray-700/50" />
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string
  sublabel?: string
  barColor: string  // hex or gradient string
  barShadow?: string
  barWidth?: number  // 0-100 for progress bar
  children?: React.ReactNode
}

function StatCard({ label, barColor, barShadow, barWidth, value, sublabel, children }: StatCardProps) {
  const isGradient = barColor.startsWith('linear-gradient')
  const barStyle: React.CSSProperties = isGradient
    ? { height: 3, background: barColor, boxShadow: barShadow }
    : { height: 3, background: barColor, boxShadow: barShadow }

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div style={barStyle} />
      <div className="p-4">
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">{label}</p>
        <p className="text-xl font-bold tabular-nums text-white">{value}</p>
        {sublabel && <p className="text-xs text-gray-500 mt-1">{sublabel}</p>}
        {barWidth != null && (
          <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${barWidth}%`, background: barColor }}
            />
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export default function TechnicalsPanel({ technicals, currentPrice }: Props) {
  const { rsi14, macd, sma20, sma50, sma200, bollingerBands, atr14, adx14 } = technicals

  // RSI
  const rsiBarColor = !rsi14 ? '#6366f1' : rsi14 < 30 ? '#10b981' : rsi14 > 70 ? '#ef4444' : '#6366f1'
  const rsiBarShadow = !rsi14 ? 'none' : rsi14 < 30 ? '0 0 8px rgba(16,185,129,0.4)' : rsi14 > 70 ? '0 0 8px rgba(239,68,68,0.4)' : '0 0 8px rgba(99,102,241,0.4)'
  const rsiLabel = !rsi14 ? '' : rsi14 < 30 ? 'Wyprzedany' : rsi14 > 70 ? 'Wykupiony' : 'Neutralny'

  // MACD
  const macdPositive = macd.value != null && macd.value >= 0
  const macdBarColor = macdPositive ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #ef4444, #f87171)'
  const macdBarShadow = macdPositive ? '0 0 8px rgba(16,185,129,0.4)' : '0 0 8px rgba(239,68,68,0.4)'

  // ADX
  const adxBarColor = adx14 && adx14.adx > 25 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #6366f1, #818cf8)'
  const adxBarShadow = adx14 && adx14.adx > 25 ? '0 0 8px rgba(245,158,11,0.4)' : '0 0 8px rgba(99,102,241,0.4)'
  const adxStrength = adx14 ? (
    adx14.adx < 20 ? { label: 'Brak trendu', color: 'text-gray-400' } :
    adx14.adx < 40 ? { label: 'Słaby trend', color: 'text-yellow-400' } :
    adx14.adx < 60 ? { label: 'Silny trend', color: 'text-finance-green' } :
                     { label: 'Bardzo silny', color: 'text-finance-green' }
  ) : null

  // SMA
  const smaStatus = (sma: number | null) => {
    if (sma == null) return null
    return currentPrice > sma
      ? <span className="text-finance-green ml-1">↑</span>
      : <span className="text-finance-red ml-1">↓</span>
  }

  // Bollinger
  const bbPosition = bollingerBands ? (() => {
    const range = bollingerBands.upper - bollingerBands.lower
    if (range <= 0) return null
    const pos = ((currentPrice - bollingerBands.lower) / range) * 100
    return Math.max(0, Math.min(100, pos))
  })() : null
  const bbLabel = bbPosition == null ? '' : bbPosition > 80 ? 'Blisko górnego pasma' : bbPosition < 20 ? 'Blisko dolnego pasma' : 'Środek pasm'
  const bbLabelColor = bbPosition == null ? '' : bbPosition > 80 ? 'text-finance-red' : bbPosition < 20 ? 'text-finance-green' : 'text-gray-400'

  return (
    <div className="glass-card rounded-xl p-5 space-y-5">
      <h3 className="text-lg font-semibold text-white">Wskaźniki techniczne</h3>

      <SectionHeader title="Oscylatory" />
      <div className="grid grid-cols-3 gap-3">
        {/* RSI */}
        <StatCard
          label="RSI (14)"
          value={rsi14?.toFixed(1) ?? 'N/A'}
          sublabel={rsiLabel}
          barColor={rsiBarColor}
          barShadow={rsiBarShadow}
          barWidth={rsi14 != null ? Math.min(rsi14, 100) : undefined}
        />

        {/* MACD */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div style={{ height: 3, background: macdBarColor, boxShadow: macdBarShadow }} />
          <div className="p-4">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">MACD</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Value</span>
                <span className="text-white font-medium">{macd.value?.toFixed(3) ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Signal</span>
                <span className="text-white">{macd.signal?.toFixed(3) ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Hist</span>
                <span className={macd.histogram != null ? (macd.histogram >= 0 ? 'text-finance-green' : 'text-finance-red') : 'text-gray-400'}>
                  {macd.histogram?.toFixed(3) ?? 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ADX */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div style={{ height: 3, background: adxBarColor, boxShadow: adxBarShadow }} />
          <div className="p-4">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">ADX (14)</p>
            {adx14 ? (
              <>
                <p className={`text-xl font-bold tabular-nums ${adxStrength?.color ?? 'text-gray-300'}`}>
                  {adx14.adx.toFixed(1)}
                </p>
                {adxStrength && <p className={`text-xs mt-1 ${adxStrength.color}`}>{adxStrength.label}</p>}
                <div className="space-y-1 text-sm mt-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">+DI</span>
                    <span className="text-finance-green">{adx14.pdi.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">-DI</span>
                    <span className="text-finance-red">{adx14.mdi.toFixed(1)}</span>
                  </div>
                </div>
              </>
            ) : <p className="text-gray-600 text-sm">N/A</p>}
          </div>
        </div>
      </div>

      <SectionHeader title="Średnie kroczące i pasma" />
      <div className="grid grid-cols-3 gap-3">
        {/* SMA */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div style={{ height: 3, background: 'linear-gradient(90deg, #6366f1, #818cf8)', boxShadow: '0 0 8px rgba(99,102,241,0.4)' }} />
          <div className="p-4">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">SMA</p>
            <div className="space-y-1 text-sm">
              {[
                { label: 'SMA20',  value: sma20  },
                { label: 'SMA50',  value: sma50  },
                { label: 'SMA200', value: sma200 },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-gray-500">{label}</span>
                  <span className="text-white">
                    {value != null ? value.toFixed(2) : 'N/A'}{smaStatus(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bollinger Bands */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div style={{ height: 3, background: 'linear-gradient(90deg, #6366f1, #818cf8)', boxShadow: '0 0 8px rgba(99,102,241,0.4)' }} />
          <div className="p-4">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">Bollinger (20)</p>
            {bollingerBands ? (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Górne</span>
                  <span className="text-finance-red">{bollingerBands.upper.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Środek</span>
                  <span className="text-gray-300">{bollingerBands.middle.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Dolne</span>
                  <span className="text-finance-green">{bollingerBands.lower.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">BW%</span>
                  <span className="text-gray-300">{bollingerBands.bandwidth.toFixed(1)}%</span>
                </div>
                {bbPosition != null && (
                  <div className="mt-1.5">
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden relative">
                      <div
                        className="absolute top-0 h-full w-1 bg-white rounded-full"
                        style={{ left: `calc(${bbPosition}% - 2px)` }}
                      />
                    </div>
                    <p className={`text-xs mt-1 ${bbLabelColor}`}>{bbLabel}</p>
                  </div>
                )}
              </div>
            ) : <p className="text-gray-600 text-sm">N/A</p>}
          </div>
        </div>

        {/* ATR */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div style={{ height: 3, background: 'linear-gradient(90deg, #6366f1, #818cf8)', boxShadow: '0 0 8px rgba(99,102,241,0.4)' }} />
          <div className="p-4">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2">ATR (14)</p>
            {atr14 != null ? (
              <div>
                <p className="text-xl font-bold tabular-nums text-gray-300">{atr14.toFixed(2)}</p>
                {currentPrice > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {((atr14 / currentPrice) * 100).toFixed(2)}% ceny
                  </p>
                )}
                <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                  Średni dzienny zasięg ruchu
                </p>
              </div>
            ) : <p className="text-gray-600 text-sm">N/A</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
