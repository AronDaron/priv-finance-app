// electron/main/globalScore.ts
// Deterministyczny algorytm oceny potencjału inwestycyjnego regionów (0-100).
// Brak AI — tylko ważona suma znormalizowanych wskaźników rynkowych.
// Każdy region ma przypisane wagi per wskaźnik sumujące się do 1.0.

import type { GlobalMarketData, RegionScore, RegionId, RegionScoreComponent } from '../../src/lib/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Normalizuje wartość do przedziału [-1, 1] zakładając symetryczny zakres
function norm(value: number, range: number): number {
  return Math.max(-1, Math.min(1, value / range))
}

// Konwertuje wkład [-1,1] * weight * 50 → points względem bazy 50
function contrib(rawValue: number, range: number, weight: number): RegionScoreComponent & { pts: number } {
  const n = norm(rawValue, range)
  const pts = n * weight * 50
  return { name: '', rawValue, contribution: pts, weight, pts }
}

// Jak contrib, ale rawValue służy wyłącznie do wyświetlenia (np. rzeczywisty VIX/yield),
// a n to już gotowa znormalizowana wartość [-1,1].
function contribNorm(displayRaw: number, n: number, weight: number): RegionScoreComponent & { pts: number } {
  const clamped = Math.max(-1, Math.min(1, n))
  const pts = clamped * weight * 50
  return { name: '', rawValue: displayRaw, contribution: pts, weight, pts }
}

// VIX: poziom strachu — im wyższy VIX, tym niższy score
// VIX ~12 = rynek spokojny (+1), VIX ~40 = panika (-1)
// Historyczna średnia VIX ~19-20, dlatego neutral = 20
function vixFactor(vix: number): number {
  return norm(20 - vix, 18)
}

// US10Y yield: optimum ~3.0%, symetryczny zakres ±1.5% — bez nieciągłości
// yield=1.5% → 0, yield=3.0% → +1 (max), yield=4.5% → 0, yield>4.5% → ujemny
function us10yFactor(yield10y: number): number {
  if (yield10y <= 0) return -1
  return norm(1.5 - Math.abs(yield10y - 3.0), 1.5)
}

function riskLevel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 65) return 'low'
  if (score >= 40) return 'medium'
  return 'high'
}

function trend(change1d: number): 'up' | 'down' | 'neutral' {
  if (change1d > 0.3)  return 'up'
  if (change1d < -0.3) return 'down'
  return 'neutral'
}

// ─── Definicje regionów ───────────────────────────────────────────────────────

interface RegionDef {
  id: RegionId
  name: string
  flag: string
  compute: (m: GlobalMarketData) => { components: RegionScoreComponent[]; trend1d: number }
}

const REGIONS: RegionDef[] = [

  // ── Ameryka Północna ───────────────────────────────────────────────────────
  {
    id: 'north_america',
    name: 'Ameryka Północna',
    flag: '🌎',
    compute(m) {
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.SP500.change1m, 10, 0.30), name: 'S&P500 (30 dni)' },
        { ...contrib(m.indices.SP500.changePercent, 3,  0.10), name: 'S&P500 (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), 0.25), name: 'VIX (strach)' },
        { ...contribNorm(m.bonds.US10Y.price, us10yFactor(m.bonds.US10Y.price), 0.15), name: 'US10Y Yield' },
        { ...contrib(m.commodities.oil.change1m, 15, 0.10), name: 'Ropa (eksport/prod.)' },
        { ...contrib(m.currencies.EURUSD.changePercent, 1.5, 0.10), name: 'EUR/USD (płynność)' },
      ]
      return { components, trend1d: m.indices.SP500.changePercent }
    },
  },

  // ── Europa ─────────────────────────────────────────────────────────────────
  {
    id: 'europe',
    name: 'Europa',
    flag: '🇪🇺',
    compute(m) {
      const avgIndex = (m.indices.DAX.change1m + m.indices.FTSE.change1m) / 2
      const avgIdx1d = (m.indices.DAX.changePercent + m.indices.FTSE.changePercent) / 2
      // EUR, GBP, CHF — koszyk siły regionalnej
      const currencyBasket = (m.currencies.EURUSD.changePercent + m.currencies.GBPUSD.changePercent + m.currencies.CHFUSD.changePercent) / 3
      const components: RegionScoreComponent[] = [
        { ...contrib(avgIndex, 10, 0.30), name: 'DAX + FTSE (30 dni)' },
        { ...contrib(avgIdx1d,  3, 0.10), name: 'Indeksy (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), 0.20), name: 'VIX (strach)' },
        { ...contrib(currencyBasket, 1.5, 0.20), name: 'EUR+GBP+CHF (kurs)' },
        { ...contrib(-m.commodities.gas.change1m, 20, 0.10), name: 'Gaz (import)' },
        { ...contrib(-m.commodities.oil.change1m, 15, 0.10), name: 'Ropa (import)' },
      ]
      return { components, trend1d: avgIdx1d }
    },
  },

  // ── Azja ───────────────────────────────────────────────────────────────────
  {
    id: 'asia',
    name: 'Azja',
    flag: '🌏',
    compute(m) {
      // Japonia (Nikkei) + Chiny (FXI) + Indie (INDA) — trzy największe rynki Azji
      const avgIndex = (m.indices.Nikkei.change1m + m.indices.FXI.change1m + m.indices.INDA.change1m) / 3
      const avgIdx1d = (m.indices.Nikkei.changePercent + m.indices.FXI.changePercent + m.indices.INDA.changePercent) / 3
      // JPY, CNY — dwie najważniejsze waluty azjatyckie (AUD należy do Australii)
      const currencyBasket = (m.currencies.JPYUSD.changePercent + m.currencies.CNYUSD.changePercent) / 2
      const components: RegionScoreComponent[] = [
        { ...contrib(avgIndex, 10, 0.30), name: 'Nikkei+FXI+INDA (30 dni)' },
        { ...contrib(avgIdx1d,  3, 0.10), name: 'Indeksy (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), 0.15), name: 'VIX (globalny)' },
        { ...contrib(currencyBasket, 1.5, 0.20), name: 'JPY+CNY (kurs)' },
        { ...contrib(m.commodities.copper.change1m, 10, 0.15), name: 'Miedź (przemysł)' },
        { ...contrib(-m.commodities.oil.change1m, 12, 0.10), name: 'Ropa (import)' },
      ]
      return { components, trend1d: avgIdx1d }
    },
  },

  // ── Rynki Wschodzące (szeroki EM: VWO = Brazylia, Chiny, Indie, Tajwan, RPA...) ──
  {
    id: 'latam_em',
    name: 'Rynki Wschodzące',
    flag: '🌎',
    compute(m) {
      // VWO (Vanguard FTSE EM) = szeroki proxy globalnych rynków wschodzących
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.VWO.change1m, 12, 0.35), name: 'VWO EM (30 dni)' },
        { ...contrib(m.indices.VWO.changePercent, 3,  0.10), name: 'VWO EM (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), 0.20), name: 'VIX (ryzyko)' },
        // EM korzysta na surowcach (eksporter)
        { ...contrib(m.commodities.oil.change1m, 12, 0.15), name: 'Ropa (eksport)' },
        { ...contrib(m.commodities.copper.change1m, 10, 0.05), name: 'Miedź (eksport)' },
        // Silny USD = zły dla EM (droższy dług)
        { ...contrib(-m.currencies.EURUSD.changePercent, 1.5, 0.15), name: 'USD (siła, ryzyko)' },
      ]
      return { components, trend1d: m.indices.VWO.changePercent }
    },
  },

  // ── Rynki Rozwinięte (koszyk: SP500 + DAX + Nikkei + FTSE + ASX200 + makro) ──
  {
    id: 'developed_markets',
    name: 'Rynki Rozwinięte',
    flag: '🏦',
    compute(m) {
      const avgIdx1d = (
        m.indices.SP500.changePercent +
        m.indices.DAX.changePercent +
        m.indices.Nikkei.changePercent +
        m.indices.FTSE.changePercent
      ) / 4
      // EUR+GBP+JPY vs USD — siła głównych walut DM (słabszy USD = lepsza płynność globalna)
      const dmCurrencyBasket = (
        m.currencies.EURUSD.changePercent +
        m.currencies.GBPUSD.changePercent +
        m.currencies.JPYUSD.changePercent
      ) / 3
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.SP500.change1m,   10, 0.20), name: 'S&P500 (30 dni)' },
        { ...contrib(m.indices.DAX.change1m,     10, 0.15), name: 'DAX (30 dni)' },
        { ...contrib(m.indices.Nikkei.change1m,  10, 0.15), name: 'Nikkei (30 dni)' },
        { ...contrib(m.indices.FTSE.change1m,    10, 0.10), name: 'FTSE (30 dni)' },
        { ...contrib(m.indices.ASX200.change1m,  10, 0.05), name: 'ASX200 (30 dni)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), 0.10), name: 'VIX (ryzyko)' },
        { ...contribNorm(m.bonds.US10Y.price, us10yFactor(m.bonds.US10Y.price), 0.15), name: 'US10Y Yield' },
        { ...contrib(dmCurrencyBasket, 1.5, 0.10), name: 'EUR+GBP+JPY (kurs)' },
      ]
      return { components, trend1d: avgIdx1d }
    },
  },

  // ── Australia / Oceania ────────────────────────────────────────────────────
  {
    id: 'australia_oceania',
    name: 'Australia i Oceania',
    flag: '🇦🇺',
    compute(m) {
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.ASX200.change1m, 10, 0.35), name: 'ASX200 (30 dni)' },
        { ...contrib(m.indices.ASX200.changePercent, 3, 0.10), name: 'ASX200 (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), 0.20), name: 'VIX (globalny)' },
        { ...contrib(m.currencies.AUDUSD.changePercent, 1.5, 0.15), name: 'AUD/USD (kurs)' },
        // Australia: eksporter surowców — wyższe ceny = lepiej
        { ...contrib(m.commodities.gold.change1m, 8, 0.10), name: 'Złoto (eksport)' },
        { ...contrib(m.commodities.copper.change1m, 10, 0.10), name: 'Miedź (eksport)' },
      ]
      return { components, trend1d: m.indices.ASX200.changePercent }
    },
  },

  // ── Afryka (proxy: Republika Południowej Afryki) ───────────────────────────
  {
    id: 'africa',
    name: 'Afryka',
    flag: '🌍',
    compute(m) {
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.EZA.change1m, 12, 0.30), name: 'EZA SA (30 dni)' },
        { ...contrib(m.indices.EZA.changePercent, 3, 0.10), name: 'EZA SA (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), 0.15), name: 'VIX (ryzyko)' },
        // Silny USD = gorszy dla Afryki (droższy dług w USD)
        { ...contrib(-m.currencies.EURUSD.changePercent, 1.5, 0.15), name: 'USD (siła, ryzyko)' },
        // RPA: eksporter złota i platyny
        { ...contrib(m.commodities.gold.change1m, 8, 0.20), name: 'Złoto (eksport)' },
        { ...contrib(m.commodities.copper.change1m, 10, 0.10), name: 'Miedź (eksport)' },
      ]
      return { components, trend1d: m.indices.EZA.changePercent }
    },
  },

  // ── Ameryka Południowa (proxy: Bovespa — Brazylia) ─────────────────────────
  {
    id: 'south_america',
    name: 'Ameryka Płd.',
    flag: '🌎',
    compute(m) {
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.BVSP.change1m, 12, 0.30), name: 'Bovespa (30 dni)' },
        { ...contrib(m.indices.BVSP.changePercent, 3, 0.10), name: 'Bovespa (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), 0.15), name: 'VIX (ryzyko)' },
        // Silny USD = gorszy dla EM (droższy dług)
        { ...contrib(-m.currencies.EURUSD.changePercent, 1.5, 0.15), name: 'USD (siła, ryzyko)' },
        // Brazylia: eksporter ropy i surowców
        { ...contrib(m.commodities.oil.change1m, 12, 0.20), name: 'Ropa (eksport)' },
        { ...contrib(m.commodities.copper.change1m, 10, 0.10), name: 'Miedź (eksport)' },
      ]
      return { components, trend1d: m.indices.BVSP.changePercent }
    },
  },

  // ── Sektor Surowcowy ────────────────────────────────────────────────────────
  {
    id: 'commodities',
    name: 'Surowce',
    flag: '🛢️',
    compute(m) {
      // Trend 1-dniowy — średnia zmian dziennych wszystkich surowców
      const avgCommodity = (
        m.commodities.oil.changePercent    +
        m.commodities.gold.changePercent   +
        m.commodities.copper.changePercent +
        m.commodities.gas.changePercent    +
        m.commodities.wheat.changePercent
      ) / 5
      const components: RegionScoreComponent[] = [
        { ...contrib(m.commodities.gold.change1m,   8,  0.25), name: 'Złoto (30 dni)' },
        { ...contrib(m.commodities.oil.change1m,    12, 0.20), name: 'Ropa (30 dni)' },
        { ...contrib(m.commodities.copper.change1m, 10, 0.20), name: 'Miedź (30 dni)' },
        { ...contrib(m.commodities.gas.change1m,    25, 0.15), name: 'Gaz (30 dni)' },
        { ...contrib(m.commodities.wheat.change1m,  15, 0.10), name: 'Pszenica (30 dni)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), 0.10), name: 'VIX (ryzyko)' },
      ]
      return { components, trend1d: avgCommodity }
    },
  },
]

// ─── Główna funkcja ───────────────────────────────────────────────────────────

export function computeGlobalScores(marketData: GlobalMarketData): RegionScore[] {
  return REGIONS.map(region => {
    const { components, trend1d } = region.compute(marketData)
    const totalPts = components.reduce((sum, c) => sum + c.contribution, 0)
    const score    = Math.max(0, Math.min(100, Math.round(50 + totalPts)))

    return {
      id:         region.id,
      name:       region.name,
      flag:       region.flag,
      score,
      risk:       riskLevel(score),
      trend:      trend(trend1d),
      components: components.map(c => ({
        name:         c.name,
        rawValue:     c.rawValue,
        contribution: Math.round(c.contribution * 10) / 10,
        weight:       c.weight,
      })),
    }
  })
}
