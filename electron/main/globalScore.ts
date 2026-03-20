// electron/main/globalScore.ts
// Deterministyczny algorytm oceny potencjału inwestycyjnego regionów (0-100).
// Wagi składowych są dynamiczne — zależą od aktualnego reżimu rynkowego.
// Każdy z 7 reżimów wpływa na wszystkie 9 regionów (różna siła per region).

import type { GlobalMarketData, RegionScore, RegionId, RegionScoreComponent, MarketRegime } from '../../src/lib/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function norm(value: number, range: number): number {
  return Math.max(-1, Math.min(1, value / range))
}

function contrib(rawValue: number, range: number, weight: number): RegionScoreComponent & { pts: number } {
  const n = norm(rawValue, range)
  const pts = n * weight * 50
  return { name: '', rawValue, contribution: pts, weight, pts }
}

function contribNorm(displayRaw: number, n: number, weight: number): RegionScoreComponent & { pts: number } {
  const clamped = Math.max(-1, Math.min(1, n))
  const pts = clamped * weight * 50
  return { name: '', rawValue: displayRaw, contribution: pts, weight, pts }
}

// VIX: poziom strachu — im wyższy VIX, tym niższy score
function vixFactor(vix: number): number {
  return norm(20 - vix, 18)
}

// US10Y yield: optimum ~3.0%, symetryczny zakres ±1.5%
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

// Normalizuje wagi tak by sumowały się do 1.0
function normalizeWeights(w: Record<string, number>): Record<string, number> {
  const sum = Object.values(w).reduce((a, b) => a + b, 0)
  if (sum === 0) return w
  const out: Record<string, number> = {}
  for (const k of Object.keys(w)) out[k] = w[k] / sum
  return out
}

// ─── Detekcja reżimu rynkowego ────────────────────────────────────────────────

export function detectMarketRegime(m: GlobalMarketData): MarketRegime {
  const vix   = m.indices.VIX.price
  const us10y = m.bonds.US10Y.price
  return {
    vixLevel:    vix > 30 ? 'panic' : vix >= 20 ? 'elevated' : 'calm',
    bondStress:  us10y > 5.0 ? 'shock' : us10y >= 4.0 ? 'elevated' : 'normal',
    oilShock:    Math.abs(m.commodities.oil.change1m) > 15,
    goldRally:   m.commodities.gold.change1m > 10,
    copperCrash: m.commodities.copper.change1m < -10,
    gasShock:    Math.abs(m.commodities.gas.change1m) > 20,
  }
}

// ─── Definicje regionów ───────────────────────────────────────────────────────

interface RegionDef {
  id: RegionId
  name: string
  flag: string
  compute: (m: GlobalMarketData, regime: MarketRegime) => { components: RegionScoreComponent[]; trend1d: number }
}

const REGIONS: RegionDef[] = [

  // ── Ameryka Północna ───────────────────────────────────────────────────────
  {
    id: 'north_america',
    name: 'Ameryka Północna',
    flag: '🌎',
    compute(m, regime) {
      let w = { ret30: 0.30, ret1d: 0.10, vix: 0.25, us10y: 0.15, oil: 0.10, eur: 0.10 }

      if (regime.vixLevel === 'panic')         { w.ret30 *= 0.15; w.ret1d *= 0.7; w.vix *= 2.5; w.us10y *= 1.5 }
      else if (regime.vixLevel === 'elevated') { w.ret30 *= 0.5; w.vix *= 1.7 }

      if (regime.bondStress === 'shock')           { w.us10y *= 2.5; w.ret30 *= 0.4 }
      else if (regime.bondStress === 'elevated')   { w.us10y *= 1.8; w.ret30 *= 0.7 }

      if (regime.oilShock)    { w.oil *= 1.5; w.ret30 *= 0.9 }
      if (regime.goldRally)   { w.vix *= 1.3; w.ret30 *= 0.8; w.eur *= 0.9 }
      if (regime.copperCrash) { w.vix *= 1.5; w.us10y *= 1.3; w.ret30 *= 0.5 }
      if (regime.gasShock)    { w.oil *= 1.2; w.ret30 *= 0.9 }

      const nw = normalizeWeights(w)
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.SP500.change1m,         10,  nw.ret30), name: 'S&P500 (30 dni)' },
        { ...contrib(m.indices.SP500.changePercent,     3,  nw.ret1d), name: 'S&P500 (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price,  vixFactor(m.indices.VIX.price),   nw.vix),   name: 'VIX (strach)' },
        { ...contribNorm(m.bonds.US10Y.price,  us10yFactor(m.bonds.US10Y.price), nw.us10y), name: 'US10Y Yield' },
        { ...contrib(m.commodities.oil.change1m,       15,  nw.oil), name: 'Ropa (eksport/prod.)' },
        { ...contrib(m.currencies.EURUSD.changePercent, 1.5, nw.eur), name: 'EUR/USD (płynność)' },
      ]
      return { components, trend1d: m.indices.SP500.changePercent }
    },
  },

  // ── Europa ─────────────────────────────────────────────────────────────────
  {
    id: 'europe',
    name: 'Europa',
    flag: '🇪🇺',
    compute(m, regime) {
      const avgIndex = (m.indices.DAX.change1m + m.indices.FTSE.change1m) / 2
      const avgIdx1d = (m.indices.DAX.changePercent + m.indices.FTSE.changePercent) / 2
      const currencyBasket = (
        m.currencies.EURUSD.changePercent +
        m.currencies.GBPUSD.changePercent +
        m.currencies.CHFUSD.changePercent
      ) / 3

      let w = { ret30: 0.30, ret1d: 0.10, vix: 0.20, currencies: 0.20, gas: 0.10, oil: 0.10 }

      if (regime.vixLevel === 'panic')         { w.ret30 *= 0.15; w.ret1d *= 0.7; w.vix *= 2.0; w.gas *= 1.3; w.currencies *= 0.7 }
      else if (regime.vixLevel === 'elevated') { w.ret30 *= 0.6; w.vix *= 1.5 }

      if (regime.bondStress === 'shock')           { w.currencies *= 1.8; w.ret30 *= 0.5; w.vix *= 1.3 }
      else if (regime.bondStress === 'elevated')   { w.currencies *= 1.4; w.ret30 *= 0.7 }

      if (regime.oilShock)    { w.oil *= 2.0; w.ret30 *= 0.7; w.vix *= 1.3 }
      if (regime.goldRally)   { w.vix *= 1.3; w.ret30 *= 0.8; w.currencies *= 0.9 }
      if (regime.copperCrash) { w.ret30 *= 0.5; w.vix *= 1.5; w.gas *= 0.8 }
      if (regime.gasShock)    { w.gas *= 3.5; w.ret30 *= 0.4; w.vix *= 1.5 }

      const nw = normalizeWeights(w)
      const components: RegionScoreComponent[] = [
        { ...contrib(avgIndex,         10,  nw.ret30),     name: 'DAX + FTSE (30 dni)' },
        { ...contrib(avgIdx1d,          3,  nw.ret1d),     name: 'Indeksy (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), nw.vix), name: 'VIX (strach)' },
        { ...contrib(currencyBasket,   1.5, nw.currencies), name: 'EUR+GBP+CHF (kurs)' },
        { ...contrib(-m.commodities.gas.change1m, 20, nw.gas), name: 'Gaz (import)' },
        { ...contrib(-m.commodities.oil.change1m, 15, nw.oil), name: 'Ropa (import)' },
      ]
      return { components, trend1d: avgIdx1d }
    },
  },

  // ── Azja ───────────────────────────────────────────────────────────────────
  {
    id: 'asia',
    name: 'Azja',
    flag: '🌏',
    compute(m, regime) {
      const avgIndex = (m.indices.Nikkei.change1m + m.indices.FXI.change1m + m.indices.INDA.change1m) / 3
      const avgIdx1d = (m.indices.Nikkei.changePercent + m.indices.FXI.changePercent + m.indices.INDA.changePercent) / 3
      const currencyBasket = (m.currencies.JPYUSD.changePercent + m.currencies.CNYUSD.changePercent) / 2

      let w = { ret30: 0.30, ret1d: 0.10, vix: 0.15, currencies: 0.20, copper: 0.15, oil: 0.10 }

      if (regime.vixLevel === 'panic')         { w.ret30 *= 0.15; w.ret1d *= 0.7; w.vix *= 2.0; w.currencies *= 1.5 }
      else if (regime.vixLevel === 'elevated') { w.ret30 *= 0.5; w.vix *= 1.5; w.currencies *= 1.2 }

      if (regime.bondStress === 'shock')           { w.currencies *= 1.8; w.ret30 *= 0.4; w.vix *= 1.3 }
      else if (regime.bondStress === 'elevated')   { w.currencies *= 1.4; w.ret30 *= 0.6 }

      if (regime.oilShock)    { w.oil *= 2.0; w.ret30 *= 0.6; w.vix *= 1.3 }
      if (regime.goldRally)   { w.vix *= 1.3; w.currencies *= 1.1; w.ret30 *= 0.8 }
      if (regime.copperCrash) { w.copper *= 2.5; w.ret30 *= 0.3; w.vix *= 1.5 }
      if (regime.gasShock)    { w.vix *= 1.5; w.currencies *= 1.3; w.ret30 *= 0.5 }

      const nw = normalizeWeights(w)
      const components: RegionScoreComponent[] = [
        { ...contrib(avgIndex,       10,  nw.ret30),     name: 'Nikkei+FXI+INDA (30 dni)' },
        { ...contrib(avgIdx1d,        3,  nw.ret1d),     name: 'Indeksy (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), nw.vix), name: 'VIX (globalny)' },
        { ...contrib(currencyBasket, 1.5, nw.currencies), name: 'JPY+CNY (kurs)' },
        { ...contrib(m.commodities.copper.change1m, 10, nw.copper), name: 'Miedź (przemysł)' },
        { ...contrib(-m.commodities.oil.change1m,   12, nw.oil),   name: 'Ropa (import)' },
      ]
      return { components, trend1d: avgIdx1d }
    },
  },

  // ── Rynki Wschodzące (szeroki EM: VWO) ────────────────────────────────────
  {
    id: 'latam_em',
    name: 'Rynki Wschodzące',
    flag: '🌎',
    compute(m, regime) {
      let w = { ret30: 0.35, ret1d: 0.10, vix: 0.20, oil: 0.15, copper: 0.05, usd: 0.15 }

      if (regime.vixLevel === 'panic')         { w.ret30 *= 0.15; w.ret1d *= 0.7; w.vix *= 2.0; w.usd *= 1.8 }
      else if (regime.vixLevel === 'elevated') { w.ret30 *= 0.5; w.vix *= 1.5; w.usd *= 1.3 }

      if (regime.bondStress === 'shock')           { w.usd *= 2.5; w.ret30 *= 0.2; w.vix *= 1.5 }
      else if (regime.bondStress === 'elevated')   { w.usd *= 1.8; w.ret30 *= 0.5 }

      if (regime.oilShock)    { w.oil *= 1.5; w.ret30 *= 0.8 }
      if (regime.goldRally)   { w.vix *= 1.2; w.usd *= 1.2; w.ret30 *= 0.8 }
      if (regime.copperCrash) { w.copper *= 2.0; w.usd *= 1.5; w.ret30 *= 0.3 }
      if (regime.gasShock)    { w.vix *= 1.2; w.ret30 *= 0.8 }

      const nw = normalizeWeights(w)
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.VWO.change1m,       12,  nw.ret30),  name: 'VWO EM (30 dni)' },
        { ...contrib(m.indices.VWO.changePercent,   3,  nw.ret1d),  name: 'VWO EM (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), nw.vix), name: 'VIX (ryzyko)' },
        { ...contrib(m.commodities.oil.change1m,   12,  nw.oil),    name: 'Ropa (eksport)' },
        { ...contrib(m.commodities.copper.change1m, 10, nw.copper), name: 'Miedź (eksport)' },
        { ...contrib(-m.currencies.EURUSD.changePercent, 1.5, nw.usd), name: 'USD (siła, ryzyko)' },
      ]
      return { components, trend1d: m.indices.VWO.changePercent }
    },
  },

  // ── Rynki Rozwinięte (koszyk: SP500 + DAX + Nikkei + FTSE + ASX200) ───────
  {
    id: 'developed_markets',
    name: 'Rynki Rozwinięte',
    flag: '🏦',
    compute(m, regime) {
      const avgIdx1d = (
        m.indices.SP500.changePercent +
        m.indices.DAX.changePercent   +
        m.indices.Nikkei.changePercent +
        m.indices.FTSE.changePercent
      ) / 4
      const dmCurrencyBasket = (
        m.currencies.EURUSD.changePercent +
        m.currencies.GBPUSD.changePercent +
        m.currencies.JPYUSD.changePercent
      ) / 3

      let w = { sp500: 0.20, dax: 0.15, nikkei: 0.15, ftse: 0.10, asx: 0.05, vix: 0.10, us10y: 0.15, currencies: 0.10 }

      if (regime.vixLevel === 'panic') {
        w.sp500 *= 0.15; w.dax *= 0.15; w.nikkei *= 0.15; w.ftse *= 0.15; w.asx *= 0.15
        w.vix *= 2.0; w.us10y *= 1.5; w.currencies *= 0.7
      } else if (regime.vixLevel === 'elevated') {
        w.sp500 *= 0.5; w.dax *= 0.5; w.nikkei *= 0.5; w.ftse *= 0.5; w.asx *= 0.5
        w.vix *= 1.7; w.us10y *= 1.2
      }

      if (regime.bondStress === 'shock') {
        w.us10y *= 2.5; w.sp500 *= 0.3; w.dax *= 0.3; w.nikkei *= 0.3; w.ftse *= 0.3; w.asx *= 0.3
      } else if (regime.bondStress === 'elevated') {
        w.us10y *= 1.8; w.sp500 *= 0.6; w.dax *= 0.6; w.nikkei *= 0.6; w.ftse *= 0.6
      }

      if (regime.oilShock)    { w.vix *= 1.3; w.sp500 *= 0.8; w.dax *= 0.8; w.nikkei *= 0.8; w.ftse *= 0.8 }
      if (regime.goldRally)   { w.vix *= 1.3; w.us10y *= 1.2; w.sp500 *= 0.8; w.dax *= 0.8; w.nikkei *= 0.8; w.ftse *= 0.8 }
      if (regime.copperCrash) { w.vix *= 1.5; w.us10y *= 1.3; w.sp500 *= 0.4; w.dax *= 0.4; w.nikkei *= 0.4; w.ftse *= 0.4; w.asx *= 0.4 }
      if (regime.gasShock)    { w.vix *= 1.5; w.sp500 *= 0.6; w.dax *= 0.6; w.nikkei *= 0.6; w.ftse *= 0.6; w.asx *= 0.6 }

      const nw = normalizeWeights(w)
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.SP500.change1m,   10, nw.sp500),     name: 'S&P500 (30 dni)' },
        { ...contrib(m.indices.DAX.change1m,     10, nw.dax),       name: 'DAX (30 dni)' },
        { ...contrib(m.indices.Nikkei.change1m,  10, nw.nikkei),    name: 'Nikkei (30 dni)' },
        { ...contrib(m.indices.FTSE.change1m,    10, nw.ftse),      name: 'FTSE (30 dni)' },
        { ...contrib(m.indices.ASX200.change1m,  10, nw.asx),       name: 'ASX200 (30 dni)' },
        { ...contribNorm(m.indices.VIX.price,  vixFactor(m.indices.VIX.price),   nw.vix),   name: 'VIX (ryzyko)' },
        { ...contribNorm(m.bonds.US10Y.price,  us10yFactor(m.bonds.US10Y.price), nw.us10y), name: 'US10Y Yield' },
        { ...contrib(dmCurrencyBasket, 1.5, nw.currencies), name: 'EUR+GBP+JPY (kurs)' },
      ]
      return { components, trend1d: avgIdx1d }
    },
  },

  // ── Australia / Oceania ────────────────────────────────────────────────────
  {
    id: 'australia_oceania',
    name: 'Australia i Oceania',
    flag: '🇦🇺',
    compute(m, regime) {
      let w = { ret30: 0.35, ret1d: 0.10, vix: 0.20, aud: 0.15, gold: 0.10, copper: 0.10 }

      if (regime.vixLevel === 'panic')         { w.ret30 *= 0.15; w.ret1d *= 0.7; w.vix *= 2.0; w.gold *= 1.3 }
      else if (regime.vixLevel === 'elevated') { w.ret30 *= 0.5; w.vix *= 1.5 }

      if (regime.bondStress === 'shock')           { w.aud *= 1.5; w.ret30 *= 0.5; w.vix *= 1.2 }
      else if (regime.bondStress === 'elevated')   { w.aud *= 1.3; w.ret30 *= 0.7 }

      if (regime.oilShock)    { w.copper *= 1.3; w.gold *= 1.2; w.ret30 *= 0.9 }
      if (regime.goldRally)   { w.gold *= 2.0; w.ret30 *= 0.8 }
      if (regime.copperCrash) { w.copper *= 2.5; w.ret30 *= 0.3; w.aud *= 1.2 }
      if (regime.gasShock)    { w.vix *= 1.2; w.ret30 *= 0.9 }

      const nw = normalizeWeights(w)
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.ASX200.change1m,      10,  nw.ret30), name: 'ASX200 (30 dni)' },
        { ...contrib(m.indices.ASX200.changePercent,  3,  nw.ret1d), name: 'ASX200 (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), nw.vix), name: 'VIX (globalny)' },
        { ...contrib(m.currencies.AUDUSD.changePercent, 1.5, nw.aud),    name: 'AUD/USD (kurs)' },
        { ...contrib(m.commodities.gold.change1m,    8,   nw.gold),   name: 'Złoto (eksport)' },
        { ...contrib(m.commodities.copper.change1m,  10,  nw.copper), name: 'Miedź (eksport)' },
      ]
      return { components, trend1d: m.indices.ASX200.changePercent }
    },
  },

  // ── Afryka (proxy: Republika Południowej Afryki) ───────────────────────────
  {
    id: 'africa',
    name: 'Afryka',
    flag: '🌍',
    compute(m, regime) {
      let w = { ret30: 0.30, ret1d: 0.10, vix: 0.15, usd: 0.15, gold: 0.20, copper: 0.10 }

      if (regime.vixLevel === 'panic')         { w.ret30 *= 0.15; w.ret1d *= 0.7; w.vix *= 1.8; w.gold *= 1.8; w.usd *= 2.0 }
      else if (regime.vixLevel === 'elevated') { w.ret30 *= 0.5; w.vix *= 1.4; w.gold *= 1.3 }

      if (regime.bondStress === 'shock')           { w.usd *= 2.0; w.ret30 *= 0.3; w.vix *= 1.3 }
      else if (regime.bondStress === 'elevated')   { w.usd *= 1.5; w.ret30 *= 0.6 }

      if (regime.oilShock)    { w.gold *= 1.2; w.copper *= 1.2; w.ret30 *= 0.8 }
      if (regime.goldRally)   { w.gold *= 2.5; w.ret30 *= 0.7; w.vix *= 1.2 }
      if (regime.copperCrash) { w.copper *= 2.0; w.gold *= 1.5; w.ret30 *= 0.3 }
      if (regime.gasShock)    { w.vix *= 1.2; w.ret30 *= 0.9 }

      const nw = normalizeWeights(w)
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.EZA.change1m,          12,  nw.ret30), name: 'EZA SA (30 dni)' },
        { ...contrib(m.indices.EZA.changePercent,       3,  nw.ret1d), name: 'EZA SA (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), nw.vix), name: 'VIX (ryzyko)' },
        { ...contrib(-m.currencies.EURUSD.changePercent, 1.5, nw.usd),    name: 'USD (siła, ryzyko)' },
        { ...contrib(m.commodities.gold.change1m,       8,   nw.gold),   name: 'Złoto (eksport)' },
        { ...contrib(m.commodities.copper.change1m,     10,  nw.copper), name: 'Miedź (eksport)' },
      ]
      return { components, trend1d: m.indices.EZA.changePercent }
    },
  },

  // ── Ameryka Południowa (proxy: Bovespa — Brazylia) ─────────────────────────
  {
    id: 'south_america',
    name: 'Ameryka Płd.',
    flag: '🌎',
    compute(m, regime) {
      let w = { ret30: 0.30, ret1d: 0.10, vix: 0.15, usd: 0.15, oil: 0.20, copper: 0.10 }

      if (regime.vixLevel === 'panic')         { w.ret30 *= 0.15; w.ret1d *= 0.7; w.vix *= 2.0; w.usd *= 2.0 }
      else if (regime.vixLevel === 'elevated') { w.ret30 *= 0.5; w.vix *= 1.5; w.usd *= 1.3 }

      if (regime.bondStress === 'shock')           { w.usd *= 2.0; w.ret30 *= 0.3; w.vix *= 1.3 }
      else if (regime.bondStress === 'elevated')   { w.usd *= 1.5; w.ret30 *= 0.6 }

      if (regime.oilShock)    { w.oil *= 2.5; w.ret30 *= 0.8 }
      if (regime.goldRally)   { w.vix *= 1.2; w.ret30 *= 0.8 }
      if (regime.copperCrash) { w.copper *= 2.5; w.ret30 *= 0.3 }
      if (regime.gasShock)    { w.oil *= 1.2; w.ret30 *= 0.9 }

      const nw = normalizeWeights(w)
      const components: RegionScoreComponent[] = [
        { ...contrib(m.indices.BVSP.change1m,          12,  nw.ret30),  name: 'Bovespa (30 dni)' },
        { ...contrib(m.indices.BVSP.changePercent,       3,  nw.ret1d),  name: 'Bovespa (1 dzień)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), nw.vix), name: 'VIX (ryzyko)' },
        { ...contrib(-m.currencies.EURUSD.changePercent, 1.5, nw.usd),    name: 'USD (siła, ryzyko)' },
        { ...contrib(m.commodities.oil.change1m,        12,  nw.oil),    name: 'Ropa (eksport)' },
        { ...contrib(m.commodities.copper.change1m,     10,  nw.copper), name: 'Miedź (eksport)' },
      ]
      return { components, trend1d: m.indices.BVSP.changePercent }
    },
  },

  // ── Sektor Surowcowy ────────────────────────────────────────────────────────
  {
    id: 'commodities',
    name: 'Surowce',
    flag: '🛢️',
    compute(m, regime) {
      const avgCommodity = (
        m.commodities.oil.changePercent    +
        m.commodities.gold.changePercent   +
        m.commodities.copper.changePercent +
        m.commodities.gas.changePercent    +
        m.commodities.wheat.changePercent
      ) / 5

      let w = { gold: 0.25, oil: 0.20, copper: 0.20, gas: 0.15, wheat: 0.10, vix: 0.10 }

      if (regime.vixLevel === 'panic')         { w.vix *= 2.0; w.gold *= 1.5; w.oil *= 0.8; w.wheat *= 0.8 }
      else if (regime.vixLevel === 'elevated') { w.vix *= 1.5; w.gold *= 1.2 }

      if (regime.bondStress === 'shock')           { w.gold *= 0.7; w.oil *= 1.2 }
      else if (regime.bondStress === 'elevated')   { w.gold *= 0.85 }

      if (regime.oilShock)    { w.oil *= 2.5 }
      if (regime.goldRally)   { w.gold *= 2.5 }
      if (regime.copperCrash) { w.copper *= 2.5; w.oil *= 0.8 }
      if (regime.gasShock)    { w.gas *= 3.5 }

      const nw = normalizeWeights(w)
      const components: RegionScoreComponent[] = [
        { ...contrib(m.commodities.gold.change1m,    8,  nw.gold),   name: 'Złoto (30 dni)' },
        { ...contrib(m.commodities.oil.change1m,    12,  nw.oil),    name: 'Ropa (30 dni)' },
        { ...contrib(m.commodities.copper.change1m, 10,  nw.copper), name: 'Miedź (30 dni)' },
        { ...contrib(m.commodities.gas.change1m,    25,  nw.gas),    name: 'Gaz (30 dni)' },
        { ...contrib(m.commodities.wheat.change1m,  15,  nw.wheat),  name: 'Pszenica (30 dni)' },
        { ...contribNorm(m.indices.VIX.price, vixFactor(m.indices.VIX.price), nw.vix), name: 'VIX (ryzyko)' },
      ]
      return { components, trend1d: avgCommodity }
    },
  },
]

// ─── Regime summary (eksportowana — używana przez ai i dev-api-plugin) ────────

export function buildRegimeSummary(regime: MarketRegime): string | null {
  const parts: string[] = []
  if (regime.vixLevel === 'panic') parts.push('VIX panika')
  else if (regime.vixLevel === 'elevated') parts.push('VIX podwyższony')
  if (regime.bondStress === 'shock') parts.push('szok obligacyjny (US10Y >5%)')
  else if (regime.bondStress === 'elevated') parts.push('napięcie obligacyjne (US10Y 4-5%)')
  if (regime.oilShock) parts.push('szok naftowy')
  if (regime.goldRally) parts.push('rajd złota')
  if (regime.copperCrash) parts.push('wyprzedaż miedzi')
  if (regime.gasShock) parts.push('szok gazowy')
  return parts.length > 0 ? parts.join(', ') : null
}

// ─── Główna funkcja ───────────────────────────────────────────────────────────

export function computeGlobalScores(marketData: GlobalMarketData, regime?: MarketRegime): RegionScore[] {
  const r = regime ?? detectMarketRegime(marketData)
  return REGIONS.map(region => {
    const { components, trend1d } = region.compute(marketData, r)
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
        weight:       Math.round(c.weight * 1000) / 1000,
      })),
    }
  })
}
