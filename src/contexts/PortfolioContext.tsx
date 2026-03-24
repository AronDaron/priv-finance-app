import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Portfolio } from '../lib/types'
import { getPortfolios, createPortfolio as apiCreatePortfolio, renamePortfolio as apiRenamePortfolio, deletePortfolio as apiDeletePortfolio } from '../lib/api'

interface PortfolioContextType {
  portfolios: Portfolio[]
  activePortfolioId: number | null // null = wszystkie
  setActivePortfolioId: (id: number | null) => void
  createPortfolio: (name: string) => Promise<void>
  renamePortfolio: (id: number, name: string) => Promise<void>
  deletePortfolio: (id: number) => Promise<void>
  refreshPortfolios: () => Promise<void>
}

const PortfolioContext = createContext<PortfolioContextType | null>(null)

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([])
  const [activePortfolioId, setActivePortfolioIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem('active_portfolio_id')
    return stored ? Number(stored) : null
  })

  const setActivePortfolioId = useCallback((id: number | null) => {
    setActivePortfolioIdState(id)
    if (id === null) {
      localStorage.removeItem('active_portfolio_id')
    } else {
      localStorage.setItem('active_portfolio_id', String(id))
    }
  }, [])

  const refreshPortfolios = useCallback(async () => {
    const list = await getPortfolios()
    setPortfolios(list)
  }, [])

  useEffect(() => {
    refreshPortfolios()
  }, [refreshPortfolios])

  const createPortfolio = useCallback(async (name: string) => {
    await apiCreatePortfolio(name)
    await refreshPortfolios()
  }, [refreshPortfolios])

  const renamePortfolio = useCallback(async (id: number, name: string) => {
    await apiRenamePortfolio(id, name)
    await refreshPortfolios()
  }, [refreshPortfolios])

  const deletePortfolio = useCallback(async (id: number) => {
    await apiDeletePortfolio(id)
    if (activePortfolioId === id) setActivePortfolioId(null)
    await refreshPortfolios()
  }, [activePortfolioId, refreshPortfolios, setActivePortfolioId])

  return (
    <PortfolioContext.Provider value={{
      portfolios,
      activePortfolioId,
      setActivePortfolioId,
      createPortfolio,
      renamePortfolio,
      deletePortfolio,
      refreshPortfolios,
    }}>
      {children}
    </PortfolioContext.Provider>
  )
}

export function usePortfolio(): PortfolioContextType {
  const ctx = useContext(PortfolioContext)
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider')
  return ctx
}
