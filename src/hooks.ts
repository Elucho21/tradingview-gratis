import { useEffect } from 'react';
import { subscribeTicker } from './data/feed';
import { parseTimeframe, tfShort } from './data/symbols';
import { controllers } from './chart/registry';
import { getActivePane, useStore, uid } from './store';
import { isTyping } from './components/ui';

/* ------------------------------ alert engine ------------------------------ */

let audioCtx: AudioContext | null = null;
function beep() {
  try {
    audioCtx = audioCtx ?? new AudioContext();
    const ctx = audioCtx;
    [0, 0.18, 0.36].forEach((d, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = i === 2 ? 1046 : 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + d);
      o.stop(ctx.currentTime + d + 0.18);
    });
  } catch { /* audio not available */ }
}

export function useAlertEngine() {
  const symbols = useStore((s) => [...new Set(s.alerts.filter((a) => a.active).map((a) => a.symbol))].sort().join(','));
  useEffect(() => {
    if (!symbols) return;
    const prev = new Map<string, number>();
    const offs = symbols.split(',').map((sym) => subscribeTicker(sym, (t) => {
      const last = t.last;
      const before = prev.get(sym);
      prev.set(sym, last);
      const st = useStore.getState();
      for (const a of st.alerts) {
        if (!a.active || a.symbol !== sym) continue;
        let hit = false;
        if (a.condition === 'above') hit = last >= a.price;
        else if (a.condition === 'below') hit = last <= a.price;
        else if (before !== undefined) hit = (before < a.price && last >= a.price) || (before > a.price && last <= a.price);
        if (!hit) continue;
        st.updateAlert(a.id, { active: false, triggeredAt: Date.now() });
        const verb = a.condition === 'above' ? 'subió a' : a.condition === 'below' ? 'bajó a' : 'cruzó';
        const title = `🔔 ${sym} ${verb} ${a.price}`;
        const body = `Precio actual: ${last}${a.note ? ` · ${a.note}` : ''}`;
        st.toast({ kind: 'alert', title, body });
        if (st.sound) beep();
        if ('Notification' in window && Notification.permission === 'granted') {
          try { new Notification(title, { body, tag: a.id }); } catch { /* */ }
        }
      }
    }));
    return () => offs.forEach((o) => o());
  }, [symbols]);
}

/* ------------------------------ keyboard ------------------------------ */

export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const st = useStore.getState();
      const anyDialog = st.search.open || st.indicatorsOpen || st.shortcutsOpen || st.settingsOpen || st.alertDialog.open || st.textDialog.open || st.tfPrompt.open;
      if (anyDialog) return;
      const pane = getActivePane();
      const ctrl = controllers.get(pane.id);
      const k = e.key;

      if (k === 'Escape') {
        controllers.forEach((c) => c.cancelTemp());
        if (st.replay?.status === 'select') { st.set({ replay: null }); return; }
        if (st.tool !== 'cursor') { st.setTool('cursor'); return; }
        if (st.selectedDrawing) { st.set({ selectedDrawing: null }); return; }
        if (st.focusMode) { st.set({ focusMode: false }); return; }
        if (st.journalOpen) { st.set({ journalOpen: false }); return; }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (k.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); st.undo(); return; }
        if (k.toLowerCase() === 'y' || (k.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); st.redo(); return; }
        if (k.toLowerCase() === 'k') { e.preventDefault(); st.set({ search: { open: true, mode: 'change', initial: '' } }); return; }
        return;
      }
      if ((k === 'Delete' || k === 'Backspace') && st.selectedDrawing) { e.preventDefault(); st.removeSelectedDrawing(); return; }

      if (e.altKey) {
        const code = e.code.replace('Key', '').toLowerCase();
        const tools: Record<string, Parameters<typeof st.setTool>[0]> = { h: 'hline', v: 'vline', t: 'trend', f: 'fib', m: 'ruler' };
        if (tools[code]) { e.preventDefault(); controllers.forEach((c) => c.cancelTemp()); st.setTool(tools[code]); return; }
        if (code === 'r') { e.preventDefault(); st.set({ resetViewTick: st.resetViewTick + 1 }); return; }
        if (code === 'a') {
          e.preventDefault();
          const p = ctrl?.lastBar()?.close;
          st.set({ alertDialog: { open: true, price: p ? +ctrl!.fmt(p).replace(/,/g, '') : undefined } });
          return;
        }
        if (code === 'l') { e.preventDefault(); st.updatePane(pane.id, { logScale: !pane.logScale, percentScale: false }); return; }
        if (code === 's') { e.preventDefault(); st.set({ screenshotTick: { n: st.screenshotTick.n + 1, mode: 'download' } }); return; }
        if (code === 'w') {
          e.preventDefault();
          st.addToWatchlist(pane.symbol);
          st.toast({ kind: 'ok', title: `${pane.symbol} agregado a la watchlist` });
          return;
        }
        return;
      }

      // replay controls
      if (st.replay && st.replay.paneId === pane.id && st.replay.status !== 'select') {
        if (k === ' ') { e.preventDefault(); st.set({ replay: { ...st.replay, status: st.replay.status === 'playing' ? 'paused' : 'playing' } }); return; }
        if (k === 'ArrowRight' && e.shiftKey) { e.preventDefault(); ctrl?.replayStep(); return; }
      }

      if (k === 'F' && e.shiftKey) { st.set({ focusMode: !st.focusMode }); return; }
      if (k === '?') { st.set({ shortcutsOpen: true }); return; }
      if (k === '/') { e.preventDefault(); st.set({ indicatorsOpen: true }); return; }

      if (k === 'ArrowUp' || k === 'ArrowDown') {
        const wl = st.watchlist;
        if (!wl.length) return;
        e.preventDefault();
        const i = wl.indexOf(pane.symbol);
        const next = k === 'ArrowDown' ? wl[(i + 1) % wl.length] : wl[(i - 1 + wl.length) % wl.length];
        st.setSymbol(next);
        return;
      }

      if (/^[0-9]$/.test(k)) { e.preventDefault(); st.set({ tfPrompt: { open: true, initial: k } }); return; }
      if (/^[a-zA-Z]$/.test(k) && !e.shiftKey) { e.preventDefault(); st.set({ search: { open: true, mode: 'change', initial: k.toUpperCase() } }); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/* ------------------------- document title + URL sync ------------------------- */

export function useTitleAndUrl() {
  const pane = useStore((s) => s.panes.find((p) => p.id === s.activePaneId) ?? s.panes[0]);
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#131722' : '#ffffff');
  }, [theme]);
  useEffect(() => {
    let alive = true;
    const off = subscribeTicker(pane.symbol, (t) => {
      if (!alive) return;
      document.title = `${pane.symbol} ${t.last.toLocaleString('en-US', { maximumFractionDigits: t.last >= 100 ? 2 : 6 })} ${t.changePct >= 0 ? '▲' : '▼'} ${t.changePct.toFixed(2)}% — TradingView Gratis`;
    });
    document.title = `${pane.symbol} · ${tfShort(pane.tf)} — TradingView Gratis`;
    const url = new URL(location.href);
    url.searchParams.set('s', pane.symbol);
    url.searchParams.set('tf', pane.tf);
    history.replaceState(null, '', url.toString());
    return () => { alive = false; off(); };
  }, [pane.symbol, pane.tf]);
}

export { parseTimeframe, uid };
