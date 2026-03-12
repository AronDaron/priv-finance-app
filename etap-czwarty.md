# Etap Czwarty: Interfejs GUI

## Stan wyjściowy (po Milestone 3)

### Co mamy:
- `src/lib/api.ts` — pełna warstwa danych (CRUD portfolio + 6 funkcji rynkowych)
- `src/lib/types.ts` — 27 typów TypeScript
- `src/components/StockSearch.tsx` — wyszukiwarka z dropdownem (debounce 300ms)
- `src/components/charts/CandlestickChart.tsx` — wykres świecowy (lightweight-charts v5)
- `src/App.tsx` — demo widok testowy Milestone 3 (do ZASTĄPIENIA routerem)
- Dual-backend: Electron SQLite + localStorage (dev/przeglądarka)

### Dostępne funkcje z api.ts:
| Funkcja | Zwraca |
|---|---|
| `getAssets()` | PortfolioAsset[] |
| `addAsset(asset)` | PortfolioAsset |
| `updateAsset(id, updates)` | PortfolioAsset |
| `deleteAsset(id)` | void |
| `getTransactions()` | Transaction[] |
| `getTransactionsByTicker(ticker)` | Transaction[] |
| `addTransaction(tx)` | Transaction |
| `deleteTransaction(id)` | void |
| `getQuote(ticker)` | StockQuote |
| `getHistory(ticker, period)` | OHLCCandle[] |
| `searchTickers(query)` | SearchResult[] |
| `getFundamentals(ticker)` | FundamentalData |
| `getDividends(ticker)` | DividendEntry[] |
| `getTechnicals(ticker, period)` | TechnicalIndicators |
| `getSetting(key)` | string \| null |
| `setSetting(key, value)` | void |

---

## Nowa zależność

```bash
npm install react-router-dom
```

Użyć `HashRouter` (nie `BrowserRouter`) — lepsza kompatybilność z Electronem w trybie
produkcyjnym (ładowanie z pliku `index.html` bez serwera HTTP).

---

## Architektura komponentów

```
src/
├── App.tsx                          # ZASTĄP: tylko <HashRouter> + <AppLayout>
├── lib/
│   ├── api.ts                       # BEZ ZMIAN
│   └── types.ts                     # BEZ ZMIAN (ewentualnie drobne rozszerzenia)
└── components/
    ├── StockSearch.tsx              # BEZ ZMIAN
    ├── charts/
    │   └── CandlestickChart.tsx     # BEZ ZMIAN
    ├── layout/
    │   ├── AppLayout.tsx            # Wrapper: Sidebar + <Outlet>
    │   └── Sidebar.tsx              # Nawigacja boczna (4 linki + aktywny highlight)
    ├── dashboard/
    │   ├── DashboardView.tsx        # Strona główna — wykres kołowy + karty
    │   ├── PortfolioPieChart.tsx    # SVG wykres kołowy alokacji
    │   └── SummaryCards.tsx        # Total Value, Total P&L, ROI%, liczba spółek
    ├── portfolio/
    │   ├── PortfolioView.tsx        # Lista spółek + przycisk dodaj
    │   ├── AssetRow.tsx             # Wiersz tabeli: ticker, qty, avg cost, price, P&L
    │   └── AddAssetModal.tsx        # Modal: StockSearch + qty + price + data + waluta
    ├── stock/
    │   ├── StockDetailView.tsx      # Widok spółki — chart + fundamentals + technicals
    │   ├── QuoteHeader.tsx          # Ticker, nazwa, cena, zmiana %, wolumen
    │   ├── FundamentalsPanel.tsx    # PE, EPS, beta, 52w high/low, sektor
    │   ├── TechnicalsPanel.tsx      # RSI gauge + MACD bar + SMA levels
    │   └── DividendsPanel.tsx       # Tabela dywidend
    ├── transactions/
    │   ├── TransactionsView.tsx     # Lista transakcji + filter + dodaj
    │   └── AddTransactionModal.tsx  # Modal: buy/sell, ticker, qty, price, data, notatki
    └── settings/
        └── SettingsView.tsx         # OpenRouter API key + info aplikacji
```

### Routing (react-router-dom v6)

```
/                    → DashboardView
/portfolio           → PortfolioView
/portfolio/:ticker   → StockDetailView (z powrotem do portfolio)
/stock/:ticker       → StockDetailView (z wyszukiwarki)
/transactions        → TransactionsView
/settings            → SettingsView
```

---

## Krok 1: Routing i Layout (App.tsx + AppLayout + Sidebar)

### App.tsx — zastąp cały plik:

```tsx
import { HashRouter, Routes, Route } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import DashboardView from './components/dashboard/DashboardView'
import PortfolioView from './components/portfolio/PortfolioView'
import StockDetailView from './components/stock/StockDetailView'
import TransactionsView from './components/transactions/TransactionsView'
import SettingsView from './components/settings/SettingsView'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardView />} />
          <Route path="portfolio" element={<PortfolioView />} />
          <Route path="portfolio/:ticker" element={<StockDetailView />} />
          <Route path="stock/:ticker" element={<StockDetailView />} />
          <Route path="transactions" element={<TransactionsView />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
```

### AppLayout.tsx

```tsx
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-finance-dark text-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
```

### Sidebar.tsx

Ikony: proste SVG inline (bez biblioteki ikon).
`NavLink` z react-router-dom — `isActive` → `bg-finance-card` highlight.

```
Pozycje menu:
- [ikona wykresu] Dashboard  → /
- [ikona teczki]  Portfel    → /portfolio
- [ikona listy]   Transakcje → /transactions
- [ikona koła]    Ustawienia → /settings
```

Style sidebar: `w-56 bg-gray-900 border-r border-gray-700 flex flex-col`
Każdy link: `flex items-center gap-3 px-4 py-3 rounded-lg mx-2 hover:bg-finance-card transition-colors`
Aktywny link: `bg-finance-card text-finance-green`

---

## Krok 2: Dashboard (DashboardView + PortfolioPieChart + SummaryCards)

### DashboardView.tsx — logika

```
useEffect na mount:
  1. getAssets() → lista spółek z portfolio
  2. Dla każdej spółki: getQuote(ticker) → aktualna cena
  3. Oblicz: currentValue = quantity * currentPrice
  4. Oblicz: costBasis = quantity * purchase_price
  5. Oblicz: totalValue = sum(currentValue)
  6. Oblicz: totalCost = sum(costBasis)
  7. Oblicz: totalPnL = totalValue - totalCost
  8. Oblicz: totalROI = (totalPnL / totalCost) * 100
  9. Oblicz: allocation[ticker] = currentValue / totalValue * 100

Stan: assets (z cenami), loading, error
Gdy portfolio puste: wyświetl komunikat "Dodaj pierwszą spółkę" + przycisk → /portfolio
```

### SummaryCards.tsx

4 karty w gridzie (`grid-cols-2 lg:grid-cols-4`):
1. **Wartość portfela** — `totalValue` sformatowana `formatCurrency()`
2. **Zysk/Strata** — `totalPnL` z kolorowaniem (finance-green/finance-red)
3. **ROI** — `totalROI%` z kolorowaniem i znakiem +/-
4. **Spółki** — liczba unikalnych tickerów w portfelu

Karta: `bg-finance-card rounded-xl p-5 border border-gray-700`
Etykieta: `text-xs text-gray-400 uppercase tracking-wider`
Wartość: `text-2xl font-bold mt-1`

### PortfolioPieChart.tsx

Implementacja: **czysty SVG** (bez zewnętrznej biblioteki wykresów).

```
Algorytm:
1. Posortuj spółki po currentValue malejąco
2. Oblicz kąty: startAngle += (value/total) * 360
3. Użyj SVG <path> z komendą arc (M cx cy L x1 y1 A r r 0 largeArc 0 x2 y2 Z)
4. Paleta kolorów: ['#10b981','#3b82f6','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4']
5. Legenda obok: colored dot + ticker + percentage

Rozmiar: viewBox="0 0 200 200", cx=100, cy=100, r=80
Ochrona edge-case: jeśli 1 spółka → pełne koło (użyj <circle> zamiast arc)
```

Pomocnicze funkcje geometrii:
```ts
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}
```

Tooltip on hover: `<title>` element wewnątrz `<path>` (natywny SVG tooltip).

---

## Krok 3: Portfolio View (PortfolioView + AssetRow + AddAssetModal)

### PortfolioView.tsx — logika

```
Stan: assets (PortfolioAsset[]), quotes (Map<ticker, StockQuote>), loading, showAddModal

useEffect: getAssets() → dla każdego: getQuote(ticker) (Promise.all)

Obliczenia per spółka (w AssetRow):
  currentValue = quantity * currentPrice
  costBasis = quantity * purchase_price
  pnl = currentValue - costBasis
  pnlPercent = (pnl / costBasis) * 100

Akcje:
  - Klik w wiersz → navigate(`/portfolio/${ticker}`)
  - Przycisk "Usuń" (z window.confirm) → deleteAsset(id) → odśwież listę
  - Przycisk "+ Dodaj spółkę" → setShowAddModal(true)
  - Po zamknięciu AddAssetModal z sukcesem → odśwież listę
```

### AssetRow.tsx

Kolumny tabeli (`<tr>` z `cursor-pointer onClick → navigate`):

| Ticker | Nazwa | Ilość | Śr. cena zakupu | Aktualna cena | Wartość | P&L | P&L % | Akcje |
|---|---|---|---|---|---|---|---|---|

- Ticker: `font-bold text-finance-green`
- Ceny: `formatCurrency(price, currency)`
- P&L: zielony gdy >= 0, czerwony gdy < 0
- Akcje: przycisk kosz (SVG) — `stopPropagation()` żeby nie triggerować nawigacji

### AddAssetModal.tsx

Overlay: `fixed inset-0 bg-black/60 flex items-center justify-center z-50`
Modal box: `bg-finance-card rounded-2xl p-6 w-full max-w-md`

Pola formularza:
1. **Wyszukaj spółkę** — `<StockSearch onSelect={(ticker, name) => setForm({...form, ticker, name})} />`
2. **Ticker** — `<input>` (auto-wypełniany przez StockSearch, edytowalny ręcznie)
3. **Nazwa** — `<input>` (auto-wypełniana, edytowalna)
4. **Ilość** — `<input type="number" min="0.001" step="0.001">`
5. **Cena zakupu (średnia)** — `<input type="number" min="0" step="0.01">`
6. **Waluta** — `<select>`: USD | PLN | EUR
7. **Przyciski**: Anuluj (`bg-gray-700`) + Dodaj (`bg-finance-green`)

Walidacja przed submit: `ticker.trim() !== ''` && `quantity > 0` && `purchase_price >= 0`
Po submit: `addAsset({ticker, name, quantity, purchase_price, currency})` → `onSuccess()` → zamknij

---

## Krok 4: Stock Detail View

### StockDetailView.tsx — logika

```tsx
const { ticker } = useParams<{ ticker: string }>()
const navigate = useNavigate()

// Stan
const [quote, setQuote] = useState<StockQuote | null>(null)
const [candles, setCandles] = useState<OHLCCandle[]>([])
const [fundamentals, setFundamentals] = useState<FundamentalData | null>(null)
const [technicals, setTechnicals] = useState<TechnicalIndicators | null>(null)
const [dividends, setDividends] = useState<DividendEntry[]>([])
const [period, setPeriod] = useState<HistoryPeriod>('1y')
const [loading, setLoading] = useState(true)
const [showAddModal, setShowAddModal] = useState(false)

// Ładowanie danych przy zmianie tickera
useEffect(() => {
  if (!ticker) return
  setLoading(true)
  Promise.all([
    getQuote(ticker),
    getHistory(ticker, period),
    getFundamentals(ticker),
    getTechnicals(ticker, period),
    getDividends(ticker),
  ]).then(([q, c, f, t, d]) => {
    setQuote(q); setCandles(c); setFundamentals(f); setTechnicals(t); setDividends(d)
  }).finally(() => setLoading(false))
}, [ticker])

// Aktualizacja przy zmianie okresu
useEffect(() => {
  if (!ticker) return
  Promise.all([getHistory(ticker, period), getTechnicals(ticker, period)])
    .then(([c, t]) => { setCandles(c); setTechnicals(t) })
}, [period])
```

Layout strony (padding `p-6`, scroll):
```
[← Wstecz]  [+ Dodaj do portfela]       (flex justify-between)
[QuoteHeader]
[Period selector: 1mo | 3mo | 6mo | 1y | 2y | 5y]
[CandlestickChart height=400]
[grid grid-cols-1 lg:grid-cols-2 gap-4]
  [TechnicalsPanel]
  [FundamentalsPanel]
[DividendsPanel — pełna szerokość, tylko gdy dividends.length > 0]
[AddAssetModal — warunkowy, z pre-wypełnionym tickerem]
```

### QuoteHeader.tsx — props: `{ quote: StockQuote }`

```tsx
<div className="flex items-start justify-between mb-6">
  <div>
    <h1 className="text-3xl font-bold">{quote.ticker}</h1>
    <p className="text-gray-400 mt-1">{quote.name}</p>
  </div>
  <div className="text-right">
    <p className="text-4xl font-bold">{formatCurrency(quote.price, quote.currency)}</p>
    <p className={quote.change >= 0 ? 'text-finance-green text-lg' : 'text-finance-red text-lg'}>
      {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({formatPercent(quote.changePercent)})
    </p>
    <p className="text-xs text-gray-500 mt-1">
      Vol: {quote.volume?.toLocaleString('pl-PL')} · MCap: {formatMarketCap(quote.marketCap)}
    </p>
  </div>
</div>
```

### TechnicalsPanel.tsx — props: `{ technicals: TechnicalIndicators, currentPrice: number }`

Układ: `grid grid-cols-3 gap-4` wewnątrz karty

**RSI (lewa kolumna):**
```
Tytuł: "RSI (14)"
Wartość: duża liczba, kolor zależny:
  < 30  → text-finance-green + etykieta "Wyprzedany"
  30-70 → text-gray-300 + etykieta "Neutralny"
  > 70  → text-finance-red + etykieta "Wykupiony"
Pasek: <div style={{width: `${rsi}%`}} className="h-1.5 rounded bg-current" /> na tle szarym
```

**MACD (środkowa kolumna):**
```
Tytuł: "MACD"
Trzy rzędy: Value | Signal | Histogram
Histogram: kolor finance-green gdy > 0, finance-red gdy < 0
Null → "N/A"
```

**SMA (prawa kolumna):**
```
Tytuł: "SMA"
Trzy rzędy: SMA20 | SMA50 | SMA200
Każdy: [etykieta] [wartość] [status]
Status: currentPrice > sma → "↑" text-finance-green | "↓" text-finance-red
Null → "N/A" (za mało danych)
```

### FundamentalsPanel.tsx — props: `{ fundamentals: FundamentalData }`

Siatka dwukolumnowa (`grid grid-cols-2 gap-x-4 gap-y-2 text-sm`):

| Lewa etykieta | Prawa wartość |
|---|---|
| P/E Ratio | `pe?.toFixed(2) ?? 'N/A'` |
| EPS | `eps?.toFixed(2) ?? 'N/A'` |
| Stopa dywidendy | `dividendYield ? ${(dy*100).toFixed(2)}% : '—'` |
| Market Cap | `formatMarketCap(marketCap)` |
| 52-tygodniowe max | `formatCurrency(week52High)` |
| 52-tygodniowe min | `formatCurrency(week52Low)` |
| Beta | `beta?.toFixed(2) ?? 'N/A'` |
| Sektor | `sector ?? '—'` |
| Branża | `industry ?? '—'` |

Etykieta: `text-gray-400` Wartość: `text-white font-medium`

### DividendsPanel.tsx — props: `{ dividends: DividendEntry[] }`

Renderuj tylko gdy `dividends.length > 0`.

```
Nagłówek: "Historia dywidend"
Tabela: Data | Kwota | Waluta
Sortowanie: najnowsze na górze (.sort by date desc)
Limit: pokaż max 10, jeśli więcej → przycisk "Pokaż więcej" (lokalny stan expanded)
```

---

## Krok 5: Transactions View

### TransactionsView.tsx

```
Stan: transactions (Transaction[]), filterTicker (string), showAddModal, loading

useEffect: getTransactions() → posortuj malejąco po date

Filtrowanie (lokalne, bez API):
  filtered = transactions.filter(tx =>
    filterTicker === '' || tx.ticker.toLowerCase().includes(filterTicker.toLowerCase())
  )
```

Nagłówek strony: "Transakcje" + przycisk "+ Dodaj transakcję"
Pole filtru: `<input placeholder="Filtruj po tickerze...">` → setFilterTicker

Tabela (gdy filtered.length > 0):

| Data | Ticker | Typ | Ilość | Cena | Wartość | Notatki | Akcja |
|---|---|---|---|---|---|---|---|

- Data: `new Date(tx.date).toLocaleDateString('pl-PL')`
- Typ: badge — BUY: `bg-green-900/50 text-finance-green rounded px-2 py-0.5 text-xs` | SELL: czerwony
- Wartość: `formatCurrency(tx.quantity * tx.price, tx.currency)`
- Akcja: przycisk kosz → `window.confirm` → `deleteTransaction(id)` → odśwież

Gdy `filtered.length === 0`: komunikat "Brak transakcji"

### AddTransactionModal.tsx

Pola formularza:
1. **Ticker** — `<input>` (lub `<StockSearch>` opcjonalnie)
2. **Typ** — toggle przyciski: `KUP` (buy) | `SPRZEDAJ` (sell)
3. **Ilość** — `<input type="number" min="0.001" step="0.001">`
4. **Cena** — `<input type="number" min="0" step="0.01">`
5. **Waluta** — `<select>`: USD | PLN | EUR
6. **Data** — `<input type="date">` (domyślnie: `new Date().toISOString().split('T')[0]`)
7. **Notatki** — `<textarea rows={2}>` (opcjonalne)

Po submit: `addTransaction({ticker, type, quantity, price, currency, date, notes: notes || undefined})` → `onSuccess()` → zamknij

---

## Krok 6: Settings View

### SettingsView.tsx

```
Stan: apiKey (string), showKey (boolean), saved (boolean), loading

useEffect: getSetting('openrouter_api_key').then(val => setApiKey(val ?? ''))

handleSave:
  setSetting('openrouter_api_key', apiKey)
  setSaved(true) → setTimeout → setSaved(false) po 2s
```

Sekcja 1: **OpenRouter API Key**
```
Opis: "Klucz wymagany do funkcji AI (Milestone 5). Przechowywany lokalnie w SQLite."
<div class="flex gap-2">
  <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={setApiKey} class="flex-1 ..."/>
  <button onClick={() => setShowKey(!showKey)}>Pokaż/Ukryj</button>
</div>
<button onClick={handleSave}>Zapisz</button>
{saved && <p class="text-finance-green text-sm mt-2">Zapisano pomyślnie</p>}
```

Sekcja 2: **Informacje o aplikacji**
```
Finance Portfolio Tracker v1.0.0
Środowisko: isElectron() ? "Electron (SQLite)" : "Przeglądarka (localStorage)"
```

---

## Krok 7: Wspólne helpery (`src/lib/utils.ts` — NOWY PLIK)

```ts
// Formatowanie walut
export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Formatowanie procentów ze znakiem
export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

// Formatowanie market cap (T/B/M)
export function formatMarketCap(value: number | null | undefined): string {
  if (value == null) return 'N/A'
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  return value.toLocaleString('pl-PL')
}
```

### LoadingSpinner (`src/components/ui/LoadingSpinner.tsx` — NOWY PLIK)

```tsx
export default function LoadingSpinner({ text = 'Ładowanie...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-gray-400">
      <div className="animate-spin w-6 h-6 border-2 border-finance-green border-t-transparent rounded-full mr-3" />
      {text}
    </div>
  )
}
```

### ErrorMessage (`src/components/ui/ErrorMessage.tsx` — NOWY PLIK)

```tsx
export default function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-finance-red text-sm">
      {message}
    </div>
  )
}
```

### Konwencje stylowania (używaj konsekwentnie)

```
Karta:          bg-finance-card rounded-xl border border-gray-700 p-5
Nagłówek sekcji: text-lg font-semibold text-white mb-4
Table head:     text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700 pb-2
Table row:      border-b border-gray-800 hover:bg-gray-800/50 transition-colors
Input:          bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-finance-green
Button primary: bg-finance-green hover:bg-emerald-600 text-white font-medium px-4 py-2 rounded-lg transition-colors
Button danger:  bg-red-900/50 hover:bg-red-800/50 text-finance-red px-3 py-1.5 rounded transition-colors
```

---

## Kolejność implementacji (zalecana)

1. `npm install react-router-dom`
2. Utwórz `src/lib/utils.ts` — helpery `formatCurrency`, `formatPercent`, `formatMarketCap`
3. Utwórz `src/components/ui/LoadingSpinner.tsx`
4. Utwórz `src/components/ui/ErrorMessage.tsx`
5. Zastąp `src/App.tsx` — HashRouter + Routes
6. Utwórz `src/components/layout/Sidebar.tsx`
7. Utwórz `src/components/layout/AppLayout.tsx`
8. Utwórz stub widoki (puste `export default function XxxView() { return <div>XxxView</div> }`) dla wszystkich 5 widoków — sprawdź że routing działa
9. Utwórz `src/components/dashboard/PortfolioPieChart.tsx`
10. Utwórz `src/components/dashboard/SummaryCards.tsx`
11. Utwórz `src/components/dashboard/DashboardView.tsx`
12. Utwórz `src/components/portfolio/AddAssetModal.tsx`
13. Utwórz `src/components/portfolio/AssetRow.tsx`
14. Utwórz `src/components/portfolio/PortfolioView.tsx`
15. Utwórz `src/components/stock/QuoteHeader.tsx`
16. Utwórz `src/components/stock/TechnicalsPanel.tsx`
17. Utwórz `src/components/stock/FundamentalsPanel.tsx`
18. Utwórz `src/components/stock/DividendsPanel.tsx`
19. Utwórz `src/components/stock/StockDetailView.tsx`
20. Utwórz `src/components/transactions/AddTransactionModal.tsx`
21. Utwórz `src/components/transactions/TransactionsView.tsx`
22. Utwórz `src/components/settings/SettingsView.tsx`

---

## Testowanie (`npm run dev`)

1. Otwórz `http://[IP]:5173` w przeglądarce
2. **Nawigacja** — sprawdź że sidebar linki przełączają widoki, aktywny link jest podświetlony
3. **Dashboard** — portfel pusty: widoczny komunikat "Dodaj pierwszą spółkę"; po dodaniu: wykres kołowy + karty z wartościami
4. **Portfel** — dodaj spółkę przez modal (AAPL, 10 sztuk, $150 USD), sprawdź że pojawia się w tabeli z P&L
5. **Stock Detail** — klik w AAPL → wykres świecowy + fundamentals + technicals; zmień period na 5y → wykres się odświeża
6. **Transakcje** — dodaj transakcję BUY (AAPL, 5 szt, $155), sprawdź listę, użyj filtru, usuń
7. **Ustawienia** — wpisz klucz OpenRouter, zapisz, sprawdź komunikat sukcesu, przeładuj stronę — klucz powinien być zapamiętany (localStorage)
8. **Edge-case** — portfolio z 1 spółką: pie chart jako pełne koło; brak dywidend: DividendsPanel ukryty; brak SMA200: wyświetla "N/A"
