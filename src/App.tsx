import { useState, useEffect } from 'react'
import { getQuote, getHistory, getTechnicals, getEnvironmentInfo } from './lib/api'
import { CandlestickChart } from './components/charts/CandlestickChart'
import { StockSearch } from './components/StockSearch'
import type { StockQuote, OHLCCandle, TechnicalIndicators, HistoryPeriod } from './lib/types'

const PERIODS: HistoryPeriod[] = ['1mo', '3mo', '6mo', '1y', '2y', '5y']

export default function App() {
  const [activeTicker, setActiveTicker] = useState<string | null>(null)
  const [period, setPeriod] = useState<HistoryPeriod>('6mo')
  const [quote, setQuote] = useState<StockQuote | null>(null)
  const [candles, setCandles] = useState<OHLCCandle[]>([])
  const [technicals, setTechnicals] = useState<TechnicalIndicators | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const env = getEnvironmentInfo()

  useEffect(() => {
    if (!activeTicker) return
    setLoading(true)
    setError(null)
    Promise.all([
      getQuote(activeTicker),
      getHistory(activeTicker, period),
      getTechnicals(activeTicker, period),
    ])
      .then(([q, h, t]) => { setQuote(q); setCandles(h); setTechnicals(t) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [activeTicker, period])

  const handleSelect = (ticker: string) => setActiveTicker(ticker)

  return (
    <div className="min-h-screen bg-finance-dark text-white p-6">
      {/* Nagłówek */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-finance-green">Finance Tracker — Milestone 3</h1>
        <span className={`text-xs px-3 py-1 rounded-full ${env.backend === 'electron' ? 'bg-finance-green/20 text-finance-green' : 'bg-yellow-500/20 text-yellow-400'}`}>
          {env.backend === 'electron' ? 'Electron (SQLite)' : 'Dev (Mock data)'}
        </span>
      </div>

      {/* Wyszukiwarka */}
      <div className="mb-6">
        <StockSearch onSelect={handleSelect} />
      </div>

      {/* Manual input */}
      <div className="flex gap-3 mb-8">
        <input
          type="text"
          placeholder="lub wpisz ticker ręcznie (np. GC=F)"
          className="flex-1 bg-gray-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-finance-green"
          onKeyDown={e => { if (e.key === 'Enter') setActiveTicker((e.target as HTMLInputElement).value.toUpperCase().trim()) }}
        />
        <button
          onClick={(e) => {
            const input = (e.currentTarget.previousElementSibling as HTMLInputElement)
            if (input.value) setActiveTicker(input.value.toUpperCase().trim())
          }}
          className="px-5 py-2.5 bg-finance-green hover:bg-emerald-500 rounded-lg text-sm font-semibold transition-colors"
        >
          Pobierz dane
        </button>
      </div>

      {/* Stany */}
      {loading && (
        <div className="text-center py-16 text-gray-400">Ładowanie danych dla {activeTicker}...</div>
      )}
      {error && (
        <div className="bg-red-900/30 border border-finance-red rounded-lg p-4 text-finance-red mb-6">
          Błąd: {error}
        </div>
      )}

      {/* Dane spółki */}
      {!loading && quote && (
        <div className="space-y-6">
          {/* Quote card */}
          <div className="bg-finance-card rounded-xl p-6 flex items-start justify-between">
            <div>
              <div className="text-gray-400 text-sm font-mono">{quote.ticker}</div>
              <div className="text-white text-lg font-semibold mt-0.5">{quote.name}</div>
              <div className="text-4xl font-bold mt-3">
                {quote.currency} {quote.price.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
              </div>
              <div className={`text-lg font-semibold mt-1 ${quote.changePercent >= 0 ? 'text-finance-green' : 'text-finance-red'}`}>
                {quote.changePercent >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%)
              </div>
            </div>
            <div className="text-right text-sm text-gray-400">
              <div>Wolumen: {quote.volume.toLocaleString('pl-PL')}</div>
              {quote.marketCap && <div>Market Cap: {(quote.marketCap / 1e9).toFixed(1)}B {quote.currency}</div>}
            </div>
          </div>

          {/* Selektor okresu */}
          <div className="flex gap-2">
            {PERIODS.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === p ? 'bg-finance-green text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Wykres świecowy */}
          {candles.length > 0 && (
            <div className="bg-finance-card rounded-xl p-4">
              <CandlestickChart data={candles} ticker={quote.ticker} height={400} />
            </div>
          )}

          {/* Wskaźniki techniczne */}
          {technicals && (
            <div className="bg-finance-card rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Wskaźniki Techniczne</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-gray-400 text-xs mb-1">RSI(14)</div>
                  <div className={`text-xl font-bold ${!technicals.rsi14 ? 'text-gray-500' : technicals.rsi14 > 70 ? 'text-finance-red' : technicals.rsi14 < 30 ? 'text-finance-green' : 'text-white'}`}>
                    {technicals.rsi14?.toFixed(1) ?? 'N/A'}
                  </div>
                  {technicals.rsi14 && (
                    <div className="text-xs text-gray-500">
                      {technicals.rsi14 > 70 ? 'Wykupiony' : technicals.rsi14 < 30 ? 'Wyprzedany' : 'Neutralny'}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-gray-400 text-xs mb-1">MACD</div>
                  <div className="text-xl font-bold text-white">{technicals.macd.value?.toFixed(3) ?? 'N/A'}</div>
                  <div className="text-xs text-gray-500">Signal: {technicals.macd.signal?.toFixed(3) ?? 'N/A'}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs mb-1">SMA20 / SMA50</div>
                  <div className="text-white text-sm">{technicals.sma20?.toFixed(2) ?? 'N/A'}</div>
                  <div className="text-gray-400 text-sm">{technicals.sma50?.toFixed(2) ?? 'N/A'}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs mb-1">SMA200</div>
                  <div className={`text-xl font-bold ${!technicals.sma200 ? 'text-gray-500' : 'text-white'}`}>
                    {technicals.sma200?.toFixed(2) ?? 'N/A (za mało danych)'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!activeTicker && !loading && (
        <div className="text-center py-20 text-gray-500">
          Wyszukaj spółkę lub wpisz ticker, aby zobaczyć dane
        </div>
      )}
    </div>
  )
}
