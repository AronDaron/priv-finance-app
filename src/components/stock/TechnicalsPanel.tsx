import type { TechnicalIndicators } from '../../lib/types'

interface Props {
  technicals: TechnicalIndicators
  currentPrice: number
}

export default function TechnicalsPanel({ technicals, currentPrice }: Props) {
  const { rsi14, macd, sma20, sma50, sma200 } = technicals

  const rsiColor = !rsi14 ? 'text-gray-300' : rsi14 < 30 ? 'text-finance-green' : rsi14 > 70 ? 'text-finance-red' : 'text-gray-300'
  const rsiLabel = !rsi14 ? '' : rsi14 < 30 ? 'Wyprzedany' : rsi14 > 70 ? 'Wykupiony' : 'Neutralny'

  const smaStatus = (sma: number | null) => {
    if (sma == null) return null
    return currentPrice > sma
      ? <span className="text-finance-green">↑</span>
      : <span className="text-finance-red">↓</span>
  }

  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="text-lg font-semibold text-white mb-4">Wskaźniki techniczne</h3>
      <div className="grid grid-cols-3 gap-4">
        {/* RSI */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">RSI (14)</p>
          <p className={`text-2xl font-bold ${rsiColor}`}>{rsi14?.toFixed(1) ?? 'N/A'}</p>
          {rsiLabel && <p className="text-xs text-gray-500 mt-1">{rsiLabel}</p>}
          {rsi14 != null && (
            <div className="mt-2 h-1.5 bg-gray-700 rounded overflow-hidden">
              <div
                className={`h-full rounded ${rsiColor}`}
                style={{ width: `${Math.min(rsi14, 100)}%`, backgroundColor: 'currentColor' }}
              />
            </div>
          )}
        </div>

        {/* MACD */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">MACD</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Value</span>
              <span className="text-white">{macd.value?.toFixed(3) ?? 'N/A'}</span>
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

        {/* SMA */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">SMA</p>
          <div className="space-y-1 text-sm">
            {[
              { label: 'SMA20', value: sma20 },
              { label: 'SMA50', value: sma50 },
              { label: 'SMA200', value: sma200 },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-gray-500">{label}</span>
                <span className="text-white">
                  {value != null ? value.toFixed(2) : 'N/A'} {smaStatus(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
