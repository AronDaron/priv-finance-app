import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import DashboardView from './components/dashboard/DashboardView'
import PortfolioView from './components/portfolio/PortfolioView'
import StockDetailView from './components/stock/StockDetailView'
import SettingsView from './components/settings/SettingsView'
import PortfolioAnalysisView from './components/ai/PortfolioAnalysisView'
import StocksAnalysisView from './components/ai/StocksAnalysisView'
import ChatView from './components/ai/ChatView'
import BenchmarkView from './components/benchmark/BenchmarkView'
import NewsView from './components/news/NewsView'
import GlobalView from './components/global/GlobalView'
import TransactionsView from './components/transactions/TransactionsView'
import SearchView from './components/search/SearchView'
import { PortfolioProvider } from './contexts/PortfolioContext'

export default function App() {
  return (
    <HashRouter>
      <PortfolioProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardView />} />
            <Route path="portfolio" element={<PortfolioView />} />
            <Route path="portfolio/:ticker" element={<StockDetailView />} />
            <Route path="stock/:ticker" element={<StockDetailView />} />
            <Route path="search" element={<SearchView />} />
            <Route path="search/:ticker" element={<SearchView />} />
            <Route path="settings" element={<SettingsView />} />
            <Route path="ai" element={<Navigate to="/ai/portfolio" replace />} />
            <Route path="ai/portfolio" element={<PortfolioAnalysisView />} />
            <Route path="ai/stocks" element={<StocksAnalysisView />} />
            <Route path="ai/chat" element={<ChatView />} />
            <Route path="benchmark" element={<BenchmarkView />} />
            <Route path="news" element={<NewsView />} />
            <Route path="global" element={<GlobalView />} />
            <Route path="transactions" element={<TransactionsView />} />
          </Route>
        </Routes>
      </PortfolioProvider>
    </HashRouter>
  )
}
