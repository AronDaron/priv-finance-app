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
