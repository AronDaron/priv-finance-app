import { HashRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import DashboardView from './components/dashboard/DashboardView'
import PortfolioView from './components/portfolio/PortfolioView'
import StockDetailView from './components/stock/StockDetailView'
import TransactionsView from './components/transactions/TransactionsView'
import SettingsView from './components/settings/SettingsView'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardView />} />
          <Route path="portfolio" element={<PortfolioView />} />
          <Route path="portfolio/:ticker" element={<StockDetailView />} />
          <Route path="stock/:ticker" element={<StockDetailView />} />
          <Route path="transactions" element={<TransactionsView />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
