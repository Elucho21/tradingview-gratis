import { useEffect, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { streams } from '../data/feed';
import { isCrypto } from '../data/feed';
import type { ConnStatus } from '../data/binance';
import { getSymbolInfo } from '../data/symbols';
import { useActivePane, useStore } from '../store';
import { useTicker } from './RightPanel';
import { fmtCompact, fmtPct, fmtPrice } from './ui';

export function BottomBar() {
  const pane = useActivePane();
  const t = useTicker(pane.symbol);
  const tz = useStore((s) => s.timezone);
  const journalOpen = useStore((s) => s.journalOpen);
  const set = useStore((s) => s.set);
  const [conn, setConn] = useState<ConnStatus>('offline');
  const [now, setNow] = useState(new Date());
  useEffect(() => streams.onStatus(setConn), []);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const info = getSymbolInfo(pane.symbol);
  const crypto = isCrypto(pane.symbol);
  const time = now.toLocaleTimeString('es-AR', { hour12: false, timeZone: tz === 'UTC' ? 'UTC' : undefined });
  const tzLabel = tz === 'UTC' ? 'UTC' : `UTC${-now.getTimezoneOffset() / 60 >= 0 ? '+' : ''}${-now.getTimezoneOffset() / 60}`;

  return (
    <footer className="bottombar">
      <span><span className="muted">Cambio 24h </span><span className={`num ${t && t.changePct >= 0 ? 'up' : 'down'}`}>{fmtPct(t?.changePct)}</span></span>
      <span><span className="muted">Máx. </span><span className="num up">{fmtPrice(t?.high)}</span></span>
      <span><span className="muted">Mín. </span><span className="num down">{fmtPrice(t?.low)}</span></span>
      <span className="hide-sm"><span className="muted">Volumen </span><span className="num">{fmtCompact(t?.volume)}</span></span>
      {t?.quoteVolume ? <span className="hide-sm"><span className="muted">Vol. {info.quote} </span><span className="num">{fmtCompact(t.quoteVolume)}</span></span> : null}
      <span style={{ flex: 1 }} />
      <span className="row" style={{ gap: 6 }} title={crypto ? 'Conexión en tiempo real con Binance' : 'Datos de Twelve Data (se actualizan cada minuto)'}>
        <span className={`dot ${crypto ? conn : 'connecting'}`} />
        <span className="muted">{crypto ? (conn === 'live' ? 'Binance · en vivo' : conn === 'connecting' ? 'Conectando…' : 'Sin conexión') : 'Twelve Data · 1 min'}</span>
      </span>
      <button className="muted num" title="Cambiar zona horaria" onClick={() => set({ timezone: tz === 'UTC' ? 'local' : 'UTC' })}>{time} ({tzLabel})</button>
      <button className={`btn sm ${journalOpen ? 'active' : ''}`} onClick={() => set({ journalOpen: !journalOpen })}><NotebookPen /> Diario</button>
    </footer>
  );
}
