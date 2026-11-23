import type { Bar, IndicatorType } from '../types';

export type Val = number | null;

export interface IndicatorDef {
  type: IndicatorType;
  name: string;
  short: string;
  category: 'Tendencia' | 'Osciladores' | 'Volatilidad' | 'Volumen';
  overlay: boolean; // drawn on price pane
  params: { key: string; label: string; def: number; step?: number; min?: number }[];
  color: string;
  description: string;
}

export const INDICATORS: IndicatorDef[] = [
  { type: 'ema', name: 'Media móvil exponencial', short: 'EMA', category: 'Tendencia', overlay: true, color: '#f7a600',
    params: [{ key: 'period', label: 'Período', def: 20, min: 1 }], description: 'Promedio ponderado que reacciona rápido al precio.' },
  { type: 'sma', name: 'Media móvil simple', short: 'SMA', category: 'Tendencia', overlay: true, color: '#26c6da',
    params: [{ key: 'period', label: 'Período', def: 50, min: 1 }], description: 'Promedio aritmético de los últimos N cierres.' },
  { type: 'bb', name: 'Bandas de Bollinger', short: 'BB', category: 'Volatilidad', overlay: true, color: '#7e57c2',
    params: [{ key: 'period', label: 'Período', def: 20, min: 2 }, { key: 'mult', label: 'Desvío', def: 2, step: 0.1, min: 0.1 }],
    description: 'Media ± desvíos estándar. Mide la expansión y contracción de la volatilidad.' },
  { type: 'vwap', name: 'VWAP (sesión diaria)', short: 'VWAP', category: 'Volumen', overlay: true, color: '#e91e63',
    params: [], description: 'Precio promedio ponderado por volumen, se reinicia cada día (UTC).' },
  { type: 'supertrend', name: 'SuperTrend', short: 'ST', category: 'Tendencia', overlay: true, color: '#089981',
    params: [{ key: 'period', label: 'Período ATR', def: 10, min: 1 }, { key: 'mult', label: 'Multiplicador', def: 3, step: 0.1, min: 0.1 }],
    description: 'Stop dinámico basado en ATR que cambia de color según la tendencia.' },
  { type: 'volume', name: 'Volumen', short: 'Vol', category: 'Volumen', overlay: true, color: '#787b86',
    params: [{ key: 'ma', label: 'Media de volumen', def: 20, min: 0 }], description: 'Volumen operado por vela, coloreado por dirección.' },
  { type: 'rsi', name: 'Índice de fuerza relativa', short: 'RSI', category: 'Osciladores', overlay: false, color: '#ab47bc',
    params: [{ key: 'period', label: 'Período', def: 14, min: 2 }], description: 'Oscilador 0–100. Sobrecompra > 70, sobreventa < 30.' },
  { type: 'macd', name: 'MACD', short: 'MACD', category: 'Osciladores', overlay: false, color: '#2962ff',
    params: [{ key: 'fast', label: 'Rápida', def: 12, min: 1 }, { key: 'slow', label: 'Lenta', def: 26, min: 1 }, { key: 'signal', label: 'Señal', def: 9, min: 1 }],
    description: 'Diferencia entre dos EMAs con línea de señal e histograma.' },
  { type: 'stoch', name: 'Estocástico', short: 'Stoch', category: 'Osciladores', overlay: false, color: '#2962ff',
    params: [{ key: 'k', label: '%K', def: 14, min: 1 }, { key: 'smooth', label: 'Suavizado %K', def: 3, min: 1 }, { key: 'd', label: '%D', def: 3, min: 1 }],
    description: 'Ubica el cierre dentro del rango reciente. Sobrecompra > 80, sobreventa < 20.' },
  { type: 'atr', name: 'Rango verdadero promedio', short: 'ATR', category: 'Volatilidad', overlay: false, color: '#ef5350',
    params: [{ key: 'period', label: 'Período', def: 14, min: 1 }], description: 'Volatilidad promedio por vela. Útil para ubicar stops.' },
  { type: 'obv', name: 'On Balance Volume', short: 'OBV', category: 'Volumen', overlay: false, color: '#26a69a',
    params: [], description: 'Volumen acumulado según la dirección del cierre. Confirma tendencias.' },
];

export const indicatorDef = (t: IndicatorType) => INDICATORS.find((d) => d.type === t)!;

export function defaultParams(t: IndicatorType): Record<string, number> {
  return Object.fromEntries(indicatorDef(t).params.map((p) => [p.key, p.def]));
}

export function indicatorLabel(t: IndicatorType, params: Record<string, number>) {
  const def = indicatorDef(t);
  const vals = def.params.map((p) => params[p.key] ?? p.def);
  return vals.length ? `${def.short} ${vals.join(' ')}` : def.short;
}

/* ---------------- math ---------------- */

export function sma(src: number[], n: number): Val[] {
  const out: Val[] = new Array(src.length).fill(null);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= n) sum -= src[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(src: number[], n: number): Val[] {
  const out: Val[] = new Array(src.length).fill(null);
  const k = 2 / (n + 1);
  let prev: number | null = null;
  let seed = 0;
  for (let i = 0; i < src.length; i++) {
    if (prev === null) {
      seed += src[i];
      if (i === n - 1) { prev = seed / n; out[i] = prev; }
    } else {
      prev = src[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** EMA over a series that may start with nulls */
function emaNullable(src: Val[], n: number): Val[] {
  const start = src.findIndex((v) => v !== null);
  if (start < 0) return src.map(() => null);
  const part = ema(src.slice(start) as number[], n);
  return [...new Array(start).fill(null), ...part];
}

function rma(src: number[], n: number): Val[] {
  const out: Val[] = new Array(src.length).fill(null);
  let prev: number | null = null;
  let seed = 0;
  for (let i = 0; i < src.length; i++) {
    if (prev === null) {
      seed += src[i];
      if (i === n - 1) { prev = seed / n; out[i] = prev; }
    } else {
      prev = (prev * (n - 1) + src[i]) / n;
      out[i] = prev;
    }
  }
  return out;
}

export function trueRange(bars: Bar[]): number[] {
  return bars.map((b, i) => i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)));
}

export function atr(bars: Bar[], n: number) { return rma(trueRange(bars), n); }

export function rsi(close: number[], n: number): Val[] {
  const gains: number[] = [0], losses: number[] = [0];
  for (let i = 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const g = rma(gains.slice(1), n), l = rma(losses.slice(1), n);
  return [null, ...g.map((gv, i) => {
    const lv = l[i];
    if (gv === null || lv === null) return null;
    if (lv === 0) return 100;
    return 100 - 100 / (1 + gv / lv);
  })];
}

export function bollinger(close: number[], n: number, mult: number) {
  const mid = sma(close, n);
  const upper: Val[] = [], lower: Val[] = [];
  for (let i = 0; i < close.length; i++) {
    const m = mid[i];
    if (m === null) { upper.push(null); lower.push(null); continue; }
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (close[j] - m) ** 2;
    const sd = Math.sqrt(s / n);
    upper.push(m + mult * sd);
    lower.push(m - mult * sd);
  }
  return { mid, upper, lower };
}

export function macd(close: number[], fast: number, slow: number, signal: number) {
  const f = ema(close, fast), s = ema(close, slow);
  const line: Val[] = f.map((v, i) => (v === null || s[i] === null ? null : v - (s[i] as number)));
  const sig = emaNullable(line, signal);
  const hist: Val[] = line.map((v, i) => (v === null || sig[i] === null ? null : v - (sig[i] as number)));
  return { line, signal: sig, hist };
}

export function stochastic(bars: Bar[], kLen: number, smooth: number, dLen: number) {
  const raw: Val[] = bars.map((_, i) => {
    if (i < kLen - 1) return null;
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kLen + 1; j <= i; j++) { hh = Math.max(hh, bars[j].high); ll = Math.min(ll, bars[j].low); }
    return hh === ll ? 50 : ((bars[i].close - ll) / (hh - ll)) * 100;
  });
  const smaNullable = (src: Val[], n: number): Val[] => {
    const start = src.findIndex((v) => v !== null);
    if (start < 0) return src.map(() => null);
    return [...new Array(start).fill(null), ...sma(src.slice(start) as number[], n)];
  };
  const k = smaNullable(raw, smooth);
  const d = smaNullable(k, dLen);
  return { k, d };
}

export function vwap(bars: Bar[]): Val[] {
  let day = -1, pv = 0, vol = 0;
  return bars.map((b) => {
    const d = Math.floor(b.time / 86400);
    if (d !== day) { day = d; pv = 0; vol = 0; }
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume;
    vol += b.volume;
    return vol ? pv / vol : tp;
  });
}

export function obv(bars: Bar[]): Val[] {
  let acc = 0;
  return bars.map((b, i) => {
    if (i > 0) {
      if (b.close > bars[i - 1].close) acc += b.volume;
      else if (b.close < bars[i - 1].close) acc -= b.volume;
    }
    return acc;
  });
}

export function supertrend(bars: Bar[], n: number, mult: number) {
  const a = atr(bars, n);
  const up: Val[] = [], down: Val[] = [];
  let fu = 0, fl = 0, dir = 1;
  for (let i = 0; i < bars.length; i++) {
    const av = a[i];
    if (av === null) { up.push(null); down.push(null); continue; }
    const hl2 = (bars[i].high + bars[i].low) / 2;
    const bu = hl2 + mult * av, bl = hl2 - mult * av;
    const prevClose = i > 0 ? bars[i - 1].close : bars[i].close;
    const pfu = fu, pfl = fl;
    fu = pfu === 0 || bu < pfu || prevClose > pfu ? bu : pfu;
    fl = pfl === 0 || bl > pfl || prevClose < pfl ? bl : pfl;
    if (dir === 1 && bars[i].close < fl) dir = -1;
    else if (dir === -1 && bars[i].close > fu) dir = 1;
    up.push(dir === 1 ? fl : null);
    down.push(dir === -1 ? fu : null);
  }
  return { up, down };
}

export function heikinAshi(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const close = (b.open + b.high + b.low + b.close) / 4;
    const open = i === 0 ? (b.open + b.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({ time: b.time, open, close, high: Math.max(b.high, open, close), low: Math.min(b.low, open, close), volume: b.volume });
  }
  return out;
}
