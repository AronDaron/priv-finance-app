import { useState, useEffect, useMemo } from 'react'
import { getAssets, getQuote, getCashAccounts, getAssetMeta, getSetting, setSetting } from '../../lib/api'
import type { PortfolioAsset, StockQuote, CashAccount } from '../../lib/types'
import { formatCurrency } from '../../lib/utils'
import LoadingSpinner from '../ui/LoadingSpinner'

// ─── Kategorie ────────────────────────────────────────────────────────────────

interface Category { key: string; label: string }

const CATEGORY_MAP: Record<string, Category> = {
  akcje: { key: 'equity', label: 'Akcje' }, equity: { key: 'equity', label: 'Akcje' },
  etf: { key: 'etf', label: 'ETF' }, fundusz: { key: 'etf', label: 'ETF' },
  złoto: { key: 'commodity', label: 'Złoto / Surowce' },
  srebro: { key: 'commodity', label: 'Złoto / Surowce' },
  ropa: { key: 'commodity', label: 'Złoto / Surowce' },
  surowiec: { key: 'commodity', label: 'Złoto / Surowce' },
  commodity: { key: 'commodity', label: 'Złoto / Surowce' },
  krypto: { key: 'other', label: 'Inne' }, other: { key: 'other', label: 'Inne' },
}

function categorizeAsset(ticker: string, assetType: string, goldGrams?: number): Category {
  if (goldGrams != null && goldGrams > 0) return CATEGORY_MAP.złoto
  if (ticker.endsWith('=F')) return CATEGORY_MAP.złoto
  return CATEGORY_MAP[assetType.toLowerCase()] ?? CATEGORY_MAP.akcje
}

interface CategoryAllocation {
  key: string; label: string
  currentValuePLN: number; currentPct: number; targetPct: number
  assets: { asset: PortfolioAsset; valuePLN: number }[]
}

type Targets = Record<string, number>

// ─── Kolory odchylenia ────────────────────────────────────────────────────────

function accentForDiff(diff: number) {
  const abs = Math.abs(diff)
  if (abs <= 3)  return { bar: 'linear-gradient(90deg,#10b981,#34d399)', color: '#10b981', text: 'text-finance-green' }
  if (abs <= 10) return { bar: 'linear-gradient(90deg,#f59e0b,#fbbf24)', color: '#f59e0b', text: 'text-amber-400' }
  return           { bar: 'linear-gradient(90deg,#ef4444,#f87171)',   color: '#ef4444', text: 'text-red-400' }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPlnRate(c: string, usd: number, eur: number) {
  return c === 'PLN' ? 1 : c === 'USD' ? usd : c === 'EUR' ? eur : 1
}
async function fetchRate(t: string) {
  try { return (await getQuote(t)).price ?? 1 } catch { return 1 }
}

// ─── Komponent ────────────────────────────────────────────────────────────────

export default function RebalancingView() {
  const [assets, setAssets]             = useState<PortfolioAsset[]>([])
  const [quotes, setQuotes]             = useState<Map<string, StockQuote>>(new Map())
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([])
  const [usdPln, setUsdPln]             = useState(4.0)
  const [eurPln, setEurPln]             = useState(4.3)
  const [metaMap, setMetaMap]           = useState<Map<string, string>>(new Map())
  const [targets, setTargets]           = useState<Targets>({})
  const [savedTargets, setSavedTargets] = useState<Targets>({})
  const [investAmount, setInvestAmount] = useState('')
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [list, usd, eur, cash, savedRaw] = await Promise.all([
          getAssets(), fetchRate('USDPLN=X'), fetchRate('EURPLN=X'),
          getCashAccounts(), getSetting('rebalancing_targets'),
        ])
        setAssets(list); setUsdPln(usd); setEurPln(eur); setCashAccounts(cash)
        if (savedRaw) {
          try { const p = JSON.parse(savedRaw) as Targets; setTargets(p); setSavedTargets(p) } catch {}
        }
        const tickers = [...new Set(list.map(a => a.ticker))]
        const [qE, mE] = await Promise.all([
          Promise.all(tickers.map(t => getQuote(t).then(q => [t, q] as [string, StockQuote]).catch(() => null))),
          Promise.all(tickers.map(t => getAssetMeta(t).then(m => [t, m.assetType] as [string, string]).catch(() => [t, 'akcje'] as [string, string]))),
        ])
        const qMap = new Map<string, StockQuote>(); qE.forEach(e => { if (e) qMap.set(e[0], e[1]) }); setQuotes(qMap)
        const mMap = new Map<string, string>(); mE.forEach(([t, tp]) => mMap.set(t, tp)); setMetaMap(mMap)
      } finally { setLoading(false) }
    }
    load()
  }, [])

  const categories = useMemo<CategoryAllocation[]>(() => {
    const catMap = new Map<string, { label: string; items: { asset: PortfolioAsset; valuePLN: number }[] }>()
    let total = 0
    assets.forEach(asset => {
      const q = quotes.get(asset.ticker)
      const val = asset.quantity * (q?.price ?? asset.purchase_price) * toPlnRate(q?.currency ?? asset.currency, usdPln, eurPln)
      total += val
      const { key, label } = categorizeAsset(asset.ticker, metaMap.get(asset.ticker) ?? 'akcje', asset.gold_grams)
      if (!catMap.has(key)) catMap.set(key, { label, items: [] })
      catMap.get(key)!.items.push({ asset, valuePLN: val })
    })
    return Array.from(catMap.entries()).map(([key, { label, items }]) => {
      const val = items.reduce((s, i) => s + i.valuePLN, 0)
      return { key, label, currentValuePLN: val,
               currentPct: total > 0 ? (val / total) * 100 : 0,
               targetPct: targets[key] ?? 0,
               assets: items.sort((a, b) => b.valuePLN - a.valuePLN) }
    }).sort((a, b) => b.currentValuePLN - a.currentValuePLN)
  }, [assets, quotes, metaMap, targets, usdPln, eurPln])

  const totalPLN       = useMemo(() => categories.reduce((s, c) => s + c.currentValuePLN, 0), [categories])
  const cashPLN        = useMemo(() => cashAccounts.reduce((s, a) => s + a.balance * toPlnRate(a.currency, usdPln, eurPln), 0), [cashAccounts, usdPln, eurPln])
  const targetSum      = useMemo(() => Object.values(targets).reduce((s, v) => s + (Number(v) || 0), 0), [targets])
  const targetsValid   = Math.abs(targetSum - 100) < 0.5
  const maxDev         = useMemo(() => categories.reduce((m, c) => Math.max(m, Math.abs(c.currentPct - c.targetPct)), 0), [categories])

  const suggestions = useMemo(() => {
    const invest = parseFloat(investAmount) || 0
    const available = cashPLN + invest
    if (available <= 0 || !targetsValid) return []
    const newTotal = totalPLN + available
    const gaps = categories.map(c => ({ cat: c, gap: Math.max(0, (c.targetPct / 100) * newTotal - c.currentValuePLN) })).filter(g => g.gap > 0)
    const totalGap = gaps.reduce((s, g) => s + g.gap, 0)
    if (totalGap === 0) return []
    return gaps.map(({ cat, gap }) => {
      const buy = (gap / totalGap) * available
      return {
        cat, buyPLN: buy,
        top: cat.assets.slice(0, 3).map(({ asset, valuePLN }) => ({
          ticker: asset.ticker, name: asset.name,
          amt: buy * (cat.currentValuePLN > 0 ? valuePLN / cat.currentValuePLN : 1 / Math.max(1, cat.assets.length)),
        })),
      }
    })
  }, [categories, totalPLN, cashPLN, investAmount, targetsValid])

  async function handleSave() {
    if (!targetsValid) return
    setSaving(true)
    try { await setSetting('rebalancing_targets', JSON.stringify(targets)); setSavedTargets({ ...targets }) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="p-6"><LoadingSpinner /></div>

  const devAcc = accentForDiff(maxDev)

  return (
    <div className="p-6 space-y-4">

      {/* ── Nagłówek ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Rebalansowanie</h2>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium tabular-nums ${targetsValid ? 'text-finance-green' : 'text-amber-400'}`}>
            Suma: {targetSum.toFixed(1)}%
          </span>
          <button onClick={handleSave} disabled={!targetsValid || saving}
            className="bg-finance-green hover:bg-emerald-600 text-white text-sm font-medium px-4 py-1.5 rounded-full
                       ring-2 ring-finance-green/20 hover:ring-finance-green/40 transition-all
                       disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Zapisuję…' : 'Zapisz cele'}
          </button>
        </div>
      </div>

      {/* ── Statystyki — 3 mini karty w jednym wierszu ── */}
      {categories.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'Wartość portfela', value: formatCurrency(totalPLN, 'PLN'), bar: 'linear-gradient(90deg,#6366f1,#818cf8)', valueClass: 'text-white' },
            { label: 'Kategorii',        value: String(categories.length),        bar: 'linear-gradient(90deg,#6366f1,#818cf8)', valueClass: 'text-white' },
            { label: 'Maks. odchylenie', value: `${maxDev.toFixed(1)}%`,          bar: devAcc.bar, valueClass: devAcc.text },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-xl overflow-hidden"
                 style={{ border: '1px solid rgba(75,85,99,0.25)' }}>
              <div style={{ height: 3, background: s.bar }} />
              <div className="px-4 py-3">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">{s.label}</p>
                <p className={`text-xl font-bold tabular-nums ${s.valueClass}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Kategorie ── */}
      {categories.length === 0 && (
        <div className="glass-card rounded-xl p-12 text-center text-gray-500">Brak aktywów w portfelu.</div>
      )}

      <div className="space-y-2">
        {categories.map(cat => {
          const diff = cat.currentPct - cat.targetPct
          const acc  = accentForDiff(diff)
          const unsaved = (targets[cat.key] ?? 0) !== (savedTargets[cat.key] ?? 0)

          return (
            <div key={cat.key} className="glass-card rounded-xl overflow-hidden"
                 style={{ border: '1px solid rgba(75,85,99,0.25)' }}>
              {/* Cienki pasek koloru na górze */}
              <div style={{ height: 3, background: acc.bar }} />

              <div className="px-5 py-4">
                {/* Wiersz 1: Nazwa + wartość | Odchylenie | Obecny | Cel */}
                <div className="flex items-center gap-6 mb-4">
                  {/* Lewa: nazwa kategorii + wartość PLN */}
                  <div style={{ minWidth: 160 }}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-base font-semibold text-white">{cat.label}</span>
                      {unsaved && <span className="text-xs text-amber-400/80">●</span>}
                    </div>
                    <p className="text-xs text-gray-500 tabular-nums">{formatCurrency(cat.currentValuePLN, 'PLN')}</p>
                  </div>

                  {/* Spacer */}
                  <div style={{ flex: 1 }} />

                  {/* Odchylenie */}
                  {cat.targetPct > 0 && (
                    <span className={`text-sm font-semibold tabular-nums ${acc.text}`}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                    </span>
                  )}

                  {/* Separator */}
                  <div style={{ width: 1, height: 40, backgroundColor: 'rgba(75,85,99,0.4)' }} />

                  {/* Obecny */}
                  <div className="text-right" style={{ minWidth: 72 }}>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Obecny</p>
                    <p className="text-2xl font-bold text-white tabular-nums">{cat.currentPct.toFixed(1)}%</p>
                  </div>

                  {/* Separator */}
                  <div style={{ width: 1, height: 40, backgroundColor: 'rgba(75,85,99,0.4)' }} />

                  {/* Cel — input */}
                  <div style={{ minWidth: 80 }}>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Cel</p>
                    <div className="flex items-baseline gap-1">
                      <input
                        type="number" min={0} max={100} step={1}
                        value={targets[cat.key] ?? ''}
                        onChange={e => setTargets(prev => ({ ...prev, [cat.key]: parseFloat(e.target.value) || 0 }))}
                        style={{ width: 64, background: '#1f2937', border: '1px solid rgba(75,85,99,0.6)', borderRadius: 8,
                                 padding: '2px 8px', fontSize: 22, fontWeight: 700, color: '#fff',
                                 textAlign: 'right', outline: 'none' }}
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                  </div>
                </div>

                {/* Wiersz 2: Pasek postępu */}
                <div className="relative mb-3" style={{ height: 10, background: '#1f2937', borderRadius: 9999 }}>
                  {cat.targetPct > 0 && (
                    <div style={{
                      position: 'absolute', top: -5, height: 20, width: 2, borderRadius: 9999, zIndex: 10,
                      left: `${Math.min(cat.targetPct, 100)}%`,
                      backgroundColor: acc.color, opacity: 0.8,
                    }} />
                  )}
                  <div style={{
                    height: '100%', borderRadius: 9999,
                    width: `${Math.min(cat.currentPct, 100)}%`,
                    background: acc.bar,
                    transition: 'width 0.5s',
                  }} />
                </div>

                {/* Wiersz 3: Tickery */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
                  {cat.assets.map(({ asset, valuePLN }) => (
                    <span key={asset.ticker} style={{ fontSize: 13 }}>
                      <span style={{ fontWeight: 600, color: acc.color }}>{asset.ticker}</span>
                      <span style={{ color: '#6b7280', marginLeft: 5 }}>
                        {totalPLN > 0 ? ((valuePLN / totalPLN) * 100).toFixed(1) : '0'}%
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Sugestie zakupów ── */}
      {categories.length > 0 && (
        <div className="glass-card rounded-xl overflow-hidden" style={{ border: '1px solid rgba(75,85,99,0.25)' }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg,#6366f1,#818cf8)' }} />
          <div className="px-5 py-4 space-y-3">
            {/* Nagłówek + inputy w jednej linii */}
            <div className="flex items-center gap-6 flex-wrap">
              <span className="text-sm font-semibold text-white">Sugestie zakupów</span>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>Gotówka:</span>
                <span className="font-medium text-white tabular-nums">{formatCurrency(cashPLN, 'PLN')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">+ Inwestycja:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number" min={0} value={investAmount}
                    onChange={e => setInvestAmount(e.target.value)}
                    placeholder="0"
                    className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white
                               focus:outline-none focus:border-finance-green tabular-nums"
                  />
                  <span className="text-xs text-gray-500">PLN</span>
                </div>
              </div>
            </div>

            {/* Stany / wyniki */}
            {!targetsValid && (
              <p className="text-xs text-amber-400">Ustaw cele sumujące do 100% żeby zobaczyć sugestie.</p>
            )}
            {targetsValid && suggestions.length === 0 && (cashPLN + (parseFloat(investAmount) || 0)) <= 0 && (
              <p className="text-xs text-gray-500">Wprowadź kwotę do zainwestowania.</p>
            )}
            {targetsValid && suggestions.length === 0 && (cashPLN + (parseFloat(investAmount) || 0)) > 0 && (
              <p className="text-xs text-finance-green">Portfel jest zbliżony do celu.</p>
            )}

            {suggestions.length > 0 && (
              <div className="pt-2">
                {/* Kolumny kategorii w jednej linii */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${suggestions.length}, 1fr)`,
                  gap: 0,
                  borderTop: '1px solid rgba(55,65,81,0.5)',
                }}>
                  {suggestions.map(({ cat, buyPLN, top }, idx) => {
                    const acc = accentForDiff(cat.currentPct - cat.targetPct)
                    return (
                      <div key={cat.key} style={{
                        padding: '14px 16px',
                        borderLeft: idx > 0 ? '1px solid rgba(55,65,81,0.5)' : 'none',
                      }}>
                        {/* Nagłówek kolumny */}
                        <div style={{ marginBottom: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{cat.label}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#10b981', float: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            +{formatCurrency(buyPLN, 'PLN')}
                          </span>
                        </div>
                        {/* Wiersze tickerów */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {top.map(({ ticker, name, amt }) => (
                            <div key={ticker} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: acc.color, minWidth: 70, flexShrink: 0 }}>{ticker}</span>
                              <span style={{ fontSize: 12, color: '#9ca3af', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#10b981', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>+{formatCurrency(amt, 'PLN')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p style={{ fontSize: 11, color: '#4b5563', padding: '8px 0 0', borderTop: '1px solid rgba(55,65,81,0.3)', marginTop: 4 }}>
                  Dokupienie aktywów bez sprzedaży — unika podatku od zysków.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
