# Finance Portfolio Tracker

A free, open-source desktop application for tracking your investment portfolio — stocks, ETFs, and gold — with AI-powered analysis. Built with Electron + React + TypeScript.

**Zero-cost operation** — no paid APIs, no subscriptions. All market data from [yahoo-finance2](https://github.com/gadicc/node-yahoo-finance2) (free).

---

## Features

- **Portfolio tracking** — add stocks, ETFs, gold (`GC=F`), monitor value, allocation, and profit/loss
- **Interactive charts** — candlestick charts (TradingView Lightweight Charts), portfolio history, allocation pie chart
- **Fundamentals & Technicals** — P/E, EPS, RSI, MACD, SMA — all computed locally
- **Benchmark comparison** — compare portfolio performance vs indices (S&P 500, etc.)
- **Dividend tracking** — historical dividend data per asset
- **Correlation matrix** — cross-asset correlation analysis
- **AI analysis (Map-Reduce)** — per-company reports and full portfolio risk assessment via [OpenRouter](https://openrouter.ai) (free tier models supported, e.g. Meta Llama 3)
- **News feed** — latest news per stock
- **Fully local** — all data stored in SQLite on your machine, no cloud sync, no account required

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Charts | Lightweight Charts (TradingView) |
| Database | better-sqlite3 (local SQLite) |
| Market data | yahoo-finance2 |
| Technical indicators | technicalindicators |
| AI | OpenRouter API (configurable model) |
| Build | electron-vite + electron-builder |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
git clone https://github.com/your-username/priv-finance-app.git
cd priv-finance-app
npm install
```

> `postinstall` automatically runs `electron-rebuild` to compile native modules.

### Development (browser)

```bash
npm run dev
```

Opens a Vite dev server at `http://localhost:5173`. The app runs fully in the browser — data is stored in `localStorage` instead of SQLite when `window.electronAPI` is unavailable.

### Build Windows `.exe`

```bash
npm run build:win
```

Requires Wine on Linux, or run on Windows. Output: `dist/`.

---

## Configuration

No environment variables or config files needed. After launching the app:

1. Go to **Settings**
2. Enter your [OpenRouter API key](https://openrouter.ai/keys) (free account, no card required for free models)
3. Optionally select your preferred AI model

The API key is stored locally in SQLite — never leaves your machine.

---

## Architecture

```
electron/main/        # Main process: SQLite, yahoo-finance2, AI calls
electron/preload/     # IPC bridge via contextBridge
src/                  # Renderer: React app
  components/
  lib/api.ts          # Abstraction layer: uses electronAPI or localStorage
  lib/types.ts
```

React components never import Node.js modules directly. All backend functionality is exposed through `window.electronAPI` via IPC.

---

## License

[MIT](LICENSE)
