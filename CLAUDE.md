# CLAUDE.md

Ten plik dostarcza wskazówek dla Claude Code (claude.ai/code) podczas pracy z kodem w tym repozytorium.

## Przegląd projektu

Desktopowy tracker portfela inwestycyjnego (plik `.exe` dla Windows) zbudowany na Electron + React + TypeScript. Śledzi akcje i złoto, oferuje analizę AI przez OpenRouter. **Zero-cost operation** — brak płatnych API; wszystkie dane z `yahoo-finance2` (darmowe). Dane użytkownika przechowywane lokalnie w SQLite.

Środowisko deweloperskie: kontener Linux LXC (headless, brak monitora). Testy UI przez przeglądarkę pod adresem IP serwera — `npm run dev` startuje Vite dev server z `--host`. Electron używany wyłącznie do finalnego buildu `.exe`.

## Komendy

```bash
npm run dev      # Vite dev server dostępny w przeglądarce pod http://[IP-serwera]:5173
npm run build    # Kompiluj + utwórz instalator Windows (.exe)
npm run preview  # Podgląd w trybie produkcyjnym
```

## Architektura

### Model procesów Electrona

```
electron/main/index.ts      # Główny proces: okno, baza danych, natywne API
electron/preload/index.ts   # Pomost IPC przez contextBridge.exposeInMainWorld
src/                        # Proces renderer: aplikacja React (sandbox)
```

**Zasada krytyczna:** Komponenty React (`src/`) nigdy nie mogą importować modułów Node.js bezpośrednio. Cała funkcjonalność Node.js (SQLite, yahoo-finance2, zapytania HTTP) musi być udostępniana przez metody `contextBridge.exposeInMainWorld` w `electron/preload/index.ts` i obsługiwana przez IPC w procesie głównym.

### Dwa pliki konfiguracji TypeScript

- `tsconfig.json` — renderer (ESNext, browser APIs, `src/**`)
- `tsconfig.node.json` — main process + preload (CommonJS, typy Node.js, `electron/**`)

### Integracja AI: wzorzec Map-Reduce

**Etap A (Worker):** Analiza per spółka — pobierz dane fundamentalne z yahoo-finance2, wylicz wskaźniki techniczne lokalnie przez bibliotekę `technicalindicators`, wyślij do OpenRouter (darmowy model np. Meta Llama 3), zapisz raport w SQLite z tickerem i datą.

**Etap B (Manager):** Analiza portfela — pobierz najnowsze raporty per spółka z SQLite (lub wymuś ich wygenerowanie jeśli nie istnieją), połącz w jeden prompt, wyślij do zaawansowanego modelu OpenRouter w celu oceny ryzyka i dywersyfikacji całego portfela.

### Baza danych (better-sqlite3, lokalne SQLite)

Tabele: `portfolio_assets`, `transactions`, `ai_reports`, `settings`

Klucz API OpenRouter przechowywany w tabeli `settings`, konfigurowany przez UI aplikacji w sekcji Ustawienia — nie przez pliki `.env`.

### Źródła danych

- `yahoo-finance2` — ceny akcji/złota, historyczne OHLC, wskaźniki fundamentalne, dywidendy, wyszukiwarka spółek
- `technicalindicators` — RSI, MACD, SMA wyliczane po stronie main process
- Ticker złota: `GC=F`

### Kolory Tailwind

```js
'finance-green': '#10b981'
'finance-red':   '#ef4444'
'finance-dark':  '#111827'   // też backgroundColor okna Electrona
'finance-card':  '#1f2937'
```

### Konfiguracja electron-vite

`electron.vite.config.ts` używa `externalizeDepsPlugin()` dla main/preload (node_modules pozostają zewnętrzne) oraz ustawia alias `@renderer` wskazujący na `src/`.

W trybie dev `electron-vite` automatycznie ustawia zmienną `ELECTRON_RENDERER_URL`; main process ładuje `http://localhost:5173` zamiast pliku statycznego.

## Kamienie milowe

- [x] **1.** Inicjalizacja projektu (Vite + React + TS + Electron)
- [x] **2.** Baza danych (better-sqlite3; wymaga `electron-rebuild` przy cross-compile)
- [x] **3.** Integracja danych (yahoo-finance2 + Lightweight Charts candlestick)
- [x] **4.** GUI (Dashboard wykres kołowy, wyszukiwarka/dodawanie aktywów, widok spółki)
- [x] **5.** Moduł AI (OpenRouter, wzorzec Map-Reduce)
- [ ] **6.** Build Windows (electron-builder cross-compile z Linuxa, `electron-rebuild`)

## Wymagania wstępne Milestone 2

```bash
npm install better-sqlite3 @types/better-sqlite3
npm install -D electron-rebuild
# Dodaj do scripts w package.json: "postinstall": "electron-rebuild"
```
