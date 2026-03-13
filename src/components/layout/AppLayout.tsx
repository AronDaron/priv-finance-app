import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppLayout() {
  return (
    <div className="flex h-screen text-white overflow-hidden" style={{ background: 'linear-gradient(135deg, #0d1117 0%, #111827 60%, #0f1f1a 100%)' }}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
