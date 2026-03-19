import { useEffect, useState } from 'react'
import { fetchGlobalAnalysis } from '../../lib/api'
import type { GlobalMarketData } from '../../lib/types'

interface TickerItem {
  label: string
  price: number
  changePercent: number
  decimals: number
  unit?: string
}

function buildItems(data: GlobalMarketData): TickerItem[] {
  const { commodities: c, currencies: fx, indices: idx, bonds } = data
  return [
    { label: 'S&P500',  price: idx.SP500.price,   changePercent: idx.SP500.changePercent,   decimals: 0, unit: 'pkt' },
    { label: 'DAX',     price: idx.DAX.price,     changePercent: idx.DAX.changePercent,     decimals: 0, unit: 'pkt' },
    { label: 'Nikkei',  price: idx.Nikkei.price,  changePercent: idx.Nikkei.changePercent,  decimals: 0, unit: 'pkt' },
    { label: 'WIG20',   price: idx.WIG20.price,   changePercent: idx.WIG20.changePercent,   decimals: 0, unit: 'pkt' },
    { label: 'FTSE',    price: idx.FTSE.price,    changePercent: idx.FTSE.changePercent,    decimals: 0, unit: 'pkt' },
    { label: 'Ropa',    price: c.oil.price,       changePercent: c.oil.changePercent,       decimals: 2, unit: 'USD/bbl' },
    { label: 'Złoto',   price: c.gold.price,      changePercent: c.gold.changePercent,      decimals: 0, unit: 'USD/oz' },
    { label: 'Gaz',     price: c.gas.price,       changePercent: c.gas.changePercent,       decimals: 2, unit: 'USD' },
    { label: 'Miedź',   price: c.copper.price,    changePercent: c.copper.changePercent,    decimals: 2, unit: 'USD/lb' },
    { label: 'EUR/USD', price: fx.EURUSD.price,   changePercent: fx.EURUSD.changePercent,   decimals: 4 },
    { label: 'GBP/USD', price: fx.GBPUSD.price,   changePercent: fx.GBPUSD.changePercent,   decimals: 4 },
    { label: 'JPY/USD', price: fx.JPYUSD.price,   changePercent: fx.JPYUSD.changePercent,   decimals: 5 },
    { label: 'VIX',     price: idx.VIX.price,     changePercent: idx.VIX.changePercent,     decimals: 1, unit: 'pkt' },
    { label: 'US10Y',   price: bonds.US10Y.price,  changePercent: bonds.US10Y.changePercent,  decimals: 2, unit: '%' },
  ]
}

function TickerItem({ item }: { item: TickerItem }) {
  const isPos = item.changePercent >= 0
  return (
    <span className="inline-flex items-center gap-1.5 px-4">
      <span className="text-gray-400 text-xs font-medium">{item.label}</span>
      <span className="text-white text-xs font-semibold">
        {item.price.toFixed(item.decimals)}
        {item.unit && <span className="text-gray-500 text-xs ml-0.5">{item.unit}</span>}
      </span>
      <span className={`text-xs font-medium ${isPos ? 'text-finance-green' : 'text-finance-red'}`}>
        {isPos ? '+' : ''}{item.changePercent.toFixed(2)}%
      </span>
    </span>
  )
}

function Separator() {
  return <span className="text-gray-700 text-xs select-none px-1">|</span>
}

export default function TickerBar() {
  const [items, setItems] = useState<TickerItem[]>([])

  useEffect(() => {
    fetchGlobalAnalysis()
      .then(analysis => setItems(buildItems(analysis.marketData)))
      .catch(() => {/* silently ignore — bar stays empty */})
  }, [])

  if (items.length === 0) {
    return (
      <div className="h-9 bg-gray-950/90 border-b border-gray-800/60 flex items-center px-4">
        <span className="text-gray-600 text-xs animate-pulse">Ładowanie danych rynkowych...</span>
      </div>
    )
  }

  const track = (
    <>
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center">
          <TickerItem item={item} />
          {i < items.length - 1 && <Separator />}
        </span>
      ))}
      {/* separator between end of first copy and start of second */}
      <Separator />
    </>
  )

  return (
    <div className="h-9 bg-gray-950/90 border-b border-gray-800/60 overflow-hidden flex items-center flex-shrink-0">
      <div className="animate-ticker flex items-center whitespace-nowrap">
        {track}
        {track}
      </div>
    </div>
  )
}
