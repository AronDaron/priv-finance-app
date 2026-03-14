import { useState } from 'react'
import type { RegionScore, GlobalAnalysis } from '../../lib/types'
import { analyzeRegionAI } from '../../lib/api'
import { MarkdownRenderer } from '../ai/MarkdownRenderer'

function ComponentBar({ name, contribution, weight }: { name: string; contribution: number; weight: number }) {
  const isPos = contribution >= 0
  const maxWidth = 120 // px
  const barWidth = Math.min(Math.abs(contribution) / 25 * maxWidth, maxWidth)
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-40 text-xs text-gray-400 truncate flex-shrink-0">{name}</div>
      <div className="flex items-center gap-1 flex-1">
        {/* Lewa strona (ujemna) */}
        <div className="flex-1 flex justify-end">
          {!isPos && (
            <div
              className="h-2 rounded-sm bg-finance-red"
              style={{ width: barWidth }}
            />
          )}
        </div>
        {/* Środek */}
        <div className="w-px h-4 bg-gray-600" />
        {/* Prawa strona (pozytywna) */}
        <div className="flex-1">
          {isPos && (
            <div
              className="h-2 rounded-sm bg-finance-green"
              style={{ width: barWidth }}
            />
          )}
        </div>
      </div>
      <div className={`w-14 text-xs text-right font-medium flex-shrink-0 ${isPos ? 'text-finance-green' : 'text-finance-red'}`}>
        {isPos ? '+' : ''}{contribution.toFixed(1)}
      </div>
      <div className="w-8 text-xs text-gray-600 text-right flex-shrink-0">{(weight * 100).toFixed(0)}%</div>
    </div>
  )
}

interface Props {
  region: RegionScore
  analysis: GlobalAnalysis
  newsHeadlines: string[]
  onClose: () => void
}

export default function RegionDetailModal({ region, analysis, newsHeadlines, onClose }: Props) {
  const [aiText, setAiText] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const riskColor = region.risk === 'low' ? 'text-finance-green' : region.risk === 'medium' ? 'text-yellow-400' : 'text-finance-red'
  const scoreColor = region.score >= 65 ? 'text-finance-green' : region.score >= 40 ? 'text-yellow-400' : 'text-finance-red'

  async function handleAnalyzeAI() {
    setAiLoading(true)
    setAiError(null)
    try {
      const text = await analyzeRegionAI(region.id, newsHeadlines)
      setAiText(text)
    } catch (e: any) {
      setAiError(e.message ?? 'Błąd analizy AI')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="glass-card rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700/50">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{region.flag}</span>
            <div>
              <h2 className="text-white text-xl font-bold">{region.name}</h2>
              <p className="text-gray-400 text-sm">
                Potencjał inwestycyjny — <span className={riskColor}>
                  {region.risk === 'low' ? 'niskie ryzyko' : region.risk === 'medium' ? 'średnie ryzyko' : 'wysokie ryzyko'}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className={`text-4xl font-bold ${scoreColor}`}>{region.score}</div>
              <div className="text-gray-500 text-xs">/100</div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Składowe score */}
          <div>
            <h3 className="text-white font-semibold mb-3 text-sm uppercase tracking-wide">Składowe oceny</h3>
            <div className="space-y-0.5">
              {region.components.map(c => (
                <ComponentBar key={c.name} {...c} />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <div className="w-3 h-2 rounded-sm bg-finance-green" />
              <span>pozytywny wpływ</span>
              <div className="w-3 h-2 rounded-sm bg-finance-red ml-2" />
              <span>negatywny wpływ</span>
              <span className="ml-auto">Szerokość paska = siła wpływu</span>
            </div>
          </div>

          {/* AI Analiza */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold text-sm uppercase tracking-wide">Analiza AI</h3>
              {!aiText && !aiLoading && (
                <button
                  onClick={handleAnalyzeAI}
                  className="flex items-center gap-2 bg-finance-green hover:bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Analizuj AI
                </button>
              )}
            </div>

            {aiLoading && (
              <div className="flex items-center gap-3 text-gray-400 py-4">
                <div className="w-5 h-5 border-2 border-finance-green border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Generowanie analizy AI...</span>
              </div>
            )}

            {aiError && (
              <div className="bg-finance-red/10 border border-finance-red/30 rounded-lg p-4 text-finance-red text-sm">
                {aiError}
              </div>
            )}

            {aiText && (
              <div className="bg-gray-800/50 rounded-xl p-4">
                <MarkdownRenderer content={aiText} />
                <button
                  onClick={handleAnalyzeAI}
                  className="mt-4 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  Regeneruj analizę
                </button>
              </div>
            )}

            {!aiText && !aiLoading && !aiError && (
              <div className="text-gray-500 text-sm py-2">
                Kliknij "Analizuj AI" aby wygenerować szczegółową analizę geopolityczną i inwestycyjną tego regionu z uwzględnieniem newsów i danych rynkowych.
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <div className="text-xs text-gray-600 bg-gray-800/30 rounded-lg p-3">
            Ocena algorytmiczna {region.score}/100 i analiza AI mają charakter orientacyjny i nie stanowią rekomendacji inwestycyjnych. Dane z Yahoo Finance, aktualizowane na żądanie.
          </div>
        </div>
      </div>
    </div>
  )
}
