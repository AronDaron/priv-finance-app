import { NavLink, useLocation } from 'react-router-dom'
import logoFinance from '../../assets/logo_finance.png'

const mainLinks = [
  {
    to: '/',
    label: 'Dashboard',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
      </svg>
    ),
  },
  {
    to: '/search',
    label: 'Wyszukaj',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    to: '/benchmark',
    label: 'Benchmark',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    to: '/news',
    label: 'Wiadomości',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
    ),
  },
  {
    to: '/global',
    label: 'Globalny Rynek',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: '/transactions',
    label: 'Transakcje',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
]

const portfolioSubLinks = [
  { to: '/portfolio', label: 'Portfel' },
  { to: '/portfolio/rebalancing', label: 'Rebalansowanie' },
  { to: '/portfolio/correlation', label: 'Korelacja' },
]

const portfolioIcon = (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
  </svg>
)

const aiSubLinks = [
  { to: '/ai/portfolio', label: 'Portfel' },
  { to: '/ai/stocks', label: 'Spółki' },
  { to: '/ai/chat', label: 'Chat' },
]

const aiIcon = (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
)

export default function Sidebar() {
  const location = useLocation()
  const isPortfolioActive = location.pathname.startsWith('/portfolio')
  const isAiActive = location.pathname.startsWith('/ai')

  return (
    <div className="w-72 flex flex-col" style={{ background: 'linear-gradient(to bottom, rgba(17,24,39,0.9), rgba(10,14,21,0.95))', borderRight: '1px solid rgba(55,65,81,0.4)', backdropFilter: 'blur(4px)' }}>
      <div className="px-6 py-6 border-b border-gray-700/40">
        <div className="flex gap-3" style={{ alignItems: 'center' }}>
          <img src={logoFinance} alt="Logo" className="w-14 h-14 object-contain" style={{ display: 'block', transform: 'translateY(-1px)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', lineHeight: '1.2' }}>
            <h1 className="text-finance-green font-bold text-xl" style={{ margin: 0 }}>Finance</h1>
            <p className="text-gray-500 text-sm" style={{ margin: 0 }}>Portfolio Tracker</p>
            <div className="bg-finance-green h-0.5 mt-1 rounded-full" />
          </div>
        </div>
      </div>
      <nav className="flex-1 py-4">
        {mainLinks.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-4 px-5 py-4 rounded-lg mx-3 mb-1 transition-colors ${
                isActive
                  ? 'bg-gradient-to-r from-finance-green/20 to-emerald-900/20 text-white border-l-2 border-finance-green'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {icon}
            <span className="text-base font-medium">{label}</span>
          </NavLink>
        ))}

        {/* Portfel — sekcja z sublinkiami */}
        <div className="mx-3 mb-1">
          <div className={`flex items-center gap-4 px-5 py-4 rounded-lg transition-colors ${
            isPortfolioActive ? 'text-white' : 'text-gray-400'
          }`}>
            {portfolioIcon}
            <span className="text-base font-medium">Portfel</span>
          </div>
          <div className="ml-14 flex flex-col gap-0.5">
            {portfolioSubLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/portfolio'}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-finance-green bg-finance-green/10'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Analiza AI — sekcja z sublinkiami */}
        <div className="mx-3 mb-1">
          <div className={`flex items-center gap-4 px-5 py-4 rounded-lg transition-colors ${
            isAiActive ? 'text-white' : 'text-gray-400'
          }`}>
            {aiIcon}
            <span className="text-base font-medium">Analiza AI</span>
          </div>
          <div className="ml-14 flex flex-col gap-0.5">
            {aiSubLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-finance-green bg-finance-green/10'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>

        <div className="mx-5 my-2 h-px bg-gray-700/30" />

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-4 px-5 py-4 rounded-lg mx-3 mb-1 transition-colors ${
              isActive
                ? 'bg-gradient-to-r from-finance-green/20 to-emerald-900/20 text-white border-l-2 border-finance-green'
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`
          }
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-base font-medium">Ustawienia</span>
        </NavLink>
      </nav>
    </div>
  )
}
