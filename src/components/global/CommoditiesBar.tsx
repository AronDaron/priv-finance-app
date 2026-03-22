import type { GlobalMarketData } from '../../lib/types'

function Tick({ label, price, changePercent, decimals = 2, unit, tooltip }: {
  label: string
  price: number
  changePercent: number
  decimals?: number
  unit?: string
  tooltip?: string
}) {
  const isPos = changePercent >= 0
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 glass-card rounded-lg min-w-0"
      title={tooltip}
    >
      <span className="text-gray-400 text-xs font-medium whitespace-nowrap">{label}</span>
      <span className="text-white text-sm font-semibold">
        {price.toFixed(decimals)}
        {unit && <span className="text-gray-500 text-xs ml-1"> {unit}</span>}
      </span>
      <span className={`text-xs font-medium ml-1 ${isPos ? 'text-finance-green' : 'text-finance-red'}`}>
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
      <Tick label="WTI"     price={c.oil.price}    changePercent={c.oil.changePercent}    decimals={2} unit="USD/bbl" tooltip="Ropa WTI (CL=F) — amerykański benchmark, cena baryłki w dolarach" />
      <Tick label="Brent"   price={c.brent.price}  changePercent={c.brent.changePercent}  decimals={2} unit="USD/bbl" tooltip="Ropa Brent (BZ=F) — globalny benchmark (Europa, Azja), cena baryłki w dolarach" />
      <Tick label="Złoto"   price={c.gold.price}   changePercent={c.gold.changePercent}   decimals={0} unit="USD/oz"  tooltip="Złoto — cena uncji troy w dolarach (futures GC=F)" />
      <Tick label="Gaz"     price={c.gas.price}    changePercent={c.gas.changePercent}    decimals={2} unit="USD"     tooltip="Gaz ziemny — cena kontraktu futures (MMBTU)" />
      <Tick label="Miedź"   price={c.copper.price} changePercent={c.copper.changePercent} decimals={2} unit="USD/lb"  tooltip="Miedź — cena funta w dolarach (futures HG=F)" />
      <Tick label="Pszenica" price={c.wheat.price} changePercent={c.wheat.changePercent}  decimals={0} unit="USc/bu" tooltip="Pszenica — cena buszla w centach amerykańskich (futures ZW=F)" />
      <Divider />
      {/* Waluty */}
      <Tick label="EUR/USD" price={fx.EURUSD.price} changePercent={fx.EURUSD.changePercent} decimals={4} tooltip="Euro do dolara — ile dolarów za 1 euro" />
      <Tick label="GBP/USD" price={fx.GBPUSD.price} changePercent={fx.GBPUSD.changePercent} decimals={4} tooltip="Funt brytyjski do dolara" />
      <Tick label="CHF/USD" price={fx.CHFUSD.price} changePercent={fx.CHFUSD.changePercent} decimals={4} tooltip="Frank szwajcarski do dolara" />
      <Tick label="CAD/USD" price={fx.CADUSD.price} changePercent={fx.CADUSD.changePercent} decimals={4} tooltip="Dolar kanadyjski do dolara amerykańskiego" />
      <Tick label="AUD/USD" price={fx.AUDUSD.price} changePercent={fx.AUDUSD.changePercent} decimals={4} tooltip="Dolar australijski do dolara amerykańskiego" />
      <Tick label="JPY/USD" price={fx.JPYUSD.price} changePercent={fx.JPYUSD.changePercent} decimals={5} tooltip="Jen japoński do dolara — uwaga: bardzo mała wartość (1 JPY ≈ 0.0066 USD)" />
      <Tick label="CNY/USD" price={fx.CNYUSD.price} changePercent={fx.CNYUSD.changePercent} decimals={4} tooltip="Juan chiński do dolara" />
      <Divider />
      {/* Indeksy + VIX */}
      <Tick label="S&P500"  price={idx.SP500.price}  changePercent={idx.SP500.changePercent}  decimals={0} unit="pkt" tooltip="S&P 500 — indeks 500 największych spółek USA (giełda NYSE/NASDAQ)" />
      <Tick label="DAX"     price={idx.DAX.price}    changePercent={idx.DAX.changePercent}    decimals={0} unit="pkt" tooltip="DAX — indeks 40 największych spółek niemieckich (Frankfurt)" />
      <Tick label="Nikkei"  price={idx.Nikkei.price} changePercent={idx.Nikkei.changePercent} decimals={0} unit="pkt" tooltip="Nikkei 225 — główny indeks japońskiej giełdy (Tokio)" />
      <Tick label="WIG20"   price={idx.WIG20.price}  changePercent={idx.WIG20.changePercent}  decimals={0} unit="pkt" tooltip="WIG20 — indeks 20 największych spółek polskiej giełdy (GPW Warszawa)" />
      <Tick label="FTSE"    price={idx.FTSE.price}   changePercent={idx.FTSE.changePercent}   decimals={0} unit="pkt" tooltip="FTSE 100 — indeks 100 największych spółek brytyjskich (Londyn)" />
      <Divider />
      <Tick label="VIX"     price={idx.VIX.price}    changePercent={idx.VIX.changePercent}    decimals={1} unit="pkt" tooltip="VIX — indeks zmienności (&#34;indeks strachu&#34;). Poniżej 15 = spokój, 15-25 = umiarkowany, 25-35 = wysoki strach, powyżej 35 = panika. Wysoki VIX oznacza duże wahania cen na rynkach." />
      <Tick label="US10Y"   price={bonds.US10Y.price} changePercent={bonds.US10Y.changePercent} decimals={2} unit="%" tooltip="US10Y — rentowność 10-letnich obligacji skarbowych USA. Rosnąca rentowność = droższa pożyczka dla rządu i firm. Poziom >5% uważany za restrykcyjny dla rynku akcji." />
    </div>
  )
}
