import type { SymbolInfo, Timeframe } from '../types';

const QUOTES = ['USDT', 'FDUSD', 'USDC', 'BTC', 'ETH', 'BNB', 'TRY', 'EUR'];

export function splitCrypto(symbol: string): { base: string; quote: string } {
  for (const q of QUOTES) {
    if (symbol.endsWith(q) && symbol.length > q.length) return { base: symbol.slice(0, -q.length), quote: q };
  }
  return { base: symbol, quote: '' };
}

export function crypto(symbol: string, name?: string): SymbolInfo {
  const { base, quote } = splitCrypto(symbol);
  return { symbol, name: name ?? `${base} / ${quote}`, exchange: 'Binance', type: 'crypto', provider: 'binance', base, quote };
}

const td = (symbol: string, name: string, exchange: string, type: SymbolInfo['type']): SymbolInfo => ({
  symbol, name, exchange, type, provider: 'twelvedata',
});

export const POPULAR_CRYPTO: SymbolInfo[] = [
  crypto('BTCUSDT', 'Bitcoin / TetherUS'),
  crypto('ETHUSDT', 'Ethereum / TetherUS'),
  crypto('SOLUSDT', 'Solana / TetherUS'),
  crypto('BNBUSDT', 'BNB / TetherUS'),
  crypto('XRPUSDT', 'XRP / TetherUS'),
  crypto('DOGEUSDT', 'Dogecoin / TetherUS'),
  crypto('ADAUSDT', 'Cardano / TetherUS'),
  crypto('AVAXUSDT', 'Avalanche / TetherUS'),
  crypto('LINKUSDT', 'Chainlink / TetherUS'),
  crypto('TRXUSDT', 'TRON / TetherUS'),
  crypto('DOTUSDT', 'Polkadot / TetherUS'),
  crypto('LTCUSDT', 'Litecoin / TetherUS'),
  crypto('SUIUSDT', 'Sui / TetherUS'),
  crypto('PEPEUSDT', 'Pepe / TetherUS'),
  crypto('ETHBTC', 'Ethereum / Bitcoin'),
];

export const TD_SYMBOLS: SymbolInfo[] = [
  td('AAPL', 'Apple Inc.', 'NASDAQ', 'stock'),
  td('MSFT', 'Microsoft Corp.', 'NASDAQ', 'stock'),
  td('NVDA', 'NVIDIA Corp.', 'NASDAQ', 'stock'),
  td('AMZN', 'Amazon.com Inc.', 'NASDAQ', 'stock'),
  td('GOOGL', 'Alphabet Inc.', 'NASDAQ', 'stock'),
  td('META', 'Meta Platforms Inc.', 'NASDAQ', 'stock'),
  td('TSLA', 'Tesla Inc.', 'NASDAQ', 'stock'),
  td('AMD', 'Advanced Micro Devices', 'NASDAQ', 'stock'),
  td('NFLX', 'Netflix Inc.', 'NASDAQ', 'stock'),
  td('INTC', 'Intel Corp.', 'NASDAQ', 'stock'),
  td('AVGO', 'Broadcom Inc.', 'NASDAQ', 'stock'),
  td('QCOM', 'Qualcomm Inc.', 'NASDAQ', 'stock'),
  td('ADBE', 'Adobe Inc.', 'NASDAQ', 'stock'),
  td('PYPL', 'PayPal Holdings Inc.', 'NASDAQ', 'stock'),
  td('COST', 'Costco Wholesale', 'NASDAQ', 'stock'),
  td('JPM', 'JPMorgan Chase & Co.', 'NYSE', 'stock'),
  td('BAC', 'Bank of America Corp.', 'NYSE', 'stock'),
  td('V', 'Visa Inc.', 'NYSE', 'stock'),
  td('MA', 'Mastercard Inc.', 'NYSE', 'stock'),
  td('WMT', 'Walmart Inc.', 'NYSE', 'stock'),
  td('DIS', 'The Walt Disney Co.', 'NYSE', 'stock'),
  td('KO', 'Coca-Cola Co.', 'NYSE', 'stock'),
  td('MCD', "McDonald's Corp.", 'NYSE', 'stock'),
  td('XOM', 'Exxon Mobil Corp.', 'NYSE', 'stock'),
  td('LLY', 'Eli Lilly & Co.', 'NYSE', 'stock'),
  td('BABA', 'Alibaba Group', 'NYSE', 'stock'),
  td('MELI', 'MercadoLibre Inc.', 'NASDAQ', 'stock'),
  td('YPF', 'YPF S.A.', 'NYSE', 'stock'),
  td('GGAL', 'Grupo Financiero Galicia', 'NASDAQ', 'stock'),
  td('SPY', 'SPDR S&P 500 ETF', 'NYSE', 'stock'),
  td('QQQ', 'Invesco Nasdaq 100 ETF', 'NASDAQ', 'stock'),
  td('EUR/USD', 'Euro / US Dollar', 'FX', 'forex'),
  td('GBP/USD', 'Pound / US Dollar', 'FX', 'forex'),
  td('USD/JPY', 'US Dollar / Japanese Yen', 'FX', 'forex'),
  td('USD/CHF', 'US Dollar / Swiss Franc', 'FX', 'forex'),
  td('AUD/USD', 'Australian / US Dollar', 'FX', 'forex'),
  td('USD/CAD', 'US Dollar / Canadian', 'FX', 'forex'),
  td('NZD/USD', 'New Zealand / US Dollar', 'FX', 'forex'),
  td('EUR/GBP', 'Euro / British Pound', 'FX', 'forex'),
  td('EUR/JPY', 'Euro / Japanese Yen', 'FX', 'forex'),
  td('GBP/JPY', 'Pound / Japanese Yen', 'FX', 'forex'),
  td('USD/MXN', 'US Dollar / Mexican Peso', 'FX', 'forex'),
  td('USD/BRL', 'US Dollar / Brazilian Real', 'FX', 'forex'),
  td('XAU/USD', 'Oro / US Dollar', 'FX', 'forex'),
  td('XAG/USD', 'Plata / US Dollar', 'FX', 'forex'),
  td('SPX', 'S&P 500', 'INDEX', 'index'),
  td('NDX', 'Nasdaq 100', 'INDEX', 'index'),
  td('DJI', 'Dow Jones', 'INDEX', 'index'),
  td('RUT', 'Russell 2000', 'INDEX', 'index'),
  td('VIX', 'CBOE Volatility', 'INDEX', 'index'),
  td('DAX', 'DAX 40 (Alemania)', 'INDEX', 'index'),
  td('FTSE', 'FTSE 100 (UK)', 'INDEX', 'index'),
  td('NI225', 'Nikkei 225 (Japón)', 'INDEX', 'index'),
];

const tdMap = new Map(TD_SYMBOLS.map((s) => [s.symbol, s]));
let cryptoMap = new Map(POPULAR_CRYPTO.map((s) => [s.symbol, s]));

export function registerCrypto(list: SymbolInfo[]) {
  for (const s of list) if (!cryptoMap.has(s.symbol)) cryptoMap.set(s.symbol, s);
}
export function allCrypto(): SymbolInfo[] {
  return [...cryptoMap.values()];
}

export function getSymbolInfo(symbol: string): SymbolInfo {
  const known = tdMap.get(symbol) ?? cryptoMap.get(symbol);
  if (known) return known;
  if (symbol.includes('/')) return td(symbol, symbol, 'FX', 'forex');
  if (splitCrypto(symbol).quote) return crypto(symbol);
  return td(symbol, symbol, 'US', 'stock');
}

export function displaySymbol(symbol: string) {
  return symbol;
}

export const TIMEFRAMES: { tf: Timeframe; label: string; group: string; sec: number }[] = [
  { tf: '1m', label: '1 minuto', group: 'Minutos', sec: 60 },
  { tf: '3m', label: '3 minutos', group: 'Minutos', sec: 180 },
  { tf: '5m', label: '5 minutos', group: 'Minutos', sec: 300 },
  { tf: '15m', label: '15 minutos', group: 'Minutos', sec: 900 },
  { tf: '30m', label: '30 minutos', group: 'Minutos', sec: 1800 },
  { tf: '1h', label: '1 hora', group: 'Horas', sec: 3600 },
  { tf: '2h', label: '2 horas', group: 'Horas', sec: 7200 },
  { tf: '4h', label: '4 horas', group: 'Horas', sec: 14400 },
  { tf: '6h', label: '6 horas', group: 'Horas', sec: 21600 },
  { tf: '12h', label: '12 horas', group: 'Horas', sec: 43200 },
  { tf: '1d', label: '1 día', group: 'Días', sec: 86400 },
  { tf: '3d', label: '3 días', group: 'Días', sec: 259200 },
  { tf: '1w', label: '1 semana', group: 'Días', sec: 604800 },
  { tf: '1M', label: '1 mes', group: 'Días', sec: 2592000 },
];

export const tfSeconds = (tf: Timeframe) => TIMEFRAMES.find((t) => t.tf === tf)?.sec ?? 60;

export function tfShort(tf: Timeframe) {
  const map: Record<string, string> = { '1d': '1D', '3d': '3D', '1w': '1S', '1M': '1M' };
  if (map[tf]) return map[tf];
  return tf.endsWith('m') ? tf.slice(0, -1) : tf.toUpperCase();
}

/** Parses things like "5", "15", "60", "240", "4h", "1d", "D", "W" typed by the user */
export function parseTimeframe(input: string): Timeframe | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const direct = TIMEFRAMES.find((t) => t.tf.toLowerCase() === s);
  if (direct) return direct.tf;
  if (s === 'd') return '1d';
  if (s === 'w' || s === 's' || s === '1s') return '1w';
  if (s === 'mo' || s === '1mo') return '1M';
  const m = s.match(/^(\d+)\s*([mhdws]?)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2] || 'm';
  let sec = n * ({ m: 60, h: 3600, d: 86400, w: 604800, s: 604800 } as Record<string, number>)[unit];
  const hit = TIMEFRAMES.find((t) => t.sec === sec);
  return hit ? hit.tf : null;
}
