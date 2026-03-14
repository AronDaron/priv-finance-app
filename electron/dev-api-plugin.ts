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
              const { ticker: t, apiKey, gold_grams: goldGramsStr } = body
              if (!t) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Brak ticker' })); return }
              const goldGrams = goldGramsStr ? parseFloat(goldGramsStr) : null
              const ai = await import('./main/ai')
              const [fundamentals, history, quote] = await Promise.all([
                finance.fetchFundamentals(t),
                finance.fetchHistory(t, '1y'),
                finance.fetchQuote(t),
              ])
              const technicals = finance.calculateTechnicals(history)
              const report_text = await ai.analyzeStock({
                ticker: t, apiKey, name: quote.name,
                currentPrice: quote.price, currency: quote.currency,
                fundamentals, technicals,
                gold_grams: goldGrams,
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
              const { computeGlobalScores } = await import('./main/globalScore')
              const marketData = await fetchGlobalMarketData()
              const regions = computeGlobalScores(marketData)
              data = { regions, marketData, computedAt: marketData.fetchedAt }
              break
            }
            case '/ai/analyze-region': {
              const body = await readBody(req)
              const { regionId, newsHeadlines: headlinesJson, apiKey: ak } = body
              if (!regionId) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Brak regionId' })); return }
              const { fetchGlobalMarketData: fgm } = await import('./main/finance')
              const { computeGlobalScores: cgs } = await import('./main/globalScore')
              const { analyzeRegion: ar, WORLD_MODEL: wm } = await import('./main/ai')
              const md = await fgm()
              const regions = cgs(md)
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
