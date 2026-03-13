import type { AIReport } from '../../lib/types'
import { MarkdownRenderer } from './MarkdownRenderer'

interface Props {
  ticker: string
  name: string
  report: AIReport | null
  isAnalyzing: boolean
  onAnalyze: () => void
}

export default function StockAnalysisCard({ ticker, name, report, isAnalyzing, onAnalyze }: Props) {
  return (
    <div className="bg-finance-card border border-gray-700 rounded-lg p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-finance-green font-bold text-sm">{ticker}</span>
          <span className="text-gray-400 text-xs ml-2 truncate">{name}</span>
        </div>
        <button
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
            bg-gray-700 hover:bg-gray-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isAnalyzing ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analizowanie...
            </>
          ) : report ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Odśwież
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Analizuj
            </>
          )}
        </button>
      </div>

      {/* Body */}
      {isAnalyzing ? (
        <div className="text-gray-500 text-xs italic">Generowanie analizy AI...</div>
      ) : report ? (
        <>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>{report.model}</span>
            <span>·</span>
            <span>{new Date(report.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</span>
          </div>
          <div className="border-t border-gray-700 pt-3">
            <MarkdownRenderer content={report.report_text} />
          </div>
        </>
      ) : (
        <div className="text-gray-500 text-xs italic">Brak analizy — kliknij Analizuj, aby wygenerować raport.</div>
      )}
    </div>
  )
}
