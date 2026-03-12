import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getQuote, getHistory, getFundamentals, getTechnicals, getDividends } from '../../lib/api'
import type { StockQuote, OHLCCandle, FundamentalData, TechnicalIndicators, DividendEntry, HistoryPeriod } from '../../lib/types'
import { CandlestickChart } from '../charts/CandlestickChart'
import QuoteHeader from './QuoteHeader'
import TechnicalsPanel from './TechnicalsPanel'
import FundamentalsPanel from './FundamentalsPanel'
import DividendsPanel from './DividendsPanel'
import AddAssetModal from '../portfolio/AddAssetModal'
import LoadingSpinner from '../ui/LoadingSpinner'
import ErrorMessage from '../ui/ErrorMessage'

const PERIODS: HistoryPeriod[] = ['1mo', '3mo', '6mo', '1y', '2y', '5y']

export default function StockDetailView() {
  const { ticker } = useParams<{ ticker: string }>()
  const navigate = useNavigate()

  const [quote, setQuote] = useState<StockQuote | null>(null)
  const [candles, setCandles] = useState<OHLCCandle[]>([])
  const [fundamentals, setFundamentals] = useState<FundamentalData | null>(null)
  const [technicals, setTechnicals] = useState<TechnicalIndicators | null>(null)
  const [dividends, setDividends] = useState<DividendEntry[]>([])
  const [period, setPeriod] = useState<HistoryPeriod>('1y')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    setError(null)
    Promise.all([
      getQuote(ticker),
      getHistory(ticker, period),
      getFundamentals(ticker),
      getTechnicals(ticker, period),
      getDividends(ticker),
    ])
      .then(([q, c, f, t, d]) => {
        setQuote(q); setCandles(c); setFundamentals(f); setTechnicals(t); setDividends(d)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [ticker])

  useEffect(() => {
    if (!ticker) return
    Promise.all([getHistory(ticker, period), getTechnicals(ticker, period)])
      .then(([c, t]) => { setCandles(c); setTechnicals(t) })
      .catch(() => {})
  }, [period])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Wstecz
        </button>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-finance-green hover:bg-emerald-600 text-white font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Dodaj do portfela
        </button>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && quote && (
        <div className="space-y-5">
          <QuoteHeader quote={quote} />

          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p ? 'bg-finance-green text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {candles.length > 0 && (
            <div className="bg-finance-card rounded-xl border border-gray-700 p-4">
              <CandlestickChart data={candles} ticker={quote.ticker} height={400} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {technicals && <TechnicalsPanel technicals={technicals} currentPrice={quote.price} />}
            {fundamentals && <FundamentalsPanel fundamentals={fundamentals} />}
          </div>

          <DividendsPanel dividends={dividends} />
        </div>
      )}

      {showAddModal && (
        <AddAssetModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
