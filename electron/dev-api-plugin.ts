import type { Plugin } from 'vite'
import type { IncomingMessage } from 'http'
import type { HistoryPeriod } from '../src/lib/types'
import { gramsToTroyOz } from '../src/lib/types'

function readBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')) }
      catch { reject(new Error('Invalid JSON body')) }
    })
    req.on('error', reject)
  })
}

/**
 * Vite dev server plugin — udostępnia trasy /api/* używając yahoo-finance2.
 * Działa tylko w trybie dev (configureServer nie jest wywoływany podczas buildu).
 * Dzięki temu npm run dev w przeglądarce korzysta z realnych danych jak Electron .exe.
 */
export function financeDevApiPlugin(): Plugin {
  return {
    name: 'finance-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()

        const { pathname, searchParams } = new URL(req.url, 'http://localhost')
        const endpoint = pathname.slice(4) // '/api/quote' → '/quote'
        const ticker = searchParams.get('ticker') ?? ''
        const query = searchParams.get('query') ?? ''
        const period = (searchParams.get('period') ?? '1y') as HistoryPeriod

        res.setHeader('Content-Type', 'application/json')

        try {
          // Dynamiczny import — finance.ts używa yahoo-finance2 (ESM)
          const finance = await import('./main/finance')
          let data: unknown

          switch (endpoint) {
            case '/quote':
              data = await finance.fetchQuote(ticker)
              break
            case '/history':
              data = await finance.fetchHistory(ticker, period)
              break
            case '/search':
              data = await finance.searchTickers(query)
              break
            case '/fundamentals':
              data = await finance.fetchFundamentals(ticker)
              break
            case '/dividends':
              data = await finance.fetchDividends(ticker)
              break
            case '/technicals': {
              const candles = await finance.fetchHistory(ticker, period)
              data = finance.calculateTechnicals(candles)
              break
            }
            case '/asset-meta':
              data = await finance.fetchAssetMeta(ticker)
              break
            case '/portfolio-history': {
              const body = await readBody(req)
              const assets: Array<{ ticker: string; quantity: number; currency: string; purchase_date?: string; gold_grams?: number | null }> =
                JSON.parse(body.assets ?? '[]')
              const pfPeriod = body.period ?? '1y'
              data = await finance.fetchPortfolioHistory(assets, pfPeriod)
              break
            }
            case '/portfolios': {
              // Dev mode: localStorage handles portfolios on frontend — return empty list
              data = []
              break
            }
            case '/cash/accounts': {
              data = []
              break
            }
            case '/cash/transactions': {
              data = null
              break
            }
            case '/ai/analyze-stock': {
              const body = await readBody(req)
              const { ticker: t, apiKey, gold_grams: goldGramsStr, news_headlines: newsHeadlinesJson } = body
              if (!t) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Brak ticker' })); return }
              const goldGrams = goldGramsStr ? parseFloat(goldGramsStr) : null
              const newsHeadlines: string[] = newsHeadlinesJson ? JSON.parse(newsHeadlinesJson) : []
              const ai = await import('./main/ai')
              const { detectMarketRegime, buildRegimeSummary } = await import('./main/globalScore')
              const [fundamentals, history, quote, marketData] = await Promise.all([
                finance.fetchFundamentals(t),
                finance.fetchHistory(t, '1y'),
                finance.fetchQuote(t),
                finance.fetchGlobalMarketData().catch(() => null),
              ])
              const technicals = finance.calculateTechnicals(history)
              const regime = marketData ? detectMarketRegime(marketData) : null
              const marketContext = marketData && regime ? {
                vix: marketData.indices.VIX.price,
                us10y: marketData.bonds.US10Y.price,
                sp500Change1m: marketData.indices.SP500.change1m,
                oil: { price: marketData.commodities.oil.price, change1m: marketData.commodities.oil.change1m },
                gold: { price: marketData.commodities.gold.price, change1m: marketData.commodities.gold.change1m },
                copper: { change1m: marketData.commodities.copper.change1m },
                gas: { change1m: marketData.commodities.gas.change1m },
                nikkeiChange1m: marketData.indices.Nikkei.change1m,
                ftseChange1m: marketData.indices.FTSE.change1m,
                regimeSummary: buildRegimeSummary(regime),
              } : null
              const report_text = await ai.analyzeStock({
                ticker: t, apiKey, name: quote.name,
                currentPrice: quote.price, currency: quote.currency,
                fundamentals, technicals,
                gold_grams: goldGrams,
                marketContext,
                newsHeadlines,
              })
              data = { report_text, model: ai.WORKER_MODEL, ticker: t }
              break
            }
            case '/ai/analyze-portfolio': {
              const body = await readBody(req)
              const { assets: assetsJson, apiKey } = body
              if (!assetsJson) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Brak assets' })); return }
              const ai = await import('./main/ai')
              const assetsList: Array<{ ticker: string; name: string; quantity: number; purchase_price: number; currency: string; gold_grams?: number | null }> =
                JSON.parse(assetsJson)

              // Pobierz kursy walut — wszystkie wartości będą w PLN
              const [usdPlnQ, eurPlnQ] = await Promise.all([
                finance.fetchQuote('USDPLN=X').catch(() => ({ price: 4.0 })),
                finance.fetchQuote('EURPLN=X').catch(() => ({ price: 4.3 })),
              ])
              const usdPln = usdPlnQ.price
              const eurPln = eurPlnQ.price
              const toPln = (amount: number, currency: string) =>
                currency === 'PLN' ? amount : currency === 'USD' ? amount * usdPln : currency === 'EUR' ? amount * eurPln : amount

              const enrichedAssets = await Promise.all(assetsList.map(async (assetFromList) => {
                const t = assetFromList.ticker
                const [fundamentals, history, quote] = await Promise.all([
                  finance.fetchFundamentals(t),
                  finance.fetchHistory(t, '1y'),
                  finance.fetchQuote(t),
                ])
                const technicals = finance.calculateTechnicals(history)
                const workerReport = await ai.analyzeStock({
                  ticker: t, apiKey, name: quote.name,
                  currentPrice: quote.price, currency: quote.currency,
                  fundamentals, technicals,
                  gold_grams: assetFromList.gold_grams ?? null,
                })
                const ozPerCoin = assetFromList.gold_grams ? gramsToTroyOz(assetFromList.gold_grams) : null
                const currentPriceUSD = ozPerCoin ? quote.price * ozPerCoin : quote.price
                const currentPricePLN = toPln(currentPriceUSD, ozPerCoin ? 'USD' : quote.currency)
                const purchasePricePLN = toPln(assetFromList.purchase_price, assetFromList.currency || 'USD')
                return {
                  ticker: t,
                  name: assetFromList.name || quote.name,
                  quantity: assetFromList.quantity,
                  currentPrice: currentPricePLN,
                  purchasePrice: purchasePricePLN,
                  currency: 'PLN',
                  portfolioSharePercent: 0,
                  workerReport,
                  gold_grams: assetFromList.gold_grams ?? null,
                }
              }))
              const totalValuePLN = enrichedAssets.reduce((s, a) => s + a.quantity * a.currentPrice, 0)
              const totalCostPLN = enrichedAssets.reduce((s, a) => s + a.quantity * a.purchasePrice, 0)
              enrichedAssets.forEach(a => { a.portfolioSharePercent = (a.quantity * a.currentPrice / totalValuePLN) * 100 })
              const report_text = await ai.analyzePortfolio({
                apiKey, assets: enrichedAssets, totalValuePLN,
                totalPnlPercent: totalCostPLN > 0 ? ((totalValuePLN - totalCostPLN) / totalCostPLN) * 100 : 0,
              })
              data = { report_text, model: ai.MANAGER_MODEL }
              break
            }
            case '/news': {
              const region = searchParams.get('region') ?? 'world'
              const { fetchNewsForRegion } = await import('./main/news')
              data = await fetchNewsForRegion(region as import('./main/news').NewsRegion)
              break
            }
            case '/global-market': {
              const { fetchGlobalMarketData } = await import('./main/finance')
              const { computeGlobalScores, detectMarketRegime } = await import('./main/globalScore')
              const marketData = await fetchGlobalMarketData()
              const regime = detectMarketRegime(marketData)
              const regions = computeGlobalScores(marketData, regime)
              data = { regions, marketData, computedAt: marketData.fetchedAt, regime }
              break
            }
            case '/ai/chat': {
              const body = await readBody(req)
              const { messages: msgsJson, assets: assetsJson, reports: reportsJson, apiKey: ak } = body
              if (!msgsJson) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Brak messages' })); return }
              const ai = await import('./main/ai')
              const messages: Array<{ role: 'user' | 'assistant'; content: string }> = JSON.parse(msgsJson)
              const assetsRaw: Array<{ ticker: string; name: string; quantity: number; purchase_price: number; currency: string }> =
                JSON.parse(assetsJson ?? '[]')
              const reportsRaw: Array<{ ticker: string; report_text: string; created_at: string }> =
                JSON.parse(reportsJson ?? '[]')

              const [usdPlnQ, eurPlnQ] = await Promise.all([
                finance.fetchQuote('USDPLN=X').catch(() => ({ price: 4.0 })),
                finance.fetchQuote('EURPLN=X').catch(() => ({ price: 4.3 })),
              ])
              const usdPln = usdPlnQ.price
              const eurPln = eurPlnQ.price
              const toPln = (amount: number, currency: string) =>
                currency === 'PLN' ? amount : currency === 'USD' ? amount * usdPln : currency === 'EUR' ? amount * eurPln : amount

              // Quotes
              const quoteMap = new Map<string, { price: number; currency: string; changePercent: number }>()
              await Promise.all(assetsRaw.map(async a => {
                try {
                  const q = await finance.fetchQuote(a.ticker)
                  quoteMap.set(a.ticker, { price: q.price, currency: q.currency, changePercent: q.changePercent })
                } catch { /* pomiń */ }
              }))

              // Top 5 tickers by value for price history
              const top5 = assetsRaw
                .map(a => { const q = quoteMap.get(a.ticker); const p = q ? toPln(q.price, q.currency) : toPln(a.purchase_price, a.currency); return { ticker: a.ticker, name: a.name, val: p * a.quantity } })
                .sort((a, b) => b.val - a.val).slice(0, 5).map(a => a.ticker)

              // Extract tickers mentioned in the last user question
              const lastQuestion = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
              const IGNORE_WORDS = new Set(['USD', 'PLN', 'EUR', 'GBP', 'CHF', 'JPY', 'ETF', 'AI', 'OK', 'IT', 'PE', 'EPS', 'CEO', 'IPO', 'USA', 'EU', 'UK', 'GDP', 'FED', 'ECB', 'IMF', 'RSI'])
              const mentionedTickers = [...new Set((lastQuestion.match(/\b[A-Z]{2,5}(?:\.WA)?\b/g) ?? []).filter(t => !IGNORE_WORDS.has(t)))]
              const portfolioTickerSet = new Set(assetsRaw.map(a => a.ticker))
              const nonPortfolioTickers = mentionedTickers.filter(t => !portfolioTickerSet.has(t))

              // Fetch quote + fundamentals for non-portfolio tickers mentioned in question
              const extraDataMap = new Map<string, { quote: Awaited<ReturnType<typeof finance.fetchQuote>>; fundamentals: Awaited<ReturnType<typeof finance.fetchFundamentals>> }>()
              await Promise.all(nonPortfolioTickers.map(async t => {
                try {
                  const [q, f] = await Promise.all([finance.fetchQuote(t), finance.fetchFundamentals(t)])
                  extraDataMap.set(t, { quote: q, fundamentals: f })
                } catch { /* pomiń */ }
              }))

              // All tickers for price history: mentioned + top portfolio, max 7
              const allHistoryTickers = [...new Set([...mentionedTickers, ...top5])].slice(0, 7)

              // Monthly OHLCV
              const priceHistories = new Map<string, Array<{ month: string; open: number; close: number; changePercent: number }>>()
              await Promise.all(allHistoryTickers.map(async ticker => {
                try {
                  const candles = await finance.fetchHistory(ticker, '2y')
                  const byMonth = new Map<string, typeof candles>()
                  for (const c of candles) {
                    const d = new Date(c.time * 1000)
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                    if (!byMonth.has(key)) byMonth.set(key, [])
                    byMonth.get(key)!.push(c)
                  }
                  priceHistories.set(ticker, Array.from(byMonth.entries())
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([month, cs]) => ({
                      month,
                      open: cs[0].open,
                      close: cs[cs.length - 1].close,
                      changePercent: cs[0].open > 0 ? ((cs[cs.length - 1].close - cs[0].open) / cs[0].open) * 100 : 0,
                    })))
                } catch { /* pomiń */ }
              }))

              // Global market
              let globalData: Awaited<ReturnType<typeof finance.fetchGlobalMarketData>> | null = null
              try { globalData = await finance.fetchGlobalMarketData() } catch { /* pomiń */ }

              // Build context
              const today = new Date().toISOString().split('T')[0]
              const assetLines = assetsRaw.map(a => {
                const q = quoteMap.get(a.ticker)
                const price = q?.price ?? a.purchase_price; const curr = q?.currency ?? a.currency
                const pricePLN = toPln(price, curr); const purchasePLN = toPln(a.purchase_price, a.currency)
                const pnl = purchasePLN > 0 ? ((pricePLN - purchasePLN) / purchasePLN * 100).toFixed(1) : '0.0'
                const ch = q ? (q.changePercent >= 0 ? `+${q.changePercent.toFixed(2)}%` : `${q.changePercent.toFixed(2)}%`) : 'N/A'
                return `  ${a.ticker} (${a.name}): ${a.quantity} szt. × ${price.toFixed(2)} ${curr} | P&L: ${parseFloat(pnl) >= 0 ? '+' : ''}${pnl}% | Dziś: ${ch}`
              })
              const totalPLN = assetsRaw.reduce((s, a) => { const q = quoteMap.get(a.ticker); const p = q?.price ?? a.purchase_price; const c = q?.currency ?? a.currency; return s + toPln(p, c) * a.quantity }, 0)

              const histLines: string[] = []
              for (const [ticker, monthly] of priceHistories) {
                const asset = assetsRaw.find(a => a.ticker === ticker)
                const extra = extraDataMap.get(ticker)
                const name = asset?.name ?? extra?.quote.name ?? ticker
                histLines.push(`\n${ticker} (${name}):`)
                for (const m of monthly) {
                  const ch = m.changePercent >= 0 ? `+${m.changePercent.toFixed(1)}%` : `${m.changePercent.toFixed(1)}%`
                  histLines.push(`  ${m.month}: ${m.open.toFixed(2)} → ${m.close.toFixed(2)} (${ch})`)
                }
              }

              // Fundamentals for non-portfolio tickers mentioned in question
              const extraFundLines: string[] = []
              for (const [ticker, { quote: q, fundamentals: f }] of extraDataMap) {
                extraFundLines.push(`\n${ticker} (${q.name}):`)
                extraFundLines.push(`  Cena: ${q.price.toFixed(2)} ${q.currency} | Zmiana dziś: ${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%`)
                if (f.pe) extraFundLines.push(`  P/E: ${f.pe.toFixed(2)}`)
                if (f.eps) extraFundLines.push(`  EPS (TTM): ${f.eps.toFixed(2)}`)
                if (f.revenueGrowth) extraFundLines.push(`  Przychody YoY: ${(f.revenueGrowth * 100).toFixed(1)}%`)
                if (f.profitMargins) extraFundLines.push(`  Marża netto: ${(f.profitMargins * 100).toFixed(1)}%`)
                if (f.targetMeanPrice) extraFundLines.push(`  Cel analityków: ${f.targetMeanPrice.toFixed(2)} ${q.currency} | Rekomendacja: ${f.analystRecommendation ?? 'N/A'}`)
                if (f.beta) extraFundLines.push(`  Beta: ${f.beta.toFixed(2)}`)
                if (f.marketCap) extraFundLines.push(`  Kapitalizacja: ${(f.marketCap / 1e9).toFixed(1)}B ${q.currency}`)
                if (f.week52High && f.week52Low) extraFundLines.push(`  52-tygodniowy zakres: ${f.week52Low.toFixed(2)} – ${f.week52High.toFixed(2)}`)
                if (f.sector) extraFundLines.push(`  Sektor: ${f.sector}${f.industry ? ` / ${f.industry}` : ''}`)
              }

              const macroLines: string[] = []
              if (globalData) {
                const { buildRegimeSummary: brs } = await import('./main/globalScore')
                const { detectMarketRegime: dmr } = await import('./main/globalScore')
                const m = globalData
                const reg = dmr(m)
                const ch = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
                const vixLevel = m.indices.VIX.price < 15 ? 'spokój' : m.indices.VIX.price < 25 ? 'umiarkowany' : m.indices.VIX.price < 35 ? 'wysoki' : 'panika'
                macroLines.push(`  VIX: ${m.indices.VIX.price.toFixed(1)} (${vixLevel}) | US10Y: ${m.bonds.US10Y.price.toFixed(2)}%`)
                macroLines.push(`  S&P500: ${m.indices.SP500.price.toFixed(0)} (${m.indices.SP500.changePercent >= 0 ? '+' : ''}${m.indices.SP500.changePercent.toFixed(2)}% dziś, ${ch(m.indices.SP500.change1m)} 30d) | WIG20: ${m.indices.WIG20.price.toFixed(0)} (${ch(m.indices.WIG20.change1m)} 30d)`)
                macroLines.push(`  DAX: ${m.indices.DAX.price.toFixed(0)} (${ch(m.indices.DAX.change1m)} 30d) | Nikkei: ${m.indices.Nikkei.price.toFixed(0)} (${ch(m.indices.Nikkei.change1m)} 30d) | FTSE: ${m.indices.FTSE.price.toFixed(0)} (${ch(m.indices.FTSE.change1m)} 30d)`)
                macroLines.push(`  Ropa: $${m.commodities.oil.price.toFixed(1)} (${ch(m.commodities.oil.change1m)} 30d) | Złoto: $${m.commodities.gold.price.toFixed(0)} (${ch(m.commodities.gold.change1m)} 30d) | Miedź 30d: ${ch(m.commodities.copper.change1m)} | Gaz 30d: ${ch(m.commodities.gas.change1m)}`)
                macroLines.push(`  EUR/USD: ${m.currencies.EURUSD.price.toFixed(4)} | USD/PLN: ${usdPln.toFixed(2)}`)
                const regimeLine = brs(reg)
                if (regimeLine) macroLines.push(`  Reżim rynkowy: ${regimeLine}`)
              }

              // AI reports (max 10, up to 2000 chars each, skip portfolio summary)
              const portfolioTickerSet2 = new Set(assetsRaw.map(a => a.ticker))
              const reportLines: string[] = []
              const recentReports = reportsRaw.filter(r => r.ticker !== '__PORTFOLIO__').slice(-10)
              for (const r of recentReports) {
                const inPortfolio = portfolioTickerSet2.has(r.ticker)
                const label = inPortfolio ? '(w portfelu)' : '(NIE w portfelu — tylko analiza)'
                const truncated = r.report_text.length > 2000 ? r.report_text.slice(0, 2000) + '...' : r.report_text
                reportLines.push(`\n--- Analiza ${r.ticker} ${label} (${r.created_at.slice(0, 10)}) ---\n${truncated}`)
              }

              const systemContext = [
                `Jesteś asystentem finansowym z dostępem do portfela inwestycyjnego użytkownika. Odpowiadaj po polsku. Data: ${today}.`,
                '', `=== PORTFEL (${today}) ===`, `Łączna wartość: ~${totalPLN.toFixed(0)} PLN | USD/PLN: ${usdPln.toFixed(2)} | EUR/PLN: ${eurPln.toFixed(2)}`,
                ...assetLines,
                ...(histLines.length > 0 ? ['', '=== HISTORIA CEN (miesięczna, 2 lata) ===', ...histLines] : []),
                ...(extraFundLines.length > 0 ? ['', '=== FUNDAMENTY SPÓŁEK (z pytania) ===', ...extraFundLines] : []),
                ...(macroLines.length > 0 ? ['', '=== MAKROEKONOMIA ===', ...macroLines] : []),
                ...(reportLines.length > 0 ? ['', '=== RAPORTY AI (ostatnie analizy spółek) ===', ...reportLines] : []),
                '', 'Odpowiadaj konkretnie, powołując się na powyższe dane. Nie wymyślaj liczb których nie masz.',
              ].join('\n')

              data = await ai.chatWithPortfolio(messages, systemContext, ak ?? '')
              break
            }
            case '/ai/analyze-region': {
              const body = await readBody(req)
              const { regionId, newsHeadlines: headlinesJson, apiKey: ak } = body
              if (!regionId) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Brak regionId' })); return }
              const { fetchGlobalMarketData: fgm } = await import('./main/finance')
              const { computeGlobalScores: cgs, detectMarketRegime: dmr } = await import('./main/globalScore')
              const { analyzeRegion: ar, WORLD_MODEL: wm } = await import('./main/ai')
              const md = await fgm()
              const regime = dmr(md)
              const regions = cgs(md, regime)
              const region = regions.find(r => r.id === regionId)
              if (!region) { res.statusCode = 400; res.end(JSON.stringify({ error: `Nieznany region: ${regionId}` })); return }
              const headlines: string[] = headlinesJson ? JSON.parse(headlinesJson) : []
              const text = await ar({ apiKey: ak ?? '', region, marketData: md, newsHeadlines: headlines })
              data = { text, model: wm }
              break
            }
            default:
              res.statusCode = 404
              res.end(JSON.stringify({ error: `Nieznany endpoint: ${endpoint}` }))
              return
          }

          res.end(JSON.stringify(data))
        } catch (err: unknown) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
        }
      })
    },
  }
}
