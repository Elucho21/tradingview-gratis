import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Alert, ChartType, Drawing, Indicator, IndicatorType, Layout, PaneState, Timeframe, Tool, Trade } from './types';
import { defaultParams, indicatorDef } from './chart/indicators';
import { setTwelveDataKey } from './data/twelvedata';

export const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const EXTRA_COLORS = ['#f7a600', '#2962ff', '#e91e63', '#26c6da', '#7e57c2', '#66bb6a'];

export function makeIndicator(type: IndicatorType, params?: Record<string, number>, color?: string): Indicator {
  return { id: uid(), type, params: { ...defaultParams(type), ...params }, color: color ?? indicatorDef(type).color };
}

export function makePane(symbol = 'BTCUSDT', tf: Timeframe = '15m'): PaneState {
  return {
    id: uid(), symbol, tf, chartType: 'candles', compare: [], logScale: false, percentScale: false,
    indicators: [
      makeIndicator('ema', { period: 20 }, '#f7a600'),
      makeIndicator('ema', { period: 50 }, '#2962ff'),
      makeIndicator('volume'),
      makeIndicator('rsi'),
    ],
  };
}

export type RightTab = 'watchlist' | 'book' | 'trades' | 'alerts' | 'info';
export type SearchMode = 'change' | 'compare' | 'watch';

export interface Toast { id: string; title: string; body?: string; kind: 'info' | 'alert' | 'error' | 'ok' }

export interface ReplayState { paneId: string; status: 'select' | 'paused' | 'playing'; speed: number }

interface State {
  theme: 'dark' | 'light';
  layout: Layout;
  panes: PaneState[];
  activePaneId: string;
  syncInterval: boolean;
  syncSymbol: boolean;
  syncCrosshair: boolean;

  tool: Tool;
  magnet: boolean;
  keepTool: boolean;
  drawingsLocked: boolean;
  drawingsHidden: boolean;
  drawings: Record<string, Drawing[]>;
  undoStack: { symbol: string; prev: Drawing[] }[];
  redoStack: { symbol: string; prev: Drawing[] }[];
  selectedDrawing: string | null;

  watchlist: string[];
  watchSort: { key: 'symbol' | 'last' | 'change' | null; dir: 1 | -1 };
  alerts: Alert[];
  trades: Trade[];
  showTradesOnChart: boolean;

  tdKey: string;
  timezone: 'local' | 'UTC';
  sound: boolean;

  rightPanel: RightTab | null;
  journalOpen: boolean;
  search: { open: boolean; mode: SearchMode; initial: string };
  tfPrompt: { open: boolean; initial: string };
  indicatorsOpen: boolean;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  alertDialog: { open: boolean; price?: number; symbol?: string; editId?: string };
  textDialog: { open: boolean; drawingId?: string; initial?: string };
  focusMode: boolean;
  replay: ReplayState | null;
  toasts: Toast[];
  resetViewTick: number;
  screenshotTick: { n: number; mode: 'download' | 'copy' };
  goLiveTick: number;

  // actions
  setTheme: (t: 'dark' | 'light') => void;
  setLayout: (l: Layout) => void;
  setActivePane: (id: string) => void;
  updatePane: (id: string, patch: Partial<PaneState>) => void;
  setSymbol: (symbol: string, paneId?: string) => void;
  setTimeframe: (tf: Timeframe, paneId?: string) => void;
  setChartType: (t: ChartType) => void;
  addIndicator: (type: IndicatorType) => void;
  updateIndicator: (paneId: string, id: string, patch: Partial<Indicator>) => void;
  removeIndicator: (paneId: string, id: string) => void;
  addCompare: (symbol: string) => void;
  removeCompare: (symbol: string) => void;

  setTool: (t: Tool) => void;
  setDrawings: (symbol: string, list: Drawing[], recordUndo?: boolean) => void;
  undo: () => void;
  redo: () => void;
  removeSelectedDrawing: () => void;
  clearDrawings: (symbol: string) => void;

  addToWatchlist: (s: string) => void;
  removeFromWatchlist: (s: string) => void;
  moveInWatchlist: (from: number, to: number) => void;
  setWatchSort: (key: 'symbol' | 'last' | 'change') => void;

  addAlert: (a: Omit<Alert, 'id' | 'createdAt' | 'active'>) => void;
  updateAlert: (id: string, patch: Partial<Alert>) => void;
  removeAlert: (id: string) => void;

  addTrade: (t: Omit<Trade, 'id'>) => void;
  updateTrade: (id: string, patch: Partial<Trade>) => void;
  removeTrade: (id: string) => void;

  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  set: (patch: Partial<State>) => void;
}

const active = (s: State) => s.panes.find((p) => p.id === s.activePaneId) ?? s.panes[0];
export const useActivePane = () => useStore((s) => active(s));

const LAYOUT_COUNT: Record<Layout, number> = { '1': 1, '2h': 2, '2v': 2, '3': 3, '4': 4 };
const EXTRA_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      layout: '1',
      panes: [makePane()],
      activePaneId: '',
      syncInterval: false,
      syncSymbol: false,
      syncCrosshair: true,

      tool: 'cursor',
      magnet: false,
      keepTool: false,
      drawingsLocked: false,
      drawingsHidden: false,
      drawings: {},
      undoStack: [],
      redoStack: [],
      selectedDrawing: null,

      watchlist: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'SUIUSDT'],
      watchSort: { key: null, dir: -1 },
      alerts: [],
      trades: [],
      showTradesOnChart: true,

      tdKey: '',
      timezone: 'local',
      sound: true,

      rightPanel: 'watchlist',
      journalOpen: false,
      search: { open: false, mode: 'change', initial: '' },
      tfPrompt: { open: false, initial: '' },
      indicatorsOpen: false,
      shortcutsOpen: false,
      settingsOpen: false,
      alertDialog: { open: false },
      textDialog: { open: false },
      focusMode: false,
      replay: null,
      toasts: [],
      resetViewTick: 0,
      screenshotTick: { n: 0, mode: 'download' },
      goLiveTick: 0,

      set: (patch) => set(patch),
      setTheme: (theme) => set({ theme }),
      setLayout: (layout) => set((s) => {
        const n = LAYOUT_COUNT[layout];
        let panes = s.panes.slice(0, n);
        const base = active(s);
        while (panes.length < n) {
          const used = new Set(panes.map((p) => p.symbol));
          const sym = EXTRA_SYMBOLS.find((x) => !used.has(x)) ?? base.symbol;
          panes.push(makePane(sym, base.tf));
        }
        const activePaneId = panes.some((p) => p.id === s.activePaneId) ? s.activePaneId : panes[0].id;
        return { layout, panes, activePaneId, replay: null };
      }),
      setActivePane: (id) => set({ activePaneId: id }),
      updatePane: (id, patch) => set((s) => ({ panes: s.panes.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      setSymbol: (symbol, paneId) => set((s) => {
        const target = paneId ?? active(s).id;
        return {
          panes: s.panes.map((p) => (p.id === target || s.syncSymbol ? { ...p, symbol, compare: p.compare.filter((c) => c !== symbol) } : p)),
          selectedDrawing: null,
          replay: null,
        };
      }),
      setTimeframe: (tf, paneId) => set((s) => {
        const target = paneId ?? active(s).id;
        return { panes: s.panes.map((p) => (p.id === target || s.syncInterval ? { ...p, tf } : p)), replay: null };
      }),
      setChartType: (chartType) => set((s) => ({ panes: s.panes.map((p) => (p.id === active(s).id ? { ...p, chartType } : p)) })),
      addIndicator: (type) => set((s) => {
        const pane = active(s);
        const same = pane.indicators.filter((i) => i.type === type).length;
        const color = same ? EXTRA_COLORS[(same + 1) % EXTRA_COLORS.length] : undefined;
        const params = type === 'ema' && same ? { period: [20, 50, 100, 200][same] ?? 200 } : type === 'sma' && same ? { period: [50, 100, 200][same] ?? 200 } : undefined;
        return { panes: s.panes.map((p) => (p.id === pane.id ? { ...p, indicators: [...p.indicators, makeIndicator(type, params, color)] } : p)) };
      }),
      updateIndicator: (paneId, id, patch) => set((s) => ({
        panes: s.panes.map((p) => (p.id === paneId ? { ...p, indicators: p.indicators.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : p)),
      })),
      removeIndicator: (paneId, id) => set((s) => ({
        panes: s.panes.map((p) => (p.id === paneId ? { ...p, indicators: p.indicators.filter((i) => i.id !== id) } : p)),
      })),
      addCompare: (symbol) => set((s) => {
        const pane = active(s);
        if (pane.symbol === symbol || pane.compare.includes(symbol)) return {};
        return { panes: s.panes.map((p) => (p.id === pane.id ? { ...p, compare: [...p.compare, symbol].slice(-4) } : p)) };
      }),
      removeCompare: (symbol) => set((s) => {
        const pane = active(s);
        return { panes: s.panes.map((p) => (p.id === pane.id ? { ...p, compare: p.compare.filter((c) => c !== symbol) } : p)) };
      }),

      setTool: (tool) => set({ tool, selectedDrawing: tool === 'cursor' ? get().selectedDrawing : null }),
      setDrawings: (symbol, list, recordUndo = true) => set((s) => ({
        drawings: { ...s.drawings, [symbol]: list },
        undoStack: recordUndo ? [...s.undoStack, { symbol, prev: s.drawings[symbol] ?? [] }].slice(-50) : s.undoStack,
        redoStack: recordUndo ? [] : s.redoStack,
      })),
      undo: () => set((s) => {
        const last = s.undoStack[s.undoStack.length - 1];
        if (!last) return {};
        return {
          drawings: { ...s.drawings, [last.symbol]: last.prev },
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, { symbol: last.symbol, prev: s.drawings[last.symbol] ?? [] }],
          selectedDrawing: null,
        };
      }),
      redo: () => set((s) => {
        const last = s.redoStack[s.redoStack.length - 1];
        if (!last) return {};
        return {
          drawings: { ...s.drawings, [last.symbol]: last.prev },
          redoStack: s.redoStack.slice(0, -1),
          undoStack: [...s.undoStack, { symbol: last.symbol, prev: s.drawings[last.symbol] ?? [] }],
          selectedDrawing: null,
        };
      }),
      removeSelectedDrawing: () => {
        const s = get();
        if (!s.selectedDrawing) return;
        for (const [sym, list] of Object.entries(s.drawings)) {
          if (list.some((d) => d.id === s.selectedDrawing)) {
            s.setDrawings(sym, list.filter((d) => d.id !== s.selectedDrawing));
            set({ selectedDrawing: null });
            return;
          }
        }
      },
      clearDrawings: (symbol) => { get().setDrawings(symbol, []); set({ selectedDrawing: null }); },

      addToWatchlist: (sym) => set((s) => (s.watchlist.includes(sym) ? {} : { watchlist: [...s.watchlist, sym] })),
      removeFromWatchlist: (sym) => set((s) => ({ watchlist: s.watchlist.filter((x) => x !== sym) })),
      moveInWatchlist: (from, to) => set((s) => {
        const w = [...s.watchlist];
        const [it] = w.splice(from, 1);
        w.splice(to, 0, it);
        return { watchlist: w, watchSort: { key: null, dir: -1 } };
      }),
      setWatchSort: (key) => set((s) => ({
        watchSort: s.watchSort.key !== key ? { key, dir: key === 'symbol' ? 1 : -1 } : s.watchSort.dir === -1 && key !== 'symbol' ? { key, dir: 1 } : s.watchSort.dir === 1 && key === 'symbol' ? { key, dir: -1 } : { key: null, dir: -1 },
      })),

      addAlert: (a) => set((s) => ({ alerts: [{ ...a, id: uid(), createdAt: Date.now(), active: true }, ...s.alerts] })),
      updateAlert: (id, patch) => set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),

      addTrade: (t) => set((s) => ({ trades: [{ ...t, id: uid() }, ...s.trades] })),
      updateTrade: (id, patch) => set((s) => ({ trades: s.trades.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      removeTrade: (id) => set((s) => ({ trades: s.trades.filter((t) => t.id !== id) })),

      toast: (t) => {
        const id = uid();
        set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
        setTimeout(() => get().dismissToast(id), t.kind === 'alert' ? 10000 : 3500);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'tvg-state-v2',
      version: 1,
      partialize: (s) => ({
        theme: s.theme, layout: s.layout, panes: s.panes, activePaneId: s.activePaneId,
        syncInterval: s.syncInterval, syncSymbol: s.syncSymbol, syncCrosshair: s.syncCrosshair,
        magnet: s.magnet, keepTool: s.keepTool, drawings: s.drawings, drawingsHidden: s.drawingsHidden, drawingsLocked: s.drawingsLocked,
        watchlist: s.watchlist, watchSort: s.watchSort, alerts: s.alerts, trades: s.trades, showTradesOnChart: s.showTradesOnChart,
        tdKey: s.tdKey, timezone: s.timezone, sound: s.sound, rightPanel: s.rightPanel,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) setTwelveDataKey(state.tdKey);
      },
    },
  ),
);

/* ---------- one-time migration from the previous version (v1, Next.js) ---------- */
function migrateLegacy() {
  try {
    if (localStorage.getItem('tvg-migrated')) return;
    localStorage.setItem('tvg-migrated', '1');
    const s = useStore.getState();
    const journal = JSON.parse(localStorage.getItem('tv-gratis-journal') || 'null');
    const oldTrades = journal?.state?.trades;
    if (Array.isArray(oldTrades) && oldTrades.length && !s.trades.length) {
      const trades: Trade[] = oldTrades.map((t: any) => ({
        id: t.id ?? uid(), symbol: t.symbol || 'BTCUSDT', side: t.side === 'short' ? 'short' : 'long',
        entry: +t.entry || 0, exit: t.exit !== '' && t.exit != null ? +t.exit : undefined,
        sl: t.sl !== '' && t.sl != null ? +t.sl : undefined, tp: t.tp !== '' && t.tp != null ? +t.tp : undefined,
        size: +t.size || 0, date: t.date || new Date().toISOString().slice(0, 10), notes: t.notes || '',
      }));
      useStore.setState({ trades });
    }
    const alerts = JSON.parse(localStorage.getItem('tv-gratis-alerts') || 'null')?.state?.alerts;
    if (Array.isArray(alerts) && alerts.length && !s.alerts.length) {
      useStore.setState({
        alerts: alerts.filter((a: any) => a.symbol && a.price).map((a: any) => ({
          id: a.id ?? uid(), symbol: a.symbol, price: +a.price,
          condition: a.condition === 'below' ? 'below' : a.condition === 'above' ? 'above' : 'cross',
          active: !a.triggered, createdAt: a.createdAt ?? Date.now(),
        })),
      });
    }
    const chart = JSON.parse(localStorage.getItem('tv-gratis-chart-state') || 'null')?.state;
    if (chart?.watchlist && Array.isArray(chart.watchlist)) {
      const wl = chart.watchlist.filter((x: unknown) => typeof x === 'string');
      if (wl.length) useStore.setState({ watchlist: wl });
    }
    if (chart?.symbol && typeof chart.symbol === 'string') {
      const p = useStore.getState().panes[0];
      useStore.getState().updatePane(p.id, { symbol: chart.symbol });
    }
  } catch { /* ignore */ }
}

export function initStore() {
  migrateLegacy();
  const s = useStore.getState();
  if (!s.panes.length) useStore.setState({ panes: [makePane()] });
  const st = useStore.getState();
  if (!st.panes.some((p) => p.id === st.activePaneId)) useStore.setState({ activePaneId: st.panes[0].id });

  // URL params: ?s=ETHUSDT&tf=1h
  const q = new URLSearchParams(location.search);
  const sym = q.get('s') || q.get('symbol');
  const tf = q.get('tf') as Timeframe | null;
  const pid = useStore.getState().activePaneId;
  if (sym) useStore.getState().updatePane(pid, { symbol: sym.toUpperCase() });
  if (tf) useStore.getState().updatePane(pid, { tf });
  setTwelveDataKey(useStore.getState().tdKey);
  // On narrow screens the side panel floats over the chart: start with it closed.
  if (window.innerWidth < 1100) useStore.setState({ rightPanel: null });
  if (window.innerWidth < 720 && useStore.getState().layout !== '1') useStore.getState().setLayout('1');
}

export const getActivePane = () => active(useStore.getState());
