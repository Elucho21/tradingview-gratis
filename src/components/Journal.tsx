import { useMemo, useState } from 'react';
import { Download, NotebookPen, Plus, Trash2, X, Check } from 'lucide-react';
import type { Trade } from '../types';
import { useActivePane, useStore } from '../store';
import { lastTicker } from '../data/feed';
import { fmtPrice } from './ui';

const empty = (symbol: string) => ({ symbol, side: 'long' as 'long' | 'short', entry: '', exit: '', sl: '', tp: '', size: '', date: new Date().toISOString().slice(0, 10), notes: '' });

export function pnl(t: Trade) {
  if (t.exit === undefined) return null;
  return (t.side === 'long' ? t.exit - t.entry : t.entry - t.exit) * t.size;
}
function rr(t: Trade) {
  if (!t.sl || !t.tp) return null;
  const risk = Math.abs(t.entry - t.sl);
  return risk ? Math.abs(t.tp - t.entry) / risk : null;
}

export function Journal() {
  const pane = useActivePane();
  const trades = useStore((s) => s.trades);
  const { addTrade, removeTrade, updateTrade, set, toast } = useStore.getState();
  const [f, setF] = useState(empty(pane.symbol));
  const [closing, setClosing] = useState<string | null>(null);
  const [closePrice, setClosePrice] = useState('');

  const stats = useMemo(() => {
    const closed = trades.filter((t) => t.exit !== undefined);
    const pl = closed.map((t) => pnl(t)!);
    const wins = pl.filter((x) => x > 0).length;
    const rrs = trades.map(rr).filter((x): x is number => x !== null);
    return {
      closed: closed.length, open: trades.length - closed.length,
      winRate: closed.length ? (wins / closed.length) * 100 : null,
      total: pl.reduce((a, b) => a + b, 0),
      avgRR: rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : null,
      best: pl.length ? Math.max(...pl) : null, worst: pl.length ? Math.min(...pl) : null,
    };
  }, [trades]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.entry || !f.size) { toast({ kind: 'error', title: 'Completá entrada y tamaño' }); return; }
    const n = (v: string) => (v === '' ? undefined : +v);
    addTrade({ symbol: f.symbol.toUpperCase() || pane.symbol, side: f.side, entry: +f.entry, exit: n(f.exit), sl: n(f.sl), tp: n(f.tp), size: +f.size, date: f.date, notes: f.notes });
    setF(empty(pane.symbol));
    toast({ kind: 'ok', title: 'Trade agregado al diario' });
  };

  const exportCsv = () => {
    const head = ['fecha', 'par', 'lado', 'entrada', 'salida', 'stop', 'objetivo', 'tamaño', 'pnl', 'notas'];
    const rows = trades.map((t) => [t.date, t.symbol, t.side, t.entry, t.exit ?? '', t.sl ?? '', t.tp ?? '', t.size, pnl(t)?.toFixed(2) ?? '', (t.notes ?? '').replace(/[\n,;]/g, ' ')]);
    const csv = [head, ...rows].map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `diario-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const money = (v: number | null) => (v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
  const inp = (k: keyof typeof f, ph: string, type = 'number') => (
    <input className="input num" type={type} step="any" placeholder={ph} value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
  );

  return (
    <section className="journal">
      <div className="rp-head">
        <span className="rp-title row"><NotebookPen size={16} /> Diario de trades <span className="tag">{trades.length}</span></span>
        <div className="row" style={{ gap: 2 }}>
          <button className="btn sm ghost" disabled={!trades.length} onClick={exportCsv} title="Exportar CSV"><Download /> <span className="hide-sm">CSV</span></button>
          <button className="btn sm ghost" onClick={() => set({ journalOpen: false })} title="Cerrar"><X /></button>
        </div>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <div className="stats">
          <div className="stat"><div className="k">Win rate</div><div className="v">{stats.winRate === null ? '—' : `${stats.winRate.toFixed(0)}%`}</div></div>
          <div className="stat"><div className="k">P&L total</div><div className={`v ${stats.total >= 0 ? 'up' : 'down'}`}>{stats.closed ? money(stats.total) : '—'}</div></div>
          <div className="stat"><div className="k">R:R prom.</div><div className="v">{stats.avgRR === null ? '—' : stats.avgRR.toFixed(2)}</div></div>
          <div className="stat"><div className="k">Mejor</div><div className="v up">{money(stats.best)}</div></div>
          <div className="stat"><div className="k">Peor</div><div className="v down">{money(stats.worst)}</div></div>
          <div className="stat"><div className="k">Cerrados / abiertos</div><div className="v">{stats.closed} / {stats.open}</div></div>
        </div>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, padding: '0 12px 12px', alignItems: 'end' }}>
          <div className="field"><label>Par</label><input className="input" value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} /></div>
          <div className="field"><label>Lado</label>
            <div className="seg">
              <button type="button" className={`long ${f.side === 'long' ? 'on' : ''}`} onClick={() => setF({ ...f, side: 'long' })}>Long</button>
              <button type="button" className={`short ${f.side === 'short' ? 'on' : ''}`} onClick={() => setF({ ...f, side: 'short' })}>Short</button>
            </div>
          </div>
          <div className="field"><label>Entrada *</label>
            <div className="row" style={{ gap: 4 }}>{inp('entry', 'Precio')}
              <button type="button" className="btn sm" style={{ border: '1px solid var(--border)' }} title="Usar precio actual" onClick={() => { const p = lastTicker(f.symbol || pane.symbol)?.last; if (p) setF({ ...f, entry: fmtPrice(p).replace(/,/g, '') }); }}>Ya</button>
            </div>
          </div>
          <div className="field"><label>Salida</label>{inp('exit', 'Vacío = abierto')}</div>
          <div className="field"><label>Stop loss</label>{inp('sl', '—')}</div>
          <div className="field"><label>Take profit</label>{inp('tp', '—')}</div>
          <div className="field"><label>Tamaño *</label>{inp('size', 'Unidades')}</div>
          <div className="field"><label>Fecha</label>{inp('date', '', 'date')}</div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label>Notas</label><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Setup, emociones, errores…" /></div>
          <button className="btn solid" type="submit"><Plus /> Agregar</button>
        </form>
        {trades.length > 0 ? (
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Par</th><th>Lado</th><th>Entrada</th><th>Salida</th><th className="hide-sm">SL / TP</th><th>Tamaño</th><th>P&L</th><th className="hide-sm">Notas</th><th /></tr></thead>
            <tbody>
              {trades.map((t) => {
                const p = pnl(t);
                const live = lastTicker(t.symbol)?.last;
                const unreal = t.exit === undefined && live ? (t.side === 'long' ? live - t.entry : t.entry - live) * t.size : null;
                return (
                  <tr key={t.id}>
                    <td>{t.date}</td>
                    <td style={{ cursor: 'pointer', fontWeight: 500 }} onClick={() => useStore.getState().setSymbol(t.symbol)}>{t.symbol}</td>
                    <td className={t.side === 'long' ? 'up' : 'down'}>{t.side === 'long' ? 'Long' : 'Short'}</td>
                    <td>{t.entry}</td>
                    <td>{t.exit ?? (closing === t.id ? (
                      <form className="row" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); if (closePrice) { updateTrade(t.id, { exit: +closePrice }); setClosing(null); } }}>
                        <input className="input num" style={{ height: 26, width: 90 }} autoFocus type="number" step="any" value={closePrice} onChange={(e) => setClosePrice(e.target.value)} />
                        <button className="btn sm" type="submit"><Check /></button>
                      </form>
                    ) : <button className="btn sm" style={{ border: '1px solid var(--border)', height: 24 }} onClick={() => { setClosing(t.id); setClosePrice(live ? fmtPrice(live).replace(/,/g, '') : ''); }}>Cerrar</button>)}</td>
                    <td className="hide-sm muted">{t.sl ?? '—'} / {t.tp ?? '—'}</td>
                    <td>{t.size}</td>
                    <td className={(p ?? unreal ?? 0) >= 0 ? 'up' : 'down'}>{p !== null ? money(p) : unreal !== null ? <span title="No realizado">{money(unreal)}*</span> : '—'}</td>
                    <td className="hide-sm muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.notes}</td>
                    <td><button className="btn sm ghost" title="Eliminar" onClick={() => removeTrade(t.id)}><Trash2 /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="empty">Todavía no registraste trades. Completá el formulario de arriba para cargar el primero.</div>}
      </div>
    </section>
  );
}
