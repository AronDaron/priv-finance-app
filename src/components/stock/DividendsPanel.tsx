import { useState } from 'react'
import { formatCurrency } from '../../lib/utils'
import type { DividendEntry } from '../../lib/types'

interface Props {
  dividends: DividendEntry[]
}

export default function DividendsPanel({ dividends }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (dividends.length === 0) return null

  const sorted = [...dividends].sort((a, b) => b.date.localeCompare(a.date))
  const visible = expanded ? sorted : sorted.slice(0, 10)

  return (
    <div className="bg-finance-card rounded-xl border border-gray-700 p-5">
      <h3 className="text-lg font-semibold text-white mb-4">Historia dywidend</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700 pb-2">
            <th className="text-left pb-2">Data</th>
            <th className="text-right pb-2">Kwota</th>
            <th className="text-right pb-2">Waluta</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((d) => (
            <tr key={d.date} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
              <td className="py-2 text-gray-300">
                {new Date(d.date).toLocaleDateString('pl-PL')}
              </td>
              <td className="py-2 text-right text-white font-medium">
                {formatCurrency(d.amount, d.currency)}
              </td>
              <td className="py-2 text-right text-gray-400">{d.currency}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > 10 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-sm text-finance-green hover:text-emerald-400 transition-colors"
        >
          {expanded ? 'Pokaż mniej' : `Pokaż więcej (${sorted.length - 10} więcej)`}
        </button>
      )}
    </div>
  )
}
