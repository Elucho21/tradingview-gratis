import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { INDICATORS } from '../../chart/indicators';
import { useActivePane, useStore } from '../../store';
import { Dialog } from '../ui';

const CATS = ['Todos', 'Tendencia', 'Osciladores', 'Volatilidad', 'Volumen'] as const;

export function IndicatorsDialog() {
  const close = () => useStore.getState().set({ indicatorsOpen: false });
  const pane = useActivePane();
  const addIndicator = useStore((s) => s.addIndicator);
  const toast = useStore((s) => s.toast);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<(typeof CATS)[number]>('Todos');
  const [kbd, setKbd] = useState(0);

  const list = useMemo(() => INDICATORS.filter((d) => (cat === 'Todos' || d.category === cat)
    && (!q || `${d.name} ${d.short} ${d.description}`.toLowerCase().includes(q.toLowerCase()))), [q, cat]);

  const add = (type: (typeof INDICATORS)[number]['type']) => {
    addIndicator(type);
    const d = INDICATORS.find((x) => x.type === type)!;
    toast({ kind: 'ok', title: `${d.short} agregado`, body: 'Configuralo desde la leyenda del gráfico (ícono de engranaje).' });
  };

  return (
    <Dialog title="Indicadores" onClose={close}>
      <div className="searchbox">
        <Search size={18} className="muted" />
        <input autoFocus placeholder="Buscar indicador (RSI, Bollinger, VWAP…)" value={q} style={{ textTransform: 'none' }}
          onChange={(e) => { setQ(e.target.value); setKbd(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setKbd((k) => Math.min(list.length - 1, k + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setKbd((k) => Math.max(0, k - 1)); }
            if (e.key === 'Enter' && list[kbd]) add(list[kbd].type);
          }} />
      </div>
      <div className="tabs">
        {CATS.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {list.map((d, i) => {
          const count = pane.indicators.filter((x) => x.type === d.type).length;
          return (
            <div key={d.type} className={`result ${i === kbd ? 'kbd-active' : ''}`} onClick={() => add(d.type)} onMouseEnter={() => setKbd(i)}>
              <span className="legend-dot" style={{ background: d.color, width: 10, height: 10 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{d.name} <span className="muted">({d.short})</span></div>
                <div className="muted" style={{ fontSize: 12 }}>{d.description}</div>
              </div>
              {count > 0 && <span className="tag" style={{ color: 'var(--blue)' }}>{count} activo{count > 1 ? 's' : ''}</span>}
              <span className="tag">{d.overlay ? 'En precio' : 'Panel'}</span>
            </div>
          );
        })}
        {!list.length && <div className="empty">No hay indicadores que coincidan.</div>}
      </div>
    </Dialog>
  );
}
