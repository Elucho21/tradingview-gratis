import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import {
  Zap, ChevronDown, Plus, BarChart3, CandlestickChart, LineChart, AreaChart, Activity, Bell, History,
  Undo2, Redo2, Sun, Moon, Camera, Maximize, Minimize, Settings, Keyboard, Code2, Download, Copy, Link2,
  LayoutGrid, Square, Columns2, Rows2, PanelRight, Pencil, Focus,
} from 'lucide-react';
import type { ChartType, Layout } from '../types';
import { TIMEFRAMES, tfShort } from '../data/symbols';
import { supportedTimeframes } from '../data/feed';
import { useActivePane, useStore } from '../store';
import { Popover, SymbolIcon } from './ui';
import { DrawingToolsMenu } from './LeftToolbar';

const FAV_TF = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const;

export const CHART_TYPES: { id: ChartType; label: string; icon: ReactNode }[] = [
  { id: 'candles', label: 'Velas', icon: <CandlestickChart /> },
  { id: 'hollow', label: 'Velas huecas', icon: <CandlestickChart style={{ opacity: 0.6 }} /> },
  { id: 'heikin', label: 'Heikin Ashi', icon: <CandlestickChart style={{ color: 'var(--orange)' }} /> },
  { id: 'bars', label: 'Barras', icon: <BarChart3 /> },
  { id: 'line', label: 'Línea', icon: <LineChart /> },
  { id: 'area', label: 'Área', icon: <AreaChart /> },
  { id: 'baseline', label: 'Línea base', icon: <Activity /> },
];

const LAYOUTS: { id: Layout; label: string; icon: ReactNode }[] = [
  { id: '1', label: '1 gráfico', icon: <Square /> },
  { id: '2h', label: '2 lado a lado', icon: <Columns2 /> },
  { id: '2v', label: '2 apilados', icon: <Rows2 /> },
  { id: '3', label: '3 gráficos', icon: <LayoutGrid /> },
  { id: '4', label: '4 gráficos', icon: <LayoutGrid /> },
];

export function TopBar() {
  const pane = useActivePane();
  const s = useStore();
  const [open, setOpen] = useState<null | 'tf' | 'type' | 'layout' | 'shot' | 'draw'>(null);
  const tfRef = useRef<HTMLButtonElement>(null);
  const typeRef = useRef<HTMLButtonElement>(null);
  const layoutRef = useRef<HTMLButtonElement>(null);
  const shotRef = useRef<HTMLButtonElement>(null);
  const drawRef = useRef<HTMLButtonElement>(null);
  const [fs, setFs] = useState(!!document.fullscreenElement);
  const supported = supportedTimeframes(pane.symbol);
  const close = () => setOpen(null);
  const type = CHART_TYPES.find((c) => c.id === pane.chartType) ?? CHART_TYPES[0];
  const tfInFav = (FAV_TF as readonly string[]).includes(pane.tf);

  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* not allowed */ }
    setFs(!!document.fullscreenElement);
  };

  const shareLink = () => {
    const url = `${location.origin}${location.pathname}?s=${encodeURIComponent(pane.symbol)}&tf=${pane.tf}`;
    navigator.clipboard?.writeText(url);
    s.toast({ kind: 'ok', title: 'Link copiado', body: url });
    close();
  };

  return (
    <header className="topbar">
      <div className="logo hide-sm">
        <div className="logo-mark"><Zap /></div>
        <span className="hide-sm">TradingView <small>Gratis</small></span>
      </div>

      <button className="btn symbtn" onClick={() => s.set({ search: { open: true, mode: 'change', initial: '' } })} title="Buscar símbolo (empezá a escribir)">
        <SymbolIcon symbol={pane.symbol} size={20} />
        {pane.symbol}
      </button>
      <button className="btn ghost hide-sm" title="Comparar o agregar símbolo" onClick={() => s.set({ search: { open: true, mode: 'compare', initial: '' } })}><Plus /></button>
      <div className="sep" />

      {FAV_TF.map((tf) => (
        <button key={tf} className={`btn tfbtn hide-sm ${pane.tf === tf ? 'active' : ''}`} disabled={!supported.includes(tf)}
          onClick={() => s.setTimeframe(tf)} title={TIMEFRAMES.find((t) => t.tf === tf)?.label}>{tfShort(tf)}</button>
      ))}
      <button ref={tfRef} className={`btn tfbtn ${!tfInFav ? 'active' : ''}`} onClick={() => setOpen(open === 'tf' ? null : 'tf')} title="Más temporalidades">
        <span className={tfInFav ? 'mobile-only' : ''}>{tfShort(pane.tf)}</span><ChevronDown size={14} />
      </button>
      <Popover anchor={tfRef} open={open === 'tf'} onClose={close}>
        {['Minutos', 'Horas', 'Días'].map((g) => (
          <div key={g}>
            <div className="menu-group">{g}</div>
            {TIMEFRAMES.filter((t) => t.group === g).map((t) => (
              <button key={t.tf} className={`menu-item ${pane.tf === t.tf ? 'on' : ''}`} disabled={!supported.includes(t.tf)}
                style={{ opacity: supported.includes(t.tf) ? 1 : 0.35 }} onClick={() => { s.setTimeframe(t.tf); close(); }}>
                {t.label}<span className="kbd">{tfShort(t.tf)}</span>
              </button>
            ))}
          </div>
        ))}
        <div className="menu-sep" />
        <div className="menu-group" style={{ textTransform: 'none' }}>Tip: escribí “240” + Enter en el gráfico</div>
      </Popover>
      <div className="sep" />

      <button ref={typeRef} className="btn" title={`Tipo de gráfico: ${type.label}`} onClick={() => setOpen(open === 'type' ? null : 'type')}>{type.icon}<ChevronDown size={14} className="hide-sm" /></button>
      <Popover anchor={typeRef} open={open === 'type'} onClose={close}>
        {CHART_TYPES.map((c) => (
          <button key={c.id} className={`menu-item ${pane.chartType === c.id ? 'on' : ''}`} onClick={() => { s.setChartType(c.id); close(); }}>{c.icon}{c.label}</button>
        ))}
      </Popover>

      <button className="btn" onClick={() => s.set({ indicatorsOpen: true })} title="Indicadores (/)">
        <Activity /><span className="hide-sm">Indicadores</span>
        {pane.indicators.length > 0 && <span className="tag" style={{ color: 'var(--blue)' }}>{pane.indicators.length}</span>}
      </button>

      <button ref={drawRef} className="btn mobile-only" title="Herramientas de dibujo" onClick={() => setOpen(open === 'draw' ? null : 'draw')}><Pencil /></button>
      <Popover anchor={drawRef} open={open === 'draw'} onClose={close}><DrawingToolsMenu onPick={close} /></Popover>

      <div className="sep hide-sm" />
      <button className="btn" title="Crear alerta (Alt+A)" onClick={() => s.set({ alertDialog: { open: true } })}><Bell /><span className="hide-md">Alerta</span></button>
      <button className={`btn ${s.replay ? 'active' : ''}`} title="Replay de velas" onClick={() => s.set({ replay: s.replay ? null : { paneId: pane.id, status: 'select', speed: 3 } })}>
        <History /><span className="hide-md">Replay</span>
      </button>
      <div className="sep hide-sm" />
      <button className="btn hide-sm" title="Deshacer (Ctrl+Z)" disabled={!s.undoStack.length} onClick={s.undo}><Undo2 /></button>
      <button className="btn hide-sm" title="Rehacer (Ctrl+Y)" disabled={!s.redoStack.length} onClick={s.redo}><Redo2 /></button>

      <div style={{ flex: 1, minWidth: 8 }} />

      <button ref={layoutRef} className="btn hide-sm" title="Diseño multi-gráfico" onClick={() => setOpen(open === 'layout' ? null : 'layout')}>
        {LAYOUTS.find((l) => l.id === s.layout)?.icon}<ChevronDown size={14} className="hide-sm" />
      </button>
      <Popover anchor={layoutRef} open={open === 'layout'} onClose={close} align="right">
        <div className="menu-group">Diseño</div>
        {LAYOUTS.map((l) => (
          <button key={l.id} className={`menu-item ${s.layout === l.id ? 'on' : ''}`} onClick={() => { s.setLayout(l.id); close(); }}>{l.icon}{l.label}</button>
        ))}
        <div className="menu-sep" />
        <div className="menu-group">Sincronizar</div>
        <label className="menu-item"><input type="checkbox" checked={s.syncSymbol} onChange={(e) => s.set({ syncSymbol: e.target.checked })} /> Símbolo</label>
        <label className="menu-item"><input type="checkbox" checked={s.syncInterval} onChange={(e) => s.set({ syncInterval: e.target.checked })} /> Temporalidad</label>
        <label className="menu-item"><input type="checkbox" checked={s.syncCrosshair} onChange={(e) => s.set({ syncCrosshair: e.target.checked })} /> Cruz (crosshair)</label>
      </Popover>

      <button className="btn hide-sm" title={s.theme === 'dark' ? 'Tema claro' : 'Tema oscuro'} onClick={() => s.setTheme(s.theme === 'dark' ? 'light' : 'dark')}>{s.theme === 'dark' ? <Sun /> : <Moon />}</button>
      <button ref={shotRef} className="btn" title="Captura y compartir" onClick={() => setOpen(open === 'shot' ? null : 'shot')}><Camera /></button>
      <Popover anchor={shotRef} open={open === 'shot'} onClose={close} align="right">
        <button className="menu-item" onClick={() => { s.set({ screenshotTick: { n: s.screenshotTick.n + 1, mode: 'download' } }); close(); }}><Download /> Descargar imagen <span className="kbd">Alt+S</span></button>
        <button className="menu-item" onClick={() => { s.set({ screenshotTick: { n: s.screenshotTick.n + 1, mode: 'copy' } }); close(); }}><Copy /> Copiar imagen</button>
        <button className="menu-item" onClick={shareLink}><Link2 /> Copiar link del gráfico</button>
      </Popover>
      <button className={`btn hide-sm ${s.focusMode ? 'active' : ''}`} title="Modo foco (Shift+F)" onClick={() => s.set({ focusMode: !s.focusMode })}><Focus /></button>
      <button className="btn hide-sm" title="Pantalla completa" onClick={toggleFs}>{fs ? <Minimize /> : <Maximize />}</button>
      <button className="btn hide-md" title="Atajos de teclado (?)" onClick={() => s.set({ shortcutsOpen: true })}><Keyboard /></button>
      <button className="btn hide-sm" title="Ajustes" onClick={() => s.set({ settingsOpen: true })}><Settings /></button>
      <a className="btn hide-md" href="https://github.com/Elucho21/tradingview-gratis" target="_blank" rel="noreferrer" title="Código fuente"><Code2 /></a>
      <button className={`btn mobile-only ${s.rightPanel ? 'active' : ''}`} title="Watchlist" onClick={() => s.set({ rightPanel: s.rightPanel ? null : 'watchlist' })}><PanelRight /></button>
    </header>
  );
}
