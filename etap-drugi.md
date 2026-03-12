# Etap 2: Baza Danych + Warstwa API — Finance Portfolio Tracker

## Kontekst

Budujesz warstwę danych dla aplikacji desktopowej. Projekt po Milestone 1 ma działający Electron + React + Vite. Celem Milestone 2 jest:

1. Zainstalowanie `better-sqlite3` i skonfigurowanie bazy SQLite po stronie Electron (main process)
2. Zarejestrowanie IPC handlers w `electron/main/index.ts`
3. Wyeksponowanie metod przez `contextBridge` w `electron/preload/index.ts`
4. Stworzenie `src/lib/api.ts` — jedynej warstwy dostępu do danych dla React
5. Demonstracja w `src/App.tsx` że wszystko działa (dodaj/usuń aktywo, widoczne w UI)

**Wynik:** dodawanie/usuwanie spółek działa zarówno w przeglądarce (localStorage) jak i w aplikacji Electron (SQLite).

**AD. NA POTRZEBY DEWELOPERSKIE WSZYSTKIE TESTY APLIKACJI BĘDĄ ODBYWAĆ SIĘ PRZY POMOCY KOMENDY 'NPM RUN DEV' TESTOWANE PRZEZ UŻYTKOWNIKA W PRZEGLĄDARCE.**

---

## Ważna obserwacja dotycząca środowiska deweloperskiego

`npm run dev` uruchamia czysty Vite dev server (`--host`) dostępny w przeglądarce pod IP serwera LXC. W trybie dev `window.electronAPI` nie istnieje — `src/lib/api.ts` automatycznie wykrywa to i używa `localStorage` jako backend. Pełne UI działa w przeglądarce bez uruchomionego Electrona.

---

## Kolejność implementacji (zależności)

```
KROK 1: Instalacja zależności (better-sqlite3, electron-rebuild)
    ↓
KROK 2: Typy TypeScript — src/lib/types.ts (encje danych)
    ↓
KROK 3: Moduł bazy danych — electron/main/database.ts
    ↓
KROK 4: IPC handlers — rozszerzenie electron/main/index.ts
    ↓
KROK 5: Preload API — rozszerzenie electron/preload/index.ts
    ↓
KROK 6: API layer — src/lib/api.ts (localStorage + electronAPI)
    ↓
KROK 7: Aktualizacja src/App.tsx — demonstracja działania
    ↓
KROK 8: Weryfikacja w przeglądarce (npm run dev)
```

---

## KROK 1: Instalacja zależności

Wykonaj kolejno w terminalu:

```bash
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
npm install --save-dev electron-rebuild
```

Następnie otwórz `package.json` i zmodyfikuj sekcję `"scripts"` — dodaj `"postinstall"`:

```json
"scripts": {
  "dev": "vite --host",
  "build": "electron-vite build && electron-builder",
  "preview": "electron-vite preview",
  "postinstall": "electron-rebuild"
},
```

**Uruchom rebuild ręcznie (jednorazowo po instalacji):**

```bash
npx electron-rebuild
```

**Dlaczego `electron-rebuild`?** `better-sqlite3` to natywny moduł C++. Musi być skompilowany dla konkretnej wersji V8 (Node.js) wbudowanej w Electron, a nie dla systemowego Node.js.

Jeśli pojawi się błąd `node-gyp` o brakujących nagłówkach:

```bash
# Na Ubuntu/Debian:
apt-get install -y python3 make g++

# Sprawdź wersję Electrona:
npx electron --version

# Rebuild z podaną wersją:
npx electron-rebuild --force --version <VERSION>
```

---

## KROK 2: Utwórz plik src/lib/types.ts

Najpierw utwórz katalog:

```bash
mkdir -p src/lib
```

Ścieżka: `src/lib/types.ts`

```typescript
// src/lib/types.ts
// Centralne typy danych dla całej aplikacji.
// Używane przez: src/lib/api.ts, src/components/**, src/App.tsx

export interface PortfolioAsset {
  id: number
  ticker: string        // np. "AAPL", "PKOBP.WA", "GC=F"
  name: string          // pełna nazwa: "Apple Inc."
  quantity: number      // ilość jednostek/akcji
  purchase_price: number // średnia cena zakupu (PLN lub USD)
  currency: string      // "USD" | "PLN" | "EUR"
  created_at: string    // ISO 8601: "2024-01-15T10:30:00Z"
}

export interface Transaction {
  id: number
  ticker: string
  type: 'buy' | 'sell'
  quantity: number
  price: number         // cena jednostkowa w momencie transakcji
  currency: string
  date: string          // ISO 8601
  notes: string | null
}

export interface AIReport {
  id: number
  ticker: string
  model: string         // np. "meta-llama/llama-3-8b-instruct:free"
  report_text: string
  created_at: string    // ISO 8601
}

export interface Setting {
  key: string
  value: string
}

// Typy pomocnicze dla operacji API

export type NewPortfolioAsset = Omit<PortfolioAsset, 'id' | 'created_at'>
export type NewTransaction = Omit<Transaction, 'id'>
export type NewAIReport = Omit<AIReport, 'id' | 'created_at'>
```

---

## KROK 3: Utwórz plik electron/main/database.ts

Ścieżka: `electron/main/database.ts`

Wydzielony moduł odpowiedzialny wyłącznie za inicjalizację SQLite i operacje CRUD. Importowany przez `electron/main/index.ts`.

```typescript
// electron/main/database.ts
// Warstwa SQLite dla main process. Używa better-sqlite3 (synchroniczne API).
// Ten plik NIGDY nie jest importowany przez renderer ani preload bezpośrednio.

import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

// Typy lokalne (duplikacja z src/lib/types.ts ze względu na izolację tsconfig)
export interface DBPortfolioAsset {
  id: number
  ticker: string
  name: string
  quantity: number
  purchase_price: number
  currency: string
  created_at: string
}

export interface DBTransaction {
  id: number
  ticker: string
  type: 'buy' | 'sell'
  quantity: number
  price: number
  currency: string
  date: string
  notes: string | null
}

export interface DBNewPortfolioAsset {
  ticker: string
  name: string
  quantity: number
  purchase_price: number
  currency: string
}

export interface DBNewTransaction {
  ticker: string
  type: 'buy' | 'sell'
  quantity: number
  price: number
  currency: string
  date: string
  notes: string | null
}

export interface DBAIReport {
  id: number
  ticker: string
  model: string
  report_text: string
  created_at: string
}

export interface DBNewAIReport {
  ticker: string
  model: string
  report_text: string
}

let db: Database.Database

export function initDatabase(): void {
  // app.getPath('userData') → %APPDATA%\Finance Portfolio Tracker\ (Windows)
  //                         → ~/.config/Finance Portfolio Tracker/ (Linux)
  const dbPath = join(app.getPath('userData'), 'portfolio.db')
  db = new Database(dbPath)

  // Włącz WAL mode — lepsza wydajność przy concurrent reads
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createTables()
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_assets (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker         TEXT NOT NULL UNIQUE,
      name           TEXT NOT NULL,
      quantity       REAL NOT NULL DEFAULT 0,
      purchase_price REAL NOT NULL DEFAULT 0,
      currency       TEXT NOT NULL DEFAULT 'USD',
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker   TEXT NOT NULL,
      type     TEXT NOT NULL CHECK(type IN ('buy', 'sell')),
      quantity REAL NOT NULL,
      price    REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      date     TEXT NOT NULL,
      notes    TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_reports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker      TEXT NOT NULL,
      model       TEXT NOT NULL,
      report_text TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
}

// ─── portfolio_assets ────────────────────────────────────────────────────────

export function getAllAssets(): DBPortfolioAsset[] {
  return db
    .prepare('SELECT * FROM portfolio_assets ORDER BY created_at ASC')
    .all() as DBPortfolioAsset[]
}

export function addAsset(asset: DBNewPortfolioAsset): DBPortfolioAsset {
  const stmt = db.prepare(`
    INSERT INTO portfolio_assets (ticker, name, quantity, purchase_price, currency)
    VALUES (@ticker, @name, @quantity, @purchase_price, @currency)
  `)
  const result = stmt.run(asset)
  return getAssetById(result.lastInsertRowid as number)!
}

export function updateAsset(
  id: number,
  updates: Partial<DBNewPortfolioAsset>
): DBPortfolioAsset | null {
  const fields = Object.keys(updates)
    .map((k) => `${k} = @${k}`)
    .join(', ')
  if (!fields) return getAssetById(id)

  db.prepare(`UPDATE portfolio_assets SET ${fields} WHERE id = @id`).run({
    ...updates,
    id
  })
  return getAssetById(id)
}

export function deleteAsset(id: number): void {
  db.prepare('DELETE FROM portfolio_assets WHERE id = ?').run(id)
}

export function getAssetById(id: number): DBPortfolioAsset | null {
  return (
    (db
      .prepare('SELECT * FROM portfolio_assets WHERE id = ?')
      .get(id) as DBPortfolioAsset) ?? null
  )
}

// ─── transactions ────────────────────────────────────────────────────────────

export function getAllTransactions(): DBTransaction[] {
  return db
    .prepare('SELECT * FROM transactions ORDER BY date DESC')
    .all() as DBTransaction[]
}

export function getTransactionsByTicker(ticker: string): DBTransaction[] {
  return db
    .prepare('SELECT * FROM transactions WHERE ticker = ? ORDER BY date DESC')
    .all(ticker) as DBTransaction[]
}

export function addTransaction(tx: DBNewTransaction): DBTransaction {
  const stmt = db.prepare(`
    INSERT INTO transactions (ticker, type, quantity, price, currency, date, notes)
    VALUES (@ticker, @type, @quantity, @price, @currency, @date, @notes)
  `)
  const result = stmt.run(tx)
  return db
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .get(result.lastInsertRowid) as DBTransaction
}

export function deleteTransaction(id: number): void {
  db.prepare('DELETE FROM transactions WHERE id = ?').run(id)
}

// ─── ai_reports ──────────────────────────────────────────────────────────────

export function getLatestReportByTicker(ticker: string): DBAIReport | null {
  return (
    (db
      .prepare(
        'SELECT * FROM ai_reports WHERE ticker = ? ORDER BY created_at DESC LIMIT 1'
      )
      .get(ticker) as DBAIReport) ?? null
  )
}

export function getAllReports(): DBAIReport[] {
  return db
    .prepare('SELECT * FROM ai_reports ORDER BY created_at DESC')
    .all() as DBAIReport[]
}

export function addReport(report: DBNewAIReport): DBAIReport {
  const stmt = db.prepare(`
    INSERT INTO ai_reports (ticker, model, report_text)
    VALUES (@ticker, @model, @report_text)
  `)
  const result = stmt.run(report)
  return db
    .prepare('SELECT * FROM ai_reports WHERE id = ?')
    .get(result.lastInsertRowid) as DBAIReport
}

// ─── settings ────────────────────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string
    value: string
  }>
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}
```

---

## KROK 4: Nadpisz electron/main/index.ts

Zastąp **CAŁĄ** zawartość pliku `electron/main/index.ts` poniższym kodem. Zachowuje oryginalną logikę `createWindow()` i dodaje inicjalizację bazy danych oraz IPC handlers.

```typescript
// electron/main/index.ts
import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import {
  initDatabase,
  getAllAssets,
  addAsset,
  updateAsset,
  deleteAsset,
  getAllTransactions,
  getTransactionsByTicker,
  addTransaction,
  deleteTransaction,
  getLatestReportByTicker,
  getAllReports,
  addReport,
  getSetting,
  setSetting,
  getAllSettings
} from './database'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'Finance Portfolio Tracker',
    backgroundColor: '#111827',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  // ── portfolio_assets ──────────────────────────────────────────────────────
  ipcMain.handle('db:assets:getAll', () => {
    return getAllAssets()
  })

  ipcMain.handle('db:assets:add', (_event, asset) => {
    return addAsset(asset)
  })

  ipcMain.handle('db:assets:update', (_event, id, updates) => {
    return updateAsset(id, updates)
  })

  ipcMain.handle('db:assets:delete', (_event, id) => {
    deleteAsset(id)
    return { success: true }
  })

  // ── transactions ──────────────────────────────────────────────────────────
  ipcMain.handle('db:transactions:getAll', () => {
    return getAllTransactions()
  })

  ipcMain.handle('db:transactions:getByTicker', (_event, ticker) => {
    return getTransactionsByTicker(ticker)
  })

  ipcMain.handle('db:transactions:add', (_event, tx) => {
    return addTransaction(tx)
  })

  ipcMain.handle('db:transactions:delete', (_event, id) => {
    deleteTransaction(id)
    return { success: true }
  })

  // ── ai_reports ────────────────────────────────────────────────────────────
  ipcMain.handle('db:reports:getAll', () => {
    return getAllReports()
  })

  ipcMain.handle('db:reports:getLatestByTicker', (_event, ticker) => {
    return getLatestReportByTicker(ticker)
  })

  ipcMain.handle('db:reports:add', (_event, report) => {
    return addReport(report)
  })

  // ── settings ──────────────────────────────────────────────────────────────
  ipcMain.handle('db:settings:get', (_event, key) => {
    return getSetting(key)
  })

  ipcMain.handle('db:settings:set', (_event, key, value) => {
    setSetting(key, value)
    return { success: true }
  })

  ipcMain.handle('db:settings:getAll', () => {
    return getAllSettings()
  })
}

app.whenReady().then(() => {
  // Inicjalizuj bazę PRZED otwarciem okna
  initDatabase()
  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

**Kanały IPC — pełna lista:**

| Kanał | Argumenty | Zwraca |
|---|---|---|
| `db:assets:getAll` | — | `DBPortfolioAsset[]` |
| `db:assets:add` | `DBNewPortfolioAsset` | `DBPortfolioAsset` |
| `db:assets:update` | `id: number, updates: Partial<DBNewPortfolioAsset>` | `DBPortfolioAsset \| null` |
| `db:assets:delete` | `id: number` | `{ success: true }` |
| `db:transactions:getAll` | — | `DBTransaction[]` |
| `db:transactions:getByTicker` | `ticker: string` | `DBTransaction[]` |
| `db:transactions:add` | `DBNewTransaction` | `DBTransaction` |
| `db:transactions:delete` | `id: number` | `{ success: true }` |
| `db:reports:getAll` | — | `DBAIReport[]` |
| `db:reports:getLatestByTicker` | `ticker: string` | `DBAIReport \| null` |
| `db:reports:add` | `DBNewAIReport` | `DBAIReport` |
| `db:settings:get` | `key: string` | `string \| null` |
| `db:settings:set` | `key: string, value: string` | `{ success: true }` |
| `db:settings:getAll` | — | `Record<string, string>` |

---

## KROK 5: Nadpisz electron/preload/index.ts

Zastąp **CAŁĄ** zawartość pliku `electron/preload/index.ts`:

```typescript
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
  }
})
```

**Uwaga TypeScript:** TypeScript w trybie renderer (`tsconfig.json`) nie widzi typów Electrona. Typy dla `window.electronAPI` są zdefiniowane w `src/lib/api.ts` przez deklarację `declare global { interface Window { electronAPI?: ... } }`.

---

## KROK 6: Utwórz plik src/lib/api.ts

Ścieżka: `src/lib/api.ts`

To jest najważniejszy plik Milestone 2. Jedyna warstwa dostępu do danych dla komponentów React. Implementuje dual-backend: localStorage (przeglądarka/dev) i electronAPI (Electron/.exe).

```typescript
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
```

---

## KROK 7: Nadpisz src/App.tsx

Zastąp **CAŁĄ** zawartość `src/App.tsx` poniższym kodem. Ten komponent demonstruje że Milestone 2 działa: dodawanie/usuwanie aktywów, wskaźnik aktywnego backendu.

```typescript
// src/App.tsx
// Tymczasowy komponent demonstracyjny dla Milestone 2.
// Milestone 3+ zastąpi to właściwym UI dashboardu.

import { useState, useEffect } from 'react'
import {
  getAssets,
  addAsset,
  deleteAsset,
  getEnvironmentInfo
} from './lib/api'
import type { PortfolioAsset, NewPortfolioAsset } from './lib/types'

function App(): JSX.Element {
  const [assets, setAssets] = useState<PortfolioAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const env = getEnvironmentInfo()

  // Formularz nowego aktywa
  const [form, setForm] = useState<NewPortfolioAsset>({
    ticker: '',
    name: '',
    quantity: 1,
    purchase_price: 0,
    currency: 'USD'
  })

  useEffect(() => {
    loadAssets()
  }, [])

  async function loadAssets() {
    try {
      setLoading(true)
      setError(null)
      const data = await getAssets()
      setAssets(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd ładowania danych')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ticker.trim() || !form.name.trim()) return
    try {
      setError(null)
      await addAsset(form)
      setForm({ ticker: '', name: '', quantity: 1, purchase_price: 0, currency: 'USD' })
      await loadAssets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd dodawania aktywa')
    }
  }

  async function handleDelete(id: number) {
    try {
      setError(null)
      await deleteAsset(id)
      await loadAssets()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd usuwania aktywa')
    }
  }

  return (
    <div className="min-h-screen bg-finance-dark text-white p-8">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Nagłówek */}
        <div>
          <h1 className="text-3xl font-bold text-finance-green">
            Finance Portfolio Tracker
          </h1>
          <p className="text-gray-400 mt-1">Milestone 2 — Baza danych</p>
        </div>

        {/* Status środowiska */}
        <div className="bg-finance-card rounded-xl p-4 flex items-center justify-between">
          <span className="text-gray-400 text-sm">Backend:</span>
          <span className={`text-sm font-semibold ${
            env.backend === 'electron' ? 'text-finance-green' : 'text-yellow-400'
          }`}>
            {env.backend === 'electron'
              ? `Electron SQLite (v${env.version})`
              : 'localStorage (przeglądarka / dev)'}
          </span>
        </div>

        {/* Błąd */}
        {error && (
          <div className="bg-red-900/30 border border-finance-red rounded-xl p-4 text-finance-red text-sm">
            {error}
          </div>
        )}

        {/* Formularz dodawania */}
        <form onSubmit={handleAdd} className="bg-finance-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Dodaj aktywo</h2>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Ticker (np. AAPL)"
              value={form.ticker}
              onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
              className="bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-finance-green"
            />
            <input
              type="text"
              placeholder="Nazwa spółki"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-finance-green"
            />
            <input
              type="number"
              placeholder="Ilość"
              value={form.quantity}
              min={0}
              step="any"
              onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })}
              className="bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-finance-green"
            />
            <input
              type="number"
              placeholder="Cena zakupu"
              value={form.purchase_price}
              min={0}
              step="any"
              onChange={(e) => setForm({ ...form, purchase_price: parseFloat(e.target.value) || 0 })}
              className="bg-gray-800 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-finance-green"
            />
          </div>
          <div className="flex gap-3">
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="bg-gray-800 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-finance-green"
            >
              <option value="USD">USD</option>
              <option value="PLN">PLN</option>
              <option value="EUR">EUR</option>
            </select>
            <button
              type="submit"
              className="flex-1 bg-finance-green text-white font-semibold py-2 px-4 rounded-lg hover:bg-emerald-600 transition-colors text-sm"
            >
              Dodaj do portfela
            </button>
          </div>
        </form>

        {/* Lista aktywów */}
        <div className="bg-finance-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
            Portfel ({assets.length} aktywów)
          </h2>

          {loading ? (
            <p className="text-gray-500 text-sm">Ładowanie...</p>
          ) : assets.length === 0 ? (
            <p className="text-gray-500 text-sm">Brak aktywów. Dodaj pierwsze aktywo powyżej.</p>
          ) : (
            <div className="space-y-2">
              {assets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3"
                >
                  <div>
                    <span className="font-semibold text-finance-green mr-2">{asset.ticker}</span>
                    <span className="text-white text-sm">{asset.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-400 text-sm">
                      {asset.quantity} szt. @ {asset.purchase_price} {asset.currency}
                    </span>
                    <button
                      onClick={() => handleDelete(asset.id)}
                      className="text-finance-red hover:text-red-400 transition-colors text-xs px-2 py-1 rounded border border-finance-red hover:border-red-400"
                    >
                      Usuń
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-gray-600 text-xs text-center">
          Milestone 2 / 6 — Gotowe do Milestone 3: Integracja danych (yahoo-finance2)
        </p>
      </div>
    </div>
  )
}

export default App
```

---

## KROK 8: Weryfikacja (npm run dev — przeglądarka)

Po implementacji wszystkich plików uruchom:

```bash
npm run dev
```

Otwórz `http://[IP-serwera]:5173` w przeglądarce.

**Oczekiwany wynik:**

1. Strona ładuje się bez błędów JavaScript w konsoli przeglądarki (F12)
2. Widać kartę "Backend: **localStorage (przeglądarka / dev)**" w kolorze żółtym
3. Formularz "Dodaj aktywo" jest widoczny i interaktywny
4. Wpisz: Ticker `AAPL`, Nazwa `Apple Inc.`, Ilość `10`, Cena `150`, waluta `USD` → kliknij "Dodaj do portfela"
5. Aktywo pojawia się na liście poniżej
6. Odśwież stronę (`F5`) — aktywo nadal jest na liście (persystuje w localStorage)
7. Kliknij "Usuń" — aktywo znika z listy
8. Sprawdź w DevTools: F12 → Application → Local Storage → klucz `fp_assets` zawiera JSON z aktywami

**Sprawdzenie typów TypeScript (opcjonalnie):**

```bash
npx tsc --noEmit
```

Nie powinno być błędów typów.

---

## KROK 9: Aktualizacja zalozenia-projektu.md

W pliku `zalozenia-projektu.md`, w sekcji `## 5. Kamienie Milowe`, zmień linię Milestone 2 z `- [ ]` na `- [x]`:

```markdown
- [x] **2. Baza Danych + Warstwa API:** ...
```

---

## Rozwiązywanie problemów

### `better-sqlite3` nie kompiluje się (`node-gyp` błędy)

```bash
# Zainstaluj narzędzia build
apt-get install -y python3 make g++

# Sprawdź wersję Electrona
cat node_modules/electron/package.json | grep '"version"'

# Wymuś rebuild z konkretną wersją
npx electron-rebuild --force --version <VERSION>
```

### `Cannot find module 'better-sqlite3'` w main process

```bash
# Sprawdź czy paczka jest w dependencies (nie devDependencies)
cat package.json | grep better-sqlite3

# Jeśli w devDependencies — przenieś:
npm install better-sqlite3
npm uninstall --save-dev better-sqlite3
```

### `TypeError: db is not defined` w database.ts

Oznacza że `initDatabase()` nie zostało wywołane przed `registerIpcHandlers()`. Sprawdź kolejność w `app.whenReady().then(...)` w `electron/main/index.ts` — `initDatabase()` musi być pierwsze.

### `window.electronAPI` jest `undefined` w przeglądarce — to normalne

To oczekiwane zachowanie. `api.ts` wykrywa brak `window.electronAPI` i automatycznie używa `localStorage`. Karta w UI powinna pokazywać "localStorage (przeglądarka / dev)" w kolorze żółtym.

### Dane znikają po odświeżeniu (localStorage)

Sprawdź w DevTools (F12 → Application → Local Storage) czy klucz `fp_assets` istnieje. Jeśli nie — `lsSet` może rzucać wyjątek. Sprawdź konsolę przeglądarki na błędy.

### TypeScript błąd: `Cannot find module './types'`

Sprawdź czy plik `src/lib/types.ts` istnieje i czy `tsconfig.json` ma `"include": ["src/**/*.ts", "src/**/*.tsx"]`.

---

## Struktura katalogów po Milestone 2

```
priv-finance-app/
├── electron/
│   ├── main/
│   │   ├── index.ts       ← zmodyfikowany (IPC handlers + initDatabase)
│   │   └── database.ts    ← NOWY (better-sqlite3, CRUD)
│   └── preload/
│       └── index.ts       ← zmodyfikowany (contextBridge z assets/transactions/reports/settings)
├── src/
│   ├── lib/
│   │   ├── api.ts         ← NOWY (dual-backend: localStorage + electronAPI)
│   │   └── types.ts       ← NOWY (TypeScript interfaces)
│   ├── assets/
│   │   └── index.css
│   ├── App.tsx            ← zmodyfikowany (demonstracja CRUD)
│   └── main.tsx
├── package.json           ← zmodyfikowany (postinstall: electron-rebuild)
└── ...pozostałe pliki bez zmian
```

---

## Notatki dla Milestone 3

**Milestone 3 (Integracja Danych) będzie wymagał:**
- `npm install yahoo-finance2 lightweight-charts technicalindicators`
- `npm install -D @types/technicalindicators`
- Nowe kanały IPC w `electron/main/index.ts`: `yahoo:quote`, `yahoo:history`, `yahoo:search`, `yahoo:fundamentals`
- Nowe metody w `electron/preload/index.ts`: `window.electronAPI.yahoo.*`
- Nowe funkcje w `src/lib/api.ts`: `getQuote()`, `getHistory()`, `searchTickers()` — w trybie dev (przeglądarka) zwracają mock dane
- Komponent wykresu świecowego z Lightweight Charts dla wybranego tickera
- CSP w `index.html` musi dopuścić `connect-src` dla Yahoo Finance (tylko dla Electrona)
