// electron/main/stockAdvisor.ts
// Doradca spółkowy — użytkownik opisuje własnymi słowami, czego szuka, a model
// dostaje jego wytyczne razem z kompletem realnych danych o spółkach i sam dobiera
// oraz uzasadnia rekomendację.
//
// ZASADA: model dostaje WYŁĄCZNIE realne dane rynkowe. Wewnętrzny scoring aplikacji
// (Profitability/Safety/Valuation) nie trafia do promptu — to nasz wskaźnik, nie fakt.
//
// WAŻNE: Ten plik NIE może importować modułów Node.js/Electron — jest ładowany
// dynamicznie także przez dev-api-plugin.ts (Vite), tak samo jak bonds.ts.

import type { StockProfile, AdvisorFilters } from '../../src/lib/types'

export const DEFAULT_FILTERS: Required<AdvisorFilters> = {
  limit: 60,
  dividendOnly: false,
}

/**
 * Rozszerzenie uniwersum spółek TYLKO dla Doradcy. EXCHANGE_CONFIG w stockScreener.ts
 * zostaje nietknięty — zawiera 20 największych spółek per giełda, co dla rekomendacji
 * (zwłaszcza dywidendowych) było za wąskie: brakowało REIT-ów, utilities i telekomów.
 *
 * Wszystkie tickery zweryfikowane zapytaniem do Yahoo Finance — zwracają realne notowania.
 * Bazowe tickery z EXCHANGE_CONFIG są dołączane automatycznie przez advisorTickers().
 */
export const ADVISOR_EXTRA_TICKERS: Record<string, string[]> = {
  WSE: [
    'ENA.WA', 'ACP.WA', 'CAR.WA', 'KRU.WA', 'XTB.WA', 'NEU.WA', 'EUR.WA',
    'MIL.WA', 'ING.WA', 'BHW.WA', 'ALR.WA', 'ATT.WA', 'GPW.WA', 'DVL.WA', 'WPL.WA',
    'TEN.WA', 'AMC.WA', 'SNT.WA', 'ASE.WA', 'ECH.WA', 'LWB.WA', 'PCR.WA', 'STP.WA',
  ],
  NYQ: [
    'T', 'VZ', 'O', 'MO', 'IBM', 'MMM', 'PFE', 'KMB',
    'ED', 'SO', 'D', 'DUK', 'PM', 'CL', 'GIS',
  ],
  NMS: [],
  LSE: [],
  GER: [],
  PAR: [],
  JPX: [],
}

/** Pełna lista tickerów Doradcy dla danej giełdy — bazowa z EXCHANGE_CONFIG + rozszerzenie. */
export function advisorTickers(baseTickers: string[], exchange: string): string[] {
  return [...new Set([...baseTickers, ...(ADVISOR_EXTRA_TICKERS[exchange] ?? [])])]
}

/**
 * Zawęża listę tylko po to, żeby prompt nie urósł ponad rozsądek.
 * To NIE jest ocena spółek — wyboru dokonuje model na podstawie zapytania użytkownika.
 */
export function selectCandidates(
  profiles: StockProfile[],
  filters: AdvisorFilters = {}
): StockProfile[] {
  const f = { ...DEFAULT_FILTERS, ...filters }
  let list = profiles.filter(p => p.price != null)
  if (f.dividendOnly) list = list.filter(p => (p.dividendYield ?? 0) > 0)
  // Największe spółki najpierw — przy obcinaniu listy zostają te najbardziej płynne
  list = [...list].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
  return list.slice(0, f.limit)
}

// ─── Formatowanie danych ──────────────────────────────────────────────────────

function pct(v: number | null, digits = 1): string {
  return v != null ? (v * 100).toFixed(digits) + '%' : 'brak'
}

function num(v: number | null, digits = 2): string {
  return v != null ? v.toFixed(digits) : 'brak'
}

function money(v: number | null, currency: string, digits = 2): string {
  return v != null ? `${v.toFixed(digits)} ${currency}` : 'brak'
}

function cap(v: number | null): string {
  if (v == null) return 'brak'
  const abs = Math.abs(v)
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  return v.toFixed(0)
}

/** Opis spółki — same realne liczby, wszystkie aspekty, bez naszych ocen. */
function describe(p: StockProfile, index: number, inPortfolio: boolean): string {
  const c = p.currency
  const lines: string[] = []

  lines.push(`${index}. ${p.ticker} — ${p.name}${inPortfolio ? '  [JUŻ W PORTFELU]' : ''}`)

  // CENA na własnej linii — potrzebna do przeliczenia budżetu na liczbę akcji
  lines.push(`   CENA 1 AKCJI: ${money(p.price, c)}` +
    ` | Kapitalizacja: ${cap(p.marketCap)} ${c}` +
    ` | Sektor: ${p.sector ?? 'brak'}${p.industry ? ` / ${p.industry}` : ''}`)

  lines.push(`   Wycena — P/E: ${num(p.trailingPE)} | Forward P/E: ${num(p.forwardPE)}` +
    ` | PEG: ${num(p.pegRatio)} | P/BV: ${num(p.priceToBook)}` +
    ` | EV/EBITDA: ${num(p.enterpriseToEbitda)}` +
    ` | Zakres 52T: ${num(p.week52Low)}–${num(p.week52High)}`)

  lines.push(`   Wzrost — przychody r/r: ${pct(p.revenueGrowth)} | zyski r/r: ${pct(p.earningsGrowth)}` +
    ` | przychody: ${cap(p.totalRevenue)} ${c} | EBITDA: ${cap(p.ebitda)} ${c}`)

  lines.push(`   Rentowność — marża brutto: ${pct(p.grossMargins)} | operacyjna: ${pct(p.operatingMargins)}` +
    ` | netto: ${pct(p.profitMargins)} | ROE: ${pct(p.returnOnEquity)} | ROA: ${pct(p.returnOnAssets)}`)

  lines.push(`   Bilans — dług: ${cap(p.totalDebt)} ${c} | gotówka: ${cap(p.totalCash)} ${c}` +
    ` | dług/kapitał: ${num(p.debtToEquity, 1)} | płynność bieżąca: ${num(p.currentRatio)}` +
    ` | FCF: ${cap(p.freeCashflow)} ${c} | CF operacyjny: ${cap(p.operatingCashflow)} ${c}`)

  lines.push(`   Ryzyko i notowania — beta: ${num(p.beta)}` +
    ` | short: ${p.shortPercentOfFloat != null ? pct(p.shortPercentOfFloat) + ' float' : 'brak'}` +
    ` | udział instytucji: ${pct(p.heldPercentInstitutions, 0)}` +
    ` | śr. 50d: ${num(p.fiftyDayAverage)} | śr. 200d: ${num(p.twoHundredDayAverage)}` +
    ` | śr. wolumen: ${cap(p.averageVolume)}`)

  // Dywidendy — pełny obraz tylko gdy spółka faktycznie płaci
  if ((p.dividendYield ?? 0) > 0) {
    lines.push(`   Dywidenda — stopa: ${pct(p.dividendYield, 2)}${p.yieldIsEstimated ? ' (policzona z historii wypłat)' : ''}` +
      ` | ROCZNA KWOTA NA AKCJĘ: ${money(p.dividendRate, c)} | payout: ${pct(p.payoutRatio, 0)}` +
      ` | wypłat w roku: ${p.paymentsPerYear || '?'}` +
      ` | lat nieprzerwanych wypłat: ${p.streakYears}` +
      ` | wzrost dywidendy (CAGR): ${p.cagr5y != null ? pct(p.cagr5y) : 'brak danych'}` +
      (p.lastCutYear != null ? ` | ostatnie obniżenie: ${p.lastCutYear}` : ' | bez obniżek'))
    const recent = p.annualTotals.slice(-10)
    if (recent.length > 0) {
      lines.push(`   Wypłaty rok po roku (${c}/akcję): ${recent.map(a => `${a.year}: ${a.total.toFixed(2)}`).join(' | ')}`)
    }
  } else {
    lines.push('   Dywidenda — nie wypłaca')
  }

  if (p.numberOfAnalysts) {
    const rt = p.recommendationTrend
    const dist = rt ? ` | rozkład ocen: mocne kupno ${rt.strongBuy}, kupno ${rt.buy}, trzymaj ${rt.hold}, sprzedaj ${rt.sell}, mocna sprzedaż ${rt.strongSell}` : ''
    lines.push(`   Analitycy (${p.numberOfAnalysts}): ${p.analystRecommendation ?? 'brak'}` +
      ` | cel cenowy: ${money(p.targetMeanPrice, c)}${dist}`)
  }

  if (p.earningsHistory?.length) {
    const hist = p.earningsHistory
      .map(h => `${h.period}: prognoza ${num(h.epsEstimate)} / wynik ${num(h.epsActual)}` +
        (h.surprisePercent != null ? ` (${h.surprisePercent >= 0 ? '+' : ''}${(h.surprisePercent * 100).toFixed(1)}%)` : ''))
      .join(' | ')
    lines.push(`   Historia EPS: ${hist}`)
  }

  if (p.earningsTrend?.length) {
    const fc = p.earningsTrend
      .map(t => `${t.period}: EPS ~${num(t.epsEstimate)}` +
        (t.growth != null ? `, wzrost ${(t.growth * 100).toFixed(1)}%` : ''))
      .join(' | ')
    lines.push(`   Prognozy analityków: ${fc}`)
  }

  if (p.nextEarningsDate) lines.push(`   Najbliższe wyniki: ${p.nextEarningsDate}`)

  return lines.join('\n')
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

export interface AdvisorPromptParams {
  /** Zapytanie użytkownika własnymi słowami — to ono steruje całą analizą */
  userQuery: string
  profiles: StockProfile[]
  exchangeLabel: string
  portfolioTickers: string[]
  dataDate: string
  /** Kursy walut notowań → PLN, żeby model mógł przeliczyć budżet podany w złotówkach */
  fxRates?: Record<string, number>
}

export function buildAdvisorPrompt(params: AdvisorPromptParams): { system: string; user: string } {
  const { userQuery, profiles, exchangeLabel, portfolioTickers, dataDate, fxRates } = params
  const inPortfolio = new Set(portfolioTickers.map(t => t.toUpperCase()))

  const system =
    'Jesteś analitykiem giełdowym. Piszesz po polsku, konkretnie i rzeczowo, używając markdown: ' +
    '**bold** dla kluczowych liczb, listy punktowane dla argumentów i ryzyk. ' +
    'Odpowiadasz DOKŁADNIE na to, o co pyta użytkownik — jeśli szuka spółek dywidendowych, oceniasz ' +
    'dywidendy; jeśli wzrostowych, oceniasz dynamikę przychodów i zysków; jeśli tanich, oceniasz wycenę. ' +
    'Gdy użytkownik podaje kwotę do zainwestowania, ZAWSZE przeliczasz ją na konkretną liczbę akcji ' +
    'i spodziewany dochód. Opierasz się WYŁĄCZNIE na danych podanych w wiadomości użytkownika. ' +
    'Nigdy nie podajesz spółek spoza przekazanej listy i nigdy nie wymyślasz liczb, których nie ma w danych.'

  // Kursy tylko dla walut faktycznie występujących na liście
  const usedCurrencies = [...new Set(profiles.map(p => p.currency))]
  const fxLines = usedCurrencies
    .map(c => {
      if (c === 'PLN') return '- 1 PLN = 1 PLN'
      const rate = fxRates?.[c]
      return rate ? `- 1 ${c} = ${rate.toFixed(4)} PLN` : null
    })
    .filter(Boolean) as string[]

  const list = profiles
    .map((p, i) => describe(p, i + 1, inPortfolio.has(p.ticker.toUpperCase())))
    .join('\n\n')

  const user = `## CZEGO SZUKA UŻYTKOWNIK

${userQuery.trim()}

## DOSTĘPNE SPÓŁKI (${exchangeLabel}, ${profiles.length} pozycji)

Dane z ${dataDate}, źródło: Yahoo Finance — realne wartości rynkowe i historyczne wypłaty dywidend.
${fxLines.length > 0 ? `\nKURSY WALUT (do przeliczeń budżetu):\n${fxLines.join('\n')}\n` : ''}
${list}

## ZADANIE

Dobierz spółki, które najlepiej odpowiadają na powyższe zapytanie użytkownika, i uzasadnij wybór.

KRYTYCZNE ZASADY — przestrzegaj bezwzględnie:
- Rekomenduj WYŁĄCZNIE spółki z powyższej listy. Nie dodawaj żadnych innych tickerów.
- Każda liczba, którą podajesz, musi pochodzić z powyższych danych lub być z nich wyliczona.
- Jeśli czegoś brakuje w danych, napisz wprost „brak danych" zamiast zgadywać.
- Skup się na kryteriach, o które pyta użytkownik. Pozostałe aspekty poruszaj tylko wtedy, gdy stanowią istotne ryzyko.
- Jeśli żadna spółka nie spełnia oczekiwań użytkownika, powiedz to wprost zamiast dopasowywać na siłę.
- Spółki oznaczone [JUŻ W PORTFELU] omawiaj pod kątem dokupienia, nie pierwszego zakupu.
- Wskaż sygnały ostrzegawcze widoczne w danych (payout powyżej 100%, malejące wypłaty, ujemne marże, dług znacznie przewyższający gotówkę, ujemny FCF).

JEŚLI UŻYTKOWNIK PODAŁ KWOTĘ DO ZAINWESTOWANIA — dla każdej rekomendowanej spółki policz i podaj:
- ile pełnych akcji kupi za tę kwotę (kwota ÷ cena 1 akcji; przy walucie innej niż PLN najpierw przelicz kursem powyżej)
- faktyczny koszt zakupu i ile gotówki zostanie niewykorzystane
- spodziewaną roczną dywidendę brutto (liczba akcji × roczna kwota na akcję), również w PLN
- zaznacz, jeśli za podaną kwotę nie da się kupić ani jednej akcji

Struktura odpowiedzi:
1. **Rekomendacje** — 3–5 spółek najlepiej pasujących do zapytania, każda z konkretnym uzasadnieniem liczbowym (oraz wyliczeniem dla budżetu, jeśli został podany)
2. **Dlaczego nie inne** — krótko, które spółki odpadły i z jakiego powodu
3. **Ryzyka** — co może się nie udać w przypadku rekomendowanych spółek
4. **Uwaga o dywersyfikacji** — czy wskazane spółki nie koncentrują się w jednym sektorze`

  return { system, user }
}
