import { formatCurrency, formatPercent } from '../../lib/utils'

interface Props {
  totalValue: number
  totalPnL: number
  totalROI: number
  assetCount: number
  totalAnnualDividend?: number
  cashValuePLN?: number
  compact?: boolean
}

const IconWallet = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
)

const IconTrendingUp = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
)

const IconTrendingDown = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
  </svg>
)

const IconPercent = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M6 6h.01M18 18h.01M6 6l12 12M8 6a2 2 0 11-4 0 2 2 0 014 0zm12 12a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
)

const IconBriefcase = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
  </svg>
)

const IconBanknote = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
)

const IconGift = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
  </svg>
)

interface Accent {
  bar: string        // gradient dla paska
  barGlow: string    // box-shadow glow pod paskiem
  iconBg: string     // tło kółka ikony
  iconColor: string  // kolor ikony
  valueColor: string
}

const ACCENTS: Record<string, Accent> = {
  green: {
    bar: 'linear-gradient(90deg, #10b981, #34d399)',
    barGlow: '0 2px 12px rgba(16,185,129,0.45)',
    iconBg: 'rgba(16,185,129,0.12)',
    iconColor: '#10b981',
    valueColor: '#10b981',
  },
  red: {
    bar: 'linear-gradient(90deg, #ef4444, #f87171)',
    barGlow: '0 2px 12px rgba(239,68,68,0.45)',
    iconBg: 'rgba(239,68,68,0.12)',
    iconColor: '#ef4444',
    valueColor: '#ef4444',
  },
  indigo: {
    bar: 'linear-gradient(90deg, #6366f1, #818cf8)',
    barGlow: '0 2px 12px rgba(99,102,241,0.4)',
    iconBg: 'rgba(99,102,241,0.12)',
    iconColor: '#818cf8',
    valueColor: '#f9fafb',
  },
  amber: {
    bar: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
    barGlow: '0 2px 12px rgba(245,158,11,0.4)',
    iconBg: 'rgba(245,158,11,0.12)',
    iconColor: '#f59e0b',
    valueColor: '#10b981',
  },
}

interface CardDef {
  label: string
  value: string
  accent: Accent
  icon: React.ReactNode
}

export default function SummaryCards({ totalValue, totalPnL, totalROI, assetCount, totalAnnualDividend = 0, cashValuePLN = 0, compact = false }: Props) {
  const pnlPositive = totalPnL >= 0
  const roiPositive = totalROI >= 0

  const cards: CardDef[] = [
    {
      label: 'Wartość portfela',
      value: formatCurrency(totalValue, 'PLN'),
      accent: ACCENTS.indigo,
      icon: <IconWallet />,
    },
    {
      label: 'Zysk / Strata',
      value: (totalPnL >= 0 ? '+' : '') + formatCurrency(totalPnL, 'PLN'),
      accent: pnlPositive ? ACCENTS.green : ACCENTS.red,
      icon: pnlPositive ? <IconTrendingUp /> : <IconTrendingDown />,
    },
    {
      label: 'ROI',
      value: formatPercent(totalROI),
      accent: roiPositive ? ACCENTS.green : ACCENTS.red,
      icon: <IconPercent />,
    },
    {
      label: 'Spółki',
      value: String(assetCount),
      accent: ACCENTS.indigo,
      icon: <IconBriefcase />,
    },
  ]

  if (cashValuePLN > 0) {
    cards.push({
      label: 'Gotówka (PLN)',
      value: formatCurrency(cashValuePLN, 'PLN'),
      accent: ACCENTS.indigo,
      icon: <IconBanknote />,
    })
  }

  if (totalAnnualDividend > 0) {
    cards.push({
      label: 'Roczna dywidenda (est.)',
      value: formatCurrency(totalAnnualDividend, 'PLN'),
      accent: ACCENTS.amber,
      icon: <IconGift />,
    })
  }

  const gridClass = compact ? 'grid grid-cols-2 gap-4' : `grid grid-cols-2 lg:grid-cols-${cards.length <= 4 ? 4 : cards.length <= 5 ? 5 : 6} gap-4`

  return (
    <div className={gridClass}>
      {cards.map(card => (
        <div
          key={card.label}
          className="glass-card rounded-xl overflow-hidden"
          style={{ border: '1px solid rgba(75,85,99,0.25)' }}
        >
          {/* Kolorowy pasek na górze */}
          <div
            style={{
              height: 3,
              background: card.accent.bar,
              boxShadow: card.accent.barGlow,
            }}
          />

          <div className="p-5">
            {/* Ikona w kółku + etykieta */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: card.accent.iconBg, color: card.accent.iconColor }}
              >
                {card.icon}
              </div>
              <p className="text-xs text-gray-500 uppercase tracking-widest leading-tight">{card.label}</p>
            </div>

            {/* Wartość */}
            <p
              className="text-2xl font-bold leading-none tabular-nums"
              style={{ color: card.accent.valueColor }}
            >
              {card.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
