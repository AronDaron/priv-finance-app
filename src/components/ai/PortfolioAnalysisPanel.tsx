import type { AIReport } from '../../lib/types'
import { MarkdownRenderer } from './MarkdownRenderer'

interface Props {
  report: AIReport | null
  isAnalyzing: boolean
  onAnalyze: () => void
}

export default function PortfolioAnalysisPanel({ report, isAnalyzing, onAnalyze }: Props) {
  return (
    <div className="glass-card rounded-lg p-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-white font-semibold text-base">Analiza całego portfela</h2>
          {report && (
            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
              <span>{report.model}</span>
              <span>·</span>
              <span>{new Date(report.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          )}
        </div>
        <button
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium
            bg-finance-green hover:bg-emerald-400 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isAnalyzing ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analizowanie portfela...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {report ? 'Odśwież analizę' : 'Analizuj Portfel'}
            </>
          )}
        </button>
      </div>

      {/* Body */}
      <div className="border-t border-gray-700 pt-4">
        {isAnalyzing ? (
          <div className="text-gray-500 text-sm italic">
            Generowanie analizy portfela (Manager AI)... Może to potrwać do 30 sekund.
          </div>
        ) : report ? (
          <MarkdownRenderer content={report.report_text} />
        ) : (
          <div className="text-gray-500 text-sm italic">
            Kliknij „Analizuj Portfel", aby wygenerować kompleksową ocenę dywersyfikacji i ryzyka.
          </div>
        )}
      </div>
    </div>
  )
}
