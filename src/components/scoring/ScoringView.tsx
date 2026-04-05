// src/components/scoring/ScoringView.tsx
// Panel Scoring — tabela rankingowa top 20 spółek per giełda.
// Dane pobierane automatycznie via yf.screener + quoteSummary + algorytm scoringowy.

import { useState, useCallback } from 'react'
import type { ScreenerExchangeResult, ScreenerViewMode } from '../../lib/types'
import { fetchScoringExchange } from '../../lib/api'
import ScoringTable from './ScoringTable'

const EXCHANGES = [
  { key: 'NYQ',  label: 'NYSE' },
  { key: 'NMS',  label: 'NASDAQ' },
  { key: 'LSE',  label: 'LSE' },
  { key: 'GER',  label: 'XETRA' },
  { key: 'JPX',  label: 'TSE' },
  { key: 'PAR',  label: 'Euronext' },
  { key: 'WSE',  label: 'GPW' },
]

const LOOKBACK_OPTIONS = [
  { value: 14,  label: '14 dni' },
  { value: 30,  label: '30 dni' },
  { value: 60,  label: '60 dni' },
  { value: 90,  label: '90 dni' },
]

export default function ScoringView() {
  const [activeExchange, setActiveExchange] = useState('NYQ')
  const [lookbackDays, setLookbackDays] = useState(30)
  const [viewMode, setViewMode] = useState<ScreenerViewMode>('simple')
  const [results, setResults] = useState<Record<string, ScreenerExchangeResult>>({})
  const [loadingExchanges, setLoadingExchanges] = useState<Set<string>>(new Set())

  const loadExchange = useCallback(async (exchange: string, force = false) => {
    if (loadingExchanges.has(exchange)) return

    setLoadingExchanges(prev => new Set(prev).add(exchange))
    setResults(prev => ({
      ...prev,
      [exchange]: {
        exchange,
        exchangeLabel: EXCHANGES.find(e => e.key === exchange)?.label ?? exchange,
        stocks: prev[exchange]?.stocks ?? [],
        lastFetchedAt: prev[exchange]?.lastFetchedAt ?? null,
        isLoading: true,
        error: null,
      },
    }))

    try {
      const result = await fetchScoringExchange(exchange, lookbackDays, force)
      setResults(prev => ({ ...prev, [exchange]: result }))
    } catch (e: any) {
      setResults(prev => ({
        ...prev,
        [exchange]: {
          exchange,
          exchangeLabel: EXCHANGES.find(ex => ex.key === exchange)?.label ?? exchange,
          stocks: prev[exchange]?.stocks ?? [],
          lastFetchedAt: prev[exchange]?.lastFetchedAt ?? null,
          isLoading: false,
          error: e?.message ?? 'Błąd pobierania danych',
        },
      }))
    } finally {
      setLoadingExchanges(prev => {
        const next = new Set(prev)
        next.delete(exchange)
        return next
      })
    }
  }, [lookbackDays, loadingExchanges])

  function handleTabChange(exchange: string) {
    setActiveExchange(exchange)
    if (!results[exchange] || results[exchange].stocks.length === 0) {
      loadExchange(exchange)
    }
  }

  function handleLookbackChange(days: number) {
    setLookbackDays(days)
    // Wyczyść cache dla aktywnej giełdy — wymusi ponowny fetch
    setResults(prev => {
      const next = { ...prev }
      delete next[activeExchange]
      return next
    })
  }

  const current = results[activeExchange]
  const isLoading = loadingExchanges.has(activeExchange)

  return (
    <div className="flex flex-col h-full bg-finance-dark text-white">
      {/* ── Nagłówek ── */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-800">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Stock Scoring System</h1>
            <p className="text-gray-400 text-sm mt-1">
              Top 20 spółek per giełda — ranking Profitability / Safety / Valuation
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Lookback */}
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Lookback:</span>
              <select
                className="bg-[#1f2937] border border-gray-600 text-white text-sm rounded px-2 py-1 focus:outline-none focus:border-finance-green"
                value={lookbackDays}
                onChange={e => handleLookbackChange(Number(e.target.value))}
              >
                {LOOKBACK_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Extended View toggle */}
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Extended View:</span>
              <button
                onClick={() => setViewMode(v => v === 'simple' ? 'extended' : 'simple')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none
                  ${viewMode === 'extended' ? 'bg-finance-green' : 'bg-gray-600'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${viewMode === 'extended' ? 'translate-x-6' : 'translate-x-1'}`}
                />
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={() => loadExchange(activeExchange, true)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm text-white disabled:opacity-50 transition-colors"
            >
              <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Odśwież
            </button>
          </div>
        </div>

        {/* ── Zakładki giełd ── */}
        <div className="flex gap-1 mt-4 flex-wrap">
          {EXCHANGES.map(ex => (
            <button
              key={ex.key}
              onClick={() => handleTabChange(ex.key)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors
                ${activeExchange === ex.key
                  ? 'bg-finance-green text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
            >
              {ex.label}
              {loadingExchanges.has(ex.key) && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              )}
              {results[ex.key]?.stocks?.length > 0 && !loadingExchanges.has(ex.key) && (
                <span className="ml-1.5 text-xs opacity-60">{results[ex.key].stocks.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Zawartość ── */}
      <div className="flex-1 overflow-auto">
        {/* Status bar */}
        {current && (
          <div className="px-6 py-2 flex items-center justify-between text-xs text-gray-500 border-b border-gray-800">
            <span>
              {current.stocks.length > 0
                ? `${current.stocks.length} spółek · ${current.exchangeLabel}`
                : 'Brak danych'}
            </span>
            <span className="flex items-center gap-3">
              {current.lastFetchedAt && (
                <span>Dane z: {new Date(current.lastFetchedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</span>
              )}
              {current.error && (
                <span className="text-yellow-500">⚠ {current.error}</span>
              )}
            </span>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (!current || current.stocks.length === 0) && (
          <div className="px-6 py-8 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-800/50 rounded animate-pulse" />
            ))}
            <p className="text-center text-gray-500 text-sm pt-2">
              Pobieranie danych z Yahoo Finance... może to chwilę potrwać.
            </p>
          </div>
        )}

        {/* Empty state — nie załadowano jeszcze */}
        {!current && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <svg className="w-12 h-12 mb-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-lg font-medium">Kliknij giełdę, żeby załadować ranking</p>
            <p className="text-sm mt-1">Dane pobierane automatycznie — top 20 spółek wg market cap</p>
            <button
              onClick={() => loadExchange(activeExchange)}
              className="mt-6 px-6 py-2 bg-finance-green hover:bg-emerald-600 text-white rounded font-medium transition-colors"
            >
              Załaduj {EXCHANGES.find(e => e.key === activeExchange)?.label}
            </button>
          </div>
        )}

        {/* Tabela */}
        {current && current.stocks.length > 0 && (
          <ScoringTable
            stocks={current.stocks}
            mode={viewMode}
            lookbackDays={lookbackDays}
          />
        )}

        {/* Empty po fetch */}
        {current && current.stocks.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="text-lg">Brak danych dla {current.exchangeLabel}</p>
            {current.error && <p className="text-sm text-yellow-500 mt-2">{current.error}</p>}
            <button
              onClick={() => loadExchange(activeExchange, true)}
              className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
            >
              Spróbuj ponownie
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
