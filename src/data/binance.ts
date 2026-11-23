import type { Bar, SymbolInfo, Ticker, Timeframe } from '../types';
import { crypto } from './symbols';

const REST_HOSTS = ['https://api.binance.com/api/v3', 'https://data-api.binance.vision/api/v3'];
let restIdx = 0;

async function rest<T>(path: string): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < REST_HOSTS.length; i++) {
    const host = REST_HOSTS[(restIdx + i) % REST_HOSTS.length];
    try {
      const r = await fetch(host + path);
      if (!r.ok) {
        const body = await r.text();
        if (r.status === 400) throw Object.assign(new Error(body), { fatal: true });
        throw new Error(`HTTP ${r.status}`);
      }
      restIdx = (restIdx + i) % REST_HOSTS.length;
      return (await r.json()) as T;
    } catch (e) {
      lastErr = e;
      if ((e as { fatal?: boolean }).fatal) throw e;
    }
  }
  throw lastErr;
}

type RawKline = [number, string, string, string, string, string, number, string, number, string, string, string];

const toBar = (k: RawKline): Bar => ({
  time: Math.floor(k[0] / 1000),
  open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
});

export async function fetchKlines(symbol: string, tf: Timeframe, endTimeSec?: number, limit = 1000): Promise<Bar[]> {
  let q = `/klines?symbol=${symbol}&interval=${tf}&limit=${limit}`;
  if (endTimeSec) q += `&endTime=${endTimeSec * 1000 - 1}`;
  const raw = await rest<RawKline[]>(q);
  return raw.map(toBar);
}

interface Raw24 { symbol: string; lastPrice: string; openPrice: string; highPrice: string; lowPrice: string; volume: string; quoteVolume: string; priceChangePercent: string }

const to24 = (r: Raw24): Ticker => ({
  symbol: r.symbol, last: +r.lastPrice, open: +r.openPrice, high: +r.highPrice, low: +r.lowPrice,
  volume: +r.volume, quoteVolume: +r.quoteVolume, changePct: +r.priceChangePercent,
});

export async function fetchTickers(symbols: string[]): Promise<Ticker[]> {
  if (!symbols.length) return [];
  // Invalid symbols make the whole request fail, so fall back to one by one.
  try {
    const raw = await rest<Raw24[]>(`/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
    return raw.map(to24);
  } catch {
    const out: Ticker[] = [];
    await Promise.all(symbols.map(async (s) => {
      try { out.push(to24(await rest<Raw24>(`/ticker/24hr?symbol=${s}`))); } catch { /* skip */ }
    }));
    return out;
  }
}

let allSymbolsPromise: Promise<SymbolInfo[]> | null = null;
export function fetchAllCryptoSymbols(): Promise<SymbolInfo[]> {
  if (!allSymbolsPromise) {
    allSymbolsPromise = rest<{ symbol: string; quoteVolume: string; count: number }[]>('/ticker/24hr?type=MINI')
      .then((list) => list
        .filter((t) => /(USDT|FDUSD|USDC|BTC|ETH)$/.test(t.symbol) && +t.quoteVolume > 0)
        .sort((a, b) => +b.quoteVolume - +a.quoteVolume)
        .map((t) => crypto(t.symbol)))
      .catch((e) => { allSymbolsPromise = null; throw e; });
  }
  return allSymbolsPromise;
}

/* ------------------------------------------------------------------ */
/* Shared WebSocket: one connection, dynamic SUBSCRIBE/UNSUBSCRIBE    */
/* ------------------------------------------------------------------ */

export type ConnStatus = 'connecting' | 'live' | 'offline';
type Handler = (data: any) => void;

const WS_HOSTS = ['wss://stream.binance.com:9443/stream', 'wss://data-stream.binance.vision/stream'];

class StreamManager {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private reqId = 1;
  private hostIdx = 0;
  private failures = 0;
  private reconnectTimer: number | null = null;
  private statusListeners = new Set<(s: ConnStatus) => void>();
  status: ConnStatus = 'offline';

  onStatus(fn: (s: ConnStatus) => void) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => { this.statusListeners.delete(fn); };
  }

  private setStatus(s: ConnStatus) {
    this.status = s;
    this.statusListeners.forEach((f) => f(s));
  }

  subscribe(stream: string, fn: Handler): () => void {
    let set = this.handlers.get(stream);
    const isNew = !set;
    if (!set) { set = new Set(); this.handlers.set(stream, set); }
    set.add(fn);
    if (isNew) this.send('SUBSCRIBE', [stream]);
    this.ensure();
    return () => {
      const s = this.handlers.get(stream);
      if (!s) return;
      s.delete(fn);
      if (s.size === 0) {
        this.handlers.delete(stream);
        this.send('UNSUBSCRIBE', [stream]);
      }
    };
  }

  /** Reconnect right away (used when the network or the tab comes back). */
  kick() {
    if (this.ws || !this.handlers.size) return;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.failures = 0;
    this.connect();
  }

  private send(method: string, params: string[]) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method, params, id: this.reqId++ }));
    }
  }

  private ensure() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.reconnectTimer) return;
    this.connect();
  }

  private connect() {
    this.setStatus('connecting');
    const ws = new WebSocket(WS_HOSTS[this.hostIdx]);
    this.ws = ws;
    ws.onopen = () => {
      this.failures = 0;
      this.setStatus('live');
      const streams = [...this.handlers.keys()];
      for (let i = 0; i < streams.length; i += 100) this.send('SUBSCRIBE', streams.slice(i, i + 100));
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (!msg.stream) return;
        this.handlers.get(msg.stream)?.forEach((h) => h(msg.data));
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus('offline');
      this.failures++;
      if (this.failures >= 2) this.hostIdx = (this.hostIdx + 1) % WS_HOSTS.length;
      const delay = Math.min(15000, 1000 * 2 ** Math.min(this.failures, 4));
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        if (this.handlers.size) this.connect();
      }, delay);
    };
    ws.onerror = () => ws.close();
  }
}

export const streams = new StreamManager();

// Reconnect promptly when the tab comes back / network returns.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => streams.kick());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) streams.kick(); });
}

export interface KlineMsg { bar: Bar; closed: boolean }

export function subscribeKline(symbol: string, tf: Timeframe, fn: (m: KlineMsg) => void) {
  return streams.subscribe(`${symbol.toLowerCase()}@kline_${tf}`, (d) => {
    const k = d.k;
    fn({ bar: { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v }, closed: k.x });
  });
}

export function subscribeMiniTicker(symbol: string, fn: (t: Ticker) => void) {
  return streams.subscribe(`${symbol.toLowerCase()}@miniTicker`, (d) => {
    const last = +d.c, open = +d.o;
    fn({ symbol: d.s, last, open, high: +d.h, low: +d.l, volume: +d.v, quoteVolume: +d.q, changePct: open ? ((last - open) / open) * 100 : 0 });
  });
}

export interface DepthMsg { bids: [number, number][]; asks: [number, number][] }
export function subscribeDepth(symbol: string, fn: (d: DepthMsg) => void) {
  return streams.subscribe(`${symbol.toLowerCase()}@depth20@100ms`, (d) => {
    fn({
      bids: (d.bids as [string, string][]).map(([p, q]) => [+p, +q]),
      asks: (d.asks as [string, string][]).map(([p, q]) => [+p, +q]),
    });
  });
}

export interface TradeMsg { id: number; price: number; qty: number; time: number; buyerMaker: boolean }
export function subscribeTrades(symbol: string, fn: (t: TradeMsg) => void) {
  return streams.subscribe(`${symbol.toLowerCase()}@aggTrade`, (d) => {
    fn({ id: d.a, price: +d.p, qty: +d.q, time: d.T, buyerMaker: d.m });
  });
}
