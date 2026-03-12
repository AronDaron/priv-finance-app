# Specyfikacja Projektu: Aplikacja Desktopowa do Śledzenia Inwestycji z Asystentem AI

## 1. Kontekst Środowiskowy i Cel Projektu
* **Cel:** Stworzenie w pełni darmowej, desktopowej aplikacji (plik `.exe` dla Windows) do śledzenia osobistego portfela inwestycyjnego (akcje, złoto) oraz zaawansowanej analizy finansowej wspieranej przez sztuczną inteligencję.
**AD.** NA POTRZEBY DEWELOPERSKIE WSZYSTKIE TESTY APLIKACJI BĘDĄ ODBYWAĆ SIĘ PRZY POMOCY KOMENDY 'NPM RUN DEV' TESTOWANE PRZEZ UZYTKOWNIKA
* **Środowisko deweloperskie:** Projekt będzie rozwijany przez autonomiczne agenty AI działające w kontenerze LXC na serwerze Proxmox (Linux).
* **Wymóg krytyczny:** Aplikacja musi być w 100% darmowa w utrzymaniu (Zero-Cost Operation). ZABRONIONE jest korzystanie z płatnych API finansowych wymagających rejestracji lub podpinania karty.

## 2. Stos Technologiczny (Tech Stack)
Aplikacja ma zostać zbudowana w całości w ekosystemie `Node.js` / `TypeScript`.

* **Frontend:** `React.js` (z hookami) + `TypeScript` + `Vite` (jako bundler).
* **Styling:** `Tailwind CSS` (dla nowoczesnego, responsywnego UI).
* **Wykresy:** `Lightweight Charts` (od TradingView) — wybrany jako najlepszy dla wykresów świecowych candlestick.
* **Backend/Wrapper:** `Electron`.
* **Baza Danych (Lokalna):** `better-sqlite3`. Wszystkie dane użytkownika mają być zapisywane lokalnie na dysku.
* **Kompilacja:** `electron-builder` (cel: kompilacja do `win32` `.exe` z poziomu Linuxa/LXC).
* **Build tool Electron:** `electron-vite` (zarządza pipeline main + preload + renderer w jednym narzędziu).

### Podjęte decyzje implementacyjne
- **Wykresy:** `Lightweight Charts` (TradingView) — najlepszy dla candlestick, lekki i profesjonalny
- **SQLite:** `better-sqlite3` (wymaga `electron-rebuild` przy cross-compile do Windows — obsługiwane w Milestone 6)
- **Klucz API OpenRouter:** Przechowywany w lokalnej bazie SQLite, konfigurowany przez UI aplikacji w sekcji Ustawienia (nie przez plik .env)
- **Build tool Electron:** `electron-vite` (zarządza main + preload + renderer w jednym pipeline)
- **Design:** Nowoczesny design inspirując się kolorystyką w trybie ciemnym i modalami UI z TradingView

## 3. Źródła Danych i Integracje (Brak płatnych API)
Agent musi zaimplementować następujące mechanizmy pobierania danych:

1. **Akcje i Złoto (Ticker `GC=F`):** Użycie biblioteki NPM `yahoo-finance2`. Pobieranie aktualnych cen, danych historycznych do wykresów oraz wskaźników fundamentalnych.
2. **Dywidendy:** Użycie `yahoo-finance2` do pobierania historii dywidend dla posiadanych spółek i dodawanie ich wartości do całkowitego salda portfela w aplikacji.
3. **Wyszukiwarka Spółek:** Implementacja endpointu wyszukiwania (Search) z `yahoo-finance2` w polu tekstowym UI.
4. **Wskaźniki Techniczne:** Zamiast zlecać to AI, aplikacja używa biblioteki NPM `technicalindicators` do samodzielnego wyliczania RSI, MACD i SMA z historycznych cen pobranych z Yahoo.

## 4. Architektura AI (Wzorzec Map-Reduce)
Integracja z API OpenRouter. Aplikacja musi implementować asynchroniczną architekturę hierarchiczną, aby uniknąć przepełnienia kontekstu (Context Window) modelu.

### Etap A: Modele-Wyrobnicy (Worker Level - Analiza per spółka)
* **Wyzwalacz:** Na żądanie użytkownika.
* **Logika:** Dla wybranej spółki (np. Orlen), aplikacja zbiera jej wskaźniki fundamentalne (z `yahoo-finance2`) oraz techniczne (wyliczone przez `technicalindicators`).
* **Akcja:** Aplikacja wysyła asynchroniczne zapytanie (prompt) z tymi suchymi danymi do darmowego modelu (np. Meta Llama 3) przez OpenRouter.
* **Zapis:** Wynik (wygenerowany raport tekstowy dla jednej spółki) jest zapisywany w lokalnej bazie `SQLite` wraz z datą i tickerem.

### Etap B: Model-Zarządca (Manager Level - Analiza całego portfela)
* **Wyzwalacz:** Na żądanie użytkownika ("Analizuj Portfel").
* **Logika:** Aplikacja pobiera z bazy SQLite NAJNOWSZE wygenerowane raporty z Etapu A dla wszystkich posiadanych w portfelu spółek lub gdy takie raporty nie były wygenerowane przez użytkownika ani razu wymusza ich wygenerowanie,
* **Akcja:** Aplikacja łączy te streszczenia w jeden duży prompt (np. "Oto analizy moich 10 spółek, moje saldo to X, złoto to Y"). Prompt trafia do zaawansowanego modelu przez OpenRouter.
* **Cel:** AI ocenia dywersyfikację, ryzyko portfela jako całości i sugeruje ewentualne rebalansowanie.

## 5. Kamienie Milowe dla Agenta (Milestones)
Instrukcja krok po kroku do wykonania przez agenta:

- [ ] **1. Inicjalizacja:** Skonfiguruj projekt Vite + React + TS + Electron. Upewnij się, że okno Electrona się otwiera, a dev-server działa.
- [ ] **2. Baza Danych:** Skonfiguruj `better-sqlite3`. Stwórz tabele: `portfolio_assets`, `transactions`, `ai_reports`.
- [ ] **3. Integracja Danych:** Zaimplementuj pobieranie danych z `yahoo-finance2` i wyświetl prosty wykres dla dowolnego tickera.
- [ ] **4. Interfejs (GUI):** Zbuduj widoki: Dashboard (wykres kołowy portfela), Wyszukiwarka/Dodawanie aktywów, Widok Spółki (wykresy świecowe).
- [ ] **5. Moduł AI (Map-Reduce):** Zaimplementuj zapytania do OpenRoutera. Najpierw test na jednej spółce (Worker), potem zapis do DB, na końcu agregacja (Manager).
- [ ] **6. Build:** Skonfiguruj `electron-builder` i wygeneruj testowy plik `app-setup.exe` dla Windowsa.