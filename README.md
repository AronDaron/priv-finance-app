<div align="center">

# 📈 Finance Portfolio Tracker

**Darmowa aplikacja desktopowa do śledzenia portfela inwestycyjnego z analizą AI**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-41-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Zero Cost](https://img.shields.io/badge/koszt_utrzymania-$0-brightgreen)](https://github.com/gadicc/node-yahoo-finance2)

Śledź akcje, ETF-y i złoto. Analizuj portfel z pomocą AI. Wszystko lokalnie, bez subskrypcji, bez chmury.

</div>

---

## 📸 Zrzuty ekranu

> *Dodaj własne zrzuty ekranu — zastąp poniższe obrazki plikami z folderu `docs/screenshots/`*

| Dashboard | Widok spółki |
|:---------:|:------------:|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Stock](docs/screenshots/stock.png) |

| Analiza AI | Ustawienia |
|:----------:|:----------:|
| ![AI](docs/screenshots/ai.png) | ![Settings](docs/screenshots/settings.png) |

---

## ✨ Funkcjonalności

### Portfel i dane rynkowe
- **Śledzenie portfela** — akcje, ETF-y, złoto (`GC=F`); pełna historia transakcji, zysk/strata, alokacja
- **Wykresy świecowe** — interaktywne candlestick (TradingView Lightweight Charts), historia wartości portfela, wykres kołowy alokacji
- **Wskaźniki fundamentalne** — P/E, EPS, kapitalizacja, przychody — dane z Yahoo Finance
- **Wskaźniki techniczne** — RSI, MACD, SMA — wyliczane lokalnie, bez zewnętrznych API
- **Dywidendy** — pełna historia wypłat dywidend dla każdego aktywa
- **Aktualności** — najnowsze wiadomości finansowe dla śledzonych spółek

### Analiza i narzędzia
- **Benchmark** — porównaj swój portfel z S&P 500, WIG20 i innymi indeksami
- **Macierz korelacji** — wizualizacja zależności między aktywami w portfelu
- **Rebalancing** — sugestie dotyczące przywrócenia docelowej alokacji

### Analiza AI
- **Raporty per spółka** — AI analizuje dane fundamentalne i techniczne każdej pozycji
- **Ocena całego portfela** — analiza ryzyka, dywersyfikacji i wzajemnych zależności
- **Wzorzec Map-Reduce** — raporty generowane równolegle, następnie łączone w spójną ocenę portfela
- **OpenRouter** — obsługuje darmowe modele (np. Meta Llama 3); klucz API z darmowego konta

### Prywatność i koszty
- **Zero kosztów utrzymania** — wszystkie dane rynkowe z `yahoo-finance2` (darmowe, bez rejestracji)
- **W 100% lokalny** — dane w SQLite na Twoim dysku; brak chmury, brak konta, brak telemetrii

---

## 🛠️ Stos technologiczny

| Warstwa | Technologia | Opis |
|---|---|---|
| Powłoka desktopowa | [Electron 41](https://www.electronjs.org/) | Aplikacja `.exe` dla Windows |
| Frontend | React 19 + TypeScript + Vite | UI w trybie sandboxed renderer |
| Stylowanie | Tailwind CSS | Ciemny motyw, kolory inspirowane TradingView |
| Wykresy | [Lightweight Charts](https://tradingview.github.io/lightweight-charts/) | Profesjonalne wykresy świecowe |
| Baza danych | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Lokalny SQLite, synchroniczny dostęp |
| Dane rynkowe | [yahoo-finance2](https://github.com/gadicc/node-yahoo-finance2) | Kursy, OHLC, fundamenty, dywidendy |
| Wskaźniki | [technicalindicators](https://github.com/anandanand84/technicalindicators) | RSI, MACD, SMA — lokalnie |
| AI | [OpenRouter API](https://openrouter.ai/) | Dowolny model LLM, w tym darmowe |
| Build | electron-vite + electron-builder | Cross-compile do `.exe` z Linuxa |

---

## 🚀 Pierwsze kroki

### Wymagania

- **Node.js** 18 lub nowszy
- **npm**
- *(Opcjonalnie, do buildu na Linuxie)* Wine

### Instalacja

```bash
git clone https://github.com/your-username/priv-finance-app.git
cd priv-finance-app
npm install
```

> **Uwaga:** `npm install` automatycznie uruchamia `electron-rebuild`, który kompiluje natywne moduły (better-sqlite3) dla Twojej platformy. Może to chwilę potrwać przy pierwszej instalacji.

### Uruchomienie w trybie deweloperskim

```bash
npm run dev
```

Otwiera aplikację w przeglądarce pod adresem `http://localhost:5173`.
W trybie dev dane są zapisywane w `localStorage` — pełne UI działa bez Electrona.

### Build — plik `.exe` dla Windows

```bash
npm run build:win
```

Gotowy instalator znajdziesz w katalogu `dist/`.
Na Linuxie wymagane Wine. Na Windows działa natywnie.

---

## ⚙️ Konfiguracja AI

Aplikacja nie wymaga żadnych plików `.env` ani zmiennych środowiskowych.
Klucz API konfiguruje się bezpośrednio w aplikacji:

1. Utwórz darmowe konto na [openrouter.ai](https://openrouter.ai)
2. Wygeneruj klucz API w zakładce [Keys](https://openrouter.ai/keys) — darmowe modele nie wymagają podania karty
3. W aplikacji przejdź do **Ustawień** i wklej klucz
4. *(Opcjonalnie)* Wybierz preferowany model AI

> Klucz API jest przechowywany wyłącznie lokalnie w bazie SQLite na Twoim komputerze. Nigdy nie jest wysyłany nigdzie poza oficjalne API OpenRouter.

---

## 🏗️ Architektura

Aplikacja korzysta z modelu procesów Electrona — renderer (React) jest izolowany od Node.js przez IPC:

```
electron/
  main/
    index.ts        ← Główny proces: okno, baza danych, fetch danych
    database.ts     ← Operacje SQLite (better-sqlite3)
    finance.ts      ← Integracja yahoo-finance2
    ai.ts           ← Logika Map-Reduce, wywołania OpenRouter
  preload/
    index.ts        ← Most IPC — contextBridge.exposeInMainWorld

src/                ← Renderer: aplikacja React (sandbox, brak Node.js)
  components/       ← Wszystkie widoki UI
  lib/
    api.ts          ← Warstwa abstrakcji: electronAPI lub localStorage
    types.ts        ← Wspólne typy TypeScript
```

**Zasada krytyczna:** Komponenty React nigdy nie importują modułów Node.js bezpośrednio. Dostęp do SQLite, danych finansowych i AI odbywa się wyłącznie przez `window.electronAPI` (IPC).

---

## 📄 Licencja

Ten projekt jest udostępniony na licencji **MIT**.

Licencja MIT to jedna z najbardziej permisywnych licencji open-source. Oznacza to, że:

- ✅ **Możesz** używać kodu w projektach prywatnych i komercyjnych
- ✅ **Możesz** modyfikować kod według własnych potrzeb
- ✅ **Możesz** dystrybuować oryginał oraz własne modyfikacje
- ✅ **Możesz** dołączać ten kod do projektów na innych licencjach
- ℹ️ **Musisz** zachować oryginalną informację o prawach autorskich i treść licencji w dystrybuowanych kopiach

Pełna treść licencji: [LICENSE](LICENSE)
