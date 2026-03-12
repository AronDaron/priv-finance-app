import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { OHLCCandle } from '../../lib/types'

interface Props {
  data: OHLCCandle[]
  ticker: string
  height?: number
}

export function CandlestickChart({ data, ticker, height = 400 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  // Efekt #1: tworzenie/niszczenie wykresu (zależność: height)
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

    seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
      upColor:        '#10b981',  // finance-green
      downColor:      '#ef4444',  // finance-red
      borderUpColor:  '#10b981',
      borderDownColor:'#ef4444',
      wickUpColor:    '#10b981',
      wickDownColor:  '#ef4444',
    })

    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && chartRef.current) chartRef.current.applyOptions({ width: w })
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chartRef.current?.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [height])

  // Efekt #2: aktualizacja danych (zależność: data, ticker)
  useEffect(() => {
    if (!seriesRef.current || data.length === 0) return
    seriesRef.current.setData(data.map(c => ({ ...c, time: c.time as UTCTimestamp })))
    chartRef.current?.timeScale().fitContent()
  }, [data, ticker])

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl overflow-hidden"
      style={{ height }}
    />
  )
}
