import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { BollingerBands } from 'technicalindicators'
import type { OHLCCandle } from '../../lib/types'

interface Props {
  data: OHLCCandle[]
  ticker: string
  height?: number
  showBB?: boolean
}

export function CandlestickChart({ data, ticker, height = 400, showBB = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const candleRef    = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const bbUpperRef   = useRef<ISeriesApi<'Line'> | null>(null)
  const bbMiddleRef  = useRef<ISeriesApi<'Line'> | null>(null)
  const bbLowerRef   = useRef<ISeriesApi<'Line'> | null>(null)

  // Efekt #1: tworzenie/niszczenie wykresu
  useEffect(() => {
    if (!containerRef.current) return

    chartRef.current = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: '#1f2937' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#374151' },
        horzLines: { color: '#374151' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#374151' },
      timeScale: { borderColor: '#374151', timeVisible: true },
    })

    candleRef.current = chartRef.current.addSeries(CandlestickSeries, {
      upColor:         '#10b981',
      downColor:       '#ef4444',
      borderUpColor:   '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor:     '#10b981',
      wickDownColor:   '#ef4444',
    })

    if (showBB) {
      bbUpperRef.current = chartRef.current.addSeries(LineSeries, {
        color: 'rgba(239, 68, 68, 0.6)',
        lineWidth: 1,
        lineStyle: 2, // dashed
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      bbMiddleRef.current = chartRef.current.addSeries(LineSeries, {
        color: 'rgba(156, 163, 175, 0.5)',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      bbLowerRef.current = chartRef.current.addSeries(LineSeries, {
        color: 'rgba(16, 185, 129, 0.6)',
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
    }

    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && chartRef.current) chartRef.current.applyOptions({ width: w })
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chartRef.current?.remove()
      chartRef.current = null
      candleRef.current = null
      bbUpperRef.current = null
      bbMiddleRef.current = null
      bbLowerRef.current = null
    }
  }, [height, showBB])

  // Efekt #2: aktualizacja danych
  useEffect(() => {
    if (!candleRef.current || data.length === 0) return

    candleRef.current.setData(data.map(c => ({ ...c, time: c.time as UTCTimestamp })))

    if (showBB && data.length >= 20 && bbUpperRef.current && bbMiddleRef.current && bbLowerRef.current) {
      const closes = data.map(c => c.close)
      const bbResult = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 })

      // BB ma o (period-1) = 19 punktów mniej niż dane wejściowe
      const offset = data.length - bbResult.length

      const upperData = bbResult.map((bb, i) => ({ time: data[offset + i].time as UTCTimestamp, value: bb.upper }))
      const middleData = bbResult.map((bb, i) => ({ time: data[offset + i].time as UTCTimestamp, value: bb.middle }))
      const lowerData = bbResult.map((bb, i) => ({ time: data[offset + i].time as UTCTimestamp, value: bb.lower }))

      bbUpperRef.current.setData(upperData)
      bbMiddleRef.current.setData(middleData)
      bbLowerRef.current.setData(lowerData)
    }

    chartRef.current?.timeScale().fitContent()
  }, [data, ticker, showBB])

  return (
    <div className="space-y-1">
      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-hidden"
        style={{ height }}
      />
      {showBB && (
        <div className="flex items-center gap-4 px-1 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-px border-t-2 border-dashed border-red-400/60" />
            BB górne
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-px border-t-2 border-dashed border-gray-400/50" />
            BB środek (SMA20)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-px border-t-2 border-dashed border-emerald-400/60" />
            BB dolne
          </span>
        </div>
      )}
    </div>
  )
}
