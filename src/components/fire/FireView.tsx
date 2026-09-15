// src/components/fire/FireView.tsx
// FIRE — kiedy kapitał zacznie utrzymywać Cię sam.
//
// Wartość portfela pobierana automatycznie z aplikacji i dzielona na koszyki podatkowe
// według tagów portfeli (IKE / IKZE / zwykłe). Parametry zapisywane w tabeli settings.
// Cała matematyka w src/lib/fireMath.ts — tu wyłącznie pobranie danych i prezentacja.

import { useState, useEffect, useMemo, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceDot } from 'recharts'
import { getAssets, getCashAccounts, getFxRates, getBondValues, getPortfolios, getQuote, getAllSettings, setSetting } from '../../lib/api'
import type { SupportedCurrency } from '../../lib/types'
import { gramsToTroyOz } from '../../lib/types'
import { simulateScenarios, simulateDrawdown, allocationShares, weightedReturn, BELKA_RATE, type FireBucket, type FireScenarios, type FireResult, type DrawdownResult, type AssetAllocation } from '../../lib/fireMath'
import LoadingSpinner from '../ui/LoadingSpinner'
import InfoTip from '../ui/InfoTip'

// ─── Parametry i ich persystencja ─────────────────────────────────────────────

interface FireParams {
  age: number
  years: number
  contribution: number
  contributionGrows: boolean
  expenses: number
  inflationPct: number
  returnPessPct: number
  returnBasePct: number
  returnOptPct: number
  swrPct: number
  ikeSharePct: number
  ikzeSharePct: number
  returnBondsPct: number
  returnMetalsPct: number
  contribStocksPct: number
  contribBondsPct: number
  contribMetalsPct: number
}

const DEFAULTS: FireParams = {
  age: 30, years: 25, contribution: 2000, contributionGrows: true, expenses: 5000,
  inflationPct: 3, returnPessPct: 4, returnBasePct: 7, returnOptPct: 10, swrPct: 4,
  ikeSharePct: 0, ikzeSharePct: 0, returnBondsPct: 5, returnMetalsPct: 3,
  contribStocksPct: 100, contribBondsPct: 0, contribMetalsPct: 0,
}

const SETTING_KEYS: Record<keyof FireParams, string> = {
  age: 'fire_age', years: 'fire_years', contribution: 'fire_contribution',
  contributionGrows: 'fire_contribution_grows', expenses: 'fire_expenses',
  inflationPct: 'fire_inflation', returnPessPct: 'fire_return_pess',
  returnBasePct: 'fire_return_base', returnOptPct: 'fire_return_opt',
  swrPct: 'fire_swr', ikeSharePct: 'fire_ike_share', ikzeSharePct: 'fire_ikze_share',
  returnBondsPct: 'fire_return_bonds', returnMetalsPct: 'fire_return_metals',
  contribStocksPct: 'fire_contrib_stocks', contribBondsPct: 'fire_contrib_bonds', contribMetalsPct: 'fire_contrib_metals',
}

function paramsFromSettings(s: Record<string, string>): FireParams {
  const num = (key: string, fallback: number) => {
    const v = Number(s[key])
    return s[key] != null && Number.isFinite(v) ? v : fallback
  }
  return {
    age: num(SETTING_KEYS.age, DEFAULTS.age),
    years: num(SETTING_KEYS.years, DEFAULTS.years),
    contribution: num(SETTING_KEYS.contribution, DEFAULTS.contribution),
    contributionGrows: s[SETTING_KEYS.contributionGrows] == null ? DEFAULTS.contributionGrows : s[SETTING_KEYS.contributionGrows] === 'true',
    expenses: num(SETTING_KEYS.expenses, DEFAULTS.expenses),
    inflationPct: num(SETTING_KEYS.inflationPct, DEFAULTS.inflationPct),
    returnPessPct: num(SETTING_KEYS.returnPessPct, DEFAULTS.returnPessPct),
    returnBasePct: num(SETTING_KEYS.returnBasePct, DEFAULTS.returnBasePct),
    returnOptPct: num(SETTING_KEYS.returnOptPct, DEFAULTS.returnOptPct),
    swrPct: num(SETTING_KEYS.swrPct, DEFAULTS.swrPct),
    ikeSharePct: num(SETTING_KEYS.ikeSharePct, DEFAULTS.ikeSharePct),
    ikzeSharePct: num(SETTING_KEYS.ikzeSharePct, DEFAULTS.ikzeSharePct),
    returnBondsPct: num(SETTING_KEYS.returnBondsPct, DEFAULTS.returnBondsPct),
    returnMetalsPct: num(SETTING_KEYS.returnMetalsPct, DEFAULTS.returnMetalsPct),
    contribStocksPct: num(SETTING_KEYS.contribStocksPct, DEFAULTS.contribStocksPct),
    contribBondsPct: num(SETTING_KEYS.contribBondsPct, DEFAULTS.contribBondsPct),
    contribMetalsPct: num(SETTING_KEYS.contribMetalsPct, DEFAULTS.contribMetalsPct),
  }
}

// ─── Formatowanie ─────────────────────────────────────────────────────────────

const pln = (v: number) => Math.round(v).toLocaleString('pl-PL') + ' zł'
const plnShort = (v: number) => {
  const abs = Math.abs(v)
  if (abs >= 1e6) return (v / 1e6).toFixed(2).replace('.', ',') + ' mln zł'
  if (abs >= 1e3) return Math.round(v / 1e3).toLocaleString('pl-PL') + ' tys. zł'
  return Math.round(v) + ' zł'
}

// ─── Pobranie portfela i podział na koszyki podatkowe ────────────────────────

type Buckets = { regular: FireBucket; ike: FireBucket; ikze: FireBucket }
type PortfolioSnapshot = { buckets: Buckets; allocation: AssetAllocation }

const EMPTY_SNAPSHOT: PortfolioSnapshot = {
  buckets: { regular: { value: 0, cost: 0 }, ike: { value: 0, cost: 0 }, ikze: { value: 0, cost: 0 } },
  allocation: { stocks: 0, bonds: 0, metals: 0, cash: 0 },
}

const METAL_TICKERS = new Set(['GC=F', 'SI=F', 'PL=F', 'PA=F'])

async function loadPortfolioBuckets(): Promise<PortfolioSnapshot> {
  const [assets, cash, rates, portfolios] = await Promise.all([
    getAssets(), getCashAccounts(), getFxRates(), getPortfolios(),
  ])
  const fx = (c: string) => rates.get(c as SupportedCurrency) ?? 1

  // Koszyk wg tagów portfela — IKZE ma pierwszeństwo, bo ma inny podatek niż IKE
  const kindOf = (portfolioId: number | undefined): keyof Buckets => {
    const tags = portfolios.find(p => p.id === portfolioId)?.tags ?? []
    if (tags.includes('IKZE')) return 'ikze'
    if (tags.includes('IKE')) return 'ike'
    return 'regular'
  }

  const b: Buckets = {
    regular: { value: 0, cost: 0 }, ike: { value: 0, cost: 0 }, ikze: { value: 0, cost: 0 },
  }
  const alloc: AssetAllocation = { stocks: 0, bonds: 0, metals: 0, cash: 0 }

  const bonds = assets.filter(a => a.asset_type === 'bond')
  const stocks = assets.filter(a => a.asset_type !== 'bond')

  const [quotes, bondValues] = await Promise.all([
    Promise.all(stocks.map(a => getQuote(a.ticker).catch(() => null))),
    getBondValues(bonds),
  ])

  stocks.forEach((a, i) => {
    const q = quotes[i]
    const spot = q?.price ?? a.purchase_price
    const quoteCurrency = q?.currency ?? a.currency
    // Metale fizyczne: cena spot USD/oz × oz na monetę — zasada obowiązująca w całej aplikacji
    const ozPerCoin = a.gold_grams ? gramsToTroyOz(a.gold_grams) : null
    const unitPrice = ozPerCoin ? spot * ozPerCoin : spot
    const k = kindOf(a.portfolio_id)
    const valuePln = a.quantity * unitPrice * fx(quoteCurrency)
    b[k].value += valuePln
    b[k].cost += a.quantity * a.purchase_price * fx(a.currency)
    // Metale: fizyczne (gold_grams) albo kontrakty na złoto/srebro
    if (ozPerCoin || METAL_TICKERS.has(a.ticker)) alloc.metals += valuePln
    else alloc.stocks += valuePln
  })

  bonds.forEach(a => {
    const bv = bondValues.values.get(a.id)
    const k = kindOf(a.portfolio_id)
    const valuePln = bv?.totalValue ?? a.quantity * 100
    b[k].value += valuePln
    b[k].cost += a.quantity * 100
    alloc.bonds += valuePln
  })

  // Gotówka nie ma zysku kapitałowego — koszt = wartość
  cash.forEach(c => {
    const v = c.balance * fx(c.currency)
    const k = kindOf(c.portfolio_id)
    b[k].value += v
    b[k].cost += v
    alloc.cash += v
  })

  return { buckets: b, allocation: alloc }
}

// ─── Komponenty pomocnicze ────────────────────────────────────────────────────

function Field({ label, value, onChange, suffix, min, max, step = 1, hint }: {
  label: string; value: number; onChange: (v: number) => void
  suffix?: string; min?: number; max?: number; step?: number; hint?: string
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div className="relative">
        <input
          type="number" value={value} min={min} max={max} step={step}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm
            focus:outline-none focus:border-finance-green pr-10"
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">{suffix}</span>}
      </div>
      {hint && <p className="text-[11px] text-gray-600 mt-1">{hint}</p>}
    </div>
  )
}

const SCENARIO_META = [
  { key: 'pessimistic' as const, label: 'Pesymistyczny', color: '#f59e0b' },
  { key: 'base' as const, label: 'Bazowy', color: '#10b981' },
  { key: 'optimistic' as const, label: 'Optymistyczny', color: '#6366f1' },
]

function yearsWord(n: number): string {
  if (n === 1) return 'rok'
  const last = n % 10, lastTwo = n % 100
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return 'lata'
  return 'lat'
}

function lastsLabel(d: DrawdownResult): { text: string; ok: boolean } {
  if (d.yearsLasting === Infinity) return { text: 'do końca życia', ok: true }
  return { text: `do wieku ${d.depletedAtAge}`, ok: (d.depletedAtAge ?? 0) >= 90 }
}

function ScenarioCard({ label, color, result, returnPct, legacyPct, showReal, drawdown, expensesToday }: {
  label: string; color: string; result: FireResult; returnPct: number; legacyPct: number; showReal: boolean
  drawdown: { expenses: DrawdownResult; swr: DrawdownResult }; expensesToday: number
}) {
  // Wydatki w chwili startu wypłat — dzisiejsze albo już urealnione inflacją do roku finalnego;
  // w symulacji rosną dalej co rok, stąd „+ inflacja"
  const expensesAtStart = showReal ? expensesToday : result.final.monthlyExpensesNominal
  const f = result.final
  const reached = result.fireYear !== null
  const capital = showReal ? f.totalReal : f.totalNominal
  const monthly = showReal ? f.monthlyNetWithdrawalReal : f.monthlyNetWithdrawalNominal
  const onExpenses = lastsLabel(drawdown.expenses)
  const onSwr = lastsLabel(drawdown.swr)
  return (
    <div className="glass-card rounded-xl p-4 border-t-2" style={{ borderTopColor: color }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-xs text-gray-500" title="wpłaty · obecny portfel">{returnPct}% · {legacyPct}%</span>
      </div>
      <div className="mb-3">
        {reached ? (
          <>
            <div className="text-2xl font-bold" style={{ color }}>za {result.fireYear} {yearsWord(result.fireYear!)}</div>
            <div className="text-xs text-gray-400">FIRE w wieku {result.fireAge} lat</div>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-gray-500">poza horyzontem</div>
            <div className="text-xs text-gray-500">pokrycie w ostatnim roku: {(f.coverage * 100).toFixed(0)}%</div>
          </>
        )}
      </div>
      <div className="space-y-1.5 text-xs border-t border-gray-700/50 pt-3">
        <div className="flex justify-between"><span className="text-gray-500">Kapitał w roku {f.year}</span><span className="text-gray-200 font-medium">{plnShort(capital)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Wypłata netto / mies.</span><span className="text-gray-200 font-medium">{pln(monthly)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">Pokrycie wydatków</span>
          <span className={`font-medium ${f.coverage >= 1 ? 'text-finance-green' : 'text-finance-red'}`}>{(f.coverage * 100).toFixed(0)}%</span></div>
        <div className="pt-1.5 border-t border-gray-700/40 space-y-1">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider">Od roku {f.year} żyjąc z kapitału</div>
          <div className="flex justify-between"><span className="text-gray-500">na wydatki ({pln(expensesAtStart)} + inflacja)</span>
            <span className={`font-medium ${onExpenses.ok ? 'text-finance-green' : 'text-finance-red'}`}>{onExpenses.text}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">tylko SWR ({pln(monthly)} + inflacja)</span>
            <span className={`font-medium ${onSwr.ok ? 'text-finance-green' : 'text-finance-red'}`}>{onSwr.text}</span></div>
        </div>
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label, showReal }: any) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  return (
    <div style={{ background: '#0d1117', border: '1px solid rgba(16,185,129,0.35)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
      <p style={{ color: '#6b7280', fontSize: 11, marginBottom: 6 }}>Rok {label} · wiek {row?.age}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color, fontSize: 12, margin: '2px 0' }}>
          {p.name}: <strong>{plnShort(p.value)}</strong>
        </p>
      ))}
      <p style={{ color: '#6b7280', fontSize: 10, marginTop: 6 }}>{showReal ? 'w dzisiejszych złotówkach' : 'nominalnie'}</p>
    </div>
  )
}

// ─── Widok ────────────────────────────────────────────────────────────────────

export default function FireView() {
  const [params, setParams] = useState<FireParams>(DEFAULTS)
  const [paramsLoaded, setParamsLoaded] = useState(false)
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null)
  const [portfolioError, setPortfolioError] = useState<string | null>(null)
  const [showReal, setShowReal] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getAllSettings().then(s => { setParams(paramsFromSettings(s)); setParamsLoaded(true) })
    loadPortfolioBuckets()
      .then(setSnapshot)
      .catch(e => {
        setPortfolioError(e instanceof Error ? e.message : 'Nie udało się pobrać portfela')
        setSnapshot(EMPTY_SNAPSHOT)
      })
  }, [])

  // Zapis parametrów z opóźnieniem — nie przy każdym naciśnięciu klawisza
  const update = (patch: Partial<FireParams>) => {
    setParams(prev => ({ ...prev, ...patch }))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      for (const [k, v] of Object.entries(patch)) {
        void setSetting(SETTING_KEYS[k as keyof FireParams], String(v))
      }
    }, 600)
  }

  // Udziały klas aktywów i ważone stopy zwrotu — stopa scenariusza dotyczy akcji/ETF,
  // obligacje i metale mają własne, gotówka 0%
  const shares = useMemo(() => allocationShares(snapshot?.allocation ?? EMPTY_SNAPSHOT.allocation), [snapshot])
  // Scenariusz przesuwa WSZYSTKIE klasy o tę samą różnicę względem bazowego (akcje 7→4 oznacza
  // obligacje 5→2, metale 3→0). Dwie osobne stopy:
  //   legacy — kapitał startowy, ważony jego rzeczywistą alokacją (może być np. 54% złota)
  //   fresh  — nowe wpłaty, ważone alokacją wpłat (domyślnie 100% akcje/ETF)
  const weighted = useMemo(() => {
    const classRates = (deltaPct: number) => ({
      stocks: (params.returnBasePct + deltaPct) / 100,
      bonds: Math.max(0, params.returnBondsPct + deltaPct) / 100,
      metals: Math.max(0, params.returnMetalsPct + deltaPct) / 100,
      cash: 0,
    })
    const cs = Math.max(0, params.contribStocksPct), cb = Math.max(0, params.contribBondsPct), cm = Math.max(0, params.contribMetalsPct)
    const csum = cs + cb + cm
    // Wszystkie trzy pola na 0 → wpłaty nie mogą pracować na 0%; przyjmujemy 100% akcje/ETF (jak allocationShares)
    const contribShares: AssetAllocation = csum > 0
      ? { stocks: cs / csum, bonds: cb / csum, metals: cm / csum, cash: 0 }
      : { stocks: 1, bonds: 0, metals: 0, cash: 0 }
    const pair = (deltaPct: number) => {
      const r = classRates(deltaPct)
      return { legacy: weightedReturn(shares, r), fresh: weightedReturn(contribShares, r) }
    }
    return {
      pessimistic: pair(params.returnPessPct - params.returnBasePct),
      base: pair(0),
      optimistic: pair(params.returnOptPct - params.returnBasePct),
    }
  }, [shares, params.returnPessPct, params.returnBasePct, params.returnOptPct, params.returnBondsPct, params.returnMetalsPct, params.contribStocksPct, params.contribBondsPct, params.contribMetalsPct])

  const buckets = snapshot?.buckets ?? null

  const scenarios: FireScenarios | null = useMemo(() => {
    if (!buckets || !paramsLoaded) return null
    const ike = Math.max(0, Math.min(1, params.ikeSharePct / 100))
    const ikze = Math.max(0, Math.min(1 - ike, params.ikzeSharePct / 100))
    return simulateScenarios({
      currentAge: params.age,
      years: Math.max(1, Math.min(70, Math.round(params.years))),
      monthlyContribution: Math.max(0, params.contribution),
      contributionGrowsWithInflation: params.contributionGrows,
      monthlyExpenses: Math.max(0, params.expenses),
      inflationRate: params.inflationPct / 100,
      swr: Math.max(0.005, params.swrPct / 100),
      ikeShare: ike,
      ikzeShare: ikze,
      current: buckets,
    }, weighted)
  }, [buckets, params, paramsLoaded, weighted])

  // Faza wypłat od końca horyzontu (przestajesz wpłacać). Dwa warianty:
  //   expenses — wypłacasz tyle, ile potrzebujesz na życie (Twoje wydatki + inflacja).
  //              SWR nie ma tu wpływu: o kwocie decydują wydatki, nie procent kapitału.
  //   swr      — wypłacasz tylko SWR% kapitału startowego (indeksowane inflacją) — klasyczna
  //              definicja bezpiecznej wypłaty; pokazuje, czy przy tym SWR kapitał przetrwa.
  const drawdowns = useMemo(() => {
    if (!scenarios) return null
    const infl = params.inflationPct / 100
    const calc = (r: FireResult, rate: number) => {
      const f = r.final
      const common = { returnRate: rate, inflationRate: infl, effectiveTaxRate: f.effectiveTaxRate, startAge: f.age }
      return {
        expenses: simulateDrawdown({ ...common, startCapital: f.totalNominal, startMonthlyExpenses: f.monthlyExpensesNominal }),
        swr: simulateDrawdown({ ...common, startCapital: f.totalNominal, startMonthlyExpenses: f.monthlyNetWithdrawalNominal }),
      }
    }
    // Po zakończeniu wpłat kapitał to mieszanka części startowej i wpłat — stopa wypłat
    // ważona tym, ile każda z nich wniosła do kapitału końcowego
    const blend = (r: FireResult, w: { legacy: number; fresh: number }) => {
      const startValue = buckets ? buckets.regular.value + buckets.ike.value + buckets.ikze.value : 0
      const total = r.final.totalNominal
      if (total <= 0) return w.fresh
      const legacyGrown = startValue * Math.pow(1 + w.legacy, r.final.year)
      const legacyShare = Math.max(0, Math.min(1, legacyGrown / total))
      return legacyShare * w.legacy + (1 - legacyShare) * w.fresh
    }
    return {
      pessimistic: calc(scenarios.pessimistic, blend(scenarios.pessimistic, weighted.pessimistic)),
      base: calc(scenarios.base, blend(scenarios.base, weighted.base)),
      optimistic: calc(scenarios.optimistic, blend(scenarios.optimistic, weighted.optimistic)),
    }
  }, [scenarios, params.inflationPct, weighted, buckets])

  const chartData = useMemo(() => {
    if (!scenarios) return []
    return scenarios.base.years.map((y, i) => ({
      year: y.year,
      age: y.age,
      pesymistyczny: showReal ? scenarios.pessimistic.years[i].totalReal : scenarios.pessimistic.years[i].totalNominal,
      bazowy: showReal ? y.totalReal : y.totalNominal,
      optymistyczny: showReal ? scenarios.optimistic.years[i].totalReal : scenarios.optimistic.years[i].totalNominal,
      potrzebny: showReal ? y.fireNumberReal : y.fireNumberNominal,
    }))
  }, [scenarios, showReal])

  if (!buckets || !paramsLoaded || !scenarios || !drawdowns) return <LoadingSpinner />

  const portfolioTotal = buckets.regular.value + buckets.ike.value + buckets.ikze.value
  // Realny zwrot = (1+r)/(1+i) − 1, nie r − i
  const realReturnBasePct = ((1 + weighted.base.fresh) / (1 + params.inflationPct / 100) - 1) * 100
  const base = scenarios.base
  const fb = base.final
  const fireDot = base.fireYear !== null ? chartData[base.fireYear - 1] : null
  const inflationFactorFinal = Math.pow(1 + params.inflationPct / 100, fb.year)
  const expensesShown = showReal ? params.expenses : fb.monthlyExpensesNominal
  const withdrawalShown = showReal ? fb.monthlyNetWithdrawalReal : fb.monthlyNetWithdrawalNominal
  // Do tooltipa o podatku: udział zysku w koszyku zwykłym (tam obowiązuje Belka)
  const regularGainShare = fb.buckets.regular.value > 0
    ? Math.max(0, (fb.buckets.regular.value - fb.buckets.regular.cost) / fb.buckets.regular.value)
    : 0
  const hasIkeIkze = fb.buckets.ike.value > 0 || fb.buckets.ikze.value > 0

  return (
    <div className="p-6 space-y-6">
      {/* Nagłówek */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-white text-xl font-bold">FIRE</h1>
          <p className="text-gray-500 text-xs mt-0.5">Financial Independence, Retire Early — kiedy kapitał zacznie utrzymywać Cię sam</p>
        </div>
        <div className="flex gap-1 p-1 glass-card rounded-lg">
          <button onClick={() => setShowReal(true)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${showReal ? 'bg-finance-green text-white' : 'text-gray-400 hover:text-white'}`}>
            Dzisiejsze złotówki
          </button>
          <button onClick={() => setShowReal(false)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!showReal ? 'bg-finance-green text-white' : 'text-gray-400 hover:text-white'}`}>
            Nominalnie
          </button>
        </div>
      </div>

      {portfolioError && (
        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 text-sm text-yellow-300">
          Nie udało się pobrać wartości portfela ({portfolioError}) — obliczenia startują od zera.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        {/* ── Parametry ── */}
        <div className="glass-card rounded-xl p-5 space-y-4 self-start">
          <div>
            <h2 className="text-sm font-semibold text-gray-200 mb-1">Punkt startowy</h2>
            <div className="text-2xl font-bold text-finance-green">{pln(portfolioTotal)}</div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {[
                shares.stocks > 0 && `akcje/ETF ${(shares.stocks * 100).toFixed(0)}%`,
                shares.bonds > 0 && `obligacje ${(shares.bonds * 100).toFixed(0)}%`,
                shares.metals > 0 && `metale ${(shares.metals * 100).toFixed(0)}%`,
                shares.cash > 0 && `gotówka ${(shares.cash * 100).toFixed(0)}%`,
              ].filter(Boolean).join(' · ') || 'portfel pusty'}
            </p>
            {(buckets.ike.value > 0 || buckets.ikze.value > 0) && (
              <div className="text-[11px] text-gray-500 mt-1.5 space-y-0.5">
                <div>zwykłe: {plnShort(buckets.regular.value)}</div>
                {buckets.ike.value > 0 && <div>IKE: {plnShort(buckets.ike.value)}</div>}
                {buckets.ikze.value > 0 && <div>IKZE: {plnShort(buckets.ikze.value)}</div>}
              </div>
            )}
          </div>

          <div className="border-t border-gray-700/50 pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Twój wiek" value={params.age} onChange={v => update({ age: v })} suffix="lat" min={16} max={90} />
              <Field label="Horyzont" value={params.years} onChange={v => update({ years: v })} suffix="lat" min={1} max={70} />
            </div>
            <Field label="Miesięczna wpłata" value={params.contribution} onChange={v => update({ contribution: v })} suffix="zł" min={0} step={100} />
            <div className="text-[11px] text-gray-500 -mb-1">W co idą nowe wpłaty</div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Akcje / ETF" value={params.contribStocksPct} onChange={v => update({ contribStocksPct: v })} suffix="%" min={0} max={100} step={5} />
              <Field label="Obligacje" value={params.contribBondsPct} onChange={v => update({ contribBondsPct: v })} suffix="%" min={0} max={100} step={5} />
              <Field label="Metale" value={params.contribMetalsPct} onChange={v => update({ contribMetalsPct: v })} suffix="%" min={0} max={100} step={5} />
            </div>
            {(() => {
              const sum = params.contribStocksPct + params.contribBondsPct + params.contribMetalsPct
              return sum !== 100
                ? <p className="text-[11px] text-amber-400/80">Suma {sum}% — udziały przeliczane proporcjonalnie do 100%.</p>
                : null
            })()}
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input type="checkbox" checked={params.contributionGrows} onChange={e => update({ contributionGrows: e.target.checked })} className="accent-finance-green" />
              wpłata rośnie z inflacją (jak pensja)
            </label>
            <Field label="Miesięczne wydatki (dziś)" value={params.expenses} onChange={v => update({ expenses: v })} suffix="zł" min={0} step={100} />
          </div>

          <div className="border-t border-gray-700/50 pt-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-300">Założenia</h3>
            <Field label="Inflacja rocznie" value={params.inflationPct} onChange={v => update({ inflationPct: v })} suffix="%" min={0} max={30} step={0.5} />
            <div className="text-[11px] text-gray-500 -mb-1">Zwrot z akcji / ETF — trzy scenariusze</div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Pesym." value={params.returnPessPct} onChange={v => update({ returnPessPct: v })} suffix="%" step={0.5} />
              <Field label="Bazowy" value={params.returnBasePct} onChange={v => update({ returnBasePct: v })} suffix="%" step={0.5} />
              <Field label="Optym." value={params.returnOptPct} onChange={v => update({ returnOptPct: v })} suffix="%" step={0.5} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Zwrot z obligacji" value={params.returnBondsPct} onChange={v => update({ returnBondsPct: v })} suffix="%" step={0.5}
                hint={`EDO/COI ≈ inflacja + marża ≈ ${(params.inflationPct + 2).toFixed(1)}%`} />
              <Field label="Zwrot z metali" value={params.returnMetalsPct} onChange={v => update({ returnMetalsPct: v })} suffix="%" step={0.5}
                hint="złoto długoterminowo ≈ inflacja" />
            </div>
            <div className="text-[11px] text-gray-500">
              Stopy w symulacji — wpłaty: <span style={{ color: '#f59e0b' }}>{(weighted.pessimistic.fresh * 100).toFixed(1)}</span>
              {' / '}<span style={{ color: '#10b981' }}>{(weighted.base.fresh * 100).toFixed(1)}</span>
              {' / '}<span style={{ color: '#6366f1' }}>{(weighted.optimistic.fresh * 100).toFixed(1)}%</span>
              {(shares.bonds > 0 || shares.metals > 0 || shares.cash > 0) && (
                <> · obecny portfel: <span style={{ color: '#f59e0b' }}>{(weighted.pessimistic.legacy * 100).toFixed(1)}</span>
                {' / '}<span style={{ color: '#10b981' }}>{(weighted.base.legacy * 100).toFixed(1)}</span>
                {' / '}<span style={{ color: '#6366f1' }}>{(weighted.optimistic.legacy * 100).toFixed(1)}%</span></>
              )}
            </div>
            <Field label="Bezpieczna stopa wypłaty (SWR)" value={params.swrPct} onChange={v => update({ swrPct: v })} suffix="%" min={1} max={10} step={0.25}
              hint={'4% = klasyczna „reguła 25×” — kapitał 25 razy większy od rocznych wydatków'} />
            {params.swrPct > realReturnBasePct && (
              <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-2.5 text-[11px] text-red-300">
                SWR {params.swrPct}% jest wyższe niż realny zwrot bazowy ({realReturnBasePct.toFixed(1)}% po inflacji) —
                wypłacasz więcej, niż kapitał zarabia. „Osiągnięte FIRE" będzie pozorne: kapitał się wyczerpie.
                Sprawdź „starczy do wieku" na kartach scenariuszy.
              </div>
            )}
          </div>

          <div className="border-t border-gray-700/50 pt-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-300">
              Podatki przy wypłacie
              <InfoTip text={<>
                <b>IKE</b> — 0% podatku przy wypłacie po 60. roku życia (55 przy nabyciu uprawnień emerytalnych) i min. 5 latach wpłat.<br />
                <b>IKZE</b> — ryczałt 10% od całej wypłaty po 65. roku życia i min. 5 latach wpłat.<br />
                Symulacja zakłada, że te warunki są spełnione. Wcześniejszy zwrot: IKE — Belka 19% od zysku, IKZE — PIT wg skali od całej kwoty.
              </>} />
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Wpłat na IKE" value={params.ikeSharePct} onChange={v => update({ ikeSharePct: v })} suffix="%" min={0} max={100} step={5} />
              <Field label="Wpłat na IKZE" value={params.ikzeSharePct} onChange={v => update({ ikzeSharePct: v })} suffix="%" min={0} max={100} step={5} />
            </div>
            <p className="text-[11px] text-gray-600">
              Reszta ({Math.max(0, 100 - params.ikeSharePct - params.ikzeSharePct)}%) na zwykłe konto — Belka 19% od zysku.
              IKE: 0%. IKZE: ryczałt 10% od wypłaty. Obecny portfel dzielony według tagów portfeli.
            </p>
          </div>
        </div>

        {/* ── Wykres + wyniki ── */}
        <div className="space-y-6 min-w-0">
          <div className="glass-card rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-gray-200">Kapitał vs potrzebny kapitał</h3>
              {base.fireYear !== null ? (
                <span className="text-xs text-finance-green">scenariusz bazowy: FIRE za {base.fireYear} {yearsWord(base.fireYear)}, w wieku {base.fireAge}</span>
              ) : (
                <span className="text-xs text-gray-500">scenariusz bazowy: FIRE poza horyzontem {params.years} lat</span>
              )}
            </div>
            <div style={{ height: 360 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(75,85,99,0.15)" />
                  <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: 'rgba(75,85,99,0.2)' }} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}k`}
                    width={55} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip showReal={showReal} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                  <Line type="monotone" dataKey="potrzebny" name="Potrzebny kapitał (FIRE)" stroke="#ef4444" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  <Line type="monotone" dataKey="pesymistyczny" name="Pesymistyczny" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="bazowy" name="Bazowy" stroke="#10b981" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="optymistyczny" name="Optymistyczny" stroke="#6366f1" strokeWidth={2} dot={false} />
                  {fireDot && <ReferenceDot x={fireDot.year} y={fireDot.bazowy} r={6} fill="#10b981" stroke="#fff" strokeWidth={2} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Trzy scenariusze */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SCENARIO_META.map(m => (
              <ScenarioCard key={m.key} label={m.label} color={m.color} result={scenarios[m.key]} showReal={showReal}
                drawdown={drawdowns[m.key]} expensesToday={params.expenses}
                returnPct={Math.round(weighted[m.key].fresh * 1000) / 10} legacyPct={Math.round(weighted[m.key].legacy * 1000) / 10} />
            ))}
          </div>

          {/* Szczegóły roku finalnego — scenariusz bazowy */}
          <div className="glass-card rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-4">
              Rok {fb.year} (wiek {fb.age}) — scenariusz bazowy, {showReal ? 'w dzisiejszych złotówkach' : 'nominalnie'}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wider">Kapitał</div>
                <div className="text-lg font-bold text-white">{plnShort(showReal ? fb.totalReal : fb.totalNominal)}</div>
                <div className="text-[11px] text-gray-600">
                  z czego wpłaty: {plnShort(showReal ? fb.contributedTotal / inflationFactorFinal : fb.contributedTotal)}
                  <InfoTip side="top" text={<>
                    Twoje własne pieniądze w kapitale: koszt zakupu obecnego portfela (z transakcji; obligacje po nominale, gotówka 1:1)
                    plus wszystkie przyszłe wpłaty{showReal ? ', urealnione inflacją do dzisiejszych złotówek' : ''}.<br />
                    Reszta kapitału to zysk — i tylko od niego liczona jest Belka 19%.
                  </>} />
                </div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wider">Wypłata netto / mies.</div>
                <div className="text-lg font-bold text-finance-green">{pln(withdrawalShown)}</div>
                <div className="text-[11px] text-gray-600">
                  przy SWR {params.swrPct}%, po podatku {(fb.effectiveTaxRate * 100).toFixed(1)}% wypłaty
                  <InfoTip side="top" text={<>
                    Belka to stałe <b>19%</b>, ale od <b>zysku</b>, nie od całej wypłaty — każda wypłata to proporcjonalnie część zysku i część Twoich wpłat (bez podatku).<br />
                    W roku {fb.year} zysk stanowi {(regularGainShare * 100).toFixed(0)}% kapitału na zwykłym koncie, więc podatek efektywnie
                    wynosi 19% × {(regularGainShare * 100).toFixed(0)}% = <b>{(BELKA_RATE * regularGainShare * 100).toFixed(1)}%</b> wypłaty.
                    {hasIkeIkze && <> Wynik {(fb.effectiveTaxRate * 100).toFixed(1)}% jest dodatkowo ważony koszykami IKE (0%) i IKZE (10% od całości).</>}
                  </>} />
                </div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wider">Wydatki / mies.</div>
                <div className="text-lg font-bold text-white">{pln(expensesShown)}</div>
                <div className="text-[11px] text-gray-600">{showReal ? 'dzisiejsze' : `dzisiejsze ${pln(params.expenses)} + inflacja`}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500 uppercase tracking-wider">Bilans</div>
                <div className={`text-lg font-bold ${fb.coverage >= 1 ? 'text-finance-green' : 'text-finance-red'}`}>
                  {fb.coverage >= 1 ? '+' : ''}{pln(withdrawalShown - expensesShown)}
                </div>
                <div className="text-[11px] text-gray-600">{fb.coverage >= 1 ? 'nadwyżka miesięczna' : 'brakuje miesięcznie'} · pokrycie {(fb.coverage * 100).toFixed(0)}%</div>
              </div>
            </div>
          </div>

          {/* Faza wypłat — scenariusz bazowy */}
          <div className="glass-card rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-200 mb-1">Faza wypłat — co dalej po roku {fb.year} (wiek {fb.age})?</h3>
            <p className="text-xs text-gray-400 mb-4">
              Przestajesz wpłacać. Kapitał {plnShort(showReal ? fb.totalReal : fb.totalNominal)} nadal pracuje (stopa ważona tym, co w nim jest — start vs wpłaty),
              a Ty co miesiąc wypłacasz — kwoty poniżej to start, w kolejnych latach rosną z inflacją. Ile wypłacasz, zależy od strategii:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  title: 'Wypłacasz tyle, ile potrzebujesz',
                  amount: pln(showReal ? params.expenses : fb.monthlyExpensesNominal),
                  note: `Start w roku ${fb.year}, potem co rok +${params.inflationPct}% inflacji. SWR nie ma tu znaczenia — o kwocie decydują wydatki.`,
                  d: drawdowns.base.expenses,
                },
                {
                  title: `Wypłacasz tylko ${params.swrPct}% kapitału (SWR)`,
                  amount: pln(showReal ? fb.monthlyNetWithdrawalReal : fb.monthlyNetWithdrawalNominal),
                  note: `Klasyczna bezpieczna wypłata, też rosnąca +${params.inflationPct}% rocznie. Pokrywa ${(fb.coverage * 100).toFixed(0)}% wydatków.`,
                  d: drawdowns.base.swr,
                },
              ].map(v => {
                const l = lastsLabel(v.d)
                return (
                  <div key={v.title} className={`rounded-lg p-4 border ${l.ok ? 'bg-emerald-900/15 border-emerald-700/40' : 'bg-red-900/15 border-red-700/40'}`}>
                    <div className="text-xs text-gray-400 mb-1">{v.title}</div>
                    <div className="text-lg font-bold text-white mb-1">{v.amount} <span className="text-xs font-normal text-gray-500">/ mies.</span></div>
                    <div className={`text-sm font-semibold ${l.ok ? 'text-finance-green' : 'text-finance-red'}`}>
                      {v.d.yearsLasting === Infinity ? 'Kapitał starczy do końca życia' : `Starczy na ${v.d.yearsLasting} ${yearsWord(v.d.yearsLasting)} — ${l.text}`}
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1.5">{v.note}</div>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-gray-600 mt-3">
              FIRE osiągasz wtedy, gdy oba warianty się spotykają: wypłata przy SWR pokrywa wydatki i kapitał nigdy się nie kończy.
              Jeśli lewa karta jest czerwona, a prawa zielona — masz bezpieczny kapitał, ale za mały na Twój styl życia.
            </p>
          </div>

          <p className="text-[11px] text-gray-600">
            Symulacja z miesięczną kapitalizacją. Wartości realne = nominalne podzielone przez skumulowaną inflację.
            Belka liczona jako 19% × udział zysku w wartości koszyka — przybliżenie odpowiadające proporcjonalnej wypłacie.
            To model, nie prognoza: rzeczywiste stopy zwrotu i inflacja będą inne.
          </p>
        </div>
      </div>
    </div>
  )
}
