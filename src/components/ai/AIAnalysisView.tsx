import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { PortfolioAsset, AIReport } from '../../lib/types'
import { getAssets, getReports, getSetting, analyzeStock, analyzePortfolio } from '../../lib/api'
import StockAnalysisCard from './StockAnalysisCard'
import PortfolioAnalysisPanel from './PortfolioAnalysisPanel'

export default function AIAnalysisView() {
  const [assets, setAssets] = useState<PortfolioAsset[]>([])
  const [stockReports, setStockReports] = useState<Record<string, AIReport | null>>({})
  const [portfolioReport, setPortfolioReport] = useState<AIReport | null>(null)
  const [analyzing, setAnalyzing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)

  useEffect(() => {
    getSetting('openrouter_api_key').then(key => setHasApiKey(!!key))

    getAssets().then(setAssets)

    getReports().then(reports => {
      const byTicker: Record<string, AIReport> = {}
      reports.forEach(r => {
        if (!byTicker[r.ticker] || r.created_at > byTicker[r.ticker].created_at) {
          byTicker[r.ticker] = r
        }
      })
      setStockReports(byTicker)
      setPortfolioReport(byTicker['__PORTFOLIO__'] ?? null)
    })
  }, [])

  const handleAnalyzeStock = async (ticker: string) => {
    setAnalyzing(ticker)
    setError(null)
    try {
      const report = await analyzeStock(ticker)
      setStockReports(prev => ({ ...prev, [ticker]: report }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd analizy')
    } finally {
      setAnalyzing(null)
    }
  }

  const handleAnalyzePortfolio = async () => {
    setAnalyzing('__PORTFOLIO__')
    setError(null)
    try {
      const report = await analyzePortfolio()
      setPortfolioReport(report)
      // Odśwież raporty spółek (Manager mógł je wygenerować)
      getReports().then(reports => {
        const byTicker: Record<string, AIReport> = {}
        reports.forEach(r => {
          if (!byTicker[r.ticker] || r.created_at > byTicker[r.ticker].created_at) {
            byTicker[r.ticker] = r
          }
        })
        setStockReports(byTicker)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd analizy portfela')
    } finally {
      setAnalyzing(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-white text-xl font-bold">Analiza AI</h1>
        <button
          onClick={handleAnalyzePortfolio}
          disabled={analyzing !== null || assets.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
            bg-finance-green hover:bg-emerald-400 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {analyzing === '__PORTFOLIO__' ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analizowanie...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Analizuj Portfel
            </>
          )}
        </button>
      </div>

      {/* Brak klucza API */}
      {hasApiKey === false && (
        <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-yellow-300 text-sm">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Brak klucza API OpenRouter. Skonfiguruj go w Ustawieniach.
          </div>
          <Link
            to="/settings"
            className="flex-shrink-0 text-sm text-yellow-300 underline hover:text-yellow-100"
          >
            Przejdź do Ustawień →
          </Link>
        </div>
      )}

      {/* Błąd */}
      {error && (
        <div className="bg-red-900/30 border border-red-600 rounded-lg p-4 flex items-center justify-between gap-4">
          <span className="text-red-300 text-sm">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 text-lg leading-none">×</button>
        </div>
      )}

      {/* Portfel pusty */}
      {assets.length === 0 && (
        <div className="text-gray-500 text-sm italic">
          Portfel jest pusty — dodaj spółki przed analizą.
        </div>
      )}

      {/* Panel portfela */}
      {assets.length > 0 && (
        <PortfolioAnalysisPanel
          report={portfolioReport}
          isAnalyzing={analyzing === '__PORTFOLIO__'}
          onAnalyze={handleAnalyzePortfolio}
        />
      )}

      {/* Karty spółek */}
      {assets.length > 0 && (
        <div>
          <h2 className="text-gray-400 text-sm font-medium mb-3">Spółki w portfelu</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {assets.map(asset => (
              <StockAnalysisCard
                key={asset.ticker}
                ticker={asset.ticker}
                name={asset.name}
                report={stockReports[asset.ticker] ?? null}
                isAnalyzing={analyzing === asset.ticker}
                onAnalyze={() => handleAnalyzeStock(asset.ticker)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
