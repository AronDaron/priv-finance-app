// electron/preload/index.ts
// Bezpieczny pomost IPC. Eksponuje metody bazy danych dla renderer procesu.
// ZASADA: każda metoda to cienka warstwa — tylko ipcRenderer.invoke().
// Logika biznesowa należy do electron/main/database.ts (main process).

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Metadane
  version: process.versions.electron,

  portfolioHistory: (portfolioId?: number, period?: string) =>
    ipcRenderer.invoke('finance:portfolioHistory', portfolioId, period),

  // ── portfolios ──────────────────────────────────────────────────────────
  portfolios: {
    getAll: () => ipcRenderer.invoke('db:portfolios:getAll'),
    create: (name: string) => ipcRenderer.invoke('db:portfolios:create', { name }),
    rename: (id: number, name: string) => ipcRenderer.invoke('db:portfolios:rename', { id, name }),
    delete: (id: number) => ipcRenderer.invoke('db:portfolios:delete', { id }),
    updateTags: (id: number, tags: string[]) =>
      ipcRenderer.invoke('db:portfolios:updateTags', { id, tags }),
  },

  // ── cash ─────────────────────────────────────────────────────────────────
  cash: {
    getAccounts: (portfolioId?: number) => ipcRenderer.invoke('db:cash:getAccounts', { portfolioId }),
    addTransaction: (data: {
      portfolio_id: number
      type: 'deposit' | 'withdrawal'
      amount: number
      currency: string
      date: string
      time?: string | null
      purchase_rate?: number | null
      purchase_currency?: string | null
      notes?: string | null
    }) => ipcRenderer.invoke('db:cash:addTransaction', data),
    getTransactions: (portfolioId?: number) => ipcRenderer.invoke('db:cash:getTransactions', { portfolioId }),
    deleteTransaction: (id: number) => ipcRenderer.invoke('db:cash:deleteTransaction', { id }),
  },

  // ── portfolio_assets ────────────────────────────────────────────────────
  assets: {
    getAll: (portfolioId?: number) =>
      ipcRenderer.invoke('db:assets:getAll', portfolioId),

    add: (asset: {
      ticker: string
      name: string
      quantity: number
      purchase_price: number
      currency: string
      purchase_date?: string
      gold_grams?: number | null
      portfolio_id?: number
      asset_type?: 'stock' | 'bond'
      bond_type?: string | null
      bond_year1_rate?: number | null
      bond_maturity_date?: string | null
    }) => ipcRenderer.invoke('db:assets:add', asset),

    update: (
      id: number,
      updates: Partial<{
        ticker: string
        name: string
        quantity: number
        purchase_price: number
        currency: string
        gold_grams: number | null
        purchase_date: string
      }>
    ) => ipcRenderer.invoke('db:assets:update', id, updates),

    delete: (id: number) =>
      ipcRenderer.invoke('db:assets:delete', id)
  },

  // ── transactions ────────────────────────────────────────────────────────
  transactions: {
    getAll: () =>
      ipcRenderer.invoke('db:transactions:getAll'),

    getByTicker: (ticker: string) =>
      ipcRenderer.invoke('db:transactions:getByTicker', ticker),

    add: (tx: {
      ticker: string
      type: 'buy' | 'sell'
      quantity: number
      price: number
      currency: string
      date: string
      notes: string | null
      fee?: number
      fee_type?: string
      time?: string | null
    }) => ipcRenderer.invoke('db:transactions:add', tx),

    update: (id: number, updates: Partial<{
      type: 'buy' | 'sell'
      quantity: number
      price: number
      currency: string
      date: string
      notes: string | null
      fee: number
      fee_type: string
      time: string | null
    }>) => ipcRenderer.invoke('db:transactions:update', id, updates),

    delete: (id: number) =>
      ipcRenderer.invoke('db:transactions:delete', id)
  },

  // ── ai_reports ──────────────────────────────────────────────────────────
  reports: {
    getAll: () =>
      ipcRenderer.invoke('db:reports:getAll'),

    getLatestByTicker: (ticker: string) =>
      ipcRenderer.invoke('db:reports:getLatestByTicker', ticker),

    add: (report: {
      ticker: string
      model: string
      report_text: string
    }) => ipcRenderer.invoke('db:reports:add', report)
  },

  // ── settings ────────────────────────────────────────────────────────────
  settings: {
    get: (key: string) =>
      ipcRenderer.invoke('db:settings:get', key),

    set: (key: string, value: string) =>
      ipcRenderer.invoke('db:settings:set', key, value),

    getAll: () =>
      ipcRenderer.invoke('db:settings:getAll')
  },

  // ── AI (OpenRouter) ──────────────────────────────────────────────────────
  ai: {
    analyzeStock: (ticker: string) =>
      ipcRenderer.invoke('ai:analyzeStock', ticker),
    analyzePortfolio: () =>
      ipcRenderer.invoke('ai:analyzePortfolio'),
    chat: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) =>
      ipcRenderer.invoke('ai:chat', messages),
  },

  // ── news (RSS) ──────────────────────────────────────────────────────────
  news: {
    fetchRegion: (region: string) =>
      ipcRenderer.invoke('news:fetchRegion', region),
  },

  // ── finance (yahoo-finance2 + technicalindicators) ───────────────────────
  finance: {
    quote: (ticker: string) =>
      ipcRenderer.invoke('finance:quote', ticker),
    history: (ticker: string, period: string) =>
      ipcRenderer.invoke('finance:history', ticker, period),
    search: (query: string) =>
      ipcRenderer.invoke('finance:search', query),
    fundamentals: (ticker: string) =>
      ipcRenderer.invoke('finance:fundamentals', ticker),
    dividends: (ticker: string) =>
      ipcRenderer.invoke('finance:dividends', ticker),
    technicals: (ticker: string, period: string) =>
      ipcRenderer.invoke('finance:technicals', ticker, period),
    assetMeta: (ticker: string) =>
      ipcRenderer.invoke('finance:assetMeta', ticker),
    globalMarket: () =>
      ipcRenderer.invoke('finance:globalMarket'),
  },

  // ── global AI region analysis ─────────────────────────────────────────────
  globalAI: {
    analyzeRegion: (regionId: string, newsHeadlines: string[]) =>
      ipcRenderer.invoke('ai:analyzeRegion', regionId, newsHeadlines),
  },

  // ── obligacje skarbowe ───────────────────────────────────────────────────
  bonds: {
    getBatchValues: (assetIds: number[]) =>
      ipcRenderer.invoke('bonds:getBatchValues', assetIds),
    syncNbpRate: () =>
      ipcRenderer.invoke('bonds:syncNbpRate'),
    updateCpi: (year: number, value: number) =>
      ipcRenderer.invoke('bonds:updateCpi', year, value),
    fetchYear1Rate: (ticker: string) =>
      ipcRenderer.invoke('bonds:fetchYear1Rate', ticker),
  },
})
