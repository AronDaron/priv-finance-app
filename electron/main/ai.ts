import type { FundamentalData, TechnicalIndicators, GlobalMarketData, RegionScore } from '../../src/lib/types'
import { gramsToTroyOz } from '../../src/lib/types'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const WORKER_MODEL   = 'google/gemini-3-flash-preview'
const MANAGER_MODEL  = 'google/gemini-3.1-pro-preview'
const WORLD_MODEL   = 'google/gemini-3-flash-preview'
const APP_REFERER    = 'https://finance-portfolio-tracker'

export { WORKER_MODEL, MANAGER_MODEL, WORLD_MODEL }

// ─── Pomocnicza funkcja HTTP ──────────────────────────────────────────────────

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  maxTokens = 8000
): Promise<string> {
  if (!apiKey) throw new Error('Brak klucza API OpenRouter. Skonfiguruj go w Ustawieniach.')

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': APP_REFERER,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt  },
      ],
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  })

  if (res.status === 401) throw new Error('Nieprawidłowy klucz API OpenRouter.')
  if (res.status === 429) throw new Error('Przekroczono limit zapytań. Spróbuj za chwilę.')
  if (res.status >= 500) throw new Error('Błąd serwera OpenRouter. Spróbuj ponownie.')
  if (!res.ok) throw new Error(`Błąd OpenRouter: ${res.status} ${res.statusText}`)

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Brak treści w odpowiedzi OpenRouter.')
  return content
}

// ─── Funkcje pomocnicze formatowania ─────────────────────────────────────────

function formatMarketCap(mc: number): string {
  if (mc >= 1e12) return `${(mc / 1e12).toFixed(2)}T`
  if (mc >= 1e9)  return `${(mc / 1e9).toFixed(2)}B`
  if (mc >= 1e6)  return `${(mc / 1e6).toFixed(2)}M`
  return mc.toFixed(0)
}

function rsiInterpret(rsi: number | null): string {
  if (rsi === null) return ''
  if (rsi > 70) return '(wykupiony)'
  if (rsi < 30) return '(wyprzedany)'
  return '(neutralny)'
}

// ─── Worker: analiza jednej spółki ───────────────────────────────────────────

export interface StockAnalysisParams {
  ticker: string
  name: string
  apiKey: string
  fundamentals: FundamentalData
  technicals: TechnicalIndicators
  currentPrice: number
  currency: string
  gold_grams?: number | null  // >0 = metal fizyczny, null/undefined = giełdowy instrument
}

function formatPercent(val: number | null): string {
  return val != null ? (val * 100).toFixed(1) + '%' : 'brak'
}

function formatRecommendationTrend(rt: FundamentalData['recommendationTrend']): string {
  if (!rt) return 'brak'
  const total = rt.strongBuy + rt.buy + rt.hold + rt.sell + rt.strongSell
  if (total === 0) return 'brak'
  return `StrongBuy=${rt.strongBuy} Buy=${rt.buy} Hold=${rt.hold} Sell=${rt.sell} StrongSell=${rt.strongSell} (łącznie ${total})`
}

export async function analyzeStock(params: StockAnalysisParams): Promise<string> {
  const { ticker, name, apiKey, fundamentals, technicals, currentPrice, currency, gold_grams } = params
  const {
    pe, eps, dividendYield, marketCap, beta, sector, industry, week52High, week52Low,
    totalRevenue, revenueGrowth, grossMargins, profitMargins, totalDebt, totalCash,
    analystRecommendation, numberOfAnalysts, targetMeanPrice, earningsGrowth,
    recommendationTrend, nextEarningsDate, topHoldings, fundFamily,
  } = fundamentals
  const { rsi14, macd, sma20, sma50, sma200, bollingerBands, atr14, adx14 } = technicals

  const isEtf = topHoldings != null || fundFamily != null

  const systemPrompt = `Jesteś doświadczonym analitykiem finansowym piszącym zwięzłe raporty inwestycyjne po polsku. Zawsze pisz pełną analizę z 4 sekcjami używając markdown: **bold** dla wartości, listy dla ryzyk. Nigdy nie skracaj analizy.`

  const fundamentalSection = isEtf
    ? `TYP AKTYWA: ETF
- Rodzina funduszu: ${fundFamily ?? 'brak'}
- Kapitalizacja/AUM: ${marketCap != null ? formatMarketCap(marketCap) : 'brak'}
- Beta: ${beta ?? 'brak'}
- 52-tygodniowe: max ${week52High ?? 'brak'} / min ${week52Low ?? 'brak'}
${topHoldings?.length ? `\nTOP SKŁADNIKI:\n${topHoldings.map(h => `- ${h.name}${h.percent != null ? ': ' + (h.percent * 100).toFixed(1) + '%' : ''}`).join('\n')}` : ''}`
    : `DANE FUNDAMENTALNE:
- P/E ratio: ${pe ?? 'brak'} | EPS: ${eps ?? 'brak'}
- Stopa dywidendy: ${dividendYield != null ? (dividendYield * 100).toFixed(2) + '%' : 'brak'}
- Kapitalizacja: ${marketCap != null ? formatMarketCap(marketCap) : 'brak'}
- Beta: ${beta ?? 'brak'}
- Sektor: ${sector ?? 'brak'} / Branża: ${industry ?? 'brak'}
- 52-tygodniowe: max ${week52High ?? 'brak'} / min ${week52Low ?? 'brak'}
${totalRevenue != null ? `\nFINANSE SPÓŁKI:
- Przychody: ${formatMarketCap(totalRevenue)} (wzrost: ${formatPercent(revenueGrowth)})
- Marża brutto: ${formatPercent(grossMargins)} / Marża netto: ${formatPercent(profitMargins)}
- Dług: ${totalDebt != null ? formatMarketCap(totalDebt) : 'brak'} | Gotówka: ${totalCash != null ? formatMarketCap(totalCash) : 'brak'}
${earningsGrowth != null ? `- Wzrost zysku: ${formatPercent(earningsGrowth)}` : ''}` : ''}
${numberOfAnalysts ? `\nKONSENSUS ANALITYKÓW (${numberOfAnalysts} analityków):
- Rozkład: ${formatRecommendationTrend(recommendationTrend)}
- Rekomendacja: ${analystRecommendation?.toUpperCase() ?? 'brak'}${targetMeanPrice ? ` | Cel cenowy: ${targetMeanPrice.toFixed(2)} ${currency}` : ''}` : ''}
${nextEarningsDate ? `\nNASTĘPNE WYNIKI: ${nextEarningsDate}` : ''}`

  const isPhysicalMetal = gold_grams != null && gold_grams > 0
  const metalName = ticker === 'GC=F' ? 'złoto' : ticker === 'SI=F' ? 'srebro' : 'metal'
  const physicalMetalNote = isPhysicalMetal
    ? `WAŻNE: Ten ticker (${ticker}) reprezentuje FIZYCZNY ${metalName} (moneta/sztabka), NIE kontrakt terminowy na giełdzie. Zawartość czystego metalu: ${gold_grams}g na sztukę (${gramsToTroyOz(gold_grams!).toFixed(4)} oz troy). Cena futures służy jako proxy ceny spot. Traktuj jako inwestycję w metal fizyczny — brak płynności jak kontrakty, inne ryzyka.\n\n`
    : ''

  const userPrompt = `${physicalMetalNote}Przeanalizuj ${isEtf ? 'fundusz ETF' : (isPhysicalMetal ? `fizyczny ${metalName}` : 'spółkę')} ${ticker} (${name}), aktualna cena: ${currentPrice} ${currency}.

${fundamentalSection}

WSKAŹNIKI TECHNICZNE:
- RSI(14): ${rsi14?.toFixed(1) ?? 'brak'} ${rsiInterpret(rsi14)}
- MACD: wartość ${macd.value?.toFixed(3) ?? 'brak'}, sygnał ${macd.signal?.toFixed(3) ?? 'brak'}, histogram ${macd.histogram != null ? (macd.histogram >= 0 ? '+' : '') + macd.histogram.toFixed(3) : 'brak'}
- SMA20/50/200: ${sma20?.toFixed(2) ?? 'brak'} / ${sma50?.toFixed(2) ?? 'brak'} / ${sma200?.toFixed(2) ?? 'brak danych'}
- Bollinger Bands(20,2): górne ${bollingerBands?.upper.toFixed(2) ?? 'brak'} / środek ${bollingerBands?.middle.toFixed(2) ?? 'brak'} / dolne ${bollingerBands?.lower.toFixed(2) ?? 'brak'}${bollingerBands ? `, szerokość pasm ${bollingerBands.bandwidth.toFixed(1)}%` : ''}
- ATR(14): ${atr14?.toFixed(2) ?? 'brak'}${atr14 && currentPrice > 0 ? ` (${((atr14 / currentPrice) * 100).toFixed(2)}% ceny — zmienność dzienna)` : ''}
- ADX(14): ${adx14?.adx.toFixed(1) ?? 'brak'}${adx14 ? ` (${adx14.adx < 20 ? 'brak trendu' : adx14.adx < 40 ? 'słaby trend' : adx14.adx < 60 ? 'silny trend' : 'bardzo silny trend'}), +DI=${adx14.pdi.toFixed(1)} -DI=${adx14.mdi.toFixed(1)}` : ''}

Napisz analizę (max 250 słów) zawierającą:
1. ${isPhysicalMetal ? `Ocenę jako inwestycję w fizyczny ${metalName} (koszty przechowywania, spread kupno/sprzedaż, rola w portfelu)` : `Krótką ocenę fundamentalną${isEtf ? ' (skład, ekspozycja)' : ' (finanse, wycena, konsensus analityków)'}`}
2. Interpretację sygnałów technicznych${isPhysicalMetal ? ' (ceny spot złota/srebra)' : ''}
3. Główne ryzyka
4. Rekomendację: KUP / TRZYMAJ / SPRZEDAJ z jednozdaniowym uzasadnieniem`

  return callOpenRouter(WORKER_MODEL, systemPrompt, userPrompt, apiKey, 15000)
}

// ─── Manager: analiza całego portfela ────────────────────────────────────────

export interface PortfolioAnalysisParams {
  apiKey: string
  assets: Array<{
    ticker: string
    name: string
    quantity: number
    currentPrice: number
    purchasePrice: number
    currency: string
    portfolioSharePercent: number
    workerReport: string
    gold_grams?: number | null
  }>
  totalValuePLN: number
  totalPnlPercent: number
  portfolios?: Array<{ id: number; name: string; tags?: string[] }>
}

export async function analyzePortfolio(params: PortfolioAnalysisParams): Promise<string> {
  const { apiKey, assets, totalValuePLN, totalPnlPercent, portfolios } = params

  const systemPrompt = `Jesteś zarządzającym portfelem inwestycyjnym. Piszesz po polsku. Twoje analizy są konkretne i actionable. Zawsze pisz pełną analizę z 4 sekcjami używając markdown: **bold** dla kluczowych wartości i wniosków, listy punktowane dla rekomendacji i ryzyk. Nigdy nie skracaj analizy.`

  const assetLines = assets.map(a => {
    const wartosc = (a.quantity * a.currentPrice).toFixed(2)
    const pnl = (((a.currentPrice - a.purchasePrice) / a.purchasePrice) * 100).toFixed(2)
    let line = `- ${a.ticker} (${a.name}): ${a.quantity} szt. × ${a.currentPrice} ${a.currency} = ${wartosc} (${a.portfolioSharePercent.toFixed(1)}% portfela, P&L: ${pnl}%)`
    if (a.gold_grams && a.gold_grams > 0) {
      const totalGrams = a.quantity * a.gold_grams
      const oz = gramsToTroyOz(totalGrams)
      line += ` [METAL FIZYCZNY: ${a.gold_grams}g/szt, łącznie ${totalGrams.toFixed(2)}g = ${oz.toFixed(4)} oz troy]`
    }
    return line
  }).join('\n')

  const reportLines = assets.map(a => `=== ${a.ticker} ===\n${a.workerReport}`).join('\n\n')

  const TAG_INSTRUCTIONS: Record<string, string> = {
    'IKE': 'konto IKE — brak podatku Belki przy wypłacie po 60. roku życia; unikaj rekomendacji częstego obrotu i likwidacji pozycji',
    'IKZE': 'konto IKZE — odliczenie od PIT + preferencyjny podatek 10% przy wypłacie; długi horyzont, unikaj rekomendacji wypłat przed emeryturą',
    'Dywidendowy': 'portfel dywidendowy — priorytetem jest regularny dochód pasywny; nie rekomenduj sprzedaży spółek dywidendowych tylko z powodu przewartościowania technicznego',
    'Akumulujący': 'portfel akumulujący — reinwestowanie zysków, długi horyzont; preferuj spółki wzrostowe, ETF akumulujące',
    'Emerytalny': 'portfel emerytalny — bardzo długi horyzont, stabilność kapitału ważniejsza niż krótkoterminowy zysk; unikaj rekomendacji spekulacyjnych',
    'Spekulacyjny': 'portfel spekulacyjny — akceptowalne wyższe ryzyko i zmienność w zamian za potencjalnie wyższe zyski',
    'Krótkoterminowy': 'portfel krótkoterminowy — horyzont do 1 roku; płynność i ograniczanie strat są priorytetem',
    'Długoterminowy': 'portfel długoterminowy — horyzont powyżej 5 lat; krótkoterminowe korekty nie są powodem do sprzedaży',
    'Obligacje': 'portfel z obligacjami — stabilizacja, hedging inflacji; uwzględnij korelację z akcjami',
    'Surowce': 'portfel surowcowy — hedge przed inflacją i ryzykiem walutowym',
    'Zagraniczny': 'portfel zagraniczny — ryzyko walutowe jest kluczowe; uwzględnij w analizie',
    'Krajowy': 'portfel krajowy (GPW) — ekspozycja na ryzyko polskiej gospodarki i PLN',
    'ESG': 'portfel ESG — kryteria środowiskowe, społeczne i ładu korporacyjnego są ważne przy rekomendacjach',
    'Kryptowaluty': 'portfel z kryptowalutami — bardzo wysoka zmienność, inne ryzyka regulacyjne',
  }

  const portfolioContextSection = portfolios && portfolios.length > 0
    ? `\nKONTEKST PORTFELI I INSTRUKCJE:\n${portfolios.map(p => {
        const tags = p.tags ?? []
        const instructions = tags.map(t => TAG_INSTRUCTIONS[t]).filter(Boolean)
        return `- ${p.name}: tagi: [${tags.join(', ') || 'brak'}]${instructions.length ? '\n  WAŻNE dla tego portfela: ' + instructions.join('; ') : ''}`
      }).join('\n')}\n`
    : ''

  const physicalMetalNote = assets.some(a => a.gold_grams && a.gold_grams > 0)
    ? `\nUWAGA: Aktywa oznaczone [METAL FIZYCZNY] to fizyczne monety/sztabki, nie kontrakty terminowe. Cena wynika z: (spot USD/oz) × (gramy/31.1035). Uwzględnij brak płynności vs kontrakty.\n`
    : ''

  const userPrompt = `Oceń poniższy portfel inwestycyjny.
${portfolioContextSection}${physicalMetalNote}
SKŁAD PORTFELA (${assets.length} pozycji):
${assetLines}

ŁĄCZNA WARTOŚĆ: ~${totalValuePLN.toFixed(0)} PLN
ŁĄCZNY P&L: ${totalPnlPercent.toFixed(2)}%

ANALIZY PER SPÓŁKA (wygenerowane przez Worker AI):
${reportLines}

Napisz analizę portfela (max 400 słów).

KRYTYCZNE ZASADY — przestrzegaj bezwzględnie:
- Analizy per spółka powyżej są wygenerowane bez kontekstu portfela — ich rekomendacje (KUP/SPRZEDAJ) mogą być sprzeczne z charakterem portfela. Twoim zadaniem jest je ZREINTERPRETOWAĆ przez pryzmat tagów portfela.
- Dla portfela IKE/IKZE: nigdy nie rekomenduj sprzedaży/likwidacji pozycji — to konto emerytalne z preferencjami podatkowymi, sprzedaż niszczy korzyści podatkowe.
- Dla portfela Dywidendowy: spółki dywidendowe trzymamy długoterminowo dla dochodu pasywnego — przewartościowanie techniczne (RSI) NIE jest powodem do sprzedaży.
- Rekomenduj sprzedaż tylko gdy spółka fundamentalnie przestała pasować do strategii portfela (np. spółka dywidendowa odcięła dywidendę).

1. Ocena dywersyfikacji (sektorowa, geograficzna, walutowa)
2. Profil ryzyka całego portfela
3. Najsilniejsze i najsłabsze pozycje (oceniaj przez pryzmat strategii portfela, nie tylko krótkoterminowych wyników)
4. Rekomendacje zgodne ze strategią portfela (jeśli potrzebne — rebalansowanie, dokupienie, nie sprzedaż bez fundamentalnego powodu)`

  return callOpenRouter(MANAGER_MODEL, systemPrompt, userPrompt, apiKey, 8000)
}

// ─── Analiza regionu (na żądanie) ─────────────────────────────────────────────

export interface RegionAnalysisParams {
  apiKey: string
  region: RegionScore
  marketData: GlobalMarketData
  newsHeadlines: string[]  // tytuły newsów RSS dla regionu
}

export async function analyzeRegion(params: RegionAnalysisParams): Promise<string> {
  const { apiKey, region, marketData, newsHeadlines } = params
  const m = marketData

  const systemPrompt = `Jesteś analitykiem geopolitycznym i rynkowym. Piszesz zwięzłe analizy po polsku. Używasz markdown: **bold** dla kluczowych wniosków, listy dla punktów. Zawsze kończysz wyraźną oceną potencjału inwestycyjnego.`

  const commoditiesStr = [
    `Ropa: $${m.commodities.oil.price.toFixed(1)} (${m.commodities.oil.changePercent >= 0 ? '+' : ''}${m.commodities.oil.changePercent.toFixed(2)}% dziś, ${m.commodities.oil.change1m >= 0 ? '+' : ''}${m.commodities.oil.change1m.toFixed(1)}% 30d)`,
    `Złoto: $${m.commodities.gold.price.toFixed(0)} (${m.commodities.gold.changePercent >= 0 ? '+' : ''}${m.commodities.gold.changePercent.toFixed(2)}% dziś, ${m.commodities.gold.change1m >= 0 ? '+' : ''}${m.commodities.gold.change1m.toFixed(1)}% 30d)`,
    `Gaz: $${m.commodities.gas.price.toFixed(2)} (${m.commodities.gas.changePercent >= 0 ? '+' : ''}${m.commodities.gas.changePercent.toFixed(2)}% dziś)`,
    `Miedź: $${m.commodities.copper.price.toFixed(2)} (${m.commodities.copper.changePercent >= 0 ? '+' : ''}${m.commodities.copper.changePercent.toFixed(2)}% dziś)`,
    `Pszenica: $${m.commodities.wheat.price.toFixed(0)} (${m.commodities.wheat.changePercent >= 0 ? '+' : ''}${m.commodities.wheat.changePercent.toFixed(2)}% dziś)`,
  ].join('\n')

  const currenciesStr = [
    `EUR/USD: ${m.currencies.EURUSD.price.toFixed(4)} (${m.currencies.EURUSD.changePercent >= 0 ? '+' : ''}${m.currencies.EURUSD.changePercent.toFixed(2)}%)`,
    `GBP/USD: ${m.currencies.GBPUSD.price.toFixed(4)} (${m.currencies.GBPUSD.changePercent >= 0 ? '+' : ''}${m.currencies.GBPUSD.changePercent.toFixed(2)}%)`,
    `CHF/USD: ${m.currencies.CHFUSD.price.toFixed(4)} (${m.currencies.CHFUSD.changePercent >= 0 ? '+' : ''}${m.currencies.CHFUSD.changePercent.toFixed(2)}%)`,
    `CAD/USD: ${m.currencies.CADUSD.price.toFixed(4)} (${m.currencies.CADUSD.changePercent >= 0 ? '+' : ''}${m.currencies.CADUSD.changePercent.toFixed(2)}%)`,
    `AUD/USD: ${m.currencies.AUDUSD.price.toFixed(4)} (${m.currencies.AUDUSD.changePercent >= 0 ? '+' : ''}${m.currencies.AUDUSD.changePercent.toFixed(2)}%)`,
    `JPY/USD: ${m.currencies.JPYUSD.price.toFixed(6)} (${m.currencies.JPYUSD.changePercent >= 0 ? '+' : ''}${m.currencies.JPYUSD.changePercent.toFixed(2)}%)`,
    `CNY/USD: ${m.currencies.CNYUSD.price.toFixed(4)} (${m.currencies.CNYUSD.changePercent >= 0 ? '+' : ''}${m.currencies.CNYUSD.changePercent.toFixed(2)}%)`,
  ].join('\n')

  const indicesStr = [
    `S&P500: ${m.indices.SP500.price.toFixed(0)} (${m.indices.SP500.changePercent >= 0 ? '+' : ''}${m.indices.SP500.changePercent.toFixed(2)}% dziś, ${m.indices.SP500.change1m >= 0 ? '+' : ''}${m.indices.SP500.change1m.toFixed(1)}% 30d)`,
    `DAX: ${m.indices.DAX.price.toFixed(0)} (${m.indices.DAX.changePercent >= 0 ? '+' : ''}${m.indices.DAX.changePercent.toFixed(2)}% dziś, ${m.indices.DAX.change1m >= 0 ? '+' : ''}${m.indices.DAX.change1m.toFixed(1)}% 30d)`,
    `Nikkei: ${m.indices.Nikkei.price.toFixed(0)} (${m.indices.Nikkei.changePercent >= 0 ? '+' : ''}${m.indices.Nikkei.changePercent.toFixed(2)}% dziś)`,
    `WIG20: ${m.indices.WIG20.price.toFixed(0)} (${m.indices.WIG20.changePercent >= 0 ? '+' : ''}${m.indices.WIG20.changePercent.toFixed(2)}% dziś, ${m.indices.WIG20.change1m >= 0 ? '+' : ''}${m.indices.WIG20.change1m.toFixed(1)}% 30d)`,
    `FTSE100: ${m.indices.FTSE.price.toFixed(0)} (${m.indices.FTSE.changePercent >= 0 ? '+' : ''}${m.indices.FTSE.changePercent.toFixed(2)}% dziś)`,
    `VIX: ${m.indices.VIX.price.toFixed(1)} (strach: ${m.indices.VIX.price < 15 ? 'niski' : m.indices.VIX.price < 25 ? 'umiarkowany' : m.indices.VIX.price < 35 ? 'wysoki' : 'ekstremalny'})`,
    `US10Y: ${m.bonds.US10Y.price.toFixed(2)}%`,
  ].join('\n')

  const scoreComponents = region.components
    .map(c => `- ${c.name}: ${c.rawValue.toFixed(2)} → wkład ${c.contribution >= 0 ? '+' : ''}${c.contribution.toFixed(1)} pkt`)
    .join('\n')

  const newsStr = newsHeadlines.length > 0
    ? `\nNAJNOWSZE NAGŁÓWKI (${region.name}):\n${newsHeadlines.slice(0, 8).map(h => `- ${h}`).join('\n')}`
    : ''

  const userPrompt = `Przeprowadź analizę potencjału inwestycyjnego regionu: **${region.name} ${region.flag}**

OCENA ALGORYTMICZNA: ${region.score}/100 (ryzyko: ${region.risk === 'low' ? 'niskie' : region.risk === 'medium' ? 'średnie' : 'wysokie'})

SKŁADOWE SCORE:
${scoreComponents}

DANE RYNKOWE:
Surowce:
${commoditiesStr}

Waluty (vs USD):
${currenciesStr}

Indeksy globalne:
${indicesStr}
${newsStr}

Napisz analizę (max 300 słów):
1. **Kontekst makroekonomiczny** — co drivuje obecną sytuację w regionie
2. **Szanse inwestycyjne** — gdzie widzisz potencjał
3. **Główne ryzyka** — geopolityczne, walutowe, surowcowe
4. **Ocena końcowa** — czy score algorytmu ${region.score}/100 jest adekwatny i co inwestor powinien wiedzieć`

  return callOpenRouter(WORLD_MODEL, systemPrompt, userPrompt, apiKey, 6000)
}
