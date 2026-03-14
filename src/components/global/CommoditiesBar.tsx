import type { GlobalMarketData } from '../../lib/types'

function Tick({ label, price, changePercent, decimals = 2 }: {
  label: string
  price: number
  changePercent: number
  decimals?: number
}) {
  const isPos = changePercent >= 0
  return (
    <div className="flex items-center gap-2 px-4 py-2 glass-card rounded-lg min-w-0">
      <span className="text-gray-400 text-xs font-medium whitespace-nowrap">{label}</span>
      <span className="text-white text-sm font-semibold">{price.toFixed(decimals)}</span>
      <span className={`text-xs font-medium ${isPos ? 'text-finance-green' : 'text-finance-red'}`}>
        {isPos ? '+' : ''}{changePercent.toFixed(2)}%
      </span>
    </div>
  )
}

function Divider() {
  return <div className="w-px h-6 bg-gray-700/60 flex-shrink-0" />
}

export default function CommoditiesBar({ data }: { data: GlobalMarketData }) {
  const { commodities: c, currencies: fx, indices: idx, bonds } = data
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Surowce */}
      <Tick label="Ropa"    price={c.oil.price}    changePercent={c.oil.changePercent}    decimals={2} />
      <Tick label="Złoto"   price={c.gold.price}   changePercent={c.gold.changePercent}   decimals={0} />
      <Tick label="Gaz"     price={c.gas.price}    changePercent={c.gas.changePercent}    decimals={2} />
      <Tick label="Miedź"   price={c.copper.price} changePercent={c.copper.changePercent} decimals={2} />
      <Tick label="Pszenica" price={c.wheat.price} changePercent={c.wheat.changePercent}  decimals={0} />
      <Divider />
      {/* Waluty */}
      <Tick label="EUR/USD" price={fx.EURUSD.price} changePercent={fx.EURUSD.changePercent} decimals={4} />
      <Tick label="GBP/USD" price={fx.GBPUSD.price} changePercent={fx.GBPUSD.changePercent} decimals={4} />
      <Tick label="CHF/USD" price={fx.CHFUSD.price} changePercent={fx.CHFUSD.changePercent} decimals={4} />
      <Tick label="CAD/USD" price={fx.CADUSD.price} changePercent={fx.CADUSD.changePercent} decimals={4} />
      <Tick label="AUD/USD" price={fx.AUDUSD.price} changePercent={fx.AUDUSD.changePercent} decimals={4} />
      <Tick label="JPY/USD" price={fx.JPYUSD.price} changePercent={fx.JPYUSD.changePercent} decimals={5} />
      <Tick label="CNY/USD" price={fx.CNYUSD.price} changePercent={fx.CNYUSD.changePercent} decimals={4} />
      <Divider />
      {/* Indeksy + VIX */}
      <Tick label="S&P500"  price={idx.SP500.price}  changePercent={idx.SP500.changePercent}  decimals={0} />
      <Tick label="DAX"     price={idx.DAX.price}    changePercent={idx.DAX.changePercent}    decimals={0} />
      <Tick label="Nikkei"  price={idx.Nikkei.price} changePercent={idx.Nikkei.changePercent} decimals={0} />
      <Tick label="WIG20"   price={idx.WIG20.price}  changePercent={idx.WIG20.changePercent}  decimals={0} />
      <Tick label="FTSE"    price={idx.FTSE.price}   changePercent={idx.FTSE.changePercent}   decimals={0} />
      <Divider />
      <Tick label="VIX"     price={idx.VIX.price}    changePercent={idx.VIX.changePercent}    decimals={1} />
      <Tick label="US10Y%"  price={bonds.US10Y.price} changePercent={bonds.US10Y.changePercent} decimals={2} />
    </div>
  )
}
