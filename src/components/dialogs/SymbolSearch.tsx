import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Star, Clock } from 'lucide-react';
import type { SymbolInfo } from '../../types';
import { POPULAR_CRYPTO, TD_SYMBOLS, allCrypto, registerCrypto, getSymbolInfo } from '../../data/symbols';
import { fetchAllCryptoSymbols } from '../../data/binance';
import { useStore } from '../../store';
import { Dialog, SymbolIcon } from '../ui';

const TABS = [
  { id: 'all', label: 'Todos' }, { id: 'crypto', label: 'Cripto' }, { id: 'stock', label: 'Acciones' },
  { id: 'forex', label: 'Forex y metales' }, { id: 'index', label: 'Índices' },
] as const;

const TYPE_LABEL: Record<string, string> = { crypto: 'cripto', stock: 'acción', forex: 'forex', index: 'índice' };

function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem('tvg-recent') || '[]'); } catch { return []; }
}
export function pushRecent(s: string) {
  try { localStorage.setItem('tvg-recent', JSON.stringify([s, ...getRecent().filter((x) => x !== s)].slice(0, 8))); } catch { /* */ }
}

export function SymbolSearch() {
  const search = useStore((s) => s.search);
  const watchlist = useStore((s) => s.watchlist);
  const { set, setSymbol, addCompare, addToWatchlist, removeFromWatchlist } = useStore.getState();
  const [q, setQ] = useState(search.initial);
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('all');
  const [kbd, setKbd] = useState(0);
  const [cryptoList, setCryptoList] = useState<SymbolInfo[]>(allCrypto());
  const [loadingAll, setLoadingAll] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => set({ search: { open: false, mode: 'change', initial: '' } });

  useEffect(() => {
    setLoadingAll(true);
    fetchAllCryptoSymbols().then((l) => { registerCrypto(l); setCryptoList(allCrypto()); }).catch(() => {}).finally(() => setLoadingAll(false));
  }, []);

  const results = useMemo(() => {
    const query = q.trim().toUpperCase().replace(/\s+/g, '');
    let pool: SymbolInfo[] = [];
    if (tab === 'all' || tab === 'crypto') pool = pool.concat(cryptoList);
    if (tab !== 'crypto') pool = pool.concat(TD_SYMBOLS.filter((s) => tab === 'all' || s.type === tab));
    if (!query) {
      if (tab === 'all') {
        const recent = getRecent().map(getSymbolInfo);
        const seen = new Set(recent.map((r) => r.symbol));
        return { recent, items: [...POPULAR_CRYPTO, ...TD_SYMBOLS.slice(0, 8)].filter((s) => !seen.has(s.symbol)) };
      }
      return { recent: [], items: pool.slice(0, 80) };
    }
    const scored = pool.map((s) => {
      const sym = s.symbol.replace('/', '');
      const name = s.name.toUpperCase();
      let score = -1;
      if (sym === query || s.symbol === query) score = 100;
      else if (s.base === query) score = 90 + (s.quote === 'USDT' ? 5 : 0);
      else if (sym.startsWith(query)) score = 80 - (sym.length - query.length);
      else if (name.startsWith(query)) score = 50;
      else if (sym.includes(query)) score = 30;
      else if (name.includes(query)) score = 20;
      return { s, score };
    }).filter((x) => x.score >= 0).sort((a, b) => b.score - a.score);
    const items = scored.slice(0, 80).map((x) => x.s);
    // allow free-typed crypto pairs/tickers that are not in the list
    if (!items.length && /^[A-Z0-9/]{2,15}$/.test(query)) items.push(getSymbolInfo(query));
    return { recent: [], items };
  }, [q, tab, cryptoList]);

  const flat = [...results.recent, ...results.items];

  useEffect(() => {
    listRef.current?.querySelector('.kbd-active')?.scrollIntoView({ block: 'nearest' });
  }, [kbd]);

  const choose = (s: SymbolInfo) => {
    if (search.mode === 'compare') addCompare(s.symbol);
    else if (search.mode === 'watch') addToWatchlist(s.symbol);
    else { setSymbol(s.symbol); pushRecent(s.symbol); }
    close();
  };

  const title = search.mode === 'compare' ? 'Comparar símbolo' : search.mode === 'watch' ? 'Agregar a la watchlist' : 'Buscar símbolo';

  const row = (s: SymbolInfo, i: number, recent = false) => {
    const inWl = watchlist.includes(s.symbol);
    return (
      <div key={(recent ? 'r' : '') + s.symbol} className={`result ${i === kbd ? 'kbd-active' : ''}`} onClick={() => choose(s)} onMouseMove={() => kbd !== i && setKbd(i)}>
        {recent ? <Clock size={16} className="muted" /> : <SymbolIcon symbol={s.symbol} />}
        <span className="sym">{s.symbol}</span>
        <span className="nm">{s.name}</span>
        <span className="tag">{TYPE_LABEL[s.type]}</span>
        <span className="ex hide-sm">{s.exchange}</span>
        <button className="btn sm ghost" title={inWl ? 'Quitar de la watchlist' : 'Agregar a la watchlist'}
          onClick={(e) => { e.stopPropagation(); inWl ? removeFromWatchlist(s.symbol) : addToWatchlist(s.symbol); }}>
          <Star style={{ fill: inWl ? 'var(--orange)' : 'none', color: inWl ? 'var(--orange)' : undefined }} />
        </button>
      </div>
    );
  };

  return (
    <Dialog title={title} onClose={close}>
      <div className="searchbox">
        <Search size={18} className="muted" />
        <input autoFocus placeholder="Símbolo o nombre (ej: BTC, Apple, EUR/USD)" value={q}
          onChange={(e) => { setQ(e.target.value); setKbd(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setKbd((k) => Math.min(flat.length - 1, k + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setKbd((k) => Math.max(0, k - 1)); }
            if (e.key === 'Enter' && flat[kbd]) choose(flat[kbd]);
          }} />
        {loadingAll && <span className="muted" style={{ fontSize: 11 }}>cargando mercados…</span>}
      </div>
      <div className="tabs">
        {TABS.map((t) => <button key={t.id} className={`chip ${tab === t.id ? 'on' : ''}`} onClick={() => { setTab(t.id); setKbd(0); }}>{t.label}</button>)}
      </div>
      <div ref={listRef} style={{ overflowY: 'auto', flex: 1, minHeight: 200 }}>
        {results.recent.length > 0 && <div className="menu-group">Recientes</div>}
        {results.recent.map((s, i) => row(s, i, true))}
        {results.recent.length > 0 && <div className="menu-group">Populares</div>}
        {results.items.map((s, i) => row(s, i + results.recent.length))}
        {!flat.length && <div className="empty">Sin resultados para “{q}”.</div>}
      </div>
      <div className="dialog-foot" style={{ justifyContent: 'space-between' }}>
        <span className="muted" style={{ fontSize: 12 }}><kbd>↑</kbd> <kbd>↓</kbd> navegar · <kbd>Enter</kbd> elegir · <kbd>Esc</kbd> cerrar</span>
        <span className="muted hide-sm" style={{ fontSize: 12 }}>Cripto: Binance en vivo · Resto: Twelve Data</span>
      </div>
    </Dialog>
  );
}
