import type { Plugin } from 'vite'
import type { HistoryPeriod } from '../src/lib/types'

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
