// src/components/scoring/ScoringTable.tsx
// Tabela rankingowa spółek — Simple i Extended view.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { StockScoringResult, StockSubScore, ScreenerViewMode } from '../../lib/types'
import ScoreBar, { scoreColor } from './ScoreBar'

interface ScoringTableProps {
  stocks: StockScoringResult[]
  mode: ScreenerViewMode
  lookbackDays: number
}

type SortKey = 'totalScore' | 'profitabilityScore' | 'safetyScore' | 'valuationScore' | 'dataCoverage' | 'marketCap'

function fmt(v: number | null, decimals = 1, suffix = ''): string {
  if (v == null) return '—'
  return `${v.toFixed(decimals)}${suffix}`
}

function fmtPct(v: number | null): string {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

function fmtMarketCap(v: number | null): string {
  if (v == null) return '—'
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`
  return v.toFixed(0)
}

function SubCell({ sub }: { sub: StockSubScore }) {
  if (sub.score == null) return <span className="text-gray-500">—</span>
  const color = scoreColor(sub.score)
  return (
    <span className={`font-medium ${color}`}>
      {sub.value != null ? fmt(sub.value) : fmt(sub.score)}
    </span>
  )
}

function PeerCell({ sub }: { sub: StockSubScore }) {
  if (sub.rank == null) return <span className="text-gray-500">—</span>
  const rank = sub.rank
  const arrow = rank >= 60 ? '↑' : rank <= 40 ? '↓' : '—'
  const color = rank >= 60 ? 'text-finance-green' : rank <= 40 ? 'text-red-400' : 'text-gray-400'
  return <span className={`font-medium ${color}`}>{arrow}</span>
}

function DataCoverageBadge({ pct }: { pct: number }) {
  const color = pct >= 70 ? 'text-gray-300' : pct >= 40 ? 'text-yellow-400' : 'text-red-400'
  return <span className={`text-xs ${color}`}>{pct}%</span>
}

export default function ScoringTable({ stocks, mode, lookbackDays }: ScoringTableProps) {
  const navigate = useNavigate()
  const [sortKey, setSortKey] = useState<SortKey>('totalScore')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...stocks].sort((a, b) => {
    const av = (a[sortKey] as number | null) ?? -Infinity
    const bv = (b[sortKey] as number | null) ?? -Infinity
    return sortDir === 'desc' ? bv - av : av - bv
  })

  function SortTh({ k, children }: { k: SortKey; children: React.ReactNode }) {
    const active = sortKey === k
    return (
      <th
        className={`px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap
          ${active ? 'text-white' : 'text-gray-400'} hover:text-white transition-colors`}
        onClick={() => handleSort(k)}
      >
        {children}
        {active && <span className="ml-1 opacity-70">{sortDir === 'desc' ? '▼' : '▲'}</span>}
      </th>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-[#0f1923] text-gray-400 sticky top-0 z-10">
            {/* ── Simple columns ── */}
            <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">#</th>
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Ticker / Spółka</th>
            <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Giełda</th>
            <SortTh k="marketCap">Market Cap</SortTh>
            <SortTh k="profitabilityScore">Profitability</SortTh>
            <SortTh k="safetyScore">Safety</SortTh>
            <SortTh k="valuationScore">Valuation</SortTh>
            <SortTh k="totalScore">Total Score</SortTh>
            <SortTh k="dataCoverage">% Danych</SortTh>

            {/* ── Extended: Profitability ── */}
            {mode === 'extended' && <>
              <th colSpan={6} className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-blue-400 border-l border-gray-700 whitespace-nowrap bg-blue-950/30">
                PROFITABILITY
              </th>
            </>}

            {/* ── Extended: Safety ── */}
            {mode === 'extended' && <>
              <th colSpan={5} className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-emerald-400 border-l border-gray-700 whitespace-nowrap bg-emerald-950/30">
                SAFETY
              </th>
            </>}

            {/* ── Extended: Valuation ── */}
            {mode === 'extended' && <>
              <th colSpan={5} className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-purple-400 border-l border-gray-700 whitespace-nowrap bg-purple-950/30">
                VALUATION
              </th>
            </>}
          </tr>

          {/* Sub-headers for extended */}
          {mode === 'extended' && (
            <tr className="bg-[#0f1923] text-gray-500 sticky top-8 z-10">
              {/* Simple placeholders */}
              <th /><th /><th /><th /><th /><th /><th /><th /><th />
              {/* Profitability */}
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide border-l border-gray-700 bg-blue-950/20">Rev. Growth</th>
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide bg-blue-950/20">Rev. vs Peers</th>
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide bg-blue-950/20">Earn. Growth</th>
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide bg-blue-950/20">Fwd EPS</th>
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide bg-blue-950/20">Gross Margin</th>
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide bg-blue-950/20">Net Margin</th>
              {/* Safety */}
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide border-l border-gray-700 bg-emerald-950/20">Beta</th>
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide bg-emerald-950/20">Debt/Cash</th>
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide bg-emerald-950/20">Short Int.</th>
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide bg-emerald-950/20">Analyst</th>
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide bg-emerald-950/20">Mom. {lookbackDays}d</th>
              {/* Valuation */}
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide border-l border-gray-700 bg-purple-950/20">Trail. P/E</th>
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide bg-purple-950/20">Fwd P/E</th>
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide bg-purple-950/20">PEG</th>
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide bg-purple-950/20">52W High</th>
              <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide bg-purple-950/20">Div Yield</th>
            </tr>
          )}
        </thead>

        <tbody>
          {sorted.map((stock, idx) => {
            const muted = stock.dataCoverage < 33
            return (
              <tr
                key={stock.ticker}
                className="border-t border-gray-800 hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => navigate(`/stock/${stock.ticker}`)}
              >
                {/* Rank */}
                <td className="px-3 py-2 text-center text-gray-400 text-sm">{idx + 1}</td>

                {/* Ticker + Name */}
                <td className="px-3 py-2 text-left min-w-[140px]">
                  <div className="font-bold text-white text-sm">{stock.ticker}</div>
                  <div className="text-gray-400 text-xs truncate max-w-[160px]">{stock.name}</div>
                </td>

                {/* Exchange */}
                <td className="px-3 py-2 text-center">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 font-mono">
                    {stock.exchange}
                  </span>
                </td>

                {/* Market Cap */}
                <td className="px-3 py-2 text-center text-gray-300 text-sm">
                  {fmtMarketCap(stock.marketCap)}
                </td>

                {/* Category scores */}
                <td className="px-3 py-2 text-center">
                  <ScoreBar score={stock.profitabilityScore} compact muted={muted} />
                </td>
                <td className="px-3 py-2 text-center">
                  <ScoreBar score={stock.safetyScore} compact muted={muted} />
                </td>
                <td className="px-3 py-2 text-center">
                  <ScoreBar score={stock.valuationScore} compact muted={muted} />
                </td>

                {/* Total Score — bigger */}
                <td className="px-3 py-2 text-center">
                  <div className={`font-bold text-base ${muted ? 'text-gray-500' : scoreColor(stock.totalScore)}`}>
                    {stock.totalScore != null ? stock.totalScore.toFixed(1) : '—'}
                  </div>
                </td>

                {/* % Danych */}
                <td className="px-3 py-2 text-center">
                  <DataCoverageBadge pct={stock.dataCoverage} />
                </td>

                {/* ── Extended: Profitability ── */}
                {mode === 'extended' && <>
                  <td className="px-2 py-2 text-center border-l border-gray-800"><SubCell sub={stock.sub.revenueGrowth} /></td>
                  <td className="px-2 py-2 text-center"><PeerCell sub={stock.sub.revenueGrowthVsPeers} /></td>
                  <td className="px-2 py-2 text-center"><SubCell sub={stock.sub.earningsGrowth} /></td>
                  <td className="px-2 py-2 text-center"><SubCell sub={stock.sub.forwardEpsGrowth} /></td>
                  <td className="px-2 py-2 text-center"><SubCell sub={stock.sub.grossMargin} /></td>
                  <td className="px-2 py-2 text-center"><SubCell sub={stock.sub.netMargin} /></td>
                </>}

                {/* ── Extended: Safety ── */}
                {mode === 'extended' && <>
                  <td className="px-2 py-2 text-center border-l border-gray-800">
                    <span className="text-gray-300 text-xs">{fmt(stock.sub.beta.value, 2)}</span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="text-gray-300 text-xs">{fmt(stock.sub.debtCashRatio.value, 2)}</span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="text-gray-300 text-xs">{fmtPct(stock.sub.shortInterest.value)}</span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <SubCell sub={stock.sub.analystConsensus} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className={`text-xs font-medium ${stock.sub.priceMomentum.value != null ? (stock.sub.priceMomentum.value >= 0 ? 'text-finance-green' : 'text-red-400') : 'text-gray-500'}`}>
                      {fmtPct(stock.sub.priceMomentum.value)}
                    </span>
                  </td>
                </>}

                {/* ── Extended: Valuation ── */}
                {mode === 'extended' && <>
                  <td className="px-2 py-2 text-center border-l border-gray-800">
                    <span className="text-gray-300 text-xs">{fmt(stock.sub.trailingPE.value, 1)}</span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="text-gray-300 text-xs">{fmt(stock.sub.forwardPE.value, 1)}</span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="text-gray-300 text-xs">{fmt(stock.sub.pegRatio.value, 2)}</span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="text-gray-300 text-xs">{fmtPct(stock.sub.priceVs52wHigh.value)}</span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className="text-gray-300 text-xs">{fmtPct(stock.sub.dividendYield.value)}</span>
                  </td>
                </>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
