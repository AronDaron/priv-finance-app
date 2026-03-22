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

**Dashboard**
![Dashboard](docs/screenshots/dashboard.png)

**Widok spółki**
![Widok spółki](docs/screenshots/stock.png)

**Analiza AI**
![Analiza AI](docs/screenshots/ai.png)

**Ustawienia**
![Ustawienia](docs/screenshots/settings.png)

---

## ✨ Funkcjonalności

### 🌍 Globalny Rynek — flagowa funkcja

Widok `Globalny Rynek` to autorski system oceny potencjału inwestycyjnego regionów świata oparty na deterministycznym algorytmie — działa bez AI, bez opóźnień, bez limitu zapytań.

**Pasek rynkowy w czasie rzeczywistym** — zawsze widoczny u góry ekranu:
- Surowce: Ropa WTI, Złoto, Gaz ziemny, Miedź, Pszenica
- Waluty: EUR/USD, GBP/USD, CHF/USD, CAD/USD, AUD/USD, JPY/USD, CNY/USD
- Indeksy: S&P 500, DAX, Nikkei 225, WIG20, FTSE 100
- Wskaźniki makro: VIX (indeks strachu), US10Y (rentowność obligacji USA)

**Karty regionów i sektorów** — każdy region otrzymuje score 0–100 z kolorowym wskaźnikiem ryzyka (zielony / żółty / czerwony):

| Regiony | Sektory |
|---|---|
| Ameryka Północna, Europa, Azja | Surowce |
| Ameryka Południowa, Afryka | Rynki rozwinięte |
| Australia i Oceania | LATAM / Rynki wschodzące |

**Detekcja reżimu rynkowego** — aplikacja automatycznie wykrywa ekstremalne warunki i wyświetla alert z opisem wpływu na algorytm:
- Tryb Paniki (VIX > 35) — wagi przełączone na wskaźniki strachu i płynności
- Szok Obligacyjny (US10Y > 5%) — wagi przesunięte na USD i koszty finansowania
- Szok Naftowy / Rally Złota / Szok Gazowy / Crash Miedzi

**Modal szczegółów regionu** — po kliknięciu karty otwiera się pełna analiza:
- Wykres składowych score z objaśnieniami każdego wskaźnika w prostym języku
- Wizualizacja siły i kierunku wpływu każdej składowej (zielony/czerwony pasek)
- Aktualne wartości rynkowe z przeliczeniem na punkty score
- Przycisk **Analizuj AI** — pogłębiona analiza geopolityczna i inwestycyjna regionu wzbogacona o bieżące nagłówki newsów

---

### 📊 Portfel i transakcje
- **Dodawanie aktywów** — wyszukiwarka spółek w czasie rzeczywistym (akcje, ETF-y, złoto `GC=F`); automatyczne pobieranie ceny i nazwy
- **Historia transakcji** — pełny dziennik kupna/sprzedaży z ceną, ilością i datą; edycja i usuwanie wpisów
- **Tagi aktywów** — grupowanie pozycji według własnych kategorii (np. dywidendowe, growth, hedging)
- **Gotówka** — rejestrowanie wpłat i wypłat gotówkowych z portfela
- **Dashboard** — podsumowanie wartości portfela, zysk/strata łączny i per aktyw, wykres kołowy alokacji, historia wartości portfela w czasie

---

### 📈 Analiza spółki
- **Wykres świecowy** — interaktywny candlestick (TradingView Lightweight Charts) z wyborem zakresu dat
- **Wskaźniki fundamentalne** — P/E, EPS, kapitalizacja rynkowa, przychody, marże, dane bilansowe z Yahoo Finance
- **Wskaźniki techniczne** — RSI, MACD, SMA — wyliczane lokalnie przez `technicalindicators`, bez zewnętrznych API
- **Dywidendy** — tabela historycznych wypłat z datami i kwotami na akcję

---

### 🔬 Narzędzia analityczne
- **Benchmark** — porównanie wyników portfela z indeksami (S&P 500, WIG20 i inne) wraz z metrykami: alfa, beta, max drawdown, Sharpe ratio
- **Macierz korelacji** — wizualizacja korelacji między wszystkimi aktywami portfela; pomaga ocenić rzeczywistą dywersyfikację i wykryć ukryte zależności
- **Rebalancing** — widok docelowej alokacji z sugestiami dotyczącymi przywrócenia równowagi portfela
- **Aktualności** — najnowsze wiadomości finansowe dla śledzonych spółek i regionów świata

---

### 🤖 Analiza AI (Map-Reduce)

Aplikacja używa dwóch modeli Gemini przez OpenRouter, dobranych pod konkretne zadania:

| Zadanie | Model | Dlaczego |
|---|---|---|
| Raport per spółka (Worker) | `google/gemini-3-flash-preview` | Wiele równoległych zapytań — szybki i tani model w zupełności wystarcza do analizy jednej pozycji |
| Analiza całego portfela (Manager) | `google/gemini-3.1-pro-preview` | Jedno złożone zadanie wymagające głębokiego rozumowania — model Pro łączy wszystkie raporty Worker w spójną ocenę ryzyka portfela |
| Analiza regionu globalnego | `google/gemini-3-flash-preview` | Szybka analiza na żądanie przy kliknięciu w kartę regionu |
| Chat z portfelem | `google/gemini-3-flash-preview` | Konwersacja w czasie rzeczywistym — priorytet to czas odpowiedzi |

**Wzorzec Map-Reduce:**
- **Etap A (Worker):** każda spółka analizowana osobno — dane fundamentalne + techniczne + kontekst makro → raport zapisywany w SQLite
- **Etap B (Manager):** model Pro zbiera wszystkie raporty Worker i generuje całościową ocenę dywersyfikacji, ryzyka i rekomendacje zgodne ze strategią portfela (uwzględnia tagi: IKE, IKZE, Dywidendowy itp.)

Do korzystania z funkcji AI wystarczy darmowe konto na [OpenRouter](https://openrouter.ai) — niektóre modele są bezpłatne w ramach darmowego okresu, wszystkie modele powinny działać lecz w wersji DEV testowane były tylko modele z serii Gemini.

---

### 🔒 Prywatność i koszty
- **Zero kosztów utrzymania** — wszystkie dane rynkowe z `yahoo-finance2` (darmowe, bez rejestracji, bez limitu)
- **W 100% lokalny** — dane przechowywane wyłącznie w SQLite na Twoim dysku; brak chmury, brak konta, brak telemetrii
- **Klucz API tylko lokalnie** — klucz OpenRouter nigdy nie opuszcza Twojego komputera

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
| AI | [OpenRouter API](https://openrouter.ai/) | Gemini Flash (Worker/Chat/Regiony) + Gemini Pro (Manager portfela) |
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
2. Wygeneruj klucz API w zakładce [Keys](https://openrouter.ai/keys) — rejestracja nie wymaga karty kredytowej
3. W aplikacji przejdź do **Ustawień** i wklej klucz

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
