import type { FundamentalData, TechnicalIndicators } from '../../src/lib/types'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const WORKER_MODEL   = 'google/gemini-3-flash-preview'
const MANAGER_MODEL  = 'google/gemini-3-flash-preview'
const APP_REFERER    = 'https://finance-portfolio-tracker'

export { WORKER_MODEL, MANAGER_MODEL }

// ─── Pomocnicza funkcja HTTP ──────────────────────────────────────────────────

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
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
      max_tokens: 800,
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
}

export async function analyzeStock(params: StockAnalysisParams): Promise<string> {
  const { ticker, name, apiKey, fundamentals, technicals, currentPrice, currency } = params
  const { pe, eps, dividendYield, marketCap, beta, sector, industry, week52High, week52Low } = fundamentals
  const { rsi14, macd, sma20, sma50, sma200 } = technicals

  const systemPrompt = `Jesteś doświadczonym analitykiem finansowym piszącym zwięzłe raporty inwestycyjne po polsku.`

  const userPrompt = `Przeanalizuj spółkę ${ticker} (${name}), aktualna cena: ${currentPrice} ${currency}.

DANE FUNDAMENTALNE:
- P/E ratio: ${pe ?? 'brak'}
- EPS: ${eps ?? 'brak'}
- Stopa dywidendy: ${dividendYield != null ? (dividendYield * 100).toFixed(2) + '%' : 'brak'}
- Kapitalizacja: ${marketCap != null ? formatMarketCap(marketCap) : 'brak'}
- Beta: ${beta ?? 'brak'}
- Sektor: ${sector ?? 'brak'} / Branża: ${industry ?? 'brak'}
- 52-tygodniowe: max ${week52High ?? 'brak'} / min ${week52Low ?? 'brak'}

WSKAŹNIKI TECHNICZNE (14 dni / 1 rok):
- RSI(14): ${rsi14?.toFixed(1) ?? 'brak'} ${rsiInterpret(rsi14)}
- MACD: wartość ${macd.value?.toFixed(3) ?? 'brak'}, sygnał ${macd.signal?.toFixed(3) ?? 'brak'}
- SMA20/50/200: ${sma20?.toFixed(2) ?? 'brak'} / ${sma50?.toFixed(2) ?? 'brak'} / ${sma200?.toFixed(2) ?? 'brak danych'}

Napisz analizę (max 250 słów) zawierającą:
1. Krótką ocenę fundamentalną
2. Interpretację sygnałów technicznych
3. Główne ryzyka
4. Rekomendację: KUP / TRZYMAJ / SPRZEDAJ z jednozdaniowym uzasadnieniem`

  return callOpenRouter(WORKER_MODEL, systemPrompt, userPrompt, apiKey)
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
  }>
  totalValueUSD: number
  totalPnlPercent: number
}

export async function analyzePortfolio(params: PortfolioAnalysisParams): Promise<string> {
  const { apiKey, assets, totalValueUSD, totalPnlPercent } = params

  const systemPrompt = `Jesteś zarządzającym portfelem inwestycyjnym. Piszesz po polsku. Twoje analizy są konkretne i actionable.`

  const assetLines = assets.map(a => {
    const wartosc = (a.quantity * a.currentPrice).toFixed(2)
    const pnl = (((a.currentPrice - a.purchasePrice) / a.purchasePrice) * 100).toFixed(2)
    return `- ${a.ticker} (${a.name}): ${a.quantity} szt. × ${a.currentPrice} ${a.currency} = ${wartosc} (${a.portfolioSharePercent.toFixed(1)}% portfela, P&L: ${pnl}%)`
  }).join('\n')

  const reportLines = assets.map(a => `=== ${a.ticker} ===\n${a.workerReport}`).join('\n\n')

  const userPrompt = `Oceń poniższy portfel inwestycyjny.

SKŁAD PORTFELA (${assets.length} pozycji):
${assetLines}

ŁĄCZNA WARTOŚĆ: ~$${totalValueUSD.toFixed(0)} USD
ŁĄCZNY P&L: ${totalPnlPercent.toFixed(2)}%

ANALIZY PER SPÓŁKA (wygenerowane przez Worker AI):
${reportLines}

Napisz analizę portfela (max 400 słów):
1. Ocena dywersyfikacji (sektorowa, geograficzna, walutowa)
2. Profil ryzyka całego portfela
3. Najsilniejsze i najsłabsze pozycje
4. Konkretne rekomendacje rebalansowania (jeśli potrzebne)`

  return callOpenRouter(MANAGER_MODEL, systemPrompt, userPrompt, apiKey)
}
