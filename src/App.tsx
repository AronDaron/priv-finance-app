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
