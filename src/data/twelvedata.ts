import type { Bar, Ticker, Timeframe } from '../types';

const BASE = 'https://api.twelvedata.com';
let apiKey = '';
export const setTwelveDataKey = (k: string) => { apiKey = k.trim(); };
export const hasOwnKey = () => !!apiKey;
const key = () => apiKey || 'demo';

const TF_MAP: Partial<Record<Timeframe, string>> = {
  '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '1h', '2h': '2h', '4h': '4h', '1d': '1day', '1w': '1week', '1M': '1month',
};
export const TD_TIMEFRAMES = Object.keys(TF_MAP) as Timeframe[];

export class TwelveDataError extends Error {
  needsKey: boolean;
  constructor(msg: string, needsKey = false) { super(msg); this.needsKey = needsKey; }
}

function parseTime(dt: string): number {
  return dt.length === 10
    ? Math.floor(Date.parse(`${dt}T00:00:00Z`) / 1000)
    : Math.floor(Date.parse(dt.replace(' ', 'T') + 'Z') / 1000);
}

const cache = new Map<string, { ts: number; data: Bar[] }>();

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apikey', key());
  const r = await fetch(url.toString());
  const j = await r.json();
  if (j.status === 'error' || j.code) {
    const msg: string = j.message || 'Error de Twelve Data';
    const needsKey = !apiKey || /api ?key|demo|credits|limit/i.test(msg);
    throw new TwelveDataError(
      needsKey && !apiKey
        ? 'Este mercado necesita una API key gratuita de Twelve Data. Cargala en Ajustes.'
        : /credits|limit/i.test(msg) ? 'Se agotaron los créditos por minuto de Twelve Data. Esperá un minuto.' : msg,
      needsKey,
    );
  }
  return j as T;
}

export async function fetchKlines(symbol: string, tf: Timeframe, endTimeSec?: number): Promise<Bar[]> {
  const interval = TF_MAP[tf];
  if (!interval) throw new TwelveDataError(`Temporalidad ${tf} no disponible para este mercado.`);
  const ck = `${symbol}|${tf}|${endTimeSec ?? ''}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.ts < 30000) return hit.data;
  const params: Record<string, string> = { symbol, interval, outputsize: '1500', timezone: 'UTC', order: 'ASC' };
  if (endTimeSec) params.end_date = new Date((endTimeSec - 1) * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const j = await call<{ values?: { datetime: string; open: string; high: string; low: string; close: string; volume?: string }[] }>('/time_series', params);
  const bars = (j.values ?? []).map((v) => ({
    time: parseTime(v.datetime), open: +v.open, high: +v.high, low: +v.low, close: +v.close, volume: +(v.volume ?? 0),
  })).sort((a, b) => a.time - b.time);
  cache.set(ck, { ts: Date.now(), data: bars });
  return bars;
}

export async function fetchQuote(symbol: string): Promise<Ticker> {
  const q = await call<{ close: string; open: string; high: string; low: string; volume?: string; percent_change: string; previous_close: string }>('/quote', { symbol });
  return {
    symbol, last: +q.close, open: +q.previous_close || +q.open, high: +q.high, low: +q.low,
    volume: +(q.volume ?? 0), quoteVolume: 0, changePct: +q.percent_change,
  };
}
