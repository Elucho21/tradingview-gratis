import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsRight, Copy, Eye, EyeOff, Bell, Minus, RotateCcw, Settings2, Trash2, X, Play, Pause, StepForward, LogOut, Lock, Unlock } from 'lucide-react';
import type { PaneState } from '../types';
import { ChartController, type LegendData } from '../chart/controller';
import { controllers, crosshairBus } from '../chart/registry';
import { indicatorDef, indicatorLabel } from '../chart/indicators';
import { getSymbolInfo, tfShort } from '../data/symbols';
import { useStore, uid } from '../store';
import { fmtPct, fmtPrice, Popover } from './ui';
import { IndicatorSettingsDialog } from './dialogs/IndicatorSettings';

function ChartPaneInner({ pane, multi }: { pane: PaneState; multi: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<ChartController | null>(null);
  const [legend, setLegend] = useState<LegendData | null>(null);
  const [status, setStatus] = useState<{ loading: boolean; error: string | null; needsKey?: boolean }>({ loading: true, error: null });
  const [atRealtime, setAtRealtime] = useState(true);
  const compact = multi || window.innerWidth < 720;
  const [legendOpen, setLegendOpen] = useState(!compact);
  useEffect(() => setLegendOpen(!compact), [compact]);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; price: number | null } | null>(null);
  const [editInd, setEditInd] = useState<string | null>(null);
  const [scaleW, setScaleW] = useState(60);

  const theme = useStore((s) => s.theme);
  const isActive = useStore((s) => s.activePaneId === pane.id);
  const alerts = useStore((s) => s.alerts);
  const trades = useStore((s) => s.trades);
  const showTrades = useStore((s) => s.showTradesOnChart);
  const replay = useStore((s) => (s.replay?.paneId === pane.id ? s.replay : null));
  const drawingsLocked = useStore((s) => s.drawingsLocked);
  const set = useStore((s) => s.set);

  // create / destroy controller
  useEffect(() => {
    const ctrl = new ChartController(hostRef.current!, pane.id, {
      onLegend: setLegend,
      onStatus: setStatus,
      onCrosshair: (t) => { if (useStore.getState().syncCrosshair) crosshairBus.emit(pane.id, t); },
      onView: (v) => setAtRealtime(v.atRealtime),
      onReplayEnd: () => {
        const st = useStore.getState();
        if (st.replay) st.set({ replay: { ...st.replay, status: 'paused' } });
        st.toast({ kind: 'info', title: 'Replay terminado', body: 'Llegaste a la última vela disponible.' });
      },
    });
    ctrlRef.current = ctrl;
    controllers.set(pane.id, ctrl);
    const offBus = crosshairBus.on((from, t) => { if (from !== pane.id) ctrl.syncCrosshair(t); });
    const id = window.setInterval(() => setScaleW(ctrl.chart.priceScale('right').width() || 60), 1000);
    return () => {
      offBus();
      clearInterval(id);
      controllers.delete(pane.id);
      ctrl.destroy();
      ctrlRef.current = null;
    };
  }, [pane.id]);

  useEffect(() => { ctrlRef.current?.setTheme(theme); }, [theme]);
  useEffect(() => { ctrlRef.current?.load(pane.symbol, pane.tf); }, [pane.symbol, pane.tf]);
  useEffect(() => { ctrlRef.current?.setChartType(pane.chartType); }, [pane.chartType]);
  useEffect(() => { ctrlRef.current?.setIndicators(pane.indicators); }, [pane.indicators]);
  useEffect(() => { ctrlRef.current?.setCompare(pane.compare); }, [pane.compare]);
  useEffect(() => { ctrlRef.current?.setScaleMode(pane.logScale, pane.percentScale); }, [pane.logScale, pane.percentScale]);
  useEffect(() => { ctrlRef.current?.setAlerts(alerts.filter((a) => a.symbol === pane.symbol)); }, [alerts, pane.symbol, status.loading]);
  useEffect(() => { ctrlRef.current?.setTrades(showTrades ? trades.filter((t) => t.symbol === pane.symbol) : []); }, [trades, showTrades, pane.symbol, status.loading]);

  // global "ticks" from toolbar/shortcuts that target the active pane
  const resetTick = useStore((s) => s.resetViewTick);
  const liveTick = useStore((s) => s.goLiveTick);
  const shotTick = useStore((s) => s.screenshotTick);
  const seen = useRef({ reset: resetTick, live: liveTick, shot: shotTick.n });
  useEffect(() => {
    if (seen.current.reset === resetTick) return;
    seen.current.reset = resetTick;
    if (isActive) ctrlRef.current?.resetView();
  }, [resetTick]);
  useEffect(() => {
    if (seen.current.live === liveTick) return;
    seen.current.live = liveTick;
    if (isActive) ctrlRef.current?.goLive();
  }, [liveTick]);
  useEffect(() => {
    if (seen.current.shot === shotTick.n) return;
    seen.current.shot = shotTick.n;
    if (!isActive || !ctrlRef.current || !ctrlRef.current.lastBar()) return;
    const canvas = ctrlRef.current.screenshot(`${pane.symbol} · ${tfShort(pane.tf)} · ${getSymbolInfo(pane.symbol).exchange}`);
    if (shotTick.mode === 'copy' && navigator.clipboard && 'ClipboardItem' in window) {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          useStore.getState().toast({ kind: 'ok', title: 'Captura copiada al portapapeles' });
        } catch {
          useStore.getState().toast({ kind: 'error', title: 'No se pudo copiar', body: 'Tu navegador no lo permite. Probá con Descargar.' });
        }
      });
    } else {
      const a = document.createElement('a');
      a.download = `${pane.symbol.replace('/', '')}_${pane.tf}_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      useStore.getState().toast({ kind: 'ok', title: 'Captura descargada' });
    }
  }, [shotTick]);

  // replay control
  useEffect(() => {
    const c = ctrlRef.current;
    if (!c) return;
    if (!replay) { if (c.replayIdx !== null) c.exitReplay(); return; }
    if (replay.status === 'playing') c.replayPlay(replay.speed);
    else c.replayPause();
  }, [replay?.status, replay?.speed, !!replay]);

  const info = getSymbolInfo(pane.symbol);
  const bar = legend?.bar ?? null;
  const prev = legend?.prevClose ?? null;
  const chg = bar && prev ? bar.close - prev : null;
  const chgPct = bar && prev ? ((bar.close - prev) / prev) * 100 : null;
  const dirClass = chg === null ? '' : chg >= 0 ? 'up' : 'down';
  const ref = bar?.close;

  const onContext = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const c = ctrlRef.current;
    if (!c) return;
    useStore.getState().setActivePane(pane.id);
    const r = hostRef.current!.getBoundingClientRect();
    setCtxMenu({ x: e.clientX, y: e.clientY, price: c.priceAtY(e.clientY - r.top) });
  }, [pane.id]);

  const fmtP = (p: number) => ctrlRef.current?.fmt(p) ?? fmtPrice(p);

  const ctxActions = useMemo(() => {
    if (!ctxMenu) return null;
    const st = useStore.getState();
    const p = ctxMenu.price;
    return (
      <>
        {p !== null && (
          <>
            <button className="menu-item" onClick={() => { st.set({ alertDialog: { open: true, price: +fmtP(p).replace(/,/g, ''), symbol: pane.symbol } }); setCtxMenu(null); }}>
              <Bell /> Agregar alerta en {fmtP(p)} <span className="kbd">Alt+A</span>
            </button>
            <button className="menu-item" onClick={() => {
              const list = st.drawings[pane.symbol] ?? [];
              st.setDrawings(pane.symbol, [...list, { id: uid(), type: 'hline', points: [{ t: 0, p }], color: '#2962ff' }]);
              setCtxMenu(null);
            }}>
              <Minus /> Línea horizontal en {fmtP(p)} <span className="kbd">Alt+H</span>
            </button>
            <button className="menu-item" onClick={() => { navigator.clipboard?.writeText(fmtP(p).replace(/,/g, '')); st.toast({ kind: 'ok', title: `Precio copiado: ${fmtP(p)}` }); setCtxMenu(null); }}>
              <Copy /> Copiar precio
            </button>
            <div className="menu-sep" />
          </>
        )}
        <button className="menu-item" onClick={() => { ctrlRef.current?.resetView(); setCtxMenu(null); }}><RotateCcw /> Restablecer vista <span className="kbd">Alt+R</span></button>
        <button className="menu-item" onClick={() => { st.set({ drawingsHidden: !st.drawingsHidden }); setCtxMenu(null); }}>
          {st.drawingsHidden ? <Eye /> : <EyeOff />} {st.drawingsHidden ? 'Mostrar dibujos' : 'Ocultar dibujos'}
        </button>
        <button className="menu-item" onClick={() => { st.set({ drawingsLocked: !st.drawingsLocked }); setCtxMenu(null); }}>
          {st.drawingsLocked ? <Unlock /> : <Lock />} {st.drawingsLocked ? 'Desbloquear dibujos' : 'Bloquear dibujos'}
        </button>
        <button className="menu-item danger" onClick={() => { st.clearDrawings(pane.symbol); setCtxMenu(null); }}><Trash2 /> Borrar dibujos de {pane.symbol}</button>
        <div className="menu-sep" />
        <button className={`menu-item ${pane.logScale ? 'on' : ''}`} onClick={() => { st.updatePane(pane.id, { logScale: !pane.logScale, percentScale: false }); setCtxMenu(null); }}>Escala logarítmica <span className="kbd">Alt+L</span></button>
        <button className={`menu-item ${pane.percentScale ? 'on' : ''}`} onClick={() => { st.updatePane(pane.id, { percentScale: !pane.percentScale, logScale: false }); setCtxMenu(null); }}>Escala porcentual</button>
      </>
    );
  }, [ctxMenu, pane]);

  const editing = pane.indicators.find((i) => i.id === editInd);

  return (
    <div className={`pane ${multi ? 'multi' : ''} ${isActive ? 'active' : ''}`} onContextMenu={onContext}
      onMouseDownCapture={() => { if (!isActive) useStore.getState().setActivePane(pane.id); }}>
      <div className="watermark">{pane.symbol.replace(/USDT$/, '')}</div>
      <div ref={hostRef} className="chart-host" />

      <div className="legend">
        <div className="legend-main">
          <span className="legend-title" onClick={() => set({ search: { open: true, mode: 'change', initial: '' } })} title="Cambiar símbolo">
            {pane.symbol} · {tfShort(pane.tf)} · {info.exchange}
          </span>
          {bar && (
            <span className="legend-ohlc num">
              <span><b>A</b><span className={dirClass}>{fmtP(bar.open)}</span></span>
              <span><b>M</b><span className={dirClass}>{fmtP(bar.high)}</span></span>
              <span><b>m</b><span className={dirClass}>{fmtP(bar.low)}</span></span>
              <span><b>C</b><span className={dirClass}>{fmtP(bar.close)}</span></span>
              {chg !== null && <span className={dirClass}>{chg >= 0 ? '+' : ''}{fmtP(chg)} ({fmtPct(chgPct)})</span>}
            </span>
          )}
        </div>
        {bar && (!multi || legendOpen) && <div className={`pane-big-price num ${dirClass}`}>{fmtP(bar.close)}</div>}
        {legendOpen && pane.indicators.map((i) => {
          const def = indicatorDef(i.type);
          const vals = legend?.values[i.id] ?? [];
          const shown = vals.filter((v): v is number => v !== null && v !== undefined).slice(0, 3);
          return (
            <div key={i.id} className={`legend-row ${i.hidden ? 'off' : ''}`}>
              <span className="legend-dot" style={{ background: i.color }} />
              <span>{indicatorLabel(i.type, i.params)}</span>
              {!i.hidden && shown.map((v, k) => (
                <span key={k} className="num" style={{ color: k === 0 ? i.color : 'var(--text-2)' }}>
                  {i.type === 'volume' || i.type === 'obv' ? Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(v) : def.overlay || i.type === 'atr' || i.type === 'macd' ? fmtPrice(v, ref) : v.toFixed(2)}
                </span>
              ))}
              <span className="acts">
                <button title={i.hidden ? 'Mostrar' : 'Ocultar'} onClick={() => useStore.getState().updateIndicator(pane.id, i.id, { hidden: !i.hidden })}>{i.hidden ? <EyeOff /> : <Eye />}</button>
                <button title="Configurar" onClick={() => setEditInd(i.id)}><Settings2 /></button>
                <button title="Eliminar" onClick={() => useStore.getState().removeIndicator(pane.id, i.id)}><X /></button>
              </span>
            </div>
          );
        })}
        {legendOpen && pane.compare.map((c) => (
          <div key={c} className="legend-row">
            <span className="legend-dot" style={{ background: ['#ff9800', '#e91e63', '#00bcd4', '#8bc34a'][pane.compare.indexOf(c) % 4] }} />
            <span>{c}</span>
            <span className="num muted">{legend?.compare[c] != null ? fmtPrice(legend.compare[c]) : ''}</span>
            <span className="acts"><button title="Quitar comparación" onClick={() => { useStore.getState().setActivePane(pane.id); useStore.getState().removeCompare(c); }}><X /></button></span>
          </div>
        ))}
        {(pane.indicators.length > 0 || pane.compare.length > 0) && (
          <button className="legend-toggle" onClick={() => setLegendOpen((o) => !o)}>
            {legendOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {legendOpen ? '' : `${pane.indicators.length + pane.compare.length} indicadores`}
          </button>
        )}
      </div>

      <div className="scalebtns" style={{ bottom: 34, right: scaleW + 6 }}>
        <button className={pane.percentScale ? 'on' : ''} title="Escala porcentual" onClick={() => useStore.getState().updatePane(pane.id, { percentScale: !pane.percentScale, logScale: false })}>%</button>
        <button className={pane.logScale ? 'on' : ''} title="Escala logarítmica (Alt+L)" onClick={() => useStore.getState().updatePane(pane.id, { logScale: !pane.logScale, percentScale: false })}>log</button>
        <button title="Autoajustar escala" onClick={() => ctrlRef.current?.autoScale()}>auto</button>
      </div>

      {!atRealtime && !replay && (
        <button className="golive" style={{ bottom: 64, right: scaleW + 10 }} title="Ir al tiempo real" onClick={() => ctrlRef.current?.goLive()}><ChevronsRight /></button>
      )}

      {(status.loading || status.error) && (
        <div className="pane-msg">
          {status.loading ? <div className="spinner" style={{ padding: 0, border: undefined }} /> : (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>No se pudo cargar {pane.symbol}</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{status.error}</div>
              <div className="row" style={{ justifyContent: 'center' }}>
                {status.needsKey && <button className="btn solid sm" onClick={() => set({ settingsOpen: true })}>Cargar API key</button>}
                <button className="btn sm" style={{ border: '1px solid var(--border)' }} onClick={() => ctrlRef.current?.load(pane.symbol, pane.tf)}>Reintentar</button>
                <button className="btn sm" style={{ border: '1px solid var(--border)' }} onClick={() => useStore.getState().setSymbol('BTCUSDT', pane.id)}>Volver a BTC</button>
              </div>
            </div>
          )}
        </div>
      )}

      {replay?.status === 'select' && <div className="replay-hint">Hacé clic en el gráfico para elegir el punto de inicio del replay · Esc para cancelar</div>}
      {replay && replay.status !== 'select' && (
        <div className="replaybar">
          <span className="muted" style={{ padding: '0 8px', fontSize: 12 }}>Replay</span>
          {replay.status === 'playing'
            ? <button className="btn sm" title="Pausa (Espacio)" onClick={() => set({ replay: { ...replay, status: 'paused' } })}><Pause /></button>
            : <button className="btn sm" title="Reproducir (Espacio)" onClick={() => set({ replay: { ...replay, status: 'playing' } })}><Play /></button>}
          <button className="btn sm" title="Avanzar una vela (Shift+→)" onClick={() => ctrlRef.current?.replayStep()}><StepForward /></button>
          <div className="sep" />
          {[1, 3, 10].map((s) => (
            <button key={s} className={`btn sm ${replay.speed === s ? 'active' : ''}`} onClick={() => set({ replay: { ...replay, speed: s } })}>{s}x</button>
          ))}
          <div className="sep" />
          <button className="btn sm" title="Elegir otro inicio" onClick={() => { ctrlRef.current?.exitReplay(); set({ replay: { ...replay, status: 'select' } }); }}><RotateCcw /></button>
          <button className="btn sm" title="Salir del replay" onClick={() => set({ replay: null })}><LogOut /></button>
        </div>
      )}

      <Popover anchor={ctxMenu ?? { x: 0, y: 0 }} open={!!ctxMenu} onClose={() => setCtxMenu(null)}>
        {ctxActions}
      </Popover>

      {editing && (
        <IndicatorSettingsDialog indicator={editing} onClose={() => setEditInd(null)}
          onSave={(patch) => { useStore.getState().updateIndicator(pane.id, editing.id, patch); setEditInd(null); }} />
      )}
      {drawingsLocked && <div style={{ position: 'absolute', top: 8, right: scaleW + 8, zIndex: 5, color: 'var(--muted)' }} title="Dibujos bloqueados"><Lock size={14} /></div>}
    </div>
  );
}

export const ChartPane = memo(ChartPaneInner);
