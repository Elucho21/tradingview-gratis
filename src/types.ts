export type Provider = 'binance' | 'twelvedata';
export type AssetType = 'crypto' | 'stock' | 'forex' | 'index';

export interface SymbolInfo {
  symbol: string; // e.g. BTCUSDT, AAPL, EUR/USD
  name: string;
  exchange: string;
  type: AssetType;
  provider: Provider;
  base?: string;
  quote?: string;
}

export interface Bar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe =
  | '1m' | '3m' | '5m' | '15m' | '30m'
  | '1h' | '2h' | '4h' | '6h' | '12h'
  | '1d' | '3d' | '1w' | '1M';

export type ChartType = 'candles' | 'hollow' | 'heikin' | 'bars' | 'line' | 'area' | 'baseline';

export type IndicatorType =
  | 'ema' | 'sma' | 'bb' | 'vwap' | 'supertrend' | 'volume'
  | 'rsi' | 'macd' | 'stoch' | 'atr' | 'obv';

export interface Indicator {
  id: string;
  type: IndicatorType;
  params: Record<string, number>;
  color: string;
  hidden?: boolean;
}

export interface Ticker {
  symbol: string;
  last: number;
  open: number; // 24h open
  high: number;
  low: number;
  volume: number; // base volume
  quoteVolume: number;
  changePct: number;
}

export interface Point { t: number; p: number }

export type DrawingType =
  | 'hline' | 'vline' | 'trend' | 'ray' | 'rect' | 'fib' | 'fibext'
  | 'long' | 'short' | 'text' | 'ruler';

export interface Drawing {
  id: string;
  type: DrawingType;
  points: Point[];
  color: string;
  text?: string;
  // long/short: points[0]=entry(t,p), points[1]=(t end, target), points[2]=(t end, stop)
}

export type Tool = 'cursor' | DrawingType;

export interface PaneState {
  id: string;
  symbol: string;
  tf: Timeframe;
  chartType: ChartType;
  indicators: Indicator[];
  compare: string[];
  logScale: boolean;
  percentScale: boolean;
}

export interface Alert {
  id: string;
  symbol: string;
  price: number;
  condition: 'cross' | 'above' | 'below';
  note?: string;
  active: boolean;
  createdAt: number;
  triggeredAt?: number;
}

export interface Trade {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  entry: number;
  exit?: number;
  sl?: number;
  tp?: number;
  size: number;
  date: string; // yyyy-mm-dd
  notes?: string;
}

export type Layout = '1' | '2h' | '2v' | '3' | '4';
