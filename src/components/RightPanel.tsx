import type { ReactNode } from 'react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { List, BookOpen, ArrowLeftRight, Bell, Info, Plus, X, ChevronUp, ChevronDown, Pencil, Trash2, RotateCcw, NotebookPen } from 'lucide-react';
import type { Ticker } from '../types';
import { isCrypto, subscribeTicker } from '../data/feed';
import { subscribeDepth, subscribeTrades, type DepthMsg, type TradeMsg } from '../data/binance';
import { getSymbolInfo } from '../data/symbols';
import { useActivePane, useStore, type RightTab } from '../store';
import { fmtCompact, fmtPct, fmtPrice, SymbolIcon } from './ui';

const TABS: { id: RightTab; icon: ReactNode; label: string }[] = [
  { id: 'watchlist', icon: <List />, label: 'Watchlist' },
  { id: 'info', icon: <Info />, label: 'Detalles del símbolo' },
  { id: 'book', icon: <BookOpen />, label: 'Libro de órdenes' },
  { id: 'trades', icon: <ArrowLeftRight />, label: 'Operaciones en vivo' },
  { id: 'alerts', icon: <Bell />, label: 'Alertas' },
];

export function RightRail() {
  const tab = useStore((s) => s.rightPanel);
  const set = useStore((s) => s.set);
  const journalOpen = useStore((s) => s.journalOpen);
  const activeAlerts = useStore((s) => s.alerts.filter((a) => a.active).length);
  return (
    <aside className="rightrail">
      {TABS.map((t) => (
        <button key={t.id} className={`tool ${tab === t.id ? 'on' : ''}`} title={t.label} onClick={() => set({ rightPanel: tab === t.id ? null : t.id })}>
          {t.icon}
          {t.id === 'alerts' && activeAlerts > 0 && <span style={{ position: 'absolute', top: 3, right: 3, background: 'var(--orange)', color: '#fff', fontSize: 9, borderRadius: 8, padding: '0 4px', fontWeight: 700 }}>{activeAlerts}</span>}
        </button>
      ))}
      <div className="hsep" />
      <button className={`tool ${journalOpen ? 'on' : ''}`} title="Diario de trades" onClick={() => set({ journalOpen: !journalOpen })}><NotebookPen /></button>
    </aside>
  );
}

export function RightPanel() {
  const tab = useStore((s) => s.rightPanel);
  const set = useStore((s) => s.set);
  if (!tab) return null;
  const meta = TABS.find((t) => t.id === tab)!;
  return (
    <aside className="right">
      <div className="rp-head">
        <span className="rp-title">{meta.label}</span>
        <div className="row" style={{ gap: 2 }}>
          {tab === 'watchlist' && <button className="btn sm ghost" title="Agregar símbolo" onClick={() => set({ search: { open: true, mode: 'watch', initial: '' } })}><Plus /></button>}
          {tab === 'alerts' && <button className="btn sm ghost" title="Nueva alerta" onClick={() => set({ alertDialog: { open: true } })}><Plus /></button>}
          <button className="btn sm ghost" title="Cerrar panel" onClick={() => set({ rightPanel: null })}><X /></button>
        </div>
      </div>
      <div className="rp-body">
        {tab === 'watchlist' && <Watchlist />}
        {tab === 'info' && <SymbolDetails />}
        {tab === 'book' && <OrderBook />}
        {tab === 'trades' && <LiveTrades />}
        {tab === 'alerts' && <AlertsList />}
      </div>
    </aside>
  );
}

/* -------------------------------- Watchlist -------------------------------- */

export function useTicker(symbol: string) {
  const [t, setT] = useState<Ticker | null>(null);
  useEffect(() => {
    setT(null);
    return subscribeTicker(symbol, setT);
  }, [symbol]);
  return t;
}

const WatchRow = memo(function WatchRow({ symbol, index, selected, onTicker }: { symbol: string; index: number; selected: boolean; onTicker: (s: string, t: Ticker) => void }) {
  const t = useTicker(symbol);
  const prev = useRef<number | null>(null);
  const [flash, setFlash] = useState('');
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!t) return;
    onTicker(symbol, t);
    if (prev.current !== null && t.last !== prev.current) {
      setFlash(t.last > prev.current ? 'flash-up' : 'flash-down');
      const id = setTimeout(() => setFlash(''), 700);
      prev.current = t.last;
      return () => clearTimeout(id);
    }
    prev.current = t.last;
  }, [t?.last]);
  const info = getSymbolInfo(symbol);
  const label = info.type === 'crypto' ? info.base : symbol;
  const sub = info.type === 'crypto' ? info.quote : info.exchange;
  const st = useStore.getState;
  return (
    <div className={`wl-row ${selected ? 'sel' : ''} ${over ? 'dragover' : ''}`} draggable
      onDragStart={(e) => e.dataTransfer.setData('text/wl', String(index))}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); const from = +e.dataTransfer.getData('text/wl'); if (!isNaN(from) && from !== index) st().moveInWatchlist(from, index); }}
      onClick={() => st().setSymbol(symbol)}>
      <span className="s"><SymbolIcon symbol={symbol} size={18} />{label}<span className="muted" style={{ fontSize: 10, fontWeight: 400 }}>{sub}</span></span>
      <span className={`p ${flash}`} style={{ borderRadius: 2 }}>{t ? fmtPrice(t.last) : '…'}</span>
      <span className={`c ${t ? (t.changePct >= 0 ? 'up' : 'down') : 'muted'}`}>{t ? fmtPct(t.changePct) : ''}</span>
      <button className="x" title={`Quitar ${symbol}`} onClick={(e) => { e.stopPropagation(); st().removeFromWatchlist(symbol); }}><X /></button>
    </div>
  );
});

function Watchlist() {
  const watchlist = useStore((s) => s.watchlist);
  const sort = useStore((s) => s.watchSort);
  const setSort = useStore((s) => s.setWatchSort);
  const pane = useActivePane();
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const pending = useRef<Record<string, Ticker>>({});
  const timer = useRef<number | null>(null);
  const onTicker = useMemo(() => (s: string, t: Ticker) => {
    if (!sort.key) return; // only needed for sorting
    pending.current[s] = t;
    if (!timer.current) timer.current = window.setTimeout(() => { timer.current = null; setTickers((x) => ({ ...x, ...pending.current })); }, 1500);
  }, [sort.key]);

  const ordered = useMemo(() => {
    if (!sort.key) return watchlist;
    const val = (s: string) => sort.key === 'symbol' ? s : sort.key === 'last' ? tickers[s]?.last ?? 0 : tickers[s]?.changePct ?? 0;
    return [...watchlist].sort((a, b) => {
      const va = val(a), vb = val(b);
      return (typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * sort.dir;
    });
  }, [watchlist, sort, tickers]);

  const arrow = (k: string) => sort.key === k ? (sort.dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null;

  return (
    <div>
      <div className="wl-head">
        <button onClick={() => setSort('symbol')}>Símbolo {arrow('symbol')}</button>
        <button onClick={() => setSort('last')}>Último {arrow('last')}</button>
        <button onClick={() => setSort('change')}>Cambio 24h {arrow('change')}</button>
      </div>
      {ordered.map((s) => (
        <WatchRow key={s} symbol={s} index={watchlist.indexOf(s)} selected={s === pane.symbol} onTicker={onTicker} />
      ))}
      {!watchlist.length && <div className="empty">Tu watchlist está vacía.<br />Tocá + para agregar símbolos.</div>}
      <div className="muted" style={{ fontSize: 11, padding: '10px 12px' }}>Arrastrá para reordenar · ↑/↓ para recorrerla</div>
    </div>
  );
}

/* ------------------------------ Symbol details ------------------------------ */

function SymbolDetails() {
  const pane = useActivePane();
  const t = useTicker(pane.symbol);
  const info = getSymbolInfo(pane.symbol);
  const range = t ? t.high - t.low : 0;
  const pos = t && range ? ((t.last - t.low) / range) * 100 : 50;
  return (
    <div>
      <div style={{ padding: '14px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <SymbolIcon symbol={pane.symbol} size={36} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{pane.symbol}</div>
          <div className="muted" style={{ fontSize: 12 }}>{info.name} · {info.exchange}</div>
        </div>
      </div>
      <div style={{ padding: '0 12px 12px' }}>
        <div className="num" style={{ fontSize: 26, fontWeight: 600 }}>{t ? fmtPrice(t.last) : '—'}</div>
        <div className={`num ${t && t.changePct >= 0 ? 'up' : 'down'}`}>{t ? `${t.last - t.open >= 0 ? '+' : ''}${fmtPrice(t.last - t.open, t.last)} (${fmtPct(t.changePct)})` : ''} <span className="muted">24h</span></div>
      </div>
      {t && (
        <div style={{ padding: '0 12px 14px' }}>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Rango del día</div>
          <div style={{ height: 4, background: 'var(--panel-2)', borderRadius: 2, position: 'relative' }}>
            <div style={{ position: 'absolute', left: 0, width: `${pos}%`, top: 0, bottom: 0, background: 'var(--blue)', borderRadius: 2 }} />
          </div>
          <div className="row num" style={{ justifyContent: 'space-between', fontSize: 11, marginTop: 4 }}><span>{fmtPrice(t.low)}</span><span>{fmtPrice(t.high)}</span></div>
        </div>
      )}
      <div className="info-grid">
        <div><div className="k">Apertura 24h</div><div className="v">{fmtPrice(t?.open)}</div></div>
        <div><div className="k">Volumen</div><div className="v">{fmtCompact(t?.volume)}</div></div>
        <div><div className="k">Máximo 24h</div><div className="v up">{fmtPrice(t?.high)}</div></div>
        <div><div className="k">Mínimo 24h</div><div className="v down">{fmtPrice(t?.low)}</div></div>
        <div><div className="k">Vol. en {info.quote || 'USD'}</div><div className="v">{t?.quoteVolume ? fmtCompact(t.quoteVolume) : '—'}</div></div>
        <div><div className="k">Tipo</div><div className="v" style={{ textTransform: 'capitalize' }}>{info.type === 'crypto' ? 'Cripto' : info.type === 'stock' ? 'Acción' : info.type === 'forex' ? 'Forex' : 'Índice'}</div></div>
      </div>
    </div>
  );
}

/* -------------------------------- Order book -------------------------------- */

function NotAvailable() {
  return <div className="empty">Disponible solo para cripto (datos de Binance en tiempo real).</div>;
}

function OrderBook() {
  const pane = useActivePane();
  const [d, setD] = useState<DepthMsg | null>(null);
  const crypto = isCrypto(pane.symbol);
  useEffect(() => {
    setD(null);
    if (!crypto) return;
    let last = 0;
    return subscribeDepth(pane.symbol, (m) => { const now = performance.now(); if (now - last > 250) { last = now; setD(m); } });
  }, [pane.symbol, crypto]);
  if (!crypto) return <NotAvailable />;
  if (!d) return <div className="empty">Conectando…</div>;
  const asks = d.asks.slice(0, 14).reverse();
  const bids = d.bids.slice(0, 14);
  const max = Math.max(...asks.map((a) => a[1] * a[0]), ...bids.map((b) => b[1] * b[0]), 1);
  const bestAsk = d.asks[0]?.[0], bestBid = d.bids[0]?.[0];
  const spread = bestAsk && bestBid ? bestAsk - bestBid : 0;
  const info = getSymbolInfo(pane.symbol);
  const row = ([p, q]: [number, number], side: 'a' | 'b', i: number) => (
    <div className="ob-row" key={side + i} onClick={() => useStore.getState().set({ alertDialog: { open: true, price: p } })} style={{ cursor: 'pointer' }} title="Crear alerta en este precio">
      <div className="ob-bar" style={{ width: `${((p * q) / max) * 100}%`, background: side === 'a' ? 'rgba(242,54,69,.14)' : 'rgba(8,153,129,.14)' }} />
      <span className={side === 'a' ? 'down' : 'up'}>{fmtPrice(p, bestBid)}</span>
      <span>{q.toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
      <span className="muted">{fmtCompact(p * q)}</span>
    </div>
  );
  return (
    <div className="ob">
      <div className="ob-head"><span>Precio ({info.quote})</span><span>Cantidad ({info.base})</span><span>Total</span></div>
      {asks.map((a, i) => row(a, 'a', i))}
      <div className="ob-spread num">
        <span>{fmtPrice(bestBid)}</span>
        <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>Spread {fmtPrice(spread, bestBid)} ({((spread / (bestBid || 1)) * 100).toFixed(3)}%)</span>
      </div>
      {bids.map((b, i) => row(b, 'b', i))}
    </div>
  );
}

/* -------------------------------- Live trades -------------------------------- */

function LiveTrades() {
  const pane = useActivePane();
  const [list, setList] = useState<TradeMsg[]>([]);
  const buf = useRef<TradeMsg[]>([]);
  const crypto = isCrypto(pane.symbol);
  useEffect(() => {
    setList([]);
    buf.current = [];
    if (!crypto) return;
    const off = subscribeTrades(pane.symbol, (t) => { buf.current.unshift(t); });
    const id = setInterval(() => {
      if (!buf.current.length) return;
      const incoming = buf.current;
      buf.current = [];
      setList((l) => [...incoming, ...l].slice(0, 60));
    }, 300);
    return () => { off(); clearInterval(id); };
  }, [pane.symbol, crypto]);
  if (!crypto) return <NotAvailable />;
  const info = getSymbolInfo(pane.symbol);
  return (
    <div className="ob">
      <div className="ob-head"><span>Precio</span><span>Cantidad ({info.base})</span><span>Hora</span></div>
      {list.map((t) => (
        <div className="ob-row" key={t.id}>
          {t.price * t.qty > 50000 && <div className="ob-bar" style={{ width: '100%', background: t.buyerMaker ? 'rgba(242,54,69,.1)' : 'rgba(8,153,129,.1)' }} />}
          <span className={t.buyerMaker ? 'down' : 'up'}>{fmtPrice(t.price)}</span>
          <span style={{ fontWeight: t.price * t.qty > 50000 ? 600 : 400 }}>{t.qty.toLocaleString('en-US', { maximumFractionDigits: 5 })}</span>
          <span className="muted">{new Date(t.time).toLocaleTimeString('es-AR', { hour12: false })}</span>
        </div>
      ))}
      {!list.length && <div className="empty">Esperando operaciones…</div>}
      <div className="muted" style={{ fontSize: 11, padding: '8px 12px' }}>Resaltadas: operaciones mayores a 50K USD</div>
    </div>
  );
}

/* ---------------------------------- Alerts ---------------------------------- */

function AlertsList() {
  const alerts = useStore((s) => s.alerts);
  const { set, removeAlert, updateAlert, setSymbol } = useStore.getState();
  const activeList = alerts.filter((a) => a.active);
  const done = alerts.filter((a) => !a.active);
  const condTxt = (c: string) => (c === 'above' ? 'sube a' : c === 'below' ? 'baja a' : 'cruza');
  const item = (a: (typeof alerts)[number]) => (
    <div className="alert-item" key={a.id}>
      <Bell size={16} style={{ color: a.active ? 'var(--orange)' : 'var(--muted)', flexShrink: 0 }} />
      <div className="meta" onClick={() => setSymbol(a.symbol)} style={{ cursor: 'pointer' }}>
        <div className="t">{a.symbol} {condTxt(a.condition)} <span className="num">{fmtPrice(a.price)}</span></div>
        <div className="d">{a.triggeredAt ? `Disparada ${new Date(a.triggeredAt).toLocaleString('es-AR')}` : a.note || `Creada ${new Date(a.createdAt).toLocaleDateString('es-AR')}`}</div>
      </div>
      {a.active
        ? <button className="btn sm ghost" title="Editar" onClick={() => set({ alertDialog: { open: true, editId: a.id, symbol: a.symbol } })}><Pencil /></button>
        : <button className="btn sm ghost" title="Reactivar" onClick={() => updateAlert(a.id, { active: true, triggeredAt: undefined })}><RotateCcw /></button>}
      <button className="btn sm ghost" title="Eliminar" onClick={() => removeAlert(a.id)}><Trash2 /></button>
    </div>
  );
  return (
    <div>
      {!alerts.length && (
        <div className="empty">
          No tenés alertas.<br />
          <button className="btn sm solid" style={{ marginTop: 10 }} onClick={() => set({ alertDialog: { open: true } })}><Plus /> Crear alerta</button>
          <div style={{ marginTop: 10, fontSize: 12 }}>Tip: clic derecho en el gráfico para crear una alerta en ese precio.</div>
        </div>
      )}
      {activeList.length > 0 && <div className="menu-group">Activas ({activeList.length})</div>}
      {activeList.map(item)}
      {done.length > 0 && (
        <div className="row" style={{ justifyContent: 'space-between', paddingRight: 6 }}>
          <div className="menu-group">Disparadas ({done.length})</div>
          <button className="btn sm ghost" onClick={() => done.forEach((a) => removeAlert(a.id))}>Limpiar</button>
        </div>
      )}
      {done.map(item)}
    </div>
  );
}
