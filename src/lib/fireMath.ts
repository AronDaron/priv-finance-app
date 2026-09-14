// src/lib/fireMath.ts
// FIRE (Financial Independence, Retire Early) — czysta matematyka, bez zależności.
//
// Model: symulacja miesięczna. Kapitał podzielony na trzy koszyki podatkowe:
//   - regular — zwykłe konto maklerskie: przy wypłacie Belka 19% od ZYSKU
//   - ike     — IKE: przy wypłacie 0%
//   - ikze    — IKZE: przy wypłacie ryczałt 10% od CAŁEJ kwoty
// Belka liczona jest efektywnie: podatek = wypłata × 19% × (zysk / wartość koszyka).
// To standardowe przybliżenie — każda wypłata to proporcjonalnie część kapitału i część zysku.
//
// „Liczba FIRE" (potrzebny kapitał) uwzględnia podatek, więc przecięcie linii kapitału
// z linią FIRE na wykresie pokrywa się z rokiem, w którym wypłata NETTO pokrywa wydatki.

export interface FireBucket {
  value: number  // bieżąca wartość PLN
  cost: number   // suma wpłat PLN (koszt nabycia) — do liczenia zysku pod Belkę
}

export interface FireInputs {
  currentAge: number
  years: number                        // horyzont inwestowania w latach
  monthlyContribution: number          // PLN, dzisiejsza wartość
  contributionGrowsWithInflation: boolean
  monthlyExpenses: number              // PLN, dzisiejsze
  inflationRate: number                // ułamek roczny, np. 0.03
  returnRate: number                   // ułamek roczny dla NOWYCH wpłat, np. 0.07
  /** Stopa dla kapitału startowego (np. ważona z jego alokacji). Domyślnie = returnRate. */
  legacyReturnRate?: number
  swr: number                          // bezpieczna stopa wypłaty, ułamek, np. 0.04
  ikeShare: number                     // ułamek wpłat kierowany na IKE (0–1)
  ikzeShare: number                    // ułamek wpłat kierowany na IKZE (0–1)
  current: { regular: FireBucket; ike: FireBucket; ikze: FireBucket }
}

export interface FireYear {
  year: number                         // 1..N
  age: number
  totalNominal: number
  totalReal: number                    // w dzisiejszych PLN
  contributedTotal: number             // suma wszystkich wpłat do tego roku (nominalnie)
  fireNumberNominal: number            // kapitał potrzebny, by wypłata netto pokryła wydatki
  fireNumberReal: number
  monthlyNetWithdrawalNominal: number  // co miesiąc „na rękę" przy SWR, po podatkach
  monthlyNetWithdrawalReal: number
  monthlyExpensesNominal: number       // dzisiejsze wydatki urealnione inflacją
  coverage: number                     // wypłata netto / wydatki (1.0 = dokładnie pokrywa)
  fireReached: boolean
  effectiveTaxRate: number             // ważona stawka podatku od wypłaty
  buckets: { regular: FireBucket; ike: FireBucket; ikze: FireBucket }
}

export interface FireResult {
  years: FireYear[]
  fireYear: number | null              // pierwszy rok z fireReached
  fireAge: number | null
  final: FireYear
}

export const BELKA_RATE = 0.19
export const IKZE_WITHDRAWAL_RATE = 0.10

/** Miesięczna stopa równoważna rocznej — kapitalizacja składana, nie r/12. */
function monthlyRate(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1
}

/** Efektywna stawka podatku od wypłaty z danego koszyka. */
function bucketTaxRate(kind: 'regular' | 'ike' | 'ikze', b: FireBucket): number {
  if (kind === 'ike') return 0
  if (kind === 'ikze') return IKZE_WITHDRAWAL_RATE
  if (b.value <= 0) return 0
  const gainShare = Math.max(0, (b.value - b.cost) / b.value)
  return BELKA_RATE * gainShare
}

export function simulateFire(inp: FireInputs): FireResult {
  // Kapitał startowy i nowe wpłaty mogą mieć różne alokacje, więc rosną różnymi stopami.
  // Każdy koszyk podatkowy śledzi je osobno; Belka liczona jest od sumy.
  const rFresh = monthlyRate(inp.returnRate)
  const rLegacy = monthlyRate(inp.legacyReturnRate ?? inp.returnRate)
  const regularShare = Math.max(0, 1 - inp.ikeShare - inp.ikzeShare)

  type Part = { legacy: number; fresh: number; cost: number }
  const b: Record<'regular' | 'ike' | 'ikze', Part> = {
    regular: { legacy: inp.current.regular.value, fresh: 0, cost: inp.current.regular.cost },
    ike: { legacy: inp.current.ike.value, fresh: 0, cost: inp.current.ike.cost },
    ikze: { legacy: inp.current.ikze.value, fresh: 0, cost: inp.current.ikze.cost },
  }
  const asBucket = (p: Part): FireBucket => ({ value: p.legacy + p.fresh, cost: p.cost })
  let contributedTotal = b.regular.cost + b.ike.cost + b.ikze.cost

  const years: FireYear[] = []
  let fireYear: number | null = null

  for (let y = 1; y <= inp.years; y++) {
    const inflationFactor = Math.pow(1 + inp.inflationRate, y)
    // Wpłata w tym roku — stała albo urealniona inflacją z poprzedniego roku
    const contribution = inp.contributionGrowsWithInflation
      ? inp.monthlyContribution * Math.pow(1 + inp.inflationRate, y - 1)
      : inp.monthlyContribution

    for (let m = 0; m < 12; m++) {
      for (const [kind, share] of [['regular', regularShare], ['ike', inp.ikeShare], ['ikze', inp.ikzeShare]] as const) {
        const part = b[kind]
        part.legacy *= 1 + rLegacy
        part.fresh = part.fresh * (1 + rFresh) + contribution * share
        part.cost += contribution * share
      }
      contributedTotal += contribution
    }

    const bk = { regular: asBucket(b.regular), ike: asBucket(b.ike), ikze: asBucket(b.ikze) }
    const totalNominal = bk.regular.value + bk.ike.value + bk.ikze.value

    // Ważony podatek od wypłaty przy proporcjonalnym czerpaniu z każdego koszyka
    const effectiveTaxRate = totalNominal > 0
      ? (bk.regular.value * bucketTaxRate('regular', bk.regular)
        + bk.ike.value * bucketTaxRate('ike', bk.ike)
        + bk.ikze.value * bucketTaxRate('ikze', bk.ikze)) / totalNominal
      : 0

    const grossAnnualWithdrawal = totalNominal * inp.swr
    const netAnnualWithdrawal = grossAnnualWithdrawal * (1 - effectiveTaxRate)
    const monthlyNetWithdrawalNominal = netAnnualWithdrawal / 12

    const monthlyExpensesNominal = inp.monthlyExpenses * inflationFactor
    const annualExpensesNominal = monthlyExpensesNominal * 12

    // Potrzebny kapitał: tyle, żeby swr × kapitał × (1 − podatek) = roczne wydatki
    const fireNumberNominal = inp.swr > 0 && effectiveTaxRate < 1
      ? annualExpensesNominal / (inp.swr * (1 - effectiveTaxRate))
      : Infinity

    const coverage = monthlyExpensesNominal > 0 ? monthlyNetWithdrawalNominal / monthlyExpensesNominal : Infinity
    const fireReached = coverage >= 1
    if (fireReached && fireYear === null) fireYear = y

    years.push({
      year: y,
      age: inp.currentAge + y,
      totalNominal,
      totalReal: totalNominal / inflationFactor,
      contributedTotal,
      fireNumberNominal,
      fireNumberReal: fireNumberNominal / inflationFactor,
      monthlyNetWithdrawalNominal,
      monthlyNetWithdrawalReal: monthlyNetWithdrawalNominal / inflationFactor,
      monthlyExpensesNominal,
      coverage,
      fireReached,
      effectiveTaxRate,
      buckets: bk,
    })
  }

  return {
    years,
    fireYear,
    fireAge: fireYear !== null ? inp.currentAge + fireYear : null,
    final: years[years.length - 1],
  }
}

// ─── Ważona stopa zwrotu z alokacji portfela ──────────────────────────────────
// Jedna stopa dla całego kapitału to uproszczenie: obligacje skarbowe dają CPI + marża,
// metale historycznie okolice inflacji, akcje/ETF najwięcej. Ważymy udziałami klas w portfelu
// i zakładamy, że przyszłe wpłaty idą w tej samej proporcji.

export interface AssetAllocation {
  stocks: number   // akcje, ETF, fundusze — wartość PLN
  bonds: number    // obligacje skarbowe
  metals: number   // złoto, srebro (fizyczne i kontrakty)
  cash: number     // gotówka
}

export interface ClassReturns {
  stocks: number   // ułamek roczny — to jest stopa scenariusza (pesym./bazowy/optym.)
  bonds: number
  metals: number
  cash: number
}

/** Udziały klas (sumują się do 1). Pusty portfel → 100% akcje, bo tam idą wpłaty. */
export function allocationShares(a: AssetAllocation): AssetAllocation {
  const total = a.stocks + a.bonds + a.metals + a.cash
  if (total <= 0) return { stocks: 1, bonds: 0, metals: 0, cash: 0 }
  return { stocks: a.stocks / total, bonds: a.bonds / total, metals: a.metals / total, cash: a.cash / total }
}

export function weightedReturn(shares: AssetAllocation, returns: ClassReturns): number {
  return shares.stocks * returns.stocks
    + shares.bonds * returns.bonds
    + shares.metals * returns.metals
    + shares.cash * returns.cash
}

/** Trzy scenariusze różniące się wyłącznie stopą zwrotu. */
export interface FireScenarios {
  pessimistic: FireResult
  base: FireResult
  optimistic: FireResult
}

export interface ScenarioRates {
  /** Stopa dla nowych wpłat */
  fresh: number
  /** Stopa dla kapitału startowego (ważona z jego alokacji) */
  legacy: number
}

export function simulateScenarios(
  base: Omit<FireInputs, 'returnRate' | 'legacyReturnRate'>,
  rates: { pessimistic: number | ScenarioRates; base: number | ScenarioRates; optimistic: number | ScenarioRates }
): FireScenarios {
  const norm = (r: number | ScenarioRates): ScenarioRates => typeof r === 'number' ? { fresh: r, legacy: r } : r
  const run = (r: number | ScenarioRates) => {
    const { fresh, legacy } = norm(r)
    return simulateFire({ ...base, returnRate: fresh, legacyReturnRate: legacy })
  }
  return { pessimistic: run(rates.pessimistic), base: run(rates.base), optimistic: run(rates.optimistic) }
}

// ─── Faza wypłat (drawdown) ───────────────────────────────────────────────────
// Po osiągnięciu FIRE przestajesz wpłacać i zaczynasz wypłacać. Kapitał nadal pracuje,
// ale wypłaty rosną z inflacją. Pytanie: na ile lat starczy?
//
// Uwaga: to NIE jest SWR × kapitał — wypłacamy tyle, ile realnie potrzeba na wydatki
// (brutto, z podatkiem), niezależnie od tego, jaki procent kapitału to stanowi.

export interface DrawdownInputs {
  startCapital: number             // kapitał nominalny w chwili startu wypłat
  startMonthlyExpenses: number     // wydatki nominalne w chwili startu (już urealnione inflacją)
  returnRate: number               // ułamek roczny
  inflationRate: number            // ułamek roczny
  effectiveTaxRate: number         // ważony podatek od wypłaty (jak w FireYear)
  startAge: number
  maxYears?: number                // horyzont symulacji, domyślnie do 100. roku życia
}

export interface DrawdownYear {
  year: number                     // 1..N od startu wypłat
  age: number
  capitalNominal: number           // na koniec roku (0 gdy wyczerpany)
  capitalReal: number              // w złotówkach z chwili startu wypłat
  monthlyWithdrawalGross: number   // nominalnie, z podatkiem
}

export interface DrawdownResult {
  years: DrawdownYear[]
  /** Liczba pełnych lat, przez które kapitał wystarcza; Infinity gdy nigdy się nie kończy */
  yearsLasting: number
  depletedAtAge: number | null     // wiek, w którym kapitał spada do zera
  /** true gdy w horyzoncie kapitał realny nie maleje — wypłaty pokrywane z zysków */
  sustainable: boolean
}

export function simulateDrawdown(inp: DrawdownInputs): DrawdownResult {
  const rM = monthlyRate(inp.returnRate)
  const maxYears = inp.maxYears ?? Math.max(1, 100 - inp.startAge)
  const years: DrawdownYear[] = []

  let capital = inp.startCapital
  let depletedYear: number | null = null

  for (let y = 1; y <= maxYears; y++) {
    const inflationFactor = Math.pow(1 + inp.inflationRate, y - 1)
    // Netto na życie → brutto z kapitału (podatek płacony przy wypłacie)
    const monthlyNet = inp.startMonthlyExpenses * inflationFactor
    const monthlyGross = inp.effectiveTaxRate < 1 ? monthlyNet / (1 - inp.effectiveTaxRate) : Infinity

    for (let m = 0; m < 12; m++) {
      capital = capital * (1 + rM) - monthlyGross
      if (capital <= 0) { capital = 0; break }
    }

    years.push({
      year: y,
      age: inp.startAge + y,
      capitalNominal: capital,
      capitalReal: capital / Math.pow(1 + inp.inflationRate, y),
      monthlyWithdrawalGross: monthlyGross,
    })

    if (capital <= 0) { depletedYear = y; break }
  }

  const last = years[years.length - 1]
  const first = years[0]
  // Zrównoważone, gdy po całym horyzoncie kapitał realny nie spadł poniżej startowego
  const sustainable = depletedYear === null && last.capitalReal >= inp.startCapital * 0.999
    && (years.length < 2 || last.capitalReal >= first.capitalReal * 0.999)

  return {
    years,
    yearsLasting: depletedYear !== null ? depletedYear - 1 : Infinity,
    depletedAtAge: depletedYear !== null ? inp.startAge + depletedYear : null,
    sustainable,
  }
}
