// src/components/ai/AdvisorView.tsx
// Doradca — użytkownik opisuje własnymi słowami, czego szuka, a model dostaje jego
// wytyczne razem z kompletem realnych danych o spółkach i sam dobiera rekomendację.
//
// Dane pochodzą wyłącznie z Yahoo Finance. Wewnętrzny scoring aplikacji (zakładka
// Scoring) celowo nie bierze tu udziału — model dostaje fakty, nie nasze oceny.

import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import type { StockProfile, AIReport, AdvisorFilters, ActiveAIConfig } from '../../lib/types'
import { fetchAdvisorCandidates, analyzeAdvisor, getAssets, getActiveAIConfig } from '../../lib/api'
import { MarkdownRenderer } from './MarkdownRenderer'
import { useAIRun } from '../../lib/useAIRun'
import AIProgressIndicator from './AIProgressIndicator'

const EXCHANGES = [
  { key: 'WSE', label: 'GPW' },
  { key: 'NYQ', label: 'NYSE' },
  { key: 'NMS', label: 'NASDAQ' },
  { key: 'LSE', label: 'LSE' },
  { key: 'GER', label: 'XETRA' },
  { key: 'PAR', label: 'Euronext' },
  { key: 'JPX', label: 'TSE' },
]

const EXAMPLES = [
  'Szukam stabilnej spółki dywidendowej, która nie obniżała wypłat',
  'Która spółka jest najbardziej niedowartościowana?',
  'Interesuje mnie sektor energetyczny — co wygląda najlepiej?',
  'Chcę spółkę wzrostową o wysokich marżach i niskim zadłużeniu',
]

const DISCLAIMER =
  'Informacje generowane przez AI mają charakter wyłącznie informacyjny i nie stanowią porady ' +
  'inwestycyjnej ani rekomendacji w rozumieniu przepisów prawa. Decyzje inwestycyjne podejmuj ' +
  'na własną odpowiedzialność — w razie wątpliwości skonsultuj się z licencjonowanym doradcą finansowym.'

function pct(v: number | null, digits = 1): string {
  return v != null ? (v * 100).toFixed(digits) + '%' : '—'
}

export default function AdvisorView() {
  const [exchange, setExchange] = useState('WSE')
  const [query, setQuery] = useState('')
  const [profiles, setProfiles] = useState<StockProfile[]>([])
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<AIReport | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [portfolioTickers, setPortfolioTickers] = useState<Set<string>>(new Set())
  const [aiConfig, setAiConfig] = useState<ActiveAIConfig | null>(null)
  const [dividendOnly, setDividendOnly] = useState(false)
  const [showData, setShowData] = useState(false)

  const { running: analyzing, progress, elapsedMs, run, cancel } = useAIRun()

  useEffect(() => {
    getActiveAIConfig().then(setAiConfig).catch(() => setAiConfig(null))
    getAssets()
      .then(a => setPortfolioTickers(new Set(a.map(x => x.ticker.toUpperCase()))))
      .catch(() => { /* portfel opcjonalny */ })
  }, [])

  const loadData = useCallback(async (force = false) => {
    setLoadingData(true)
    setError(null)
    try {
      const result = await fetchAdvisorCandidates(exchange, force)
      setProfiles(result.profiles)
      setLastFetchedAt(result.lastFetchedAt)
      setSelected(new Set())
      if (result.error) setError(result.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania danych o spółkach.')
      setProfiles([])
    } finally {
      setLoadingData(false)
    }
  }, [exchange])

  const handleAsk = async () => {
    if (!query.trim()) {
      setError('Napisz, czego szukasz.')
      return
    }
    setError(null)
    setReport(null)
    try {
      // Brak danych w cache — pobierz je automatycznie, użytkownik nie musi o tym pamiętać
      let available = profiles
      if (available.length === 0) {
        const result = await fetchAdvisorCandidates(exchange, false)
        available = result.profiles
        setProfiles(available)
        setLastFetchedAt(result.lastFetchedAt)
        if (available.length === 0) {
          setError(result.error ?? 'Nie udało się pobrać danych o spółkach.')
          return
        }
      }
      const filters: AdvisorFilters = { dividendOnly }
      const r = await run(requestId =>
        analyzeAdvisor(exchange, query.trim(), [...selected], filters, requestId)
      )
      setReport(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd analizy.')
    }
  }

  const toggle = (ticker: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(ticker)) next.delete(ticker)
      else next.add(ticker)
      return next
    })
  }

  const visible = dividendOnly ? profiles.filter(p => (p.dividendYield ?? 0) > 0) : profiles
  const exchangeLabel = EXCHANGES.find(e => e.key === exchange)?.label ?? exchange

  return (
    <div className="p-6 space-y-5">
      {/* Nagłówek */}
      <div>
        <h1 className="text-white text-xl font-bold">Doradca</h1>
        <p className="text-gray-500 text-xs mt-0.5">
          Opisz, czego szukasz — AI przeanalizuje spółki na podstawie realnych danych z Yahoo Finance
          {aiConfig && ` · model: ${aiConfig.models.advisor || '—'}`}
          {aiConfig?.provider === 'local' && ' (serwer lokalny)'}
        </p>
      </div>

      {/* Zapytanie */}
      <div className="glass-card rounded-xl p-4 space-y-3">
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAsk() }}
          placeholder="Np. „szukam spółki dywidendowej z sektora energetycznego, która regularnie podnosi wypłaty”"
          rows={3}
          disabled={analyzing}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm
            placeholder-gray-600 resize-none focus:outline-none focus:border-finance-green disabled:opacity-50"
        />

        {!query && (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => setQuery(ex)}
                className="text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10
                  border border-gray-700/50 hover:border-gray-600 px-3 py-1.5 rounded-full transition-all"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {/* Giełda */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 mr-1">Giełda:</span>
          {EXCHANGES.map(ex => (
            <button
              key={ex.key}
              onClick={() => { setExchange(ex.key); setProfiles([]); setReport(null); setLastFetchedAt(null); setSelected(new Set()) }}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                exchange === ex.key ? 'bg-finance-green text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {ex.label}
            </button>
          ))}
        </div>

        {/* Akcje */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={dividendOnly} onChange={e => setDividendOnly(e.target.checked)}
                className="accent-finance-green" />
              tylko wypłacające dywidendę
            </label>
            {profiles.length > 0 && (
              <>
                <button onClick={() => setShowData(v => !v)} className="underline hover:text-gray-300">
                  {showData ? 'ukryj dane' : `podgląd danych (${visible.length})`}
                </button>
                {selected.size > 0 && <span className="text-finance-green">zaznaczono {selected.size}</span>}
                {lastFetchedAt && (
                  <span>dane z {new Date(lastFetchedAt.endsWith('Z') ? lastFetchedAt : lastFetchedAt + 'Z')
                    .toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</span>
                )}
                <button onClick={() => loadData(true)} disabled={loadingData} className="underline hover:text-gray-300 disabled:opacity-50">
                  odśwież dane
                </button>
              </>
            )}
          </div>
          <button
            onClick={handleAsk}
            disabled={analyzing || loadingData || !query.trim()}
            className="px-5 py-2 rounded-md text-sm font-medium bg-finance-green hover:bg-emerald-600
              text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {selected.size > 0 ? `Zapytaj o zaznaczone (${selected.size})` : 'Zapytaj AI'}
          </button>
        </div>
      </div>

      {/* Błąd */}
      {error && (
        <div className="bg-red-900/30 border border-red-600 rounded-lg p-4 flex items-center justify-between gap-4">
          <span className="text-red-300 text-sm">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 text-lg leading-none">×</button>
        </div>
      )}

      {/* Pobieranie danych */}
      {loadingData && (
        <div className="glass-card rounded-xl p-4 text-sm text-gray-400">
          Pobieram dane spółek z {exchangeLabel}… to potrwa kilkadziesiąt sekund.
        </div>
      )}

      {/* Podgląd danych przekazywanych modelowi */}
      {showData && visible.length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-700/50">
            Dane przekazywane modelowi. Zaznacz spółki, żeby zawęzić analizę tylko do nich.
          </div>
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#1f2937]">
                <tr className="text-gray-400 text-xs">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 text-left">Spółka</th>
                  <th className="px-3 py-2 text-right">P/E</th>
                  <th className="px-3 py-2 text-right">Przychody r/r</th>
                  <th className="px-3 py-2 text-right">Marża netto</th>
                  <th className="px-3 py-2 text-right">Dywidenda</th>
                  <th className="px-3 py-2 text-right">Lat wypłat</th>
                  <th className="px-3 py-2 text-left">Sektor</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(p => (
                  <tr key={p.ticker} className="border-t border-gray-700/50 hover:bg-white/5">
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={selected.has(p.ticker)} onChange={() => toggle(p.ticker)}
                        className="accent-finance-green" />
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/stock/${p.ticker}`} className="text-finance-green font-medium hover:underline">{p.ticker}</Link>
                      <span className="text-gray-500 text-xs ml-2">{p.name}</span>
                      {portfolioTickers.has(p.ticker.toUpperCase()) && (
                        <span className="ml-2 text-[10px] text-emerald-400 bg-emerald-900/30 px-1.5 py-0.5 rounded">w portfelu</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300">{p.trailingPE?.toFixed(1) ?? '—'}</td>
                    <td className={`px-3 py-2 text-right ${
                      p.revenueGrowth == null ? 'text-gray-500' : p.revenueGrowth >= 0 ? 'text-finance-green' : 'text-finance-red'
                    }`}>{pct(p.revenueGrowth)}</td>
                    <td className="px-3 py-2 text-right text-gray-300">{pct(p.profitMargins)}</td>
                    <td className="px-3 py-2 text-right text-gray-300">
                      {(p.dividendYield ?? 0) > 0 ? pct(p.dividendYield, 2) : '—'}
                      {p.yieldIsEstimated && <span className="text-amber-400 ml-0.5" title="Policzona z historii wypłat">*</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300">{p.streakYears || '—'}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{p.sector ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analiza */}
      {(analyzing || report) && (
        <div className="glass-card rounded-xl p-5">
          {report && !analyzing && (
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-4 pb-4 border-b border-gray-700">
              <span>{report.model}</span>
              <span>·</span>
              <span>{new Date(report.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
          )}
          {analyzing ? (
            <AIProgressIndicator
              progress={progress}
              elapsedMs={elapsedMs}
              onCancel={cancel}
              idleLabel="Przygotowuję dane spółek…"
            />
          ) : report ? (
            <MarkdownRenderer content={report.report_text} />
          ) : null}
        </div>
      )}

      {/* Nota prawna — renderowana z kodu, niezależnie od treści raportu */}
      <p className="text-[11px] text-gray-600 border-t border-gray-800 pt-3">⚠️ {DISCLAIMER}</p>
    </div>
  )
}
