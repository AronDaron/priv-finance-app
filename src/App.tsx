import { HashRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import DashboardView from './components/dashboard/DashboardView'
import PortfolioView from './components/portfolio/PortfolioView'
import StockDetailView from './components/stock/StockDetailView'
import SettingsView from './components/settings/SettingsView'
import AIAnalysisView from './components/ai/AIAnalysisView'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardView />} />
          <Route path="portfolio" element={<PortfolioView />} />
          <Route path="portfolio/:ticker" element={<StockDetailView />} />
          <Route path="stock/:ticker" element={<StockDetailView />} />
          <Route path="settings" element={<SettingsView />} />
          <Route path="ai" element={<AIAnalysisView />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
