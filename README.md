# Finance Portfolio Tracker

Darmowa, open-source'owa aplikacja desktopowa do śledzenia portfela inwestycyjnego — akcje, ETF-y, złoto — z analizą AI. Zbudowana na Electron + React + TypeScript.

**Zero kosztów utrzymania** — brak płatnych API, brak subskrypcji. Wszystkie dane rynkowe z [yahoo-finance2](https://github.com/gadicc/node-yahoo-finance2) (darmowe).

---

## Funkcjonalności

- **Śledzenie portfela** — dodawanie akcji, ETF-ów, złota (`GC=F`), monitorowanie wartości, alokacji i zysku/straty
- **Interaktywne wykresy** — wykresy świecowe (TradingView Lightweight Charts), historia portfela, wykres kołowy alokacji
- **Fundamenty i wskaźniki techniczne** — P/E, EPS, RSI, MACD, SMA — wszystko wyliczane lokalnie
- **Porównanie z benchmarkiem** — porównanie wyników portfela z indeksami (S&P 500 itp.)
- **Śledzenie dywidend** — historyczne dane dywidendowe dla każdego aktywa
- **Macierz korelacji** — analiza korelacji między aktywami
- **Analiza AI (Map-Reduce)** — raporty per spółka i ocena ryzyka całego portfela przez [OpenRouter](https://openrouter.ai) (obsługiwane darmowe modele, np. Meta Llama 3)
- **Aktualności** — najnowsze wiadomości dla każdej spółki
- **W pełni lokalny** — wszystkie dane w SQLite na Twoim komputerze, bez synchronizacji z chmurą, bez konta

---

## Stos technologiczny

| Warstwa | Technologia |
|---|---|
| Powłoka desktopowa | Electron |
| Frontend | React 19 + TypeScript + Vite |
| Stylowanie | Tailwind CSS |
| Wykresy | Lightweight Charts (TradingView) |
| Baza danych | better-sqlite3 (lokalny SQLite) |
| Dane rynkowe | yahoo-finance2 |
| Wskaźniki techniczne | technicalindicators |
| AI | OpenRouter API (konfigurowalny model) |
| Build | electron-vite + electron-builder |

---

## Pierwsze kroki

### Wymagania

- Node.js 18+
- npm

### Instalacja

```bash
git clone https://github.com/your-username/priv-finance-app.git
cd priv-finance-app
npm install
```

> `postinstall` automatycznie uruchamia `electron-rebuild` do kompilacji natywnych modułów.

### Tryb deweloperski (przeglądarka)

```bash
npm run dev
```

Uruchamia Vite dev server pod adresem `http://localhost:5173`. Aplikacja działa w pełni w przeglądarce — dane zapisywane w `localStorage` zamiast SQLite, gdy `window.electronAPI` jest niedostępne.

### Build Windows `.exe`

```bash
npm run build:win
```

Na Linuxie wymagane Wine. Na Windows działa natywnie. Wynik w katalogu `dist/`.

---

## Konfiguracja

Brak plików `.env` ani zmiennych środowiskowych. Po uruchomieniu aplikacji:

1. Przejdź do **Ustawień**
2. Wprowadź swój [klucz API OpenRouter](https://openrouter.ai/keys) (darmowe konto, darmowe modele nie wymagają karty)
3. Opcjonalnie wybierz preferowany model AI

Klucz API przechowywany lokalnie w SQLite — nigdy nie opuszcza Twojego komputera.

---

## Architektura

```
electron/main/        # Główny proces: SQLite, yahoo-finance2, zapytania AI
electron/preload/     # Most IPC przez contextBridge
src/                  # Renderer: aplikacja React
  components/
  lib/api.ts          # Warstwa abstrakcji: używa electronAPI lub localStorage
  lib/types.ts
```

Komponenty React nigdy nie importują modułów Node.js bezpośrednio. Cała funkcjonalność backendowa udostępniana przez `window.electronAPI` przez IPC.

---

## Licencja

[MIT](LICENSE)
