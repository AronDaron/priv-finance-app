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
              const assets: Array<{ ticker: string; quantity: number; currency: string; purchase_date?: string; created_at?: string }> =
                JSON.parse(body.assets ?? '[]')
              if (assets.length === 0) { data = []; break }

              const mod = await import('yahoo-finance2')
              const yf = new mod.default()

              const now = new Date()
              const histories = await Promise.all(
                assets.map(async (asset) => {
                  try {
                    const hist = await yf.historical(asset.ticker, {
                      period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
                      period2: now,
                    })
                    return { asset, hist }
                  } catch {
                    return { asset, hist: [] as any[] }
                  }
                })
              )

              let usdPln = 4.0, eurPln = 4.3
              try {
                const [u, e] = await Promise.all([
                  yf.quoteSummary('USDPLN=X', { modules: ['price'] }),
                  yf.quoteSummary('EURPLN=X', { modules: ['price'] }),
                ])
                usdPln = (u.price as any)?.regularMarketPrice ?? 4.0
                eurPln = (e.price as any)?.regularMarketPrice ?? 4.3
              } catch {}

              const toPlnRate = (cur: string) => cur === 'PLN' ? 1 : cur === 'EUR' ? eurPln : usdPln

              const dateSet = new Set<string>()
              histories.forEach(({ hist }) =>
                hist.forEach((h: any) => dateSet.add(h.date.toISOString().split('T')[0]))
              )
              const dates = Array.from(dateSet).sort()

              data = dates.map(date => {
                let totalPLN = 0
                histories.forEach(({ asset, hist }) => {
                  const purchaseDate = asset.purchase_date ?? (asset.created_at ?? '').split('T')[0]
                  if (purchaseDate && date < purchaseDate) return
                  const entry = hist
                    .filter((h: any) => h.date.toISOString().split('T')[0] <= date)
                    .at(-1)
                  if (entry?.close) {
                    totalPLN += asset.quantity * entry.close * toPlnRate(asset.currency)
                  }
                })
                return { date, value: totalPLN }
              })
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
