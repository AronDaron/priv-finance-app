import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TickerBar from './TickerBar'

export default function AppLayout() {
  return (
    <div className="flex flex-col h-screen text-white overflow-hidden" style={{ background: '#0d1117' }}>
      {/* Mesh gradient — stałe blobs w tle */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {/* Zielony odblask — lewy dolny */}
        <div style={{
          position: 'absolute',
          left: '-10%',
          bottom: '-5%',
          width: '55%',
          height: '55%',
          background: 'radial-gradient(ellipse at center, rgba(16,185,129,0.07) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        {/* Indigo — prawy górny */}
        <div style={{
          position: 'absolute',
          right: '-5%',
          top: '5%',
          width: '45%',
          height: '50%',
          background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.06) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }} />
        {/* Subtelna siatka */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
      </div>

      <div className="relative z-10 flex flex-col h-full overflow-hidden">
        <TickerBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
