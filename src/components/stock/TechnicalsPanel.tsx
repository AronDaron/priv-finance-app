import type { TechnicalIndicators } from '../../lib/types'

interface Props {
  technicals: TechnicalIndicators
  currentPrice: number
}

export default function TechnicalsPanel({ technicals, currentPrice }: Props) {
  const { rsi14, macd, sma20, sma50, sma200, bollingerBands, atr14, adx14 } = technicals

  const rsiColor = !rsi14 ? 'text-gray-300' : rsi14 < 30 ? 'text-finance-green' : rsi14 > 70 ? 'text-finance-red' : 'text-gray-300'
  const rsiLabel = !rsi14 ? '' : rsi14 < 30 ? 'Wyprzedany' : rsi14 > 70 ? 'Wykupiony' : 'Neutralny'

  const smaStatus = (sma: number | null) => {
    if (sma == null) return null
    return currentPrice > sma
      ? <span className="text-finance-green">↑</span>
      : <span className="text-finance-red">↓</span>
  }

  // Bollinger — pozycja ceny względem pasm
  const bbPosition = bollingerBands ? (() => {
    const range = bollingerBands.upper - bollingerBands.lower
    if (range <= 0) return null
    const pos = ((currentPrice - bollingerBands.lower) / range) * 100
    return Math.max(0, Math.min(100, pos))
  })() : null

  const bbLabel = bbPosition == null ? '' : bbPosition > 80 ? 'Blisko górnego pasma' : bbPosition < 20 ? 'Blisko dolnego pasma' : 'Środek pasm'
  const bbLabelColor = bbPosition == null ? '' : bbPosition > 80 ? 'text-finance-red' : bbPosition < 20 ? 'text-finance-green' : 'text-gray-400'

  // ADX — siła trendu
  const adxStrength = adx14 ? (
    adx14.adx < 20 ? { label: 'Brak trendu', color: 'text-gray-400' } :
    adx14.adx < 40 ? { label: 'Słaby trend', color: 'text-yellow-400' } :
    adx14.adx < 60 ? { label: 'Silny trend', color: 'text-finance-green' } :
                     { label: 'Bardzo silny', color: 'text-finance-green' }
  ) : null

  return (
    <div className="glass-card rounded-xl p-5">
      <h3 className="text-lg font-semibold text-white mb-4">Wskaźniki techniczne</h3>

      {/* Wiersz 1: RSI, MACD, SMA */}
      <div className="grid grid-cols-3 gap-4 mb-4">
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
              { label: 'SMA20',  value: sma20  },
              { label: 'SMA50',  value: sma50  },
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

      {/* Separator */}
      <div className="border-t border-gray-700/50 mb-4" />

      {/* Wiersz 2: Bollinger Bands, ATR, ADX */}
      <div className="grid grid-cols-3 gap-4">
        {/* Bollinger Bands */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Bollinger Bands (20)</p>
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
                  <div className="h-1.5 bg-gray-700 rounded overflow-hidden relative">
                    <div
                      className="absolute top-0 h-full w-1 bg-white rounded"
                      style={{ left: `calc(${bbPosition}% - 2px)` }}
                    />
                  </div>
                  <p className={`text-xs mt-1 ${bbLabelColor}`}>{bbLabel}</p>
                </div>
              )}
            </div>
          ) : <p className="text-gray-600 text-sm">N/A</p>}
        </div>

        {/* ATR */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">ATR (14)</p>
          {atr14 != null ? (
            <div>
              <p className="text-2xl font-bold text-gray-300">{atr14.toFixed(2)}</p>
              {currentPrice > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {((atr14 / currentPrice) * 100).toFixed(2)}% ceny
                </p>
              )}
              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                Średni dzienny zasięg ruchu (zmienność bezwzględna)
              </p>
            </div>
          ) : <p className="text-gray-600 text-sm">N/A</p>}
        </div>

        {/* ADX */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">ADX (14)</p>
          {adx14 ? (
            <div>
              <p className={`text-2xl font-bold ${adxStrength?.color ?? 'text-gray-300'}`}>
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
            </div>
          ) : <p className="text-gray-600 text-sm">N/A</p>}
        </div>
      </div>
    </div>
  )
}
