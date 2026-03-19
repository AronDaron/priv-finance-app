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
  purchase_date: string
  created_at: string
  portfolio_id: number
  gold_grams: number | null  // gramy czystego metalu na monetę; null = kontrakt giełdowy
}

export interface DBPortfolio {
  id: number
  name: string
  created_at: string
  tags: string | null
}

export interface DBCashAccount {
  id: number
  portfolio_id: number
  currency: string
  balance: number
  created_at: string
}

export interface DBCashTransaction {
  id: number
  portfolio_id: number
  type: 'deposit' | 'withdrawal'
  amount: number
  currency: string
  date: string
  notes: string | null
  created_at: string
}

export interface DBNewCashTransaction {
  portfolio_id: number
  type: 'deposit' | 'withdrawal'
  amount: number
  currency: string
  date: string
  notes?: string | null
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
  fee: number
  fee_type: string
  time: string | null
}

export interface DBNewPortfolioAsset {
  ticker: string
  name: string
  quantity: number
  purchase_price: number
  currency: string
  purchase_date?: string
  gold_grams?: number | null
  portfolio_id?: number
}

export interface DBNewTransaction {
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
  migrateDatabase()
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS portfolio_assets (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker         TEXT NOT NULL UNIQUE,
      name           TEXT NOT NULL,
      quantity       REAL NOT NULL DEFAULT 0,
      purchase_price REAL NOT NULL DEFAULT 0,
      currency       TEXT NOT NULL DEFAULT 'USD',
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      portfolio_id   INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS cash_accounts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL DEFAULT 1,
      currency     TEXT NOT NULL DEFAULT 'PLN',
      balance      REAL NOT NULL DEFAULT 0,
      created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(portfolio_id, currency)
    );

    CREATE TABLE IF NOT EXISTS cash_transactions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL DEFAULT 1,
      type         TEXT NOT NULL CHECK(type IN ('deposit','withdrawal')),
      amount       REAL NOT NULL,
      currency     TEXT NOT NULL DEFAULT 'PLN',
      date         TEXT NOT NULL,
      notes        TEXT,
      created_at   TEXT DEFAULT CURRENT_TIMESTAMP
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

    CREATE TABLE IF NOT EXISTS news_archive (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      description TEXT,
      source      TEXT,
      region      TEXT NOT NULL,
      pub_date    TEXT,
      link        TEXT NOT NULL UNIQUE,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS news_archive_fts USING fts5(
      title, description, source, region,
      content=news_archive,
      content_rowid=id
    );

    CREATE TRIGGER IF NOT EXISTS news_archive_ai AFTER INSERT ON news_archive BEGIN
      INSERT INTO news_archive_fts(rowid, title, description, source, region)
      VALUES (new.id, new.title, new.description, new.source, new.region);
    END;

    CREATE TRIGGER IF NOT EXISTS news_archive_ad AFTER DELETE ON news_archive BEGIN
      INSERT INTO news_archive_fts(news_archive_fts, rowid, title, description, source, region)
      VALUES ('delete', old.id, old.title, old.description, old.source, old.region);
    END;
  `)
}

function migrateDatabase(): void {
  const cols = db.prepare("PRAGMA table_info(portfolio_assets)").all() as { name: string }[]
  if (!cols.find(c => c.name === 'purchase_date')) {
    db.exec(`ALTER TABLE portfolio_assets ADD COLUMN purchase_date TEXT`)
    db.exec(`UPDATE portfolio_assets SET purchase_date = date(created_at) WHERE purchase_date IS NULL`)
  }
  if (!cols.find(c => c.name === 'portfolio_id')) {
    db.exec(`ALTER TABLE portfolio_assets ADD COLUMN portfolio_id INTEGER DEFAULT 1`)
  }
  if (!cols.find(c => c.name === 'gold_grams')) {
    db.exec(`ALTER TABLE portfolio_assets ADD COLUMN gold_grams REAL`)
  }

  const portfolioCols = db.prepare("PRAGMA table_info(portfolios)").all() as { name: string }[]
  if (!portfolioCols.find(c => c.name === 'tags')) {
    db.exec(`ALTER TABLE portfolios ADD COLUMN tags TEXT`)
  }

  const txCols = db.prepare("PRAGMA table_info(transactions)").all() as { name: string }[]
  if (!txCols.find(c => c.name === 'fee')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN fee REAL DEFAULT 0`)
  }
  if (!txCols.find(c => c.name === 'fee_type')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN fee_type TEXT DEFAULT 'fixed'`)
  }
  if (!txCols.find(c => c.name === 'time')) {
    db.exec(`ALTER TABLE transactions ADD COLUMN time TEXT`)
  }

  // Utwórz domyślny portfel jeśli tabela pusta
  const count = db.prepare('SELECT COUNT(*) as c FROM portfolios').get() as { c: number }
  if (count.c === 0) {
    db.prepare(`INSERT INTO portfolios (id, name) VALUES (1, 'Główny portfel')`).run()
  }
}

// ─── portfolio_assets ────────────────────────────────────────────────────────

export function getAllAssets(portfolioId?: number): DBPortfolioAsset[] {
  if (portfolioId !== undefined) {
    return db
      .prepare('SELECT * FROM portfolio_assets WHERE portfolio_id = ? ORDER BY created_at ASC')
      .all(portfolioId) as DBPortfolioAsset[]
  }
  return db
    .prepare('SELECT * FROM portfolio_assets ORDER BY created_at ASC')
    .all() as DBPortfolioAsset[]
}

export function addAsset(asset: DBNewPortfolioAsset): DBPortfolioAsset {
  const existing = db
    .prepare('SELECT * FROM portfolio_assets WHERE ticker = ?')
    .get(asset.ticker) as DBPortfolioAsset | undefined

  if (existing) {
    // Połącz pozycje: nowa ilość = suma, nowa śr. cena = średnia ważona
    const totalQty = existing.quantity + asset.quantity
    const avgPrice =
      (existing.quantity * existing.purchase_price + asset.quantity * asset.purchase_price) /
      totalQty
    db.prepare(`
      UPDATE portfolio_assets SET quantity = @quantity, purchase_price = @purchase_price WHERE id = @id
    `).run({ quantity: totalQty, purchase_price: avgPrice, id: existing.id })
    return getAssetById(existing.id)!
  }

  const stmt = db.prepare(`
    INSERT INTO portfolio_assets (ticker, name, quantity, purchase_price, currency, purchase_date, gold_grams, portfolio_id)
    VALUES (@ticker, @name, @quantity, @purchase_price, @currency, @purchase_date, @gold_grams, @portfolio_id)
  `)
  const result = stmt.run({
    ...asset,
    purchase_date: asset.purchase_date ?? new Date().toISOString().split('T')[0],
    gold_grams: asset.gold_grams ?? null,
    portfolio_id: asset.portfolio_id ?? 1,
  })
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
    INSERT INTO transactions (ticker, type, quantity, price, currency, date, notes, fee, fee_type, time)
    VALUES (@ticker, @type, @quantity, @price, @currency, @date, @notes, @fee, @fee_type, @time)
  `)
  const result = stmt.run({
    ...tx,
    fee: tx.fee ?? 0,
    fee_type: tx.fee_type ?? 'fixed',
    time: tx.time ?? null,
  })
  return db
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .get(result.lastInsertRowid) as DBTransaction
}

export function updateTransaction(
  id: number,
  updates: Partial<DBNewTransaction>
): DBTransaction | null {
  const fields = Object.keys(updates)
    .map((k) => `${k} = @${k}`)
    .join(', ')
  if (!fields) return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as DBTransaction ?? null
  db.prepare(`UPDATE transactions SET ${fields} WHERE id = @id`).run({ ...updates, id })
  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as DBTransaction ?? null
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

// ─── portfolios ───────────────────────────────────────────────────────────────

export function getPortfolios(): DBPortfolio[] {
  return db.prepare('SELECT * FROM portfolios ORDER BY id ASC').all() as DBPortfolio[]
}

export function createPortfolio(name: string): DBPortfolio {
  const result = db.prepare('INSERT INTO portfolios (name) VALUES (?)').run(name)
  return db.prepare('SELECT * FROM portfolios WHERE id = ?').get(result.lastInsertRowid) as DBPortfolio
}

export function renamePortfolio(id: number, name: string): void {
  db.prepare('UPDATE portfolios SET name = ? WHERE id = ?').run(name, id)
}

export function updatePortfolioTags(id: number, tags: string[]): void {
  db.prepare('UPDATE portfolios SET tags = ? WHERE id = ?').run(JSON.stringify(tags), id)
}

export function deletePortfolio(id: number): void {
  db.prepare('DELETE FROM portfolio_assets WHERE portfolio_id = ?').run(id)
  db.prepare('DELETE FROM cash_accounts WHERE portfolio_id = ?').run(id)
  db.prepare('DELETE FROM cash_transactions WHERE portfolio_id = ?').run(id)
  db.prepare('DELETE FROM portfolios WHERE id = ?').run(id)
}

// ─── cash_accounts / cash_transactions ───────────────────────────────────────

export function getCashAccounts(portfolioId?: number): DBCashAccount[] {
  if (portfolioId !== undefined) {
    return db
      .prepare('SELECT * FROM cash_accounts WHERE portfolio_id = ? ORDER BY currency ASC')
      .all(portfolioId) as DBCashAccount[]
  }
  return db.prepare('SELECT * FROM cash_accounts ORDER BY portfolio_id, currency ASC').all() as DBCashAccount[]
}

export function addCashTransaction(data: DBNewCashTransaction): DBCashTransaction {
  // Dodaj transakcję
  const result = db.prepare(`
    INSERT INTO cash_transactions (portfolio_id, type, amount, currency, date, notes)
    VALUES (@portfolio_id, @type, @amount, @currency, @date, @notes)
  `).run({ ...data, notes: data.notes ?? null })

  // Zaktualizuj saldo konta gotówkowego (INSERT OR REPLACE)
  const delta = data.type === 'deposit' ? data.amount : -data.amount
  db.prepare(`
    INSERT INTO cash_accounts (portfolio_id, currency, balance)
    VALUES (@portfolio_id, @currency, @delta)
    ON CONFLICT(portfolio_id, currency) DO UPDATE SET balance = balance + @delta
  `).run({ portfolio_id: data.portfolio_id, currency: data.currency, delta })

  return db
    .prepare('SELECT * FROM cash_transactions WHERE id = ?')
    .get(result.lastInsertRowid) as DBCashTransaction
}

export function getCashTransactions(portfolioId?: number): DBCashTransaction[] {
  if (portfolioId !== undefined) {
    return db
      .prepare('SELECT * FROM cash_transactions WHERE portfolio_id = ? ORDER BY date DESC')
      .all(portfolioId) as DBCashTransaction[]
  }
  return db.prepare('SELECT * FROM cash_transactions ORDER BY date DESC').all() as DBCashTransaction[]
}

// ─── news_archive ──────────────────────────────────────────────────────────────

export interface DBNewsItem {
  id: number
  title: string
  description: string | null
  source: string | null
  region: string
  pub_date: string | null
  link: string
  created_at: string
}

export function archiveNews(
  items: Array<{ title: string; description?: string | null; source: string; link: string; pubDate?: string | null }>,
  region: string
): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO news_archive (title, description, source, region, pub_date, link)
    VALUES (@title, @description, @source, @region, @pub_date, @link)
  `)
  const insertMany = db.transaction((rows: typeof items) => {
    for (const item of rows) {
      stmt.run({
        title: item.title,
        description: item.description ?? null,
        source: item.source,
        region,
        pub_date: item.pubDate ?? null,
        link: item.link,
      })
    }
  })
  insertMany(items)
}

export function searchNews(query: string, limit = 15): DBNewsItem[] {
  if (!query.trim()) return []
  try {
    return db.prepare(`
      SELECT na.* FROM news_archive na
      INNER JOIN (
        SELECT rowid, rank FROM news_archive_fts WHERE news_archive_fts MATCH ?
      ) fts ON na.id = fts.rowid
      ORDER BY fts.rank, na.pub_date DESC
      LIMIT ?
    `).all(query, limit) as DBNewsItem[]
  } catch {
    return []
  }
}

export function pruneOldNews(days = 90): void {
  const cutoff = `-${days} days`
  db.prepare(`DELETE FROM news_archive WHERE created_at < datetime('now', ?)`).run(cutoff)
}
