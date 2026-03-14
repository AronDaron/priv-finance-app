import { useState } from 'react'
import type { RegionScore } from '../../lib/types'
import { analyzeRegionAI } from '../../lib/api'
import { MarkdownRenderer } from '../ai/MarkdownRenderer'

// Metadane składowych: opis + jednostka wartości surowej (jeśli interpretowalana bezpośrednio)
const COMPONENT_META: Record<string, { desc: string; rawUnit?: string; rawLabel?: string }> = {
  'S&P500 (30 dni)':       { desc: 'Zmiana indeksu S&P 500 (500 największych spółek USA) w ciągu ostatnich 30 dni. Wzrost = więcej kapitału w rynku, lepsza koniunktura.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'S&P500 (1 dzień)':      { desc: 'Dzienna zmiana S&P 500. Sygnał bieżącego nastroju inwestorów na rynku amerykańskim.', rawUnit: '%', rawLabel: 'Zmiana dziś' },
  'VIX (strach)':          { desc: 'VIX — indeks zmienności, zwany „indeksem strachu". Niski VIX (<15) = spokój rynków. Wysoki (>30) = panika. Algorytm obniża ocenę regionu gdy VIX rośnie.' },
  'VIX (globalny)':        { desc: 'VIX — globalny indeks strachu. Panika na rynkach USA przenosi się na cały świat — wysoki VIX oznacza odpływ kapitału z każdego regionu.' },
  'VIX (ryzyko)':          { desc: 'VIX — indeks zmienności. Wysoki VIX zwiększa awersję do ryzyka i przyspiesza odpływ kapitału z rynków wschodzących i surowców.' },
  'US10Y Yield':           { desc: 'Rentowność 10-letnich obligacji rządu USA. Powyżej 4–5% oznacza zacieśnienie finansowe — droższa pożyczka dla firm i rządów. Wpływa negatywnie na wyceny akcji globalnie.' },
  'Ropa (import)':         { desc: 'Zmiana ceny ropy (WTI) w ciągu 30 dni. USA/Europa/Azja importują ropę — droga ropa podnosi koszty produkcji i inflację.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'EUR/USD (płynność)':    { desc: 'Dzienna zmiana kursu EUR/USD. Wzrost = euro silniejsze = dolar słabszy = lepsza globalna płynność dolarowa. Słabszy USD historycznie wspiera S&P 500 (wyższe zyski spółek w USD z zagranicy).', rawUnit: '%', rawLabel: 'Zmiana kursu dziś' },
  'Ropa (eksport/prod.)':  { desc: 'Zmiana ceny ropy (WTI) w ciągu 30 dni. USA jest największym producentem ropy na świecie (od 2018) i net-eksporterem (od 2019) — wzrost cen ropy pozytywnie wpływa na sektor energetyczny (~10% S&P 500) i przychody eksportowe.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'DAX + FTSE (30 dni)':   { desc: 'Średnia zmiana DAX (Niemcy, 40 spółek) i FTSE 100 (UK, 100 spółek) w ciągu 30 dni. Reprezentuje szeroki rynek akcji Europy Zachodniej.', rawUnit: '%', rawLabel: 'Zmiana 30d (śr.)' },
  'Indeksy (1 dzień)':     { desc: 'Dzienna zmiana indeksów giełdowych regionu. Szybki sygnał bieżącego nastroju inwestorów.', rawUnit: '%', rawLabel: 'Zmiana dziś (śr.)' },
  'EUR+GBP+CHF (kurs)':    { desc: 'Średnia dzienna zmiana koszyka walut europejskich (EUR, GBP, CHF) vs USD. Umocnienie euro i funta sygnalizuje lepszą kondycję gospodarki Europy.', rawUnit: '%', rawLabel: 'Zmiana koszyka dziś' },
  'Gaz (import)':          { desc: 'Zmiana ceny gazu ziemnego w ciągu 30 dni. Europa importuje gaz — wzrost cen zwiększa koszty energii, inflację i ciąży na marżach firm.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'Gaz (1 dzień)':         { desc: 'Dzienna zmiana ceny gazu ziemnego — kluczowego surowca energetycznego. Wahania wpływają na koszty energii w Europie i Azji.', rawUnit: '%', rawLabel: 'Zmiana dziś' },
  'WIG20 (30 dni)':        { desc: 'Zmiana indeksu WIG20 (20 największych spółek GPW Warszawa) w ciągu 30 dni. Bezpośredni wskaźnik kondycji polskiego rynku akcji.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'WIG20 (1 dzień)':       { desc: 'Dzienna zmiana WIG20. Bieżący nastrój na polskiej giełdzie papierów wartościowych.', rawUnit: '%', rawLabel: 'Zmiana dziś' },
  'PLN/EUR (kurs)':        { desc: 'Zmiana kursu EUR/USD jako proxy siły PLN — Polska jest silnie powiązana gospodarczo ze strefą euro. Słabe euro = słabszy złoty = droższy import.', rawUnit: '%', rawLabel: 'Zmiana kursu dziś' },
  'DAX (korelacja)':       { desc: 'Dzienna zmiana DAX (Niemcy). Polska gospodarka jest silnie skorelowana z Niemcami — głównym partnerem handlowym. Słaby DAX często ciągnie GPW w dół.', rawUnit: '%', rawLabel: 'Zmiana dziś' },
  'Nikkei + FXI (30 dni)': { desc: 'Średnia zmiana Nikkei 225 (Japonia) i FXI (ETF na największe spółki chińskie) w ciągu 30 dni. Reprezentuje dwie największe gospodarki azjatyckie.', rawUnit: '%', rawLabel: 'Zmiana 30d (śr.)' },
  'JPY+CNY+AUD (kurs)':    { desc: 'Średnia dzienna zmiana koszyka walut azjatyckich (jen, juan, dolar australijski) vs USD. Umocnienie = silniejszy region, więcej kapitału napływa do Azji.', rawUnit: '%', rawLabel: 'Zmiana koszyka dziś' },
  'Miedź (przemysł)':      { desc: 'Dzienna zmiana ceny miedzi. Azja (głównie Chiny) to największy konsument miedzi — rosnące ceny sygnalizują silny popyt przemysłowy i ożywienie gospodarcze.', rawUnit: '%', rawLabel: 'Zmiana dziś' },
  'Miedź (1 dzień)':       { desc: 'Dzienna zmiana ceny miedzi. Nazywana „dr. Copper" bo często wyprzedza koniunkturę — wzrost = wzrost popytu przemysłowego.', rawUnit: '%', rawLabel: 'Zmiana dziś' },
  'Miedź (eksport)':       { desc: 'Zmiana ceny miedzi w ciągu 30 dni. Wiele rynków wschodzących (Brazylia, RPA, Chile) eksportuje miedź — wyższe ceny = wyższe przychody z eksportu.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'EWZ EM (30 dni)':       { desc: 'Zmiana ETF EWZ (iShares MSCI Brazil) w ciągu 30 dni. Szeroki proxy rynków wschodzących i Ameryki Łacińskiej — mierzy apetyt na ryzyko w tym regionie.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'EWZ EM (1 dzień)':      { desc: 'Dzienna zmiana ETF EWZ (Brazil/EM). Bieżący nastrój inwestorów wobec rynków wschodzących.', rawUnit: '%', rawLabel: 'Zmiana dziś' },
  'Ropa (eksport)':        { desc: 'Zmiana ceny ropy w ciągu 30 dni. Kraje eksportujące ropę (Brazylia, Arabia Saudyjska, Nigeria) korzystają na jej wzroście — wyższe wpływy budżetowe.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'USD (siła, ryzyko)':    { desc: 'Siła dolara (odwrotność EUR/USD). Silny dolar to ryzyko dla rynków wschodzących: droższy dług denominowany w USD i odpływ kapitału z EM do USA.', rawUnit: '%', rawLabel: 'Siła USD dziś' },
  'Złoto (30 dni)':        { desc: 'Zmiana ceny złota (futures GC=F) w ciągu 30 dni. Wzrost złota sygnalizuje popyt na bezpieczną przystań lub oczekiwania inflacyjne.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'Złoto (eksport)':       { desc: 'Zmiana ceny złota w ciągu 30 dni. Australia i RPA to wiodący producenci złota — wyższe ceny złota bezpośrednio zwiększają wartość ich eksportu.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'Ropa (30 dni)':         { desc: 'Zmiana ceny ropy WTI w ciągu 30 dni. Wpływa na koszty energii i przychody krajów eksportujących surowce energetyczne.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'Pszenica (1 dzień)':    { desc: 'Dzienna zmiana ceny pszenicy (futures ZW=F). Sygnał bezpieczeństwa żywnościowego i kosztów rolniczych — ważne dla krajów eksportujących zboże.', rawUnit: '%', rawLabel: 'Zmiana dziś' },
  'Miedź (30 dni)':        { desc: 'Zmiana ceny miedzi (futures HG=F) w ciągu 30 dni. Nazywana „dr. Copper" — wyprzedza koniunkturę. Wzrost sygnalizuje wzrost popytu przemysłowego, ożywienie w Azji i globalnie.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'Gaz (30 dni)':          { desc: 'Zmiana ceny gazu ziemnego (NG=F) w ciągu 30 dni. Sektor surowcowy korzysta na wzroście cen. Gaz jest jednym z najbardziej zmiennych surowców energetycznych.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'Pszenica (30 dni)':     { desc: 'Zmiana ceny pszenicy (ZW=F) w ciągu 30 dni. Kluczowy surowiec rolny — wzrost cen sygnalizuje napięcia w łańcuchu dostaw żywności lub suszę.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'VWO EM (30 dni)':       { desc: 'Zmiana ETF VWO (Vanguard FTSE Emerging Markets) w ciągu 30 dni. Obejmuje Chiny, Indie, Brazylię, Tajwan, RPA i inne EM — najszerszy proxy globalnego apetytu na ryzyko rynków wschodzących.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'VWO EM (1 dzień)':      { desc: 'Dzienna zmiana ETF VWO. Bieżący nastrój inwestorów wobec rynków wschodzących globalnie.', rawUnit: '%', rawLabel: 'Zmiana dziś' },
  'Nikkei+FXI+INDA (30 dni)': { desc: 'Średnia zmiana Nikkei 225 (Japonia), FXI (Chiny Large-Cap ETF) i INDA (iShares MSCI India) w ciągu 30 dni. Reprezentuje trzy największe rynki akcji Azji: ~50%, ~20% i ~18% azjatyckiej kapitalizacji odpowiednio.', rawUnit: '%', rawLabel: 'Zmiana 30d (śr.)' },
  'EUR+GBP+JPY (kurs)':    { desc: 'Średnia dzienna zmiana koszyka walut rynków rozwiniętych (EUR, GBP, JPY) vs USD. Umocnienie tych walut = słabszy USD = lepsza globalna płynność dolarowa i wyższe zyski spółek DM w przeliczeniu na USD.', rawUnit: '%', rawLabel: 'Zmiana koszyka dziś' },
  'DAX (30 dni)':          { desc: 'Zmiana indeksu DAX (Niemcy) w ciągu ostatnich 30 dni. Główny barometr europejskich rynków rozwiniętych.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'Nikkei (30 dni)':       { desc: 'Zmiana indeksu Nikkei 225 (Japonia) w ciągu ostatnich 30 dni. Największy rynek rozwinięty w Azji.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'FTSE (30 dni)':         { desc: 'Zmiana indeksu FTSE 100 (Wielka Brytania) w ciągu ostatnich 30 dni. Kluczowy rynek europejski.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'ASX200 (30 dni)':       { desc: 'Zmiana australijskiego indeksu ASX 200 (200 największych spółek notowanych w Sydney) w ciągu 30 dni. Główny barometr australijskiej gospodarki.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'ASX200 (1 dzień)':      { desc: 'Dzienna zmiana ASX 200. Bieżący nastrój na australijskiej giełdzie — Australia otwiera sesję jako pierwsza spośród głównych rynków.', rawUnit: '%', rawLabel: 'Zmiana dziś' },
  'AUD/USD (kurs)':        { desc: 'Zmiana kursu dolara australijskiego vs USD. AUD jest walutą surowcową — umacnia się gdy rośnie popyt na rudę żelaza, węgiel i złoto, które Australia eksportuje.', rawUnit: '%', rawLabel: 'Zmiana kursu dziś' },
  'EZA SA (30 dni)':       { desc: 'Zmiana ETF EZA (iShares MSCI South Africa) w ciągu 30 dni. Proxy rynku akcji Afryki Południowej — największej i najdojrzalszej giełdy kontynentu.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'EZA SA (1 dzień)':      { desc: 'Dzienna zmiana ETF EZA. Bieżący nastrój na rynku afrykańskim — RPA jest bramą dla kapitału inwestycyjnego w całej Afryce.', rawUnit: '%', rawLabel: 'Zmiana dziś' },
  'Bovespa (30 dni)':      { desc: 'Zmiana brazylijskiego indeksu Bovespa (B3 São Paulo) w ciągu 30 dni. Największa giełda Ameryki Łacińskiej — kluczowy barometr całego regionu.', rawUnit: '%', rawLabel: 'Zmiana 30d' },
  'Bovespa (1 dzień)':     { desc: 'Dzienna zmiana Bovespa. Bieżący nastrój na rynku latynoamerykańskim.', rawUnit: '%', rawLabel: 'Zmiana dziś' },
}

function ComponentBar({ name, rawValue, contribution, weight }: {
  name: string
  rawValue: number
  contribution: number
  weight: number
}) {
  const isPos = contribution >= 0
  const maxWidth = 120
  const barWidth = Math.min(Math.abs(contribution) / 25 * maxWidth, maxWidth)
  const meta = COMPONENT_META[name]

  return (
    <div className="py-3 border-b border-gray-700/30 last:border-0">
      {/* Wiersz: nazwa + pasek + score + waga */}
      <div className="flex items-center gap-3">
        <div className="w-44 text-xs text-white font-medium flex-shrink-0 leading-tight">{name}</div>
        <div className="flex items-center gap-1 flex-1">
          <div className="flex-1 flex justify-end">
            {!isPos && (
              <div className="h-2 rounded-sm bg-finance-red" style={{ width: barWidth }} />
            )}
          </div>
          <div className="w-px h-4 bg-gray-600" />
          <div className="flex-1">
            {isPos && (
              <div className="h-2 rounded-sm bg-finance-green" style={{ width: barWidth }} />
            )}
          </div>
        </div>
        <div className={`w-14 text-xs text-right font-semibold flex-shrink-0 ${isPos ? 'text-finance-green' : 'text-finance-red'}`}>
          {isPos ? '+' : ''}{contribution.toFixed(1)} pkt
        </div>
        <div className="w-8 text-xs text-gray-600 text-right flex-shrink-0">{(weight * 100).toFixed(0)}%</div>
      </div>

      {/* Opis i wartość surowa */}
      {meta && (
        <div className="mt-1.5 pl-0 space-y-0.5">
          <p className="text-xs text-gray-500 leading-relaxed">{meta.desc}</p>
          {meta.rawUnit && (
            <p className="text-xs">
              <span className="text-gray-600">{meta.rawLabel ?? 'Wartość'}:</span>{' '}
              <span className={`font-medium ${rawValue >= 0 ? 'text-finance-green' : 'text-finance-red'}`}>
                {rawValue >= 0 ? '+' : ''}{rawValue.toFixed(2)}{meta.rawUnit}
              </span>
              <span className="text-gray-600 ml-2">→ wpływ na score: {isPos ? '+' : ''}{contribution.toFixed(1)} pkt</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  region: RegionScore
  newsHeadlines: string[]
  onClose: () => void
}

export default function RegionDetailModal({ region, newsHeadlines, onClose }: Props) {
  const [aiResult, setAiResult] = useState<{ text: string; model: string } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const riskColor = region.risk === 'low' ? 'text-finance-green' : region.risk === 'medium' ? 'text-yellow-400' : 'text-finance-red'
  const scoreColor = region.score >= 65 ? 'text-finance-green' : region.score >= 40 ? 'text-yellow-400' : 'text-finance-red'

  async function handleAnalyzeAI() {
    setAiLoading(true)
    setAiError(null)
    try {
      const result = await analyzeRegionAI(region.id, newsHeadlines)
      setAiResult(result)
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
      <div className="glass-card rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
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
            <div>
              {region.components.map(c => (
                <ComponentBar key={c.name} name={c.name} rawValue={c.rawValue} contribution={c.contribution} weight={c.weight} />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <div className="w-3 h-2 rounded-sm bg-finance-green" />
              <span>pozytywny wpływ</span>
              <div className="w-3 h-2 rounded-sm bg-finance-red ml-2" />
              <span>negatywny wpływ</span>
              <span className="ml-auto">Szerokość paska = siła wpływu na score</span>
            </div>
          </div>

          {/* AI Analiza */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold text-sm uppercase tracking-wide">Analiza AI</h3>
              {!aiResult && !aiLoading && (
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

            {aiResult && (
              <div className="bg-gray-800/50 rounded-xl p-4">
                <MarkdownRenderer content={aiResult.text} />
                <div className="mt-4 flex items-center justify-between gap-4">
                  <span className="text-xs text-gray-600 bg-gray-700/40 px-2 py-1 rounded">
                    Model: {aiResult.model}
                  </span>
                  <button
                    onClick={handleAnalyzeAI}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    Regeneruj analizę
                  </button>
                </div>
              </div>
            )}

            {!aiResult && !aiLoading && !aiError && (
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
