// electron/preload/index.ts
// Bezpieczny pomost IPC. Eksponuje metody bazy danych dla renderer procesu.
// ZASADA: każda metoda to cienka warstwa — tylko ipcRenderer.invoke().
// Logika biznesowa należy do electron/main/database.ts (main process).

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Metadane
  version: process.versions.electron,

  // ── portfolio_assets ────────────────────────────────────────────────────
  assets: {
    getAll: () =>
      ipcRenderer.invoke('db:assets:getAll'),

    add: (asset: {
      ticker: string
      name: string
      quantity: number
      purchase_price: number
      currency: string
    }) => ipcRenderer.invoke('db:assets:add', asset),

    update: (
      id: number,
      updates: Partial<{
        ticker: string
        name: string
        quantity: number
        purchase_price: number
        currency: string
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
    }) => ipcRenderer.invoke('db:transactions:add', tx),

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
  }
})
