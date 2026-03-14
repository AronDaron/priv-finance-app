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

// VIX: poziom strachu — im wyższy VIX, tym niższy score
// VIX ~12 = rynek spokojny (+1), VIX ~40 = panika (-1)
function vixFactor(vix: number): number {
  // neutralny poziom ~22, zakres ±18
  return norm(22 - vix, 18)
}

// US10Y yield: 2.5-3.5% = zdrowy (0), >5% = restrykcyjny (-1), <1.5% = deflacja (-0.5)
function us10yFactor(yield10y: number): number {
  if (yield10y <= 0) return 0
  if (yield10y < 1.5) return norm(yield10y - 1.5, 1.0)   // poniżej 1.5% — ryzyko deflacji
  if (yield10y <= 3.5) return norm(yield10y - 1.5, 2.0)  // zdrowa strefa
  return norm(-(yield10y - 3.5), 2.0)                    // powyżej 3.5% — restrykcja
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

  // ── USA ────────────────────────────────────────────────────────────────────
  {
    id: 'usa',
    name: 'USA',
    flag: '🇺🇸',
    compute(m) {
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.SP500.change1m, 10, 0.30), name: 'S&P500 (30 dni)' },
        { ...contrib(m.indices.SP500.changePercent, 3,  0.10), name: 'S&P500 (1 dzień)' },
        { ...contrib(vixFactor(m.indices.VIX.price) * 18, 18, 0.25), name: 'VIX (strach)' },
        { ...contrib(us10yFactor(m.bonds.US10Y.price) * 2, 2, 0.15), name: 'US10Y Yield' },
        { ...contrib(-m.commodities.oil.change1m, 15, 0.10), name: 'Ropa (import)' },
        { ...contrib(m.currencies.EURUSD.changePercent, 1.5, 0.10), name: 'EUR/USD (siła USD)' },
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
        { ...contrib(vixFactor(m.indices.VIX.price) * 18, 18, 0.20), name: 'VIX (strach)' },
        { ...contrib(currencyBasket, 1.5, 0.20), name: 'EUR+GBP+CHF (kurs)' },
        { ...contrib(-m.commodities.gas.changePercent, 5,  0.10), name: 'Gaz (import)' },
        { ...contrib(-m.commodities.oil.change1m, 15, 0.10), name: 'Ropa (import)' },
      ]
      return { components, trend1d: avgIdx1d }
    },
  },

  // ── Polska ─────────────────────────────────────────────────────────────────
  {
    id: 'poland',
    name: 'Polska',
    flag: '🇵🇱',
    compute(m) {
      // PLN siła: inverse USDPLN — gdy USD rośnie, PLN słabnie
      // używamy EURUSD jako proxy dla PLN (PL jest mocno skorelowana z EUR)
      const plnStrength = m.currencies.EURUSD.changePercent // EUR siłą = PLN siłą
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.WIG20.change1m, 10, 0.35), name: 'WIG20 (30 dni)' },
        { ...contrib(m.indices.WIG20.changePercent, 3,  0.15), name: 'WIG20 (1 dzień)' },
        { ...contrib(vixFactor(m.indices.VIX.price) * 18, 18, 0.15), name: 'VIX (globalny)' },
        { ...contrib(plnStrength, 1.5, 0.15), name: 'PLN/EUR (kurs)' },
        { ...contrib(m.indices.DAX.changePercent, 2, 0.10), name: 'DAX (korelacja)' },
        { ...contrib(-m.commodities.gas.changePercent, 5, 0.10), name: 'Gaz (import)' },
      ]
      return { components, trend1d: m.indices.WIG20.changePercent }
    },
  },

  // ── Azja ───────────────────────────────────────────────────────────────────
  {
    id: 'asia',
    name: 'Azja',
    flag: '🌏',
    compute(m) {
      const avgIndex = (m.indices.Nikkei.change1m + m.indices.FXI.change1m) / 2
      const avgIdx1d = (m.indices.Nikkei.changePercent + m.indices.FXI.changePercent) / 2
      // JPY, CNY, AUD jako koszyk azjatycki
      const currencyBasket = (m.currencies.JPYUSD.changePercent + m.currencies.CNYUSD.changePercent + m.currencies.AUDUSD.changePercent) / 3
      const components: RegionScoreComponent[] = [
        { ...contrib(avgIndex, 10, 0.30), name: 'Nikkei + FXI (30 dni)' },
        { ...contrib(avgIdx1d,  3, 0.10), name: 'Indeksy (1 dzień)' },
        { ...contrib(vixFactor(m.indices.VIX.price) * 18, 18, 0.15), name: 'VIX (globalny)' },
        { ...contrib(currencyBasket, 1.5, 0.20), name: 'JPY+CNY+AUD (kurs)' },
        { ...contrib(m.commodities.copper.changePercent, 3, 0.15), name: 'Miedź (przemysł)' },
        { ...contrib(-m.commodities.oil.change1m, 12, 0.10), name: 'Ropa (import)' },
      ]
      return { components, trend1d: avgIdx1d }
    },
  },

  // ── Rynki Wschodzące / Ameryka Łacińska ────────────────────────────────────
  {
    id: 'latam_em',
    name: 'Rynki Wschodzące',
    flag: '🌎',
    compute(m) {
      // EWZ = Brazil ETF jako proxy EM Latam
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.EWZ.change1m, 12, 0.30), name: 'EWZ EM (30 dni)' },
        { ...contrib(m.indices.EWZ.changePercent, 3,  0.10), name: 'EWZ EM (1 dzień)' },
        { ...contrib(vixFactor(m.indices.VIX.price) * 18, 18, 0.20), name: 'VIX (ryzyko)' },
        // EM korzysta na surowcach (eksporter)
        { ...contrib(m.commodities.oil.change1m, 12, 0.15), name: 'Ropa (eksport)' },
        { ...contrib(m.commodities.copper.change1m ?? m.commodities.copper.changePercent, 10, 0.10), name: 'Miedź (eksport)' },
        // Silny USD = zły dla EM (droższy dług)
        { ...contrib(-m.currencies.EURUSD.changePercent, 1.5, 0.15), name: 'USD (siła, ryzyko)' },
      ]
      return { components, trend1d: m.indices.EWZ.changePercent }
    },
  },

  // ── Sektor Surowcowy ────────────────────────────────────────────────────────
  {
    id: 'commodities',
    name: 'Surowce',
    flag: '🛢️',
    compute(m) {
      // Złoto i miedź mają 30d change; dla gazu i pszenicy tylko 1d
      const avgCommodity = (
        m.commodities.oil.change1m  +
        m.commodities.gold.change1m +
        m.commodities.oil.changePercent +
        m.commodities.copper.changePercent +
        m.commodities.gas.changePercent +
        m.commodities.wheat.changePercent
      ) / 6
      const components: RegionScoreComponent[] = [
        { ...contrib(m.commodities.gold.change1m, 8,   0.25), name: 'Złoto (30 dni)' },
        { ...contrib(m.commodities.oil.change1m,  12,  0.20), name: 'Ropa (30 dni)' },
        { ...contrib(m.commodities.copper.changePercent, 4, 0.20), name: 'Miedź (1 dzień)' },
        { ...contrib(m.commodities.gas.changePercent, 5,    0.15), name: 'Gaz (1 dzień)' },
        { ...contrib(m.commodities.wheat.changePercent, 4,  0.10), name: 'Pszenica (1 dzień)' },
        { ...contrib(vixFactor(m.indices.VIX.price) * 18, 18, 0.10), name: 'VIX (ryzyko)' },
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
