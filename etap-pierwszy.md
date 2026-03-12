# Etap 1: Inicjalizacja projektu — Finance Portfolio Tracker

## Kontekst
Budujesz desktopową aplikację inwestycyjną (Electron + React + TypeScript + Vite + Tailwind CSS).
Projekt jest **całkowicie pusty** — nie ma żadnych plików poza `zalozenia-projektu.md` i tym plikiem.
Robisz **wyłącznie Milestone 1**: skonfiguruj projekt tak, żeby `npm run dev` uruchamiał okno Electrona z działającą aplikacją React.

**Środowisko:** Linux LXC, Node.js v22.22.1, npm 10.9.4
**Katalog roboczy:** `/root/workspace/priv-finance-app` (już jesteś w tym folderze)

**Build tool:** `electron-vite` — obsługuje jednocześnie main process, preload i renderer (React) w jednym poleceniu.

---

## KROK 0: Aktualizacja zalozenia-projektu.md

W pliku `zalozenia-projektu.md`, w sekcji `## 2. Stos Technologiczny`, dodaj na końcu sekcji nowy podrozdział:

```markdown
### Podjęte decyzje implementacyjne
- **Wykresy:** Lightweight Charts (TradingView) — najlepszy dla candlestick
- **SQLite:** better-sqlite3 (wymaga `electron-rebuild` przy cross-compile do Windows — patrz Milestone 6)
- **Klucz API OpenRouter:** Przechowywany w lokalnej bazie SQLite, konfigurowany przez UI aplikacji (Ustawienia)
- **Build tool Electron:** `electron-vite` (zarządza main + preload + renderer w jednym pipeline)
```

W sekcji `## 5. Kamienie Milowe`, zmień linię milestone 1 z `- [ ]` na `- [x]` po ukończeniu tego etapu.

---

## KROK 1: Instalacja zależności

Wykonaj poniższe komendy kolejno w terminalu:

```bash
# Inicjalizacja package.json
npm init -y

# Zależności runtime (React)
npm install react react-dom

# Zależności deweloperskie — Electron + Vite + TypeScript
npm install -D electron electron-vite vite @vitejs/plugin-react typescript

# TypeScript types
npm install -D @types/react @types/react-dom @types/node

# Tailwind CSS + PostCSS
npm install -D tailwindcss postcss autoprefixer

# electron-builder (konfiguracja podstawowa teraz, build .exe dopiero w Milestone 6)
npm install -D electron-builder
```

---

## KROK 2: Nadpisanie package.json

**WAŻNE:** Po `npm init -y` i instalacjach, nadpisz CAŁĄ zawartość `package.json` poniższym tekstem.
Zachowaj wszystkie zainstalowane `devDependencies` — nadpisz tylko pola `name`, `description`, `main`, `scripts` i `build`.

Końcowy `package.json` powinien wyglądać tak (wersje w `dependencies`/`devDependencies` mogą się różnić — to normalne):

```json
{
  "name": "priv-finance-app",
  "version": "1.0.0",
  "description": "Desktopowa aplikacja do śledzenia portfela inwestycyjnego z AI",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build && electron-builder",
    "preview": "electron-vite preview"
  },
  "build": {
    "appId": "com.priv.finance-app",
    "productName": "Finance Portfolio Tracker",
    "directories": {
      "output": "dist"
    },
    "win": {
      "target": "nsis",
      "icon": "resources/icon.ico"
    },
    "files": [
      "out/**/*"
    ]
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "...",
    "@types/react": "...",
    "@types/react-dom": "...",
    "@vitejs/plugin-react": "...",
    "autoprefixer": "...",
    "electron": "...",
    "electron-builder": "...",
    "electron-vite": "...",
    "postcss": "...",
    "tailwindcss": "...",
    "typescript": "...",
    "vite": "..."
  }
}
```

**Krytyczne pole:** `"main": "out/main/index.js"` — electron-vite kompiluje main process właśnie do tego miejsca.

---

## KROK 3: Stwórz strukturę katalogów

```bash
mkdir -p electron/main
mkdir -p electron/preload
mkdir -p src/assets
mkdir -p resources
```

---

## KROK 4: Utwórz plik electron.vite.config.ts

Ścieżka: `electron.vite.config.ts` (w katalogu głównym projektu)

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src')
      }
    },
    plugins: [react()]
  }
})
```

**Wyjaśnienie:**
- `externalizeDepsPlugin()` w main/preload — wyklucza `node_modules` z bundla (Node.js ma do nich dostęp natywnie)
- `@renderer` alias — umożliwia import `@renderer/Component` zamiast `../../Component`

---

## KROK 5: Utwórz plik tsconfig.json

Ścieżka: `tsconfig.json` (w katalogu głównym)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

---

## KROK 6: Utwórz plik tsconfig.node.json

Ścieżka: `tsconfig.node.json` (w katalogu głównym)

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "CommonJS",
    "moduleResolution": "node",
    "target": "ES2020",
    "lib": ["ES2020"],
    "strict": true,
    "types": ["node"]
  },
  "include": [
    "electron/**/*.ts",
    "electron.vite.config.ts"
  ]
}
```

**Dlaczego dwa tsconfig?** Electron main process działa w Node.js (CommonJS), renderer w przeglądarce (ESNext). Potrzebują innych ustawień kompilatora.

---

## KROK 7: Utwórz plik electron/main/index.ts

Ścieżka: `electron/main/index.ts`

```typescript
import { app, BrowserWindow } from 'electron'
import { join } from 'path'

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

  // electron-vite automatycznie ustawia ELECTRON_RENDERER_URL w trybie dev
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
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

**Wyjaśnienie kluczowych decyzji:**
- `backgroundColor: '#111827'` — ciemne tło (Tailwind gray-900) eliminuje "biały błysk" przed załadowaniem React
- `show: false` + event `ready-to-show` — okno pojawia się dopiero gdy jest w pełni gotowe (brak migotania)
- `ELECTRON_RENDERER_URL` — electron-vite ustawia tę zmienną automatycznie; wskazuje na `http://localhost:5173`
- `contextIsolation: true, nodeIntegration: false` — bezpieczna konfiguracja (Node.js dostępny tylko przez preload/IPC)

---

## KROK 8: Utwórz plik electron/preload/index.ts

Ścieżka: `electron/preload/index.ts`

```typescript
import { contextBridge } from 'electron'

// Bezpieczny pomost między procesem głównym Electrona a rendererem React.
// W kolejnych Milestone tutaj będą dodawane metody IPC:
// - Milestone 2: operacje na bazie SQLite
// - Milestone 3: pobieranie danych z yahoo-finance2
// - Milestone 5: zapytania do OpenRouter AI
contextBridge.exposeInMainWorld('electronAPI', {
  version: process.versions.electron
})
```

**WAŻNE dla kolejnych Milestone:** Każda funkcja wymagająca dostępu do Node.js (baza danych, HTTP requests do yahoo-finance2) MUSI być udostępniana przez `contextBridge.exposeInMainWorld`. Nigdy nie importuj node_modules bezpośrednio w komponentach React — to naruszy `contextIsolation`.

---

## KROK 9: Utwórz plik index.html

Ścieżka: `index.html` (w katalogu głównym)

```html
<!DOCTYPE html>
<html lang="pl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Finance Portfolio Tracker</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## KROK 10: Utwórz plik tailwind.config.js

Ścieżka: `tailwind.config.js` (w katalogu głównym)

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'finance-green': '#10b981',
        'finance-red': '#ef4444',
        'finance-dark': '#111827',
        'finance-card': '#1f2937',
      }
    },
  },
  plugins: [],
}
```

---

## KROK 11: Utwórz plik postcss.config.js

Ścieżka: `postcss.config.js` (w katalogu głównym)

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

---

## KROK 12: Utwórz plik src/assets/index.css

Ścieżka: `src/assets/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background-color: #111827;
  color: #f9fafb;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}

input, textarea, [contenteditable] {
  user-select: text;
}

::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: #1f2937;
}
::-webkit-scrollbar-thumb {
  background: #374151;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #4b5563;
}
```

---

## KROK 13: Utwórz plik src/main.tsx

Ścieżka: `src/main.tsx`

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './assets/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

---

## KROK 14: Utwórz plik src/App.tsx

Ścieżka: `src/App.tsx`

```typescript
function App(): JSX.Element {
  return (
    <div className="min-h-screen bg-finance-dark text-white flex items-center justify-center">
      <div className="text-center space-y-6">
        <div>
          <h1 className="text-5xl font-bold text-finance-green mb-2">
            Finance Portfolio Tracker
          </h1>
          <p className="text-gray-400 text-xl">
            Śledzenie portfela inwestycyjnego z AI
          </p>
        </div>

        <div className="bg-finance-card rounded-xl p-6 inline-block min-w-80">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-8">
              <span className="text-gray-500">Status:</span>
              <span className="text-finance-green font-semibold">&#10003; Inicjalizacja zakończona</span>
            </div>
            <div className="flex justify-between gap-8">
              <span className="text-gray-500">Framework:</span>
              <span className="text-white">React + TypeScript + Vite</span>
            </div>
            <div className="flex justify-between gap-8">
              <span className="text-gray-500">Wrapper:</span>
              <span className="text-white">Electron</span>
            </div>
            <div className="flex justify-between gap-8">
              <span className="text-gray-500">Styling:</span>
              <span className="text-white">Tailwind CSS</span>
            </div>
          </div>
        </div>

        <p className="text-gray-600 text-sm">
          Milestone 1 / 6 — Gotowe do Milestone 2: Baza Danych
        </p>
      </div>
    </div>
  )
}

export default App
```

---

## KROK 15: Utwórz plik .gitignore

Ścieżka: `.gitignore` (w katalogu głównym)

```
node_modules
dist
out
.DS_Store
*.log
*.sqlite
*.db
.env
.env.local
resources/icon.ico
```

---

## KROK 16: Weryfikacja struktury katalogów

Po wykonaniu wszystkich kroków, sprawdź że struktura wygląda tak:

```
priv-finance-app/
├── electron/
│   ├── main/
│   │   └── index.ts
│   └── preload/
│       └── index.ts
├── src/
│   ├── assets/
│   │   └── index.css
│   ├── App.tsx
│   └── main.tsx
├── resources/          (pusty katalog, potrzebny w Milestone 6)
├── node_modules/       (po npm install)
├── .gitignore
├── electron.vite.config.ts
├── etap-pierwszy.md
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.node.json
└── zalozenia-projektu.md
```

---

## KROK 17: Test końcowy

Uruchom:
```bash
npm run dev
```

**Oczekiwany rezultat (sukces):**
1. Vite dev server startuje na `http://localhost:5173`
2. Okno Electrona otwiera się automatycznie
3. W oknie widać ciemną stronę z zielonym nagłówkiem "Finance Portfolio Tracker"
4. Karta ze statusem "✓ Inicjalizacja zakończona"
5. DevTools Electrona otwierają się automatycznie
6. W konsoli terminala: brak błędów TypeScript/build

**Test hot-reload:**
- Zmień cokolwiek w `src/App.tsx`
- Zapisz plik
- Okno Electrona powinno odświeżyć się w ciągu 1-2 sekund bez restartu

---

## Rozwiązywanie problemów

### `electron-vite: command not found`
```bash
# Sprawdź czy jest w node_modules
ls node_modules/.bin/electron-vite

# Uruchom przez npx
npx electron-vite dev
```

### `Cannot find module 'electron'`
Electron musi być w `devDependencies`, nie w `dependencies`. Sprawdź:
```bash
npm ls electron
```

### Okno Electrona pokazuje błąd połączenia (ERR_CONNECTION_REFUSED)
Electron próbował połączyć się z Vite zanim ten zdążył wystartować.
electron-vite powinien to obsługiwać automatycznie. Jeśli błąd się powtarza:
```bash
# Spróbuj zmienić port w electron.vite.config.ts
# W sekcji renderer dodaj:
renderer: {
  server: { port: 5174 },
  ...
}
```

### Klasy Tailwind nie działają (brak stylów)
Sprawdź kolejno:
1. `src/assets/index.css` zaczyna się od `@tailwind base/components/utilities`
2. `src/main.tsx` importuje `'./assets/index.css'`
3. `tailwind.config.js` ma `content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]`

### TypeScript błąd w electron/main/index.ts
Sprawdź że `tsconfig.node.json` ma `"include": ["electron/**/*.ts"]`. Jeśli IDE nadal pokazuje błędy typów dla `app`, `BrowserWindow` — to normalne w trybie dev, build powinien działać.

---

## Notatki dla kolejnych etapów

**Milestone 2 (Baza Danych) będzie wymagał:**
- `npm install better-sqlite3 @types/better-sqlite3`
- `npm install -D electron-rebuild`
- Dodanie do scripts: `"postinstall": "electron-rebuild"`
- Tabele SQLite: `portfolio_assets`, `transactions`, `ai_reports`, `settings`
- IPC handlers w `electron/main/index.ts`
- Nowe metody w `contextBridge.exposeInMainWorld` w `electron/preload/index.ts`
