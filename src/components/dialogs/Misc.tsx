import { useEffect, useState } from 'react';
import { Bell, ExternalLink } from 'lucide-react';
import { useActivePane, useStore } from '../../store';
import { parseTimeframe, TIMEFRAMES } from '../../data/symbols';
import { isCrypto, lastTicker, supportedTimeframes } from '../../data/feed';
import { setTwelveDataKey } from '../../data/twelvedata';
import { controllers } from '../../chart/registry';
import { Dialog, fmtPrice } from '../ui';

/* ------------------------------ Alert dialog ------------------------------ */
export function AlertDialog() {
  const d = useStore((s) => s.alertDialog);
  const pane = useActivePane();
  const symbol = d.symbol ?? pane.symbol;
  const editing = useStore((s) => s.alerts.find((a) => a.id === d.editId));
  const current = lastTicker(symbol)?.last ?? controllers.get(pane.id)?.lastBar()?.close;
  const [price, setPrice] = useState<string>(String(editing?.price ?? d.price ?? (current ? +fmtPrice(current).replace(/,/g, '') : '')));
  const [cond, setCond] = useState<'cross' | 'above' | 'below'>(editing?.condition ?? 'cross');
  const [note, setNote] = useState(editing?.note ?? '');
  const close = () => useStore.getState().set({ alertDialog: { open: false } });

  const save = async () => {
    const p = parseFloat(price);
    if (!isFinite(p) || p <= 0) return;
    const st = useStore.getState();
    if (editing) st.updateAlert(editing.id, { price: p, condition: cond, note, active: true, triggeredAt: undefined });
    else st.addAlert({ symbol, price: p, condition: cond, note });
    st.toast({ kind: 'ok', title: `Alerta ${editing ? 'actualizada' : 'creada'}`, body: `${symbol} ${cond === 'above' ? 'sube a' : cond === 'below' ? 'baja a' : 'cruza'} ${price}` });
    if ('Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* */ }
    }
    close();
  };

  const dist = current && parseFloat(price) ? ((parseFloat(price) - current) / current) * 100 : null;

  return (
    <Dialog title={<span className="row"><Bell size={17} /> {editing ? 'Editar alerta' : 'Crear alerta'} — {symbol}</span>} size="sm" onClose={close}
      footer={<><button className="btn sm" style={{ border: '1px solid var(--border)' }} onClick={close}>Cancelar</button><button className="btn sm solid" onClick={save}>{editing ? 'Guardar' : 'Crear'}</button></>}>
      <form className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="field">
          <label>Condición</label>
          <div className="seg">
            <button type="button" className={cond === 'cross' ? 'on' : ''} onClick={() => setCond('cross')}>Cruza</button>
            <button type="button" className={cond === 'above' ? 'on' : ''} onClick={() => setCond('above')}>Sube a</button>
            <button type="button" className={cond === 'below' ? 'on' : ''} onClick={() => setCond('below')}>Baja a</button>
          </div>
        </div>
        <div className="field">
          <label>Precio {current ? <span style={{ textTransform: 'none' }}>· actual {fmtPrice(current)}</span> : null}</label>
          <input className="input num" autoFocus type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
          {dist !== null && <span className={`num ${dist >= 0 ? 'up' : 'down'}`} style={{ fontSize: 12 }}>{dist >= 0 ? '+' : ''}{dist.toFixed(2)}% del precio actual</span>}
        </div>
        <div className="field">
          <label>Nota (opcional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: romper resistencia diaria" />
        </div>
        <div className="muted" style={{ fontSize: 12 }}>Te avisamos con un mensaje en pantalla, sonido y notificación del navegador (si la permitís). La pestaña tiene que quedar abierta.</div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/* ------------------------------ Text dialog ------------------------------ */
export function TextDialog() {
  const d = useStore((s) => s.textDialog);
  const [text, setText] = useState(d.initial ?? '');
  const close = () => useStore.getState().set({ textDialog: { open: false } });
  const save = () => {
    const st = useStore.getState();
    for (const [sym, list] of Object.entries(st.drawings)) {
      if (list.some((x) => x.id === d.drawingId)) {
        st.setDrawings(sym, list.map((x) => (x.id === d.drawingId ? { ...x, text: text || 'Texto' } : x)), false);
      }
    }
    close();
  };
  return (
    <Dialog title="Texto" size="sm" onClose={close}
      footer={<><button className="btn sm" style={{ border: '1px solid var(--border)' }} onClick={close}>Cancelar</button><button className="btn sm solid" onClick={save}>Aceptar</button></>}>
      <form className="dialog-body" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <input className="input" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribí tu nota…" maxLength={80} />
      </form>
    </Dialog>
  );
}

/* ------------------------- Timeframe quick prompt ------------------------- */
export function TimeframePrompt() {
  const d = useStore((s) => s.tfPrompt);
  const pane = useActivePane();
  const [v, setV] = useState(d.initial);
  const tf = parseTimeframe(v);
  const ok = tf && supportedTimeframes(pane.symbol).includes(tf);
  const close = () => useStore.getState().set({ tfPrompt: { open: false, initial: '' } });
  return (
    <Dialog title="Cambiar temporalidad" size="sm" onClose={close}>
      <form className="dialog-body" onSubmit={(e) => { e.preventDefault(); if (ok) { useStore.getState().setTimeframe(tf!); close(); } }}>
        <input className="input num" autoFocus value={v} onChange={(e) => setV(e.target.value)} style={{ fontSize: 20, height: 46 }} />
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          {ok ? <>Enter para cambiar a <b style={{ color: 'var(--text)' }}>{TIMEFRAMES.find((t) => t.tf === tf)?.label}</b></> : 'Ejemplos: 1, 5, 15, 60, 240, 4h, 1D, 1W'}
        </div>
      </form>
    </Dialog>
  );
}

/* ------------------------------ Shortcuts ------------------------------ */
const SHORTCUTS: [string, string][] = [
  ['Escribir letras', 'Abrir buscador de símbolos'],
  ['Escribir números', 'Cambiar temporalidad (ej: 15 Enter)'],
  ['/', 'Abrir indicadores'],
  ['Alt + H', 'Línea horizontal'],
  ['Alt + V', 'Línea vertical'],
  ['Alt + T', 'Línea de tendencia'],
  ['Alt + F', 'Retroceso de Fibonacci'],
  ['Alt + M', 'Regla / medir'],
  ['Alt + A', 'Crear alerta al precio actual'],
  ['Alt + R', 'Restablecer vista'],
  ['Alt + L', 'Escala logarítmica'],
  ['Alt + S', 'Descargar captura'],
  ['Alt + W', 'Agregar a la watchlist'],
  ['Ctrl + Z / Ctrl + Y', 'Deshacer / rehacer dibujo'],
  ['Supr / Backspace', 'Borrar dibujo seleccionado'],
  ['Esc', 'Cancelar herramienta / cerrar paneles'],
  ['Shift + F', 'Modo foco (ocultar paneles)'],
  ['↑ / ↓', 'Símbolo anterior / siguiente de la watchlist'],
  ['Espacio', 'Play / pausa del replay'],
  ['Shift + →', 'Avanzar una vela en replay'],
  ['?', 'Ver esta ayuda'],
];

export function ShortcutsDialog() {
  const close = () => useStore.getState().set({ shortcutsOpen: false });
  return (
    <Dialog title="Atajos de teclado" onClose={close}>
      <div className="dialog-body" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 18px', alignItems: 'center' }}>
        {SHORTCUTS.map(([k, d]) => (
          <div key={k} style={{ display: 'contents' }}>
            <span style={{ whiteSpace: 'nowrap' }}>{k.split(' / ').map((part, i) => <span key={i}>{i > 0 && ' / '}{part.split(' + ').map((x, j) => <span key={j}>{j > 0 && ' + '}<kbd>{x}</kbd></span>)}</span>)}</span>
            <span className="muted">{d}</span>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/* ------------------------------ Settings ------------------------------ */
export function SettingsDialog() {
  const s = useStore();
  const [key, setKey] = useState(s.tdKey);
  const close = () => s.set({ settingsOpen: false });
  useEffect(() => setKey(s.tdKey), [s.tdKey]);
  const save = () => {
    s.set({ tdKey: key.trim(), settingsOpen: false });
    setTwelveDataKey(key.trim());
    // reload panes that use Twelve Data
    s.panes.forEach((p) => { if (!isCrypto(p.symbol)) controllers.get(p.id)?.load(p.symbol, p.tf); });
    s.toast({ kind: 'ok', title: 'Ajustes guardados' });
  };
  return (
    <Dialog title="Ajustes" size="sm" onClose={close}
      footer={<><button className="btn sm" style={{ border: '1px solid var(--border)' }} onClick={close}>Cancelar</button><button className="btn sm solid" onClick={save}>Guardar</button></>}>
      <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="field">
          <label>API key de Twelve Data (acciones, forex, índices)</label>
          <input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Pegá tu key gratuita" />
          <span className="muted" style={{ fontSize: 12 }}>
            Es gratis (800 consultas/día). Se guarda solo en este navegador.{' '}
            <a href="https://twelvedata.com/pricing" target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>Conseguir key <ExternalLink size={11} /></a>
          </span>
        </div>
        <div className="menu-sep" />
        <label className="switch"><span>Zona horaria del reloj</span>
          <select className="input" style={{ width: 140, height: 30 }} value={s.timezone} onChange={(e) => s.set({ timezone: e.target.value as 'local' | 'UTC' })}>
            <option value="local">Local</option><option value="UTC">UTC</option>
          </select>
        </label>
        <label className="switch"><span>Sonido en alertas</span><input type="checkbox" checked={s.sound} onChange={(e) => s.set({ sound: e.target.checked })} /></label>
        <label className="switch"><span>Mostrar trades del diario en el gráfico</span><input type="checkbox" checked={s.showTradesOnChart} onChange={(e) => s.set({ showTradesOnChart: e.target.checked })} /></label>
        <label className="switch"><span>Sincronizar cruz entre gráficos</span><input type="checkbox" checked={s.syncCrosshair} onChange={(e) => s.set({ syncCrosshair: e.target.checked })} /></label>
        <label className="switch"><span>Mantener herramienta de dibujo activa</span><input type="checkbox" checked={s.keepTool} onChange={(e) => s.set({ keepTool: e.target.checked })} /></label>
        <div className="menu-sep" />
        <button className="btn sm danger" style={{ color: 'var(--down)', justifyContent: 'flex-start' }} onClick={() => {
          if (confirm('¿Restablecer la configuración del gráfico? Se conservan diario, alertas y watchlist.')) {
            localStorage.removeItem('tvg-state-v2');
            const keep = { trades: s.trades, alerts: s.alerts, watchlist: s.watchlist, tdKey: s.tdKey };
            localStorage.setItem('tvg-state-v2', JSON.stringify({ state: keep, version: 1 }));
            location.reload();
          }
        }}>Restablecer diseño del gráfico</button>
      </div>
    </Dialog>
  );
}
