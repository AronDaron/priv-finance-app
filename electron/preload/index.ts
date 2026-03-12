import { contextBridge } from 'electron'

// Bezpieczny pomost między procesem głównym Electrona a rendererem React.
// W kolejnych Milestone tutaj będą dodawane metody IPC:
// - Milestone 2: operacje na bazie SQLite
// - Milestone 3: pobieranie danych z yahoo-finance2
// - Milestone 5: zapytania do OpenRouter AI
contextBridge.exposeInMainWorld('electronAPI', {
  version: process.versions.electron
})
