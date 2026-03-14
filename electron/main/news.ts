import https from 'https'
import http from 'http'
import type { IncomingMessage } from 'http'

export type NewsRegion = 'pl' | 'eu' | 'asia' | 'us' | 'world'

export interface NewsItem {
  title: string
  link: string
  description: string
  pubDate: string
  thumbnail: string | null
  source: string
}

const FEEDS: Record<NewsRegion, Array<{ url: string; source: string }>> = {
  pl: [
    { url: 'https://www.bankier.pl/rss/wiadomosci.xml', source: 'Bankier.pl' },
    { url: 'https://www.bankier.pl/rss/gielda.xml', source: 'Bankier Giełda' },
  ],
  eu: [
    { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC Business' },
    { url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml', source: 'BBC Europe' },
  ],
  asia: [
    { url: 'https://feeds.bbci.co.uk/news/world/asia/rss.xml', source: 'BBC Asia' },
    { url: 'https://asia.nikkei.com/rss/feed/nar', source: 'Nikkei Asia' },
  ],
  us: [
    { url: 'https://feeds.marketwatch.com/marketwatch/topstories/', source: 'MarketWatch' },
    { url: 'https://feeds.marketwatch.com/marketwatch/marketpulse/', source: 'MarketWatch Pulse' },
  ],
  world: [
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', source: 'NY Times Business' },
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World' },
  ],
}

function fetchUrl(urlStr: string, redirectCount = 0): Promise<string> {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'))
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr)
    const client = parsedUrl.protocol === 'https:' ? https : http
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FinanceTracker/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      timeout: 8000,
    }
    const req = client.get(options, (res: IncomingMessage) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, urlStr).toString()
        resolve(fetchUrl(redirectUrl, redirectCount + 1))
        return
      }
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => { data += chunk })
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

function extractTag(xml: string, tag: string): string {
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i')
  const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const cdataMatch = xml.match(cdataRe)
  if (cdataMatch) return cdataMatch[1].trim()
  const plainMatch = xml.match(plainRe)
  if (plainMatch) return plainMatch[1].trim()
  return ''
}

function extractThumbnail(itemXml: string): string | null {
  const mediaThumbnailRe = /<media:thumbnail[^>]+url=["']([^"']+)["']/i
  const mc = itemXml.match(mediaThumbnailRe)
  if (mc) return mc[1]

  const mediaContentRe = /<media:content[^>]+url=["']([^"']+)["'][^>]*type=["']image/i
  const mcc = itemXml.match(mediaContentRe)
  if (mcc) return mcc[1]

  const enclosureRe = /<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i
  const enc = itemXml.match(enclosureRe)
  if (enc) return enc[1]

  const enclosureRe2 = /<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image/i
  const enc2 = itemXml.match(enclosureRe2)
  if (enc2) return enc2[1]

  // Bankier i podobne — obraz w <description> jako <img src="...">
  const descriptionRe = /<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i
  const descMatch = itemXml.match(descriptionRe)
  if (descMatch) {
    const imgRe = /<img[^>]+src=["']([^"']+)["']/i
    const imgMatch = descMatch[1].match(imgRe)
    if (imgMatch) return imgMatch[1].replace(/^http:\/\//, 'https://')
  }

  return null
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

function parseRss(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = []
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null
  while ((match = itemRe.exec(xml)) !== null) {
    const itemXml = match[1]
    const title = stripHtml(extractTag(itemXml, 'title'))
    if (!title) continue
    const link = extractTag(itemXml, 'link') || extractTag(itemXml, 'guid')
    if (!link) continue
    const description = stripHtml(extractTag(itemXml, 'description')).slice(0, 220)
    const pubDate = extractTag(itemXml, 'pubDate')
    const thumbnail = extractThumbnail(itemXml)
    items.push({ title, link, description, pubDate, thumbnail, source })
  }
  return items
}

export async function fetchNewsForRegion(region: NewsRegion): Promise<NewsItem[]> {
  const feeds = FEEDS[region]
  const results = await Promise.allSettled(
    feeds.map(async ({ url, source }) => {
      const xml = await fetchUrl(url)
      return parseRss(xml, source)
    })
  )

  const allItems: NewsItem[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') allItems.push(...result.value)
  }

  allItems.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0
    return db - da
  })

  return allItems.slice(0, 30)
}
