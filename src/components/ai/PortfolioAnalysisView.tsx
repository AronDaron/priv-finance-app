import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { PortfolioAsset, AIReport } from '../../lib/types'
import { getAssets, getReports, getLatestReportByTicker, getSetting, analyzePortfolio } from '../../lib/api'
import { MarkdownRenderer } from './MarkdownRenderer'

export default function PortfolioAnalysisView() {
  const [assets, setAssets] = useState<PortfolioAsset[]>([])
  const [portfolioReport, setPortfolioReport] = useState<AIReport | null>(null)
  const [analyzedCount, setAnalyzedCount] = useState(0)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null)

  useEffect(() => {
    getSetting('openrouter_api_key').then(key => setHasApiKey(!!key))

    getAssets().then(async (all) => {
      const nonBondAssets = all.filter(a => a.asset_type !== 'bond')
      setAssets(nonBondAssets)

      // Policz ile spółek ma raport (obligacje nie mają raportów Worker AI)
      const counts = await Promise.all(
        nonBondAssets.map(a => getLatestReportByTicker(a.ticker).then(r => (r ? 1 : 0) as number))
      )
      setAnalyzedCount(counts.reduce((s, v) => s + v, 0))
    })

    getReports().then(reports => {
      const byTicker: Record<string, AIReport> = {}
      reports.forEach(r => {
        if (!byTicker[r.ticker] || r.created_at > byTicker[r.ticker].created_at) {
          byTicker[r.ticker] = r
        }
      })
      setPortfolioReport(byTicker['__PORTFOLIO__'] ?? null)
    })
  }, [])

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    setError(null)
    try {
      const report = await analyzePortfolio()
      setPortfolioReport(report)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd analizy portfela')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const totalCount = assets.length
  const missingCount = totalCount - analyzedCount

  return (
    <div className="p-6 space-y-5">
      {/* Nagłówek */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-white text-xl font-bold">Analiza Portfela</h1>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || totalCount === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
            bg-finance-green hover:bg-emerald-400 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isAnalyzing ? (
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
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {portfolioReport ? 'Odśwież analizę' : 'Analizuj Portfel'}
            </>
          )}
        </button>
      </div>

      {/* Licznik X/Y */}
      {totalCount > 0 && (
        <div className={`rounded-lg p-4 flex items-center justify-between gap-4 ${
          missingCount > 0
            ? 'bg-yellow-900/30 border border-yellow-600/50'
            : 'bg-emerald-900/20 border border-emerald-700/40'
        }`}>
          <div className="flex items-center gap-3">
            {missingCount > 0 ? (
              <svg className="w-5 h-5 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-finance-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            <span className={`text-sm ${missingCount > 0 ? 'text-yellow-300' : 'text-emerald-300'}`}>
              Analiza bazuje na raportach{' '}
              <span className="font-bold">{analyzedCount}/{totalCount}</span>{' '}
              spółek z portfela.
              {missingCount > 0 && ` Brakuje ${missingCount} ${missingCount === 1 ? 'raportu' : 'raportów'}.`}
            </span>
          </div>
          {missingCount > 0 && (
            <Link
              to="/ai/stocks"
              className="flex-shrink-0 text-sm text-yellow-300 underline hover:text-yellow-100 whitespace-nowrap"
            >
              Przejdź do Spółek →
            </Link>
          )}
        </div>
      )}

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
          <Link to="/settings" className="flex-shrink-0 text-sm text-yellow-300 underline hover:text-yellow-100">
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

      {/* Brak spółek */}
      {totalCount === 0 && (
        <div className="text-gray-500 text-sm italic">Brak spółek w portfelu.</div>
      )}

      {/* Raport portfela */}
      {totalCount > 0 && (
        <div className="glass-card rounded-lg p-5">
          {portfolioReport && (
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-4 pb-4 border-b border-gray-700">
              <span>{portfolioReport.model}</span>
              <span>·</span>
              <span>{new Date(portfolioReport.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          )}
          {isAnalyzing ? (
            <div className="text-gray-500 text-sm italic">
              Generowanie analizy portfela (Manager AI)... Może to potrwać do 30 sekund.
            </div>
          ) : portfolioReport ? (
            <MarkdownRenderer content={portfolioReport.report_text} />
          ) : (
            <div className="text-gray-500 text-sm italic">
              Kliknij „Analizuj Portfel", aby wygenerować kompleksową ocenę dywersyfikacji i ryzyka.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
