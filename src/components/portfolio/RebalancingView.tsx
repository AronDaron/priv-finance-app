import { useState, useEffect, useMemo } from 'react'
import { getAssets, getQuote, getCashAccounts, getAssetMeta, getSetting, setSetting } from '../../lib/api'
import type { PortfolioAsset, StockQuote, CashAccount } from '../../lib/types'
import { formatCurrency } from '../../lib/utils'
import LoadingSpinner from '../ui/LoadingSpinner'

// ─── Kategorie ────────────────────────────────────────────────────────────────

interface Category {
  key: string
  label: string
}

const CATEGORY_MAP: Record<string, Category> = {
  // Polskie wartości zwracane przez fetchAssetMeta
  akcje:    { key: 'equity',    label: 'Akcje' },
  etf:      { key: 'etf',       label: 'ETF' },
  fundusz:  { key: 'etf',       label: 'ETF' },
  złoto:    { key: 'commodity', label: 'Złoto / Surowce' },
  srebro:   { key: 'commodity', label: 'Złoto / Surowce' },
  ropa:     { key: 'commodity', label: 'Złoto / Surowce' },
  surowiec: { key: 'commodity', label: 'Złoto / Surowce' },
  krypto:   { key: 'other',     label: 'Inne' },
  // Angielskie (fallback)
  equity:   { key: 'equity',    label: 'Akcje' },
  commodity:{ key: 'commodity', label: 'Złoto / Surowce' },
  other:    { key: 'other',     label: 'Inne' },
}

function categorizeAsset(ticker: string, assetType: string, goldGrams?: number): Category {
  if (goldGrams != null && goldGrams > 0) return CATEGORY_MAP.złoto
  if (ticker.endsWith('=F'))             return CATEGORY_MAP.złoto
  return CATEGORY_MAP[assetType.toLowerCase()] ?? CATEGORY_MAP.akcje
}

// ─── Typy wewnętrzne ──────────────────────────────────────────────────────────

interface CategoryAllocation {
  key: string
  label: string
  currentValuePLN: number
  currentPct: number
  targetPct: number
  assets: { asset: PortfolioAsset; valuePLN: number }[]
}

type Targets = Record<string, number>

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPlnRate(currency: string, usdPln: number, eurPln: number): number {
  if (currency === 'PLN') return 1
  if (currency === 'USD') return usdPln
  if (currency === 'EUR') return eurPln
  return 1
}

function deviationColor(current: number, target: number): string {
  const diff = Math.abs(current - target)
  if (diff <= 3)  return '#10b981'
  if (diff <= 10) return '#f59e0b'
  return '#ef4444'
}

async function fetchRate(ticker: string): Promise<number> {
  try { return (await getQuote(ticker)).price ?? 1 } catch { return 1 }
}

// ─── Komponent ────────────────────────────────────────────────────────────────

export default function RebalancingView() {
  const [assets, setAssets]               = useState<PortfolioAsset[]>([])
  const [quotes, setQuotes]               = useState<Map<string, StockQuote>>(new Map())
  const [cashAccounts, setCashAccounts]   = useState<CashAccount[]>([])
  const [usdPln, setUsdPln]               = useState(4.0)
  const [eurPln, setEurPln]               = useState(4.3)
  const [metaMap, setMetaMap]             = useState<Map<string, string>>(new Map())
  const [targets, setTargets]             = useState<Targets>({})
  const [savedTargets, setSavedTargets]   = useState<Targets>({})
  const [investAmount, setInvestAmount]   = useState('')
  const [loading, setLoading]             = useState(true)
  const [saving, setSaving]               = useState(false)

  // ── Ładowanie danych ──────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [list, usd, eur, cash, savedRaw] = await Promise.all([
          getAssets(),
          fetchRate('USDPLN=X'),
          fetchRate('EURPLN=X'),
          getCashAccounts(),
          getSetting('rebalancing_targets'),
        ])

        setAssets(list)
        setUsdPln(usd)
        setEurPln(eur)
        setCashAccounts(cash)

        if (savedRaw) {
          try {
            const parsed = JSON.parse(savedRaw) as Targets
            setTargets(parsed)
            setSavedTargets(parsed)
          } catch { /* ignoruj zepsute dane */ }
        }

        const uniqueTickers = [...new Set(list.map(a => a.ticker))]

        const [quoteEntries, metaEntries] = await Promise.all([
          Promise.all(
            uniqueTickers.map(t =>
              getQuote(t)
                .then(q => [t, q] as [string, StockQuote])
                .catch(() => null)
            )
          ),
          Promise.all(
            uniqueTickers.map(t =>
              getAssetMeta(t)
                .then(m => [t, m.assetType] as [string, string])
                .catch(() => [t, 'other'] as [string, string])
            )
          ),
        ])

        const qMap = new Map<string, StockQuote>()
        quoteEntries.forEach(e => { if (e) qMap.set(e[0], e[1]) })
        setQuotes(qMap)

        const mMap = new Map<string, string>()
        metaEntries.forEach(([t, type]) => mMap.set(t, type))
        setMetaMap(mMap)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Obliczanie alokacji ───────────────────────────────────────────────────
  const categories = useMemo<CategoryAllocation[]>(() => {
    const catMap = new Map<string, { label: string; items: { asset: PortfolioAsset; valuePLN: number }[] }>()
    let totalPLN = 0

    assets.forEach(asset => {
      const quote = quotes.get(asset.ticker)
      const price = quote?.price ?? asset.purchase_price
      const currency = quote?.currency ?? asset.currency
      const valuePLN = asset.quantity * price * toPlnRate(currency, usdPln, eurPln)
      totalPLN += valuePLN

      const rawType = metaMap.get(asset.ticker) ?? 'other'
      const { key, label } = categorizeAsset(asset.ticker, rawType, asset.gold_grams)

      if (!catMap.has(key)) catMap.set(key, { label, items: [] })
      catMap.get(key)!.items.push({ asset, valuePLN })
    })

    return Array.from(catMap.entries())
      .map(([key, { label, items }]) => {
        const currentValuePLN = items.reduce((s, i) => s + i.valuePLN, 0)
        return {
          key,
          label,
          currentValuePLN,
          currentPct: totalPLN > 0 ? (currentValuePLN / totalPLN) * 100 : 0,
          targetPct: targets[key] ?? 0,
          assets: items.sort((a, b) => b.valuePLN - a.valuePLN),
        }
      })
      .sort((a, b) => b.currentValuePLN - a.currentValuePLN)
  }, [assets, quotes, metaMap, targets, usdPln, eurPln])

  const totalCurrentPLN = useMemo(
    () => categories.reduce((s, c) => s + c.currentValuePLN, 0),
    [categories]
  )

  const cashAvailablePLN = useMemo(() => {
    return cashAccounts.reduce((s, acc) => {
      return s + acc.balance * toPlnRate(acc.currency, usdPln, eurPln)
    }, 0)
  }, [cashAccounts, usdPln, eurPln])

  const targetSum = useMemo(
    () => Object.values(targets).reduce((s, v) => s + (Number(v) || 0), 0),
    [targets]
  )
  const targetsValid = Math.abs(targetSum - 100) < 0.5

  // ── Sugestie zakupów ─────────────────────────────────────────────────────
  const suggestions = useMemo(() => {
    const invest = parseFloat(investAmount) || 0
    const available = cashAvailablePLN + invest
    if (available <= 0 || !targetsValid) return []

    const newTotal = totalCurrentPLN + available

    const gaps = categories
      .map(cat => ({
        cat,
        gap: Math.max(0, (cat.targetPct / 100) * newTotal - cat.currentValuePLN),
      }))
      .filter(g => g.gap > 0)

    const totalGap = gaps.reduce((s, g) => s + g.gap, 0)
    if (totalGap === 0) return []

    return gaps.map(({ cat, gap }) => {
      const buyAmount = (gap / totalGap) * available
      const top = cat.assets.slice(0, 3).map(({ asset, valuePLN }) => {
        const share = cat.currentValuePLN > 0 ? valuePLN / cat.currentValuePLN : 1 / cat.assets.length
        return {
          ticker: asset.ticker,
          name: asset.name,
          buyAmountPLN: buyAmount * share,
        }
      })
      return { cat, buyAmountPLN: buyAmount, top }
    })
  }, [categories, totalCurrentPLN, cashAvailablePLN, investAmount, targetsValid])

  // ── Zapis ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!targetsValid) return
    setSaving(true)
    try {
      await setSetting('rebalancing_targets', JSON.stringify(targets))
      setSavedTargets({ ...targets })
    } finally {
      setSaving(false)
    }
  }

  function handleTargetChange(key: string, raw: string) {
    setTargets(prev => ({ ...prev, [key]: parseFloat(raw) || 0 }))
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div className="p-6"><LoadingSpinner /></div>

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-lg font-semibold text-white">Rebalansowanie</h2>

      {/* Alokacja + edycja targetów */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">Docelowa alokacja</h3>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-medium ${targetsValid ? 'text-finance-green' : 'text-red-400'}`}>
              Suma: {targetSum.toFixed(1)}%
            </span>
            <button
              onClick={handleSave}
              disabled={!targetsValid || saving}
              className="px-4 py-1.5 rounded-full text-sm font-medium bg-finance-green text-white
                         hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {saving ? 'Zapisuję…' : 'Zapisz'}
            </button>
          </div>
        </div>

        {categories.length === 0 && (
          <div className="glass-card rounded-xl p-10 text-center text-gray-400">
            Brak aktywów w portfelu.
          </div>
        )}

        {categories.map(cat => {
          const diff = cat.currentPct - cat.targetPct
          const fillColor = deviationColor(cat.currentPct, cat.targetPct)
          const hasUnsaved = targets[cat.key] !== savedTargets[cat.key]

          return (
            <div key={cat.key} className="glass-card rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{cat.label}</span>
                  {hasUnsaved && <span className="text-xs text-amber-400">niezapisane</span>}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-400">
                    Obecny: <span className="text-white font-medium">{cat.currentPct.toFixed(1)}%</span>
                    {' '}({formatCurrency(cat.currentValuePLN, 'PLN')})
                  </span>
                  <span className={`text-xs font-medium ${diff > 0 ? 'text-red-400' : diff < 0 ? 'text-amber-400' : 'text-finance-green'}`}>
                    {diff > 0 ? `+${diff.toFixed(1)}%` : diff < 0 ? `${diff.toFixed(1)}%` : '✓ ok'}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">Cel:</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={targets[cat.key] ?? ''}
                      onChange={e => handleTargetChange(cat.key, e.target.value)}
                      className="w-16 bg-gray-800 border border-gray-600 rounded-md px-2 py-1 text-sm text-white text-right
                                 focus:outline-none focus:border-finance-green"
                    />
                    <span className="text-xs text-gray-500">%</span>
                  </div>
                </div>
              </div>

              {/* Pasek postępu */}
              <div className="relative h-2.5 bg-gray-700 rounded-full overflow-visible">
                {/* Marker celu */}
                {cat.targetPct > 0 && (
                  <div
                    className="absolute top-[-2px] h-[18px] w-0.5 bg-white/60 rounded z-10"
                    style={{ left: `${Math.min(cat.targetPct, 100)}%` }}
                  />
                )}
                {/* Fill obecny */}
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(cat.currentPct, 100)}%`, backgroundColor: fillColor }}
                />
              </div>

              {/* Top aktywa w kategorii */}
              <div className="flex flex-wrap gap-2 pt-0.5">
                {cat.assets.map(({ asset, valuePLN }) => (
                  <span key={asset.ticker} className="text-xs px-2 py-0.5 rounded-full bg-gray-700/60 text-gray-300">
                    {asset.ticker} {totalCurrentPLN > 0 ? ((valuePLN / totalCurrentPLN) * 100).toFixed(1) : '0'}%
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Sugestie zakupów */}
      {categories.length > 0 && (
        <div className="glass-card rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Sugestie zakupów</h3>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Gotówka w portfelu:</span>
              <span className="text-sm font-medium text-white">{formatCurrency(cashAvailablePLN, 'PLN')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Dodatkowa inwestycja (PLN):</span>
              <input
                type="number"
                min={0}
                value={investAmount}
                onChange={e => setInvestAmount(e.target.value)}
                placeholder="0"
                className="w-28 bg-gray-800 border border-gray-600 rounded-md px-3 py-1.5 text-sm text-white
                           focus:outline-none focus:border-finance-green"
              />
            </div>
          </div>

          {!targetsValid && (
            <p className="text-xs text-amber-400">Ustaw docelową alokację sumującą do 100%, żeby zobaczyć sugestie.</p>
          )}

          {targetsValid && suggestions.length === 0 && (cashAvailablePLN + (parseFloat(investAmount) || 0)) > 0 && (
            <p className="text-xs text-finance-green">Portfel jest już zbliżony do docelowej alokacji.</p>
          )}

          {targetsValid && suggestions.length === 0 && (cashAvailablePLN + (parseFloat(investAmount) || 0)) <= 0 && (
            <p className="text-xs text-gray-500">Wprowadź kwotę do zainwestowania, żeby zobaczyć sugestie.</p>
          )}

          {suggestions.length > 0 && (
            <div className="space-y-3">
              {suggestions.map(({ cat, buyAmountPLN, top }) => (
                <div key={cat.key} className="border border-gray-700/50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">{cat.label}</span>
                    <span className="text-sm font-bold text-finance-green">+{formatCurrency(buyAmountPLN, 'PLN')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {top.map(({ ticker, name, buyAmountPLN: amt }) => (
                      <div key={ticker} className="flex flex-col px-3 py-1.5 rounded-lg bg-gray-800/60">
                        <span className="text-xs font-bold text-white">{ticker}</span>
                        <span className="text-xs text-gray-400 truncate max-w-[120px]">{name}</span>
                        <span className="text-xs text-finance-green font-medium">+{formatCurrency(amt, 'PLN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-500">Sugestie preferują zakupy (bez sprzedaży — unika podatku od zysków).</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
