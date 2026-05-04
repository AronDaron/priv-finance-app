// electron/main/bonds.ts
// Logika obliczeniowa polskich obligacji skarbowych.
// WAŻNE: Ten plik NIE może importować żadnych modułów Node.js/Electron (database, app, itp.),
// ponieważ jest używany dynamicznie przez dev-api-plugin.ts (Vite).
// Zależności DB przekazywane są jako callbacki.

export type BondType = 'OTS' | 'ROR' | 'DOR' | 'TOS' | 'COI' | 'EDO' | 'ROS' | 'ROD'

// Minimalna struktura potrzebna do obliczeń (podzbiór DBPortfolioAsset)
export interface BondAssetData {
  ticker: string
  quantity: number
  purchase_date: string
  bond_type: string | null
  bond_year1_rate: number | null
  bond_maturity_date: string | null
}

export interface BondValueResult {
  currentValuePerBond: number  // PLN
  totalValue: number           // PLN
  baseValue: number            // nominał + odsetki z zakończonych lat
  accruedInterest: number      // odsetki narosłe w bieżącym roku
  bondYearNum: number          // aktualny rok obligacji (1, 2…)
  currentYearRate: number      // stopa bieżącego roku (ułamek, np. 0.0625)
  maturityDate: string         // 'YYYY-MM-DD'
  isMatured: boolean
}

const FACE_VALUE = 100 // PLN — stała wartość nominalna obligacji detalicznych

// ─── Parsowanie tickera ───────────────────────────────────────────────────────

export function parseBondTicker(ticker: string): { bondType: BondType; maturityMonth: number; maturityYear: number } | null {
  const match = ticker.match(/^([A-Z]{3})(\d{2})(\d{2})$/)
  if (!match) return null
  const bondType = match[1] as BondType
  const validTypes: BondType[] = ['OTS', 'ROR', 'DOR', 'TOS', 'COI', 'EDO', 'ROS', 'ROD']
  if (!validTypes.includes(bondType)) return null
  const maturityMonth = parseInt(match[2], 10)
  const maturityYear = 2000 + parseInt(match[3], 10)
  return { bondType, maturityMonth, maturityYear }
}

// ─── Obliczenia daty ──────────────────────────────────────────────────────────

function daysBetween(from: string, to: string): number {
  const msPerDay = 86400000
  return Math.floor((Date.parse(to) - Date.parse(from)) / msPerDay)
}

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().split('T')[0]
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

// Rzeczywista liczba dni w roku obligacyjnym (365 lub 366 dla roku przestępnego)
function daysInBondYear(periodStart: string, periodEnd: string): number {
  return daysBetween(periodStart, periodEnd)
}

// Liczba dni w roku kalendarzowym zawierającym podaną datę (dla modelu miesięcznego)
function daysInYear(dateStr: string): number {
  const year = new Date(dateStr).getFullYear()
  return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365
}

// ─── Stopy procentowe per typ/rok ─────────────────────────────────────────────

// Domyślne marże per typ — używane jako fallback gdy brak danych z DB
const DEFAULT_MARGINS: Partial<Record<BondType, number>> = {
  COI: 1.5,
  EDO: 1.75,
  ROS: 2.0,
  ROD: 2.5,
}

// Miesiąc referencyjny CPI: 2 miesiące przed początkiem okresu odsetkowego
// np. rok 2 startuje w marcu → referencja = styczeń (ogłoszony przez GUS w lutym)
function getCpiReferenceMonth(purchaseDate: string, yearNum: number): { year: number; month: number } {
  const anniversary = addYears(purchaseDate, yearNum - 1)
  const d = new Date(anniversary)
  let month = d.getMonth() + 1 - 2  // 2 miesiące wstecz
  let year = d.getFullYear()
  if (month <= 0) { month += 12; year -= 1 }
  return { year, month }
}

function getRateForYear(
  bondType: BondType,
  yearNum: number,
  purchaseDate: string,
  year1Rate: number,  // w %, np. 6.25
  lookupCpi: (year: number) => number | null,
  lookupNbpRate: (date: string) => number | null,
  lookupMargin?: () => number | null,  // marża z DB per ticker
  lookupMonthlyCpi?: (year: number, month: number) => number | null,  // miesięczne CPI GUS
): number {
  if (yearNum === 1) return year1Rate / 100

  switch (bondType) {
    case 'OTS':
    case 'TOS':
      return year1Rate / 100

    case 'ROR':
    case 'DOR': {
      const nbpRate = lookupNbpRate(purchaseDate)
      return (nbpRate ?? year1Rate) / 100
    }

    case 'COI':
    case 'EDO':
    case 'ROS':
    case 'ROD': {
      const { year: refYear, month: refMonth } = getCpiReferenceMonth(purchaseDate, yearNum)
      const monthlyCpi = lookupMonthlyCpi?.(refYear, refMonth)
      if (monthlyCpi === null || monthlyCpi === undefined) {
        // Miesięczne CPI niedostępne — dane GUS jeszcze nie opublikowane
        throw new Error(`PENDING_GUS_DATA:${refYear}-${String(refMonth).padStart(2, '0')}`)
      }
      const margin = lookupMargin?.() ?? DEFAULT_MARGINS[bondType] ?? 1.75
      return (monthlyCpi + margin) / 100
    }

    default:
      return year1Rate / 100
  }
}

// ─── Model 1: Kapitalizacja roczna (OTS, TOS, EDO, ROS, ROD) ─────────────────
// Odsetki każdego roku powiększają bazę dla kolejnego roku (procent składany).

function calculateCapitalizing(
  asset: BondAssetData,
  today: string,
  getRate: (y: number) => number,
): BondValueResult {
  const purchaseDate = asset.purchase_date!
  const maturityDate = asset.bond_maturity_date!

  if (today >= maturityDate) {
    const parsed = parseBondTicker(asset.ticker)
    const totalYears = parsed ? Math.round(daysBetween(purchaseDate, maturityDate) / 365) : 1
    let baseValue = FACE_VALUE
    for (let y = 1; y <= totalYears; y++) {
      baseValue = Math.round((baseValue + baseValue * getRate(y)) * 100) / 100
    }
    return {
      currentValuePerBond: baseValue,
      totalValue: baseValue * asset.quantity,
      baseValue,
      accruedInterest: 0,
      bondYearNum: totalYears,
      currentYearRate: getRate(totalYears),
      maturityDate,
      isMatured: true,
    }
  }

  // Znajdź aktualny rok obligacji używając rzeczywistych rocznic (poprawne dla lat przestępnych)
  let bondYearNum = 1
  while (today >= addYears(purchaseDate, bondYearNum)) bondYearNum++

  let baseValue = FACE_VALUE
  for (let y = 1; y < bondYearNum; y++) {
    baseValue = Math.round((baseValue + baseValue * getRate(y)) * 100) / 100
  }

  const anniversaryStart = addYears(purchaseDate, bondYearNum - 1)
  const anniversaryEnd = addYears(purchaseDate, bondYearNum)
  const daysInCurrentYear = daysBetween(anniversaryStart, today)
  const bondYearDays = daysInBondYear(anniversaryStart, anniversaryEnd)
  const currentYearRate = getRate(bondYearNum)
  const accruedInterest = Math.round(baseValue * currentYearRate * (daysInCurrentYear / bondYearDays) * 100) / 100

  return {
    currentValuePerBond: baseValue + accruedInterest,
    totalValue: (baseValue + accruedInterest) * asset.quantity,
    baseValue,
    accruedInterest,
    bondYearNum,
    currentYearRate,
    maturityDate,
    isMatured: false,
  }
}

// ─── Model 2: Kupon roczny bez kapitalizacji (COI) ────────────────────────────
// Baza = zawsze 100 PLN. Każdy roczny kupon liczony od 100, zaokrąglany do grosza.
// baseValue w wyniku = 100 + suma wypłaconych kuponów (dla ciągłości P&L w portfelu).

function calculateCouponAnnual(
  asset: BondAssetData,
  today: string,
  getRate: (y: number) => number,
): BondValueResult {
  const purchaseDate = asset.purchase_date!
  const maturityDate = asset.bond_maturity_date!

  if (today >= maturityDate) {
    const parsed = parseBondTicker(asset.ticker)
    const totalYears = parsed ? Math.round(daysBetween(purchaseDate, maturityDate) / 365) : 1
    let paidCoupons = 0
    for (let y = 1; y <= totalYears; y++) {
      paidCoupons += Math.round(FACE_VALUE * getRate(y) * 100) / 100
    }
    const finalValue = FACE_VALUE + paidCoupons
    return {
      currentValuePerBond: finalValue,
      totalValue: finalValue * asset.quantity,
      baseValue: FACE_VALUE + paidCoupons,
      accruedInterest: 0,
      bondYearNum: totalYears,
      currentYearRate: getRate(totalYears),
      maturityDate,
      isMatured: true,
    }
  }

  // Znajdź aktualny rok obligacji używając rzeczywistych rocznic (poprawne dla lat przestępnych)
  let bondYearNum = 1
  while (today >= addYears(purchaseDate, bondYearNum)) bondYearNum++

  // Suma kuponów z zakończonych lat — każdy liczony od 100 PLN
  let paidCoupons = 0
  for (let y = 1; y < bondYearNum; y++) {
    paidCoupons += Math.round(FACE_VALUE * getRate(y) * 100) / 100
  }

  const anniversaryStart = addYears(purchaseDate, bondYearNum - 1)
  const anniversaryEnd = addYears(purchaseDate, bondYearNum)
  const daysInCurrentYear = daysBetween(anniversaryStart, today)
  const bondYearDays = daysInBondYear(anniversaryStart, anniversaryEnd)
  const currentYearRate = getRate(bondYearNum)
  const accruedInterest = Math.round(FACE_VALUE * currentYearRate * (daysInCurrentYear / bondYearDays) * 100) / 100

  const baseValue = FACE_VALUE + paidCoupons
  return {
    currentValuePerBond: baseValue + accruedInterest,
    totalValue: (baseValue + accruedInterest) * asset.quantity,
    baseValue,
    accruedInterest,
    bondYearNum,
    currentYearRate,
    maturityDate,
    isMatured: false,
  }
}

// ─── Model 3: Kupon miesięczny bez kapitalizacji (ROR, DOR) ──────────────────
// Baza = zawsze 100 PLN. Okresy miesięczne. Stopa NBP obowiązująca na start miesiąca.
// Wzór per miesiąc: round(100 * nbpRate/100 * daysInPeriod/365, 2)

function calculateCouponMonthly(
  asset: BondAssetData,
  today: string,
  lookupNbpRate: (date: string) => number | null,
): BondValueResult {
  const purchaseDate = asset.purchase_date!
  const maturityDate = asset.bond_maturity_date!
  const year1Rate = asset.bond_year1_rate!

  // Znajdź ile miesięcznych okresów zostało zakończonych
  let completedMonths = 0
  while (addMonths(purchaseDate, completedMonths + 1) <= today &&
         addMonths(purchaseDate, completedMonths + 1) <= maturityDate) {
    completedMonths++
  }

  const isMatured = today >= maturityDate

  // Funkcja pomocnicza: kupon za jeden miesiąc
  const monthCoupon = (monthIndex: number): number => {
    const periodStart = addMonths(purchaseDate, monthIndex)
    const periodEnd = addMonths(purchaseDate, monthIndex + 1)
    const daysInPeriod = daysBetween(periodStart, periodEnd)
    const nbpRate = lookupNbpRate(periodStart) ?? year1Rate
    return Math.round(FACE_VALUE * (nbpRate / 100) * (daysInPeriod / daysInYear(periodStart)) * 100) / 100
  }

  if (isMatured) {
    // Policz wszystkie miesiące do zapadalności
    let totalMonths = 0
    while (addMonths(purchaseDate, totalMonths + 1) <= maturityDate) totalMonths++
    let paidCoupons = 0
    for (let m = 0; m < totalMonths; m++) paidCoupons += monthCoupon(m)
    const finalValue = FACE_VALUE + paidCoupons
    const lastPeriodStart = addMonths(purchaseDate, totalMonths - 1)
    const lastNbpRate = lookupNbpRate(lastPeriodStart) ?? year1Rate
    return {
      currentValuePerBond: finalValue,
      totalValue: finalValue * asset.quantity,
      baseValue: FACE_VALUE + paidCoupons,
      accruedInterest: 0,
      bondYearNum: totalMonths,
      currentYearRate: lastNbpRate / 100,
      maturityDate,
      isMatured: true,
    }
  }

  // Suma wypłaconych kuponów z zakończonych miesięcy
  let paidCoupons = 0
  for (let m = 0; m < completedMonths; m++) paidCoupons += monthCoupon(m)

  // Narosłe odsetki w bieżącym (niepełnym) miesiącu
  const currentMonthStart = addMonths(purchaseDate, completedMonths)
  const daysInCurrentPeriod = daysBetween(currentMonthStart, today)
  const currentNbpRate = lookupNbpRate(currentMonthStart) ?? year1Rate
  const accruedInterest = Math.round(FACE_VALUE * (currentNbpRate / 100) * (daysInCurrentPeriod / daysInYear(currentMonthStart)) * 100) / 100

  const baseValue = FACE_VALUE + paidCoupons
  return {
    currentValuePerBond: baseValue + accruedInterest,
    totalValue: (baseValue + accruedInterest) * asset.quantity,
    baseValue,
    accruedInterest,
    bondYearNum: completedMonths + 1,  // bieżący miesiąc
    currentYearRate: currentNbpRate / 100,
    maturityDate,
    isMatured: false,
  }
}

// ─── Główna funkcja obliczeniowa ──────────────────────────────────────────────

export function calculateBondValue(
  asset: BondAssetData,
  today: string,  // 'YYYY-MM-DD'
  lookupCpi: (year: number) => number | null,
  lookupNbpRate: (date: string) => number | null,
  lookupMargin?: () => number | null,
  lookupMonthlyCpi?: (year: number, month: number) => number | null,
): BondValueResult {
  if (!asset.bond_type || asset.bond_year1_rate === null || !asset.purchase_date || !asset.bond_maturity_date) {
    throw new Error(`Asset ${asset.ticker} nie ma kompletnych danych obligacji`)
  }

  const bondType = asset.bond_type as BondType
  const year1Rate = asset.bond_year1_rate
  const purchaseDate = asset.purchase_date

  // Model 3: miesięczny kupon bez kapitalizacji
  if (bondType === 'ROR' || bondType === 'DOR') {
    return calculateCouponMonthly(asset, today, lookupNbpRate)
  }

  // Model 2: roczny kupon bez kapitalizacji
  if (bondType === 'COI') {
    const getRate = (y: number) => getRateForYear(bondType, y, purchaseDate, year1Rate, lookupCpi, lookupNbpRate, lookupMargin, lookupMonthlyCpi)
    return calculateCouponAnnual(asset, today, getRate)
  }

  // Model 1: kapitalizacja roczna (OTS, TOS, EDO, ROS, ROD)
  const getRate = (y: number) => getRateForYear(bondType, y, purchaseDate, year1Rate, lookupCpi, lookupNbpRate, lookupMargin, lookupMonthlyCpi)
  return calculateCapitalizing(asset, today, getRate)
}

// ─── Pobieranie oprocentowania roku 1 z obligacjeskarbowe.pl ──────────────────

const BOND_TYPE_SLUGS: Record<BondType, string> = {
  OTS: 'obligacje-3-miesieczne-ots',
  ROR: 'obligacje-roczne-ror',
  DOR: 'obligacje-2-letnie-dor',
  TOS: 'obligacje-3-letnie-tos',
  COI: 'obligacje-4-letnie-coi',
  EDO: 'obligacje-10-letnie-edo',
  ROS: 'obligacje-6-letnie-ros',
  ROD: 'obligacje-12-letnie-rod',
}

export interface BondPageData {
  year1Rate: number | null   // oprocentowanie roku 1 w %
  margin: number | null      // marża inflacyjna dla lat 2+ w %
}

export async function fetchBondYear1Rate(ticker: string): Promise<BondPageData> {
  const parsed = parseBondTicker(ticker.toUpperCase())
  if (!parsed) return { year1Rate: null, margin: null }

  const slug = BOND_TYPE_SLUGS[parsed.bondType]
  const url = `https://www.obligacjeskarbowe.pl/oferta-obligacji/${slug}/${ticker.toLowerCase()}/`

  try {
    const response = await fetch(url)
    if (!response.ok) return { year1Rate: null, margin: null }

    const html = await response.text()

    // Oprocentowanie roku 1: "6,55% w pierwszym rocznym okresie odsetkowym"
    const rateMatch = html.match(/Oprocentowanie[^%]*?([\d]+[,.][\d]+)\s*%/)
    const year1Rate = rateMatch ? parseFloat(rateMatch[1].replace(',', '.')) : null

    // Marża inflacyjna: "marża 2,00% + inflacja" lub "marża 1,75% + inflacja"
    const marginMatch = html.match(/mar[żz]a\s+([\d]+[,.][\d]+)\s*%/)
    const margin = marginMatch ? parseFloat(marginMatch[1].replace(',', '.')) : null

    return { year1Rate, margin }
  } catch {
    return { year1Rate: null, margin: null }
  }
}

// ─── Synchronizacja CPI z GUS BDL ────────────────────────────────────────────
// Zmienna 217230 = "wskaźnik cen towarów i usług konsumpcyjnych ogółem, rok poprzedni = 100"
// Zwraca pobrane dane — zapisanie do DB należy do wywołującego (index.ts)

export async function fetchGusAnnualCpi(): Promise<Array<{ year: number; value: number }>> {
  try {
    const url = 'https://bdl.stat.gov.pl/api/v1/data/by-variable/217230?unit-level=0&format=json&page-size=30'
    const response = await fetch(url)
    if (!response.ok) return []

    const data = await response.json() as {
      results?: Array<{
        values?: Array<{ year: number; val: number }>
      }>
    }

    const results = data.results?.[0]?.values ?? []
    return results
      .filter(v => typeof v.year === 'number' && typeof v.val === 'number')
      .map(v => ({ year: v.year, value: v.val - 100 }))  // 103.6 → 3.6%
  } catch {
    return []
  }
}

// ─── Jednorazowy fetch CPI z GUS SDP dla konkretnego miesiąca ────────────────
// Używany on-demand gdy bond calculation rzuca PENDING_GUS_DATA:YYYY-MM.
// GUS SDP: id-zmienna=305, id-przekroj=739, id-pozycja-2=6656078 (ogółem)
//          id-sposob-prezentacji-miara=5 (r/r), id-okres=246+miesiąc
//          wartosc: 102.90000 → 2.90% (odejmujemy 100)

export async function fetchGusMonthCpi(year: number, month: number): Promise<number | null> {
  const url = `https://api-sdp.stat.gov.pl/api/variable/variable-data-section?id-zmienna=305&id-przekroj=739&id-rok=${year}&id-okres=${246 + month}&page-size=5000&page=0&lang=en`
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const data = await response.json() as {
      data?: Array<{ 'id-pozycja-2': number; 'id-sposob-prezentacji-miara': number; wartosc: number | null }>
    }
    const entry = (data.data ?? []).find(e =>
      e['id-sposob-prezentacji-miara'] === 5 && e['id-pozycja-2'] === 6656078 && e.wartosc !== null
    )
    return entry ? Math.round((entry.wartosc! - 100) * 100) / 100 : null
  } catch {
    return null
  }
}


// ─── Fallback CPI ze stooq.pl (gdy GUS SDP jeszcze nie opublikował miesiąca) ──
// Używany jako tymczasowe źródło gdy fetchGusMonthCpi zwraca null.
// Dane są zaokrąglane do 1 miejsca po przecinku — dokładność niższa niż GUS SDP.
// W DB oznaczane source='stooq'; przy kolejnym starcie aplikacji próbowane jest
// nadpisanie precyzyjnymi danymi z GUS SDP.

export async function fetchStooqMonthCpi(year: number, month: number): Promise<number | null> {
  try {
    const response = await fetch('https://stooq.pl/q/d/l/?s=cpiypl.m&i=m')
    if (!response.ok) return null
    const target = `${year}-${String(month).padStart(2, '0')}`
    for (const line of (await response.text()).trim().split('\n').slice(1)) {
      const parts = line.split(',')
      if (parts.length < 5) continue
      if (!parts[0].trim().startsWith(target)) continue
      const val = parseFloat(parts[4].trim())
      return isNaN(val) ? null : Math.round(val * 100) / 100
    }
    return null
  } catch {
    return null
  }
}

// ─── Fallback CPI z TradingEconomics (gdy GUS SDP i stooq nie odpowiadają) ──
// Trzecie źródło wprowadzone gdy stooq zaczął wymagać apikey i GUS SDP
// przestał wystawiać dane bieżącego roku w API.
//
// Hierarchia parserów (pierwszy wygrywa per miesiąc — żeby zrewidowane wartości
// w narracji nie zostały nadpisane starszymi z tabeli Calendar):
//   1. Narracja artykułów: "rose to X% in Month YYYY from Y% in the previous month"
//      — to jedyne miejsce na stronie aktualizowane po REWIZJACH GUS.
//   2. Tabela Related ("Inflation Rate YoY | Last | Previous | Unit | Reference")
//      — daje 2 najnowsze miesiące, też z aktualnymi (zrewidowanymi) wartościami.
//   3. Tabela Calendar (Final/Prel) — uwaga: kolumna "Previous" trzyma wartość
//      Z MOMENTU PUBLIKACJI, nie po późniejszych rewizjach. Używana jako last resort.

export async function fetchTradingEconomicsCpi(year: number, month: number): Promise<number | null> {
  try {
    const response = await fetch('https://tradingeconomics.com/poland/inflation-cpi', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    if (!response.ok) return null
    const html = await response.text()

    const monShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monLong = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const map = new Map<string, number>()
    // first-wins: parser-priorytet rozstrzyga przy konflikcie wartości dla tego samego miesiąca
    const setMonth = (y: number, m: number, v: number) => {
      if (y > 1990 && m >= 1 && m <= 12 && !isNaN(v)) {
        const key = `${y}-${String(m).padStart(2, '0')}`
        if (!map.has(key)) map.set(key, v)
      }
    }
    const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    const prevMonth = (y: number, m: number): [number, number] => m === 1 ? [y - 1, 12] : [y, m - 1]

    // (1) Narracja — najnowsze artykuły są wcześniej w HTML, więc first-wins daje aktualne wartości
    const narrRe = /(?:rose|fell|increased|decreased|declined|stood|remained|edged)[\s\S]{0,40}?(\d+(?:\.\d+)?)%[\s\S]{0,40}?in (January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})[\s\S]{0,80}?from[\s\S]{0,80}?(\d+(?:\.\d+)?)%[\s\S]{0,80}?previous month/gi
    let narr: RegExpExecArray | null
    while ((narr = narrRe.exec(html)) !== null) {
      const cur = parseFloat(narr[1])
      const monIdx = monLong.indexOf(narr[2]) + 1
      const yr = parseInt(narr[3], 10)
      const prev = parseFloat(narr[4])
      if (monIdx > 0) {
        setMonth(yr, monIdx, cur)
        const [py, pm] = prevMonth(yr, monIdx)
        setMonth(py, pm, prev)
      }
    }

    // (2)+(3) Tabele HTML — Related (priorytet 2) i Calendar (priorytet 3)
    // Parsujemy jednym przejściem rzędów, ale wynik wpada do mapy tylko gdy klucz wolny.
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g
    let row: RegExpExecArray | null
    const calendarBuffer: Array<[number, number, number]> = []  // odroczona tabela Calendar
    while ((row = rowRe.exec(html)) !== null) {
      const cells: string[] = []
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g
      let cell: RegExpExecArray | null
      while ((cell = cellRe.exec(row[1])) !== null) cells.push(stripTags(cell[1]))
      if (cells.length === 0) continue

      // Tabela Related (5 kolumn): "Inflation Rate YoY" | Last | Previous | Unit | Reference ("Mon YYYY")
      if (cells.length === 5 && cells[0] === 'Inflation Rate YoY') {
        const refMatch = cells[4].match(/^([A-Z][a-z]{2})\s+(\d{4})$/)
        if (refMatch) {
          const refIdx = monShort.indexOf(refMatch[1])
          if (refIdx >= 0) {
            const refMon = refIdx + 1
            const refYear = parseInt(refMatch[2], 10)
            const last = parseFloat(cells[1].replace('%', '').replace(',', '.'))
            const previous = parseFloat(cells[2].replace('%', '').replace(',', '.'))
            if (!isNaN(last)) setMonth(refYear, refMon, last)
            if (!isNaN(previous)) {
              const [py, pm] = prevMonth(refYear, refMon)
              setMonth(py, pm, previous)
            }
          }
        }
      }

      // Tabela Calendar (8 kolumn) — odroczona, wpada dopiero po wszystkim
      if (cells.length >= 6) {
        const dateMatch = cells[0].match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (dateMatch && /Inflation Rate YoY (Final|Prel)/.test(cells[2] || '')) {
          const releaseMonth = parseInt(dateMatch[2], 10)
          const releaseYear = parseInt(dateMatch[1], 10)
          const refIdx = monShort.indexOf(cells[3])
          if (refIdx >= 0) {
            const refMon = refIdx + 1
            const refYear = refMon <= releaseMonth ? releaseYear : releaseYear - 1
            const actual = parseFloat((cells[4] ?? '').replace('%', '').replace(',', '.'))
            const previous = parseFloat((cells[5] ?? '').replace('%', '').replace(',', '.'))
            if (!isNaN(actual)) calendarBuffer.push([refYear, refMon, actual])
            if (!isNaN(previous)) {
              const [py, pm] = prevMonth(refYear, refMon)
              calendarBuffer.push([py, pm, previous])
            }
          }
        }
      }
    }
    // Wpychamy Calendar dopiero teraz — wypełni miesiące, których narracja+Related nie pokryły
    for (const [y, m, v] of calendarBuffer) setMonth(y, m, v)

    const v = map.get(`${year}-${String(month).padStart(2, '0')}`)
    return v === undefined ? null : Math.round(v * 100) / 100
  } catch {
    return null
  }
}

// ─── Synchronizacja stopy NBP ─────────────────────────────────────────────────
// Zwraca pobrane dane — zapisanie do DB należy do wywołującego (index.ts)

export async function fetchNbpRates(): Promise<Array<{ date: string; rate: number }>> {
  try {
    const response = await fetch('https://api.nbp.pl/api/stopy/referencji/?format=json')
    if (!response.ok) return []

    const data = await response.json() as Array<{ effectiveDate: string; rate: number }>
    if (!Array.isArray(data)) return []

    return data
      .filter(e => e.effectiveDate && typeof e.rate === 'number')
      .map(e => ({ date: e.effectiveDate, rate: e.rate }))
  } catch {
    return []
  }
}
