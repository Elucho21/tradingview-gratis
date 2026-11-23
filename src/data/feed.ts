import type { Bar, Ticker, Timeframe } from '../types';
import { getSymbolInfo, TIMEFRAMES } from './symbols';
import * as bn from './binance';
import * as td from './twelvedata';

export const isCrypto = (symbol: string) => getSymbolInfo(symbol).provider === 'binance';

export function supportedTimeframes(symbol: string): Timeframe[] {
  return isCrypto(symbol) ? TIMEFRAMES.map((t) => t.tf) : td.TD_TIMEFRAMES;
}

export function fetchHistory(symbol: string, tf: Timeframe, endTimeSec?: number): Promise<Bar[]> {
  return isCrypto(symbol) ? bn.fetchKlines(symbol, tf, endTimeSec) : td.fetchKlines(symbol, tf, endTimeSec);
}

/** Live bar updates. Crypto: websocket. Others: polling every 60s. */
export function subscribeBars(symbol: string, tf: Timeframe, fn: (bar: Bar) => void): () => void {
  if (isCrypto(symbol)) return bn.subscribeKline(symbol, tf, (m) => fn(m.bar));
  let stop = false;
  const poll = async () => {
    try {
      const bars = await td.fetchKlines(symbol, tf);
      if (!stop && bars.length) fn(bars[bars.length - 1]);
    } catch { /* keep last data */ }
  };
  const id = window.setInterval(poll, 60000);
  return () => { stop = true; clearInterval(id); };
}

/* Shared, ref-counted ticker hub so the header, watchlist and alerts reuse one feed per symbol. */
const hub = new Map<string, { last?: Ticker; fns: Set<(t: Ticker) => void>; off: () => void }>();

export function subscribeTicker(symbol: string, fn: (t: Ticker) => void): () => void {
  let entry = hub.get(symbol);
  if (!entry) {
    const e = { last: undefined as Ticker | undefined, fns: new Set<(t: Ticker) => void>(), off: () => {} };
    e.off = rawTicker(symbol, (t) => { e.last = t; e.fns.forEach((f) => f(t)); });
    hub.set(symbol, e);
    entry = e;
  }
  entry.fns.add(fn);
  if (entry.last) fn(entry.last);
  return () => {
    const e = hub.get(symbol);
    if (!e) return;
    e.fns.delete(fn);
    if (!e.fns.size) {
      // keep it alive a few seconds to avoid churn when switching symbols back and forth
      setTimeout(() => { if (!e.fns.size && hub.get(symbol) === e) { e.off(); hub.delete(symbol); } }, 5000);
    }
  };
}

export const lastTicker = (symbol: string) => hub.get(symbol)?.last;

/** 24h ticker stream. Crypto: miniTicker websocket (+ initial REST). Others: quote polling. */
function rawTicker(symbol: string, fn: (t: Ticker) => void): () => void {
  if (isCrypto(symbol)) {
    let alive = true;
    bn.fetchTickers([symbol]).then((l) => { if (alive && l[0]) fn(l[0]); }).catch(() => {});
    const off = bn.subscribeMiniTicker(symbol, fn);
    return () => { alive = false; off(); };
  }
  let alive = true;
  const poll = () => td.fetchQuote(symbol).then((t) => { if (alive) fn(t); }).catch(() => {});
  poll();
  const id = window.setInterval(poll, 90000);
  return () => { alive = false; clearInterval(id); };
}

export { streams } from './binance';
