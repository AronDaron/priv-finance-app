// src/lib/api.ts
// Jedyna warstwa dostępu do danych dla komponentów React.
//
// Dual-backend:
//   - brak window.electronAPI  → localStorage (dev: przeglądarka/Vite)
//   - window.electronAPI       → SQLite przez IPC (produkcja: Electron .exe)
//
// ZASADA: Żaden komponent React nie wywołuje window.electronAPI bezpośrednio.
//         Wszystkie operacje przechodzą przez ten plik.

import type {
  PortfolioAsset,
  Transaction,
  AIReport,
  NewPortfolioAsset,
  NewTransaction,
  NewAIReport
} from './types'

// ─── Deklaracja typów dla window.electronAPI ─────────────────────────────────
// TypeScript renderer nie importuje typów Electrona — deklarujemy ręcznie.

declare global {
  interface Window {
    electronAPI?: {
      version: string
      assets: {
        getAll(): Promise<PortfolioAsset[]>
        add(asset: NewPortfolioAsset): Promise<PortfolioAsset>
        update(id: number, updates: Partial<NewPortfolioAsset>): Promise<PortfolioAsset | null>
        delete(id: number): Promise<{ success: boolean }>
      }
      transactions: {
        getAll(): Promise<Transaction[]>
        getByTicker(ticker: string): Promise<Transaction[]>
        add(tx: NewTransaction): Promise<Transaction>
        delete(id: number): Promise<{ success: boolean }>
      }
      reports: {
        getAll(): Promise<AIReport[]>
        getLatestByTicker(ticker: string): Promise<AIReport | null>
        add(report: NewAIReport): Promise<AIReport>
      }
      settings: {
        get(key: string): Promise<string | null>
        set(key: string, value: string): Promise<{ success: boolean }>
        getAll(): Promise<Record<string, string>>
      }
    }
  }
}

// ─── Detekcja środowiska ──────────────────────────────────────────────────────

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI
}

// ─── localStorage helpers ────────────────────────────────────────────────────

const LS_KEYS = {
  ASSETS: 'fp_assets',
  TRANSACTIONS: 'fp_transactions',
  REPORTS: 'fp_reports',
  SETTINGS: 'fp_settings'
} as const

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function lsSet(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function nextId(items: Array<{ id: number }>): number {
  return items.length === 0 ? 1 : Math.max(...items.map((i) => i.id)) + 1
}

function nowIso(): string {
  return new Date().toISOString()
}

// ─── API: portfolio_assets ────────────────────────────────────────────────────

export async function getAssets(): Promise<PortfolioAsset[]> {
  if (isElectron()) {
    return window.electronAPI!.assets.getAll()
  }
  return lsGet<PortfolioAsset[]>(LS_KEYS.ASSETS, [])
}

export async function addAsset(asset: NewPortfolioAsset): Promise<PortfolioAsset> {
  if (isElectron()) {
    return window.electronAPI!.assets.add(asset)
  }
  const assets = lsGet<PortfolioAsset[]>(LS_KEYS.ASSETS, [])
  const newAsset: PortfolioAsset = {
    ...asset,
    id: nextId(assets),
    created_at: nowIso()
  }
  lsSet(LS_KEYS.ASSETS, [...assets, newAsset])
  return newAsset
}

export async function updateAsset(
  id: number,
  updates: Partial<NewPortfolioAsset>
): Promise<PortfolioAsset | null> {
  if (isElectron()) {
    return window.electronAPI!.assets.update(id, updates)
  }
  const assets = lsGet<PortfolioAsset[]>(LS_KEYS.ASSETS, [])
  const idx = assets.findIndex((a) => a.id === id)
  if (idx === -1) return null
  assets[idx] = { ...assets[idx], ...updates }
  lsSet(LS_KEYS.ASSETS, assets)
  return assets[idx]
}

export async function deleteAsset(id: number): Promise<void> {
  if (isElectron()) {
    await window.electronAPI!.assets.delete(id)
    return
  }
  const assets = lsGet<PortfolioAsset[]>(LS_KEYS.ASSETS, [])
  lsSet(LS_KEYS.ASSETS, assets.filter((a) => a.id !== id))
}

// ─── API: transactions ────────────────────────────────────────────────────────

export async function getTransactions(): Promise<Transaction[]> {
  if (isElectron()) {
    return window.electronAPI!.transactions.getAll()
  }
  return lsGet<Transaction[]>(LS_KEYS.TRANSACTIONS, [])
}

export async function getTransactionsByTicker(ticker: string): Promise<Transaction[]> {
  if (isElectron()) {
    return window.electronAPI!.transactions.getByTicker(ticker)
  }
  const txs = lsGet<Transaction[]>(LS_KEYS.TRANSACTIONS, [])
  return txs.filter((t) => t.ticker === ticker)
}

export async function addTransaction(tx: NewTransaction): Promise<Transaction> {
  if (isElectron()) {
    return window.electronAPI!.transactions.add(tx)
  }
  const txs = lsGet<Transaction[]>(LS_KEYS.TRANSACTIONS, [])
  const newTx: Transaction = { ...tx, id: nextId(txs) }
  lsSet(LS_KEYS.TRANSACTIONS, [...txs, newTx])
  return newTx
}

export async function deleteTransaction(id: number): Promise<void> {
  if (isElectron()) {
    await window.electronAPI!.transactions.delete(id)
    return
  }
  const txs = lsGet<Transaction[]>(LS_KEYS.TRANSACTIONS, [])
  lsSet(LS_KEYS.TRANSACTIONS, txs.filter((t) => t.id !== id))
}

// ─── API: ai_reports ──────────────────────────────────────────────────────────

export async function getReports(): Promise<AIReport[]> {
  if (isElectron()) {
    return window.electronAPI!.reports.getAll()
  }
  return lsGet<AIReport[]>(LS_KEYS.REPORTS, [])
}

export async function getLatestReportByTicker(ticker: string): Promise<AIReport | null> {
  if (isElectron()) {
    return window.electronAPI!.reports.getLatestByTicker(ticker)
  }
  const reports = lsGet<AIReport[]>(LS_KEYS.REPORTS, [])
  const filtered = reports
    .filter((r) => r.ticker === ticker)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return filtered[0] ?? null
}

export async function addReport(report: NewAIReport): Promise<AIReport> {
  if (isElectron()) {
    return window.electronAPI!.reports.add(report)
  }
  const reports = lsGet<AIReport[]>(LS_KEYS.REPORTS, [])
  const newReport: AIReport = {
    ...report,
    id: nextId(reports),
    created_at: nowIso()
  }
  lsSet(LS_KEYS.REPORTS, [...reports, newReport])
  return newReport
}

// ─── API: settings ────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  if (isElectron()) {
    return window.electronAPI!.settings.get(key)
  }
  const settings = lsGet<Record<string, string>>(LS_KEYS.SETTINGS, {})
  return settings[key] ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (isElectron()) {
    await window.electronAPI!.settings.set(key, value)
    return
  }
  const settings = lsGet<Record<string, string>>(LS_KEYS.SETTINGS, {})
  lsSet(LS_KEYS.SETTINGS, { ...settings, [key]: value })
}

export async function getAllSettings(): Promise<Record<string, string>> {
  if (isElectron()) {
    return window.electronAPI!.settings.getAll()
  }
  return lsGet<Record<string, string>>(LS_KEYS.SETTINGS, {})
}

// ─── Helper: info o środowisku ────────────────────────────────────────────────

export function getEnvironmentInfo(): { backend: 'electron' | 'localStorage'; version?: string } {
  if (isElectron()) {
    return { backend: 'electron', version: window.electronAPI!.version }
  }
  return { backend: 'localStorage' }
}
