import type { Plugin } from 'vite'
import type { IncomingMessage } from 'http'
import type { HistoryPeriod } from '../src/lib/types'

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
              const assets: Array<{ ticker: string; quantity: number; currency: string; purchase_date?: string }> =
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
              const { ticker: t, apiKey } = body
              if (!t) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Brak ticker' })); return }
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
              })
              data = { report_text, model: ai.WORKER_MODEL, ticker: t }
              break
            }
            case '/ai/analyze-portfolio': {
              const body = await readBody(req)
              const { tickers, apiKey } = body
              if (!tickers) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Brak tickers' })); return }
              const ai = await import('./main/ai')
              const tickerList = tickers.split(',').map((s: string) => s.trim()).filter(Boolean)
              const enrichedAssets = await Promise.all(tickerList.map(async (t: string) => {
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
                })
                return { ticker: t, name: quote.name, quantity: 1, currentPrice: quote.price,
                  purchasePrice: quote.price, currency: quote.currency, portfolioSharePercent: 0, workerReport }
              }))
              const totalValue = enrichedAssets.reduce((s, a) => s + a.currentPrice, 0)
              enrichedAssets.forEach(a => { a.portfolioSharePercent = (a.currentPrice / totalValue) * 100 })
              const report_text = await ai.analyzePortfolio({
                apiKey, assets: enrichedAssets, totalValueUSD: totalValue, totalPnlPercent: 0,
              })
              data = { report_text, model: ai.MANAGER_MODEL }
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
