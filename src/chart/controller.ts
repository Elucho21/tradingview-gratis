import {
  AreaSeries, BarSeries, BaselineSeries, CandlestickSeries, ColorType, createChart, createSeriesMarkers,
  CrosshairMode, HistogramSeries, LineSeries, LineStyle, PriceScaleMode,
  type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type MouseEventParams,
  type SeriesType, type Time, type UTCTimestamp,
} from 'lightweight-charts';
import type { Alert, Bar, ChartType, Drawing, Indicator, Point, Timeframe, Trade } from '../types';
import { fetchHistory, subscribeBars } from '../data/feed';
import { tfSeconds } from '../data/symbols';
import * as ind from './indicators';
import { DEFAULT_COLOR, hitTest, POINTS_NEEDED, renderDrawing, type Conv, type Hit } from './drawings';
import { useStore, uid } from '../store';

export interface ChartColors {
  bg: string; text: string; grid: string; border: string; crosshair: string; up: string; down: string; handleFill: string; labelBg: string;
}

export const THEMES: Record<'dark' | 'light', ChartColors> = {
  dark: { bg: '#131722', text: '#b2b5be', grid: 'rgba(42,46,57,0.55)', border: '#2a2e39', crosshair: '#9598a1', up: '#089981', down: '#f23645', handleFill: '#131722', labelBg: '#363a45' },
  light: { bg: '#ffffff', text: '#131722', grid: 'rgba(224,227,235,0.7)', border: '#e0e3eb', crosshair: '#9598a1', up: '#089981', down: '#f23645', handleFill: '#ffffff', labelBg: '#e0e3eb' },
};

export interface LegendData {
  bar: Bar | null;
  prevClose: number | null;
  values: Record<string, (number | null)[]>;
  compare: Record<string, number | null>;
}

export interface ControllerEvents {
  onLegend: (l: LegendData) => void;
  onStatus: (s: { loading: boolean; error: string | null; needsKey?: boolean }) => void;
  onCrosshair: (time: number | null) => void;
  onView: (v: { atRealtime: boolean }) => void;
  onReplayEnd: () => void;
}

type AnySeries = ISeriesApi<SeriesType>;

interface IndicatorRuntime {
  ind: Indicator;
  series: AnySeries[];
  outputs: ind.Val[][];
  priceLines: IPriceLine[];
}

function precisionFor(p: number) {
  if (!isFinite(p) || p <= 0) return 2;
  if (p >= 10) return 2;
  if (p >= 1) return 4;
  return Math.min(10, Math.max(4, Math.ceil(-Math.log10(p)) + 3));
}

const ts = (t: number) => t as UTCTimestamp;

export class ChartController {
  chart: IChartApi;
  private el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ev: ControllerEvents;
  paneId: string;

  private main!: AnySeries;
  private chartType: ChartType = 'candles';
  private colors: ChartColors = THEMES.dark;
  private bars: Bar[] = [];
  private display: Bar[] = [];
  symbol = '';
  tf: Timeframe = '15m';
  private loadToken = 0;
  private liveOff: (() => void) | null = null;
  private loadingOlder = false;
  private noMoreHistory = false;
  private precision = 2;

  private indicators: Indicator[] = [];
  private runtimes: IndicatorRuntime[] = [];
  private compareList: string[] = [];
  private compares = new Map<string, { series: AnySeries; bars: Bar[]; off: () => void; color: string }>();
  private logScale = false;
  private pctScale = false;

  private alertLines: IPriceLine[] = [];
  private alerts: Alert[] = [];
  private markers: ISeriesMarkersPluginApi<Time> | null = null;
  private trades: Trade[] = [];

  replayIdx: number | null = null;
  private replayTimer: number | null = null;

  // drawings interaction
  private temp: Drawing | null = null;
  private ruler: Drawing | null = null;
  private drag: { id: string; handle: number; start: Point; orig: Point[]; moved: boolean } | null = null;
  private mouse: { x: number; y: number } | null = null;
  private raf = 0;
  private lastSig = '';
  private destroyed = false;
  private ro: ResizeObserver;

  constructor(el: HTMLElement, paneId: string, ev: ControllerEvents) {
    this.el = el;
    this.paneId = paneId;
    this.ev = ev;
    this.chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: this.colors.bg }, textColor: this.colors.text,
        fontFamily: 'Inter, -apple-system, system-ui, sans-serif', fontSize: 11, attributionLogo: false,
        panes: { separatorColor: this.colors.border, separatorHoverColor: 'rgba(41,98,255,0.25)', enableResize: true },
      },
      grid: { vertLines: { color: this.colors.grid }, horzLines: { color: this.colors.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: this.colors.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: this.colors.labelBg },
        horzLine: { color: this.colors.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: this.colors.labelBg },
      },
      rightPriceScale: { borderColor: this.colors.border, scaleMargins: { top: 0.1, bottom: 0.08 } },
      timeScale: { borderColor: this.colors.border, timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 7, minBarSpacing: 0.5 },
      localization: { locale: 'es-AR' },
    });

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'drawing-layer';
    el.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    this.createMain();

    this.chart.subscribeCrosshairMove(this.onCrosshair);
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.onRange);
    el.addEventListener('mousedown', this.onDown, true);
    el.addEventListener('mousemove', this.onMove, true);
    el.addEventListener('mouseleave', this.onLeave);
    el.addEventListener('dblclick', this.onDbl, true);
    el.addEventListener('touchstart', this.onTouchStart, { capture: true, passive: false });
    window.addEventListener('mouseup', this.onUp, true);
    this.ro = new ResizeObserver(() => this.resizeCanvas());
    this.ro.observe(el);
    this.resizeCanvas();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.stopReplayTimer();
    this.liveOff?.();
    this.compares.forEach((c) => c.off());
    this.ro.disconnect();
    this.el.removeEventListener('mousedown', this.onDown, true);
    this.el.removeEventListener('mousemove', this.onMove, true);
    this.el.removeEventListener('mouseleave', this.onLeave);
    this.el.removeEventListener('dblclick', this.onDbl, true);
    this.el.removeEventListener('touchstart', this.onTouchStart, true);
    window.removeEventListener('mouseup', this.onUp, true);
    this.chart.remove();
    this.canvas.remove();
  }

  /* ------------------------------ appearance ------------------------------ */

  setTheme(theme: 'dark' | 'light') {
    this.colors = THEMES[theme];
    const c = this.colors;
    this.chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text, panes: { separatorColor: c.border, separatorHoverColor: 'rgba(41,98,255,0.25)', enableResize: true } },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { vertLine: { labelBackgroundColor: c.labelBg }, horzLine: { labelBackgroundColor: c.labelBg } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
    });
    this.applyMainStyle();
    this.lastSig = '';
  }

  private mainOptions() {
    const c = this.colors;
    const priceFormat = { type: 'price' as const, precision: this.precision, minMove: 1 / 10 ** this.precision };
    switch (this.chartType) {
      case 'hollow':
        return { upColor: 'rgba(0,0,0,0)', downColor: c.down, borderUpColor: c.up, borderDownColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: true, priceFormat };
      case 'bars':
        return { upColor: c.up, downColor: c.down, thinBars: false, priceFormat };
      case 'line':
        return { color: '#2962ff', lineWidth: 2 as const, priceFormat };
      case 'area':
        return { lineColor: '#2962ff', topColor: 'rgba(41,98,255,0.28)', bottomColor: 'rgba(41,98,255,0.02)', lineWidth: 2 as const, priceFormat };
      case 'baseline':
        return { topLineColor: c.up, topFillColor1: 'rgba(8,153,129,0.28)', topFillColor2: 'rgba(8,153,129,0.03)', bottomLineColor: c.down, bottomFillColor1: 'rgba(242,54,69,0.03)', bottomFillColor2: 'rgba(242,54,69,0.28)', lineWidth: 2 as const, priceFormat };
      default:
        return { upColor: c.up, downColor: c.down, borderVisible: false, wickUpColor: c.up, wickDownColor: c.down, priceFormat };
    }
  }

  private createMain() {
    const t = this.chartType;
    const def = t === 'bars' ? BarSeries : t === 'line' ? LineSeries : t === 'area' ? AreaSeries : t === 'baseline' ? BaselineSeries : CandlestickSeries;
    this.main = this.chart.addSeries(def as any, this.mainOptions() as any, 0) as AnySeries;
    this.markers = createSeriesMarkers(this.main as any, []);
  }

  private applyMainStyle() {
    this.main.applyOptions(this.mainOptions() as any);
    this.runtimes.forEach((r) => this.styleRuntime(r));
    this.refreshVolumeColors();
  }

  setChartType(t: ChartType) {
    if (t === this.chartType) return;
    const range = this.chart.timeScale().getVisibleLogicalRange();
    this.chartType = t;
    this.markers?.detach();
    this.chart.removeSeries(this.main);
    this.createMain();
    // keep main series first in pane 0 so drawings/price scale behave
    this.computeDisplay();
    this.setMainData();
    this.rebuildIndicators();
    this.applyScaleMode();
    this.renderAlerts();
    this.renderTrades();
    if (range) this.chart.timeScale().setVisibleLogicalRange(range);
  }

  /* --------------------------------- data --------------------------------- */

  async load(symbol: string, tf: Timeframe) {
    const token = ++this.loadToken;
    this.liveOff?.();
    this.liveOff = null;
    this.exitReplay(false);
    this.symbol = symbol;
    this.tf = tf;
    this.noMoreHistory = false;
    this.temp = null;
    this.ruler = null;
    this.ev.onStatus({ loading: true, error: null });
    try {
      const bars = await fetchHistory(symbol, tf);
      if (token !== this.loadToken || this.destroyed) return;
      if (!bars.length) throw new Error('Sin datos para este símbolo.');
      this.bars = bars;
      this.precision = precisionFor(bars[bars.length - 1].close);
      this.main.applyOptions(this.mainOptions() as any);
      this.computeDisplay();
      this.setMainData();
      this.rebuildIndicators();
      this.renderAlerts();
      this.renderTrades();
      this.resetView();
      this.ev.onStatus({ loading: false, error: null });
      this.emitLegend(null);
      this.liveOff = subscribeBars(symbol, tf, (b) => { if (token === this.loadToken) this.onLiveBar(b); });
      this.reloadCompares(true);
    } catch (e: any) {
      if (token !== this.loadToken) return;
      this.bars = [];
      this.display = [];
      this.main.setData([]);
      this.rebuildIndicators();
      this.ev.onStatus({ loading: false, error: e?.message || 'No se pudieron cargar los datos.', needsKey: !!e?.needsKey });
    }
  }

  private computeDisplay() {
    const src = this.replayIdx !== null ? this.bars.slice(0, this.replayIdx + 1) : this.bars;
    this.display = this.chartType === 'heikin' ? ind.heikinAshi(src) : src;
  }

  private mapBar(b: Bar) {
    if (this.chartType === 'line' || this.chartType === 'area' || this.chartType === 'baseline') return { time: ts(b.time), value: b.close };
    return { time: ts(b.time), open: b.open, high: b.high, low: b.low, close: b.close };
  }

  private setMainData() {
    this.main.setData(this.display.map((b) => this.mapBar(b)) as any);
    if (this.chartType === 'baseline' && this.display.length) {
      const ref = this.display[Math.max(0, this.display.length - 150)].close;
      this.main.applyOptions({ baseValue: { type: 'price', price: ref } } as any);
    }
  }

  private onLiveBar(b: Bar) {
    if (!this.bars.length) return;
    const last = this.bars[this.bars.length - 1];
    let isNew = false;
    if (b.time === last.time) this.bars[this.bars.length - 1] = b;
    else if (b.time > last.time) { this.bars.push(b); isNew = true; }
    else return;
    if (this.replayIdx !== null) return; // replay shows history only
    const prevDisplayLen = this.display.length;
    if (this.chartType === 'heikin') this.display = ind.heikinAshi(this.bars);
    else this.display = this.bars;
    const d = this.display;
    if (isNew && prevDisplayLen >= 1 && d.length >= 2) this.main.update(this.mapBar(d[d.length - 2]) as any);
    this.main.update(this.mapBar(d[d.length - 1]) as any);
    this.updateIndicatorsTail(isNew);
    this.emitLegend(this.hoverIdx);
  }

  private onRange = (range: { from: number; to: number } | null) => {
    if (!range) return;
    const atRealtime = this.display.length ? range.to >= this.display.length - 2 : true;
    this.ev.onView({ atRealtime });
    if (range.from < 25 && !this.loadingOlder && !this.noMoreHistory && this.replayIdx === null && this.bars.length) this.loadOlder();
  };

  private async loadOlder() {
    this.loadingOlder = true;
    const token = this.loadToken;
    try {
      const first = this.bars[0].time;
      const older = (await fetchHistory(this.symbol, this.tf, first)).filter((b) => b.time < first);
      if (token !== this.loadToken) return;
      if (!older.length) { this.noMoreHistory = true; return; }
      const range = this.chart.timeScale().getVisibleLogicalRange();
      this.bars = [...older, ...this.bars];
      this.computeDisplay();
      this.setMainData();
      this.rebuildIndicators();
      this.renderTrades();
      if (range) this.chart.timeScale().setVisibleLogicalRange({ from: range.from + older.length, to: range.to + older.length });
      this.reloadCompares(false);
    } catch { /* ignore, retry on next scroll */ } finally {
      this.loadingOlder = false;
    }
  }

  resetView() {
    const n = this.display.length;
    if (!n) return;
    this.chart.timeScale().applyOptions({ barSpacing: 7, rightOffset: 8 });
    this.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n + 8 });
    this.chart.priceScale('right').applyOptions({ autoScale: true });
  }

  goLive() {
    this.chart.timeScale().scrollToRealTime();
  }

  /* ------------------------------ indicators ------------------------------ */

  setIndicators(list: Indicator[]) {
    const sig = (l: Indicator[]) => JSON.stringify(l.map((i) => [i.id, i.type, i.params, i.hidden]));
    const colorOnly = sig(list) === sig(this.indicators);
    this.indicators = list;
    if (colorOnly) {
      this.runtimes.forEach((r) => {
        const fresh = list.find((i) => i.id === r.ind.id);
        if (fresh) { r.ind = fresh; this.styleRuntime(r); }
      });
      this.emitLegend(this.hoverIdx);
      return;
    }
    this.rebuildIndicators();
  }

  private compute(i: Indicator, bars: Bar[]): ind.Val[][] {
    const close = bars.map((b) => b.close);
    const p = i.params;
    switch (i.type) {
      case 'ema': return [ind.ema(close, p.period)];
      case 'sma': return [ind.sma(close, p.period)];
      case 'bb': { const r = ind.bollinger(close, p.period, p.mult); return [r.upper, r.mid, r.lower]; }
      case 'vwap': return [ind.vwap(bars)];
      case 'supertrend': { const r = ind.supertrend(bars, p.period, p.mult); return [r.up, r.down]; }
      case 'volume': return [bars.map((b) => b.volume), p.ma > 0 ? ind.sma(bars.map((b) => b.volume), p.ma) : []];
      case 'rsi': return [ind.rsi(close, p.period)];
      case 'macd': { const r = ind.macd(close, p.fast, p.slow, p.signal); return [r.hist, r.line, r.signal]; }
      case 'stoch': { const r = ind.stochastic(bars, p.k, p.smooth, p.d); return [r.k, r.d]; }
      case 'atr': return [ind.atr(bars, p.period)];
      case 'obv': return [ind.obv(bars)];
    }
  }

  private rebuildIndicators() {
    for (const r of this.runtimes) {
      r.series.forEach((s) => { try { this.chart.removeSeries(s); } catch { /* */ } });
    }
    this.runtimes = [];
    const src = this.replayIdx !== null ? this.bars.slice(0, this.replayIdx + 1) : this.bars;
    let paneIdx = 1;
    for (const i of this.indicators) {
      if (i.hidden) { this.runtimes.push({ ind: i, series: [], outputs: [], priceLines: [] }); continue; }
      const def = ind.indicatorDef(i.type);
      const pane = def.overlay ? 0 : paneIdx++;
      const r: IndicatorRuntime = { ind: i, series: [], outputs: [], priceLines: [] };
      const lw = 2 as const;
      const common = { priceLineVisible: false, lastValueVisible: !def.overlay || i.type !== 'volume', crosshairMarkerVisible: false };
      const fmt = { type: 'price' as const, precision: this.precision, minMove: 1 / 10 ** this.precision };
      switch (i.type) {
        case 'ema': case 'sma': case 'vwap':
          r.series.push(this.chart.addSeries(LineSeries, { ...common, lineWidth: lw, priceFormat: fmt }, pane) as AnySeries);
          break;
        case 'bb':
          for (let k = 0; k < 3; k++) r.series.push(this.chart.addSeries(LineSeries, { ...common, lineWidth: 1, priceFormat: fmt, lastValueVisible: false }, pane) as AnySeries);
          break;
        case 'supertrend':
          for (let k = 0; k < 2; k++) r.series.push(this.chart.addSeries(LineSeries, { ...common, lineWidth: lw, priceFormat: fmt, lastValueVisible: false }, pane) as AnySeries);
          break;
        case 'volume': {
          const h = this.chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }, 0) as AnySeries;
          h.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
          r.series.push(h);
          if (i.params.ma > 0) r.series.push(this.chart.addSeries(LineSeries, { priceScaleId: 'vol', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0) as AnySeries);
          break;
        }
        case 'rsi': case 'atr': case 'obv': {
          const s = this.chart.addSeries(LineSeries, { ...common, lineWidth: lw, priceFormat: i.type === 'obv' ? { type: 'volume' } : { type: 'price', precision: i.type === 'atr' ? this.precision : 2, minMove: 0.01 } }, pane) as AnySeries;
          r.series.push(s);
          if (i.type === 'rsi') {
            for (const lv of [70, 50, 30]) r.priceLines.push(s.createPriceLine({ price: lv, color: '#787b86', lineWidth: 1, lineStyle: lv === 50 ? LineStyle.Dotted : LineStyle.Dashed, axisLabelVisible: false, title: '' }));
          }
          break;
        }
        case 'macd':
          r.series.push(this.chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: fmt }, pane) as AnySeries);
          r.series.push(this.chart.addSeries(LineSeries, { ...common, lineWidth: lw, priceFormat: fmt }, pane) as AnySeries);
          r.series.push(this.chart.addSeries(LineSeries, { ...common, lineWidth: lw, priceFormat: fmt }, pane) as AnySeries);
          break;
        case 'stoch': {
          const k = this.chart.addSeries(LineSeries, { ...common, lineWidth: lw }, pane) as AnySeries;
          r.series.push(k);
          r.series.push(this.chart.addSeries(LineSeries, { ...common, lineWidth: lw }, pane) as AnySeries);
          for (const lv of [80, 20]) r.priceLines.push(k.createPriceLine({ price: lv, color: '#787b86', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' }));
          break;
        }
      }
      this.styleRuntime(r);
      r.outputs = this.compute(i, src);
      this.setRuntimeData(r, src);
      this.runtimes.push(r);
    }
    // pane sizes: main gets most of the height
    const panes = this.chart.panes();
    panes.forEach((p, idx) => p.setStretchFactor(idx === 0 ? 3.2 : 1));
    this.emitLegend(this.hoverIdx);
  }

  private styleRuntime(r: IndicatorRuntime) {
    const c = r.ind.color;
    const C = this.colors;
    switch (r.ind.type) {
      case 'bb':
        r.series[0]?.applyOptions({ color: c });
        r.series[1]?.applyOptions({ color: '#f7a600', lineStyle: LineStyle.Solid });
        r.series[2]?.applyOptions({ color: c });
        break;
      case 'supertrend':
        r.series[0]?.applyOptions({ color: C.up });
        r.series[1]?.applyOptions({ color: C.down });
        break;
      case 'volume':
        r.series[1]?.applyOptions({ color: '#2962ff' });
        break;
      case 'macd':
        r.series[1]?.applyOptions({ color: c });
        r.series[2]?.applyOptions({ color: '#ff6d00' });
        break;
      case 'stoch':
        r.series[0]?.applyOptions({ color: c });
        r.series[1]?.applyOptions({ color: '#ff6d00' });
        break;
      default:
        r.series[0]?.applyOptions({ color: c });
    }
  }

  private pointFor(r: IndicatorRuntime, k: number, i: number, bars: Bar[]) {
    const v = r.outputs[k]?.[i] ?? null;
    const time = ts(bars[i].time);
    if (v === null || v === undefined || !isFinite(v)) return { time };
    if (r.ind.type === 'volume' && k === 0) {
      const up = bars[i].close >= bars[i].open;
      return { time, value: v, color: up ? 'rgba(8,153,129,0.45)' : 'rgba(242,54,69,0.45)' };
    }
    if (r.ind.type === 'macd' && k === 0) {
      const prev = i > 0 ? r.outputs[0][i - 1] : null;
      const rising = prev === null || v >= prev;
      const color = v >= 0 ? (rising ? '#26a69a' : '#b2dfdb') : (rising ? '#ffcdd2' : '#ff5252');
      return { time, value: v, color };
    }
    return { time, value: v };
  }

  private setRuntimeData(r: IndicatorRuntime, bars: Bar[]) {
    r.series.forEach((s, k) => {
      const data = bars.map((_, i) => this.pointFor(r, k, i, bars));
      s.setData(data as any);
    });
  }

  private refreshVolumeColors() {
    const src = this.replayIdx !== null ? this.bars.slice(0, this.replayIdx + 1) : this.bars;
    this.runtimes.filter((r) => r.ind.type === 'volume' && r.series.length).forEach((r) => this.setRuntimeData(r, src));
  }

  private updateIndicatorsTail(isNew: boolean) {
    const src = this.replayIdx !== null ? this.bars.slice(0, this.replayIdx + 1) : this.bars;
    const n = src.length;
    for (const r of this.runtimes) {
      if (!r.series.length) continue;
      r.outputs = this.compute(r.ind, src);
      r.series.forEach((s, k) => {
        try {
          if (isNew && n >= 2) s.update(this.pointFor(r, k, n - 2, src) as any);
          s.update(this.pointFor(r, k, n - 1, src) as any);
        } catch { /* series may be ahead after rebuild */ }
      });
    }
  }

  /* ------------------------------- compare ------------------------------- */

  setCompare(list: string[]) {
    this.compareList = list;
    for (const [sym, c] of this.compares) {
      if (!list.includes(sym)) { c.off(); this.chart.removeSeries(c.series); this.compares.delete(sym); }
    }
    this.reloadCompares(false);
    this.applyScaleMode();
  }

  private reloadCompares(force: boolean) {
    const palette = ['#ff9800', '#e91e63', '#00bcd4', '#8bc34a'];
    this.compareList.forEach(async (sym, idx) => {
      let c = this.compares.get(sym);
      if (c && !force) {
        // refresh data range after loading older history
      }
      if (!c) {
        const series = this.chart.addSeries(LineSeries, { color: palette[idx % palette.length], lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: sym }, 0) as AnySeries;
        c = { series, bars: [], off: () => {}, color: palette[idx % palette.length] };
        this.compares.set(sym, c);
      } else {
        c.off();
      }
      const token = this.loadToken;
      try {
        const from = this.bars[0]?.time;
        let bars = await fetchHistory(sym, this.tf);
        if (from && bars.length && bars[0].time > from) {
          try { const older = await fetchHistory(sym, this.tf, bars[0].time); bars = [...older.filter((b) => b.time < bars[0].time), ...bars]; } catch { /* */ }
        }
        if (token !== this.loadToken || this.compares.get(sym) !== c) return;
        c.bars = bars;
        c.series.setData(bars.map((b) => ({ time: ts(b.time), value: b.close })));
        const cc = c;
        cc.off = subscribeBars(sym, this.tf, (b) => {
          const last = cc.bars[cc.bars.length - 1];
          if (!last || b.time < last.time) return;
          if (b.time === last.time) cc.bars[cc.bars.length - 1] = b; else cc.bars.push(b);
          if (this.replayIdx === null) cc.series.update({ time: ts(b.time), value: b.close });
        });
      } catch { /* ignore compare failure */ }
    });
  }

  setScaleMode(log: boolean, pct: boolean) {
    this.logScale = log;
    this.pctScale = pct;
    this.applyScaleMode();
  }

  private applyScaleMode() {
    const mode = this.compareList.length || this.pctScale ? PriceScaleMode.Percentage : this.logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal;
    this.chart.priceScale('right').applyOptions({ mode });
  }

  autoScale() {
    this.chart.priceScale('right').applyOptions({ autoScale: true });
  }

  /* --------------------------- alerts & trades --------------------------- */

  setAlerts(list: Alert[]) {
    this.alerts = list;
    this.renderAlerts();
  }

  private renderAlerts() {
    this.alertLines.forEach((l) => { try { this.main.removePriceLine(l); } catch { /* */ } });
    this.alertLines = this.alerts.filter((a) => a.active).map((a) => this.main.createPriceLine({
      price: a.price, color: '#ff9800', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true,
      title: `🔔 ${a.condition === 'above' ? '↑' : a.condition === 'below' ? '↓' : '↕'}`,
    }));
  }

  setTrades(list: Trade[]) {
    this.trades = list;
    this.renderTrades();
  }

  private renderTrades() {
    if (!this.markers) return;
    if (!this.display.length || !this.trades.length) { this.markers.setMarkers([]); return; }
    const first = this.display[0].time, last = this.display[this.display.length - 1].time;
    const marks = this.trades.map((t) => {
      const tsec = Math.floor(Date.parse(`${t.date}T12:00:00Z`) / 1000);
      if (tsec < first - tfSeconds(this.tf) || tsec > last + 86400) return null;
      // snap to nearest bar
      let lo = 0, hi = this.display.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.display[mid].time <= tsec) lo = mid; else hi = mid - 1; }
      const bar = this.display[lo];
      const long = t.side === 'long';
      return {
        time: ts(bar.time), position: long ? 'belowBar' : 'aboveBar', shape: long ? 'arrowUp' : 'arrowDown',
        color: long ? this.colors.up : this.colors.down, text: `${long ? 'L' : 'S'} ${t.entry}`,
      };
    }).filter(Boolean).sort((a: any, b: any) => a.time - b.time);
    this.markers.setMarkers(marks as any);
  }

  /* -------------------------------- replay -------------------------------- */

  startReplayAt(idx: number) {
    if (!this.bars.length) return;
    const offset = this.chartType === 'heikin' ? 0 : 0;
    this.replayIdx = Math.max(10, Math.min(this.bars.length - 2, idx + offset));
    this.computeDisplay();
    this.setMainData();
    this.rebuildIndicators();
    const n = this.display.length;
    this.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 120), to: n + 20 });
  }

  replayStep(): boolean {
    if (this.replayIdx === null) return false;
    if (this.replayIdx >= this.bars.length - 1) { this.stopReplayTimer(); this.ev.onReplayEnd(); return false; }
    this.replayIdx++;
    this.computeDisplay();
    const d = this.display;
    this.main.update(this.mapBar(d[d.length - 1]) as any);
    this.updateIndicatorsTail(true);
    this.emitLegend(null);
    return true;
  }

  replayPlay(speed: number) {
    this.stopReplayTimer();
    const ms = Math.max(40, 1000 / speed);
    this.replayTimer = window.setInterval(() => { if (!this.replayStep()) this.stopReplayTimer(); }, ms);
  }

  replayPause() { this.stopReplayTimer(); }

  private stopReplayTimer() {
    if (this.replayTimer) { clearInterval(this.replayTimer); this.replayTimer = null; }
  }

  exitReplay(refresh = true) {
    this.stopReplayTimer();
    if (this.replayIdx === null) return;
    this.replayIdx = null;
    if (!refresh) return;
    this.computeDisplay();
    this.setMainData();
    this.rebuildIndicators();
    this.goLive();
  }

  /* ------------------------------- legend -------------------------------- */

  private hoverIdx: number | null = null;

  private onCrosshair = (p: MouseEventParams<Time>) => {
    let idx: number | null = null;
    if (p.logical !== undefined && p.point) {
      idx = Math.round(p.logical);
      if (idx < 0 || idx >= this.display.length) idx = null;
    }
    this.hoverIdx = idx;
    this.emitLegend(idx);
    if (p.sourceEvent) this.ev.onCrosshair(p.time !== undefined ? (p.time as number) : null);
  };

  private legendPending = false;
  private emitLegend(idx: number | null) {
    if (this.legendPending) return;
    this.legendPending = true;
    requestAnimationFrame(() => {
      this.legendPending = false;
      const n = this.display.length;
      const i = idx ?? this.hoverIdx ?? n - 1;
      const bar = n && i >= 0 && i < n ? this.display[i] : null;
      const values: Record<string, (number | null)[]> = {};
      for (const r of this.runtimes) values[r.ind.id] = r.outputs.map((o) => o[i] ?? null);
      const compare: Record<string, number | null> = {};
      for (const [sym, c] of this.compares) {
        const b = bar ? c.bars.find((x) => x.time === bar.time) : c.bars[c.bars.length - 1];
        compare[sym] = b ? b.close : null;
      }
      this.ev.onLegend({ bar, prevClose: i > 0 && n ? this.display[i - 1]?.close ?? null : null, values, compare });
    });
  }

  syncCrosshair(time: number | null) {
    if (time === null || !this.display.length) { this.chart.clearCrosshairPosition(); return; }
    let lo = 0, hi = this.display.length - 1;
    if (time < this.display[0].time) { this.chart.clearCrosshairPosition(); return; }
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.display[mid].time <= time) lo = mid; else hi = mid - 1; }
    const b = this.display[lo];
    this.chart.setCrosshairPosition(b.close, ts(b.time), this.main);
  }

  /* ---------------------------- coordinates ----------------------------- */

  lastBar() { return this.display[this.display.length - 1] ?? null; }
  getPrecision() { return this.precision; }
  fmt = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: this.precision, maximumFractionDigits: this.precision });

  private tToLogical(t: number): number {
    const d = this.display, n = d.length;
    const sec = tfSeconds(this.tf);
    if (!n) return 0;
    if (t <= d[0].time) return (t - d[0].time) / sec;
    if (t >= d[n - 1].time) return n - 1 + (t - d[n - 1].time) / sec;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (d[mid].time <= t) lo = mid; else hi = mid - 1; }
    const t0 = d[lo].time, t1 = d[lo + 1].time;
    return lo + (t - t0) / (t1 - t0);
  }

  private logicalToT(l: number): number {
    const d = this.display, n = d.length;
    const sec = tfSeconds(this.tf);
    if (!n) return 0;
    if (l <= 0) return d[0].time + l * sec;
    if (l >= n - 1) return d[n - 1].time + (l - (n - 1)) * sec;
    const i = Math.floor(l);
    return d[i].time + (l - i) * (d[i + 1].time - d[i].time);
  }

  private mainPaneHeight() {
    try { return this.chart.panes()[0].getHeight(); } catch { return this.el.clientHeight; }
  }

  conv(): Conv {
    const tsApi = this.chart.timeScale();
    return {
      tToX: (t) => tsApi.logicalToCoordinate(this.tToLogical(t) as any) as number | null,
      pToY: (p) => this.main.priceToCoordinate(p) as number | null,
      xToT: (x) => this.logicalToT((tsApi.coordinateToLogical(x) as number | null) ?? 0),
      yToP: (y) => this.main.coordinateToPrice(y) as number | null,
      width: tsApi.width(),
      height: this.mainPaneHeight(),
      fmt: this.fmt,
      bars: (t1, t2) => Math.round(this.tToLogical(t2) - this.tToLogical(t1)),
      tfSec: tfSeconds(this.tf),
    };
  }

  priceAtY(y: number): number | null {
    if (y > this.mainPaneHeight()) return null;
    return this.main.coordinateToPrice(y) as number | null;
  }

  logicalAtX(x: number) {
    return this.chart.timeScale().coordinateToLogical(x) as number | null;
  }

  /* ------------------------------ drawings ------------------------------ */

  private state() { return useStore.getState(); }
  private myDrawings(): Drawing[] { return this.state().drawings[this.symbol] ?? []; }
  private isActive() { return this.state().activePaneId === this.paneId; }

  private local(e: { clientX: number; clientY: number }) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private inPlot(x: number, y: number, conv: Conv) {
    return x >= 0 && x <= conv.width && y >= 0 && y <= conv.height;
  }

  private snap(x: number, y: number, conv: Conv): Point {
    let t = conv.xToT(x);
    let p = conv.yToP(y) ?? 0;
    const st = this.state();
    if (st.magnet && this.display.length) {
      const l = this.logicalAtX(x);
      if (l !== null) {
        const i = Math.round(l);
        if (i >= 0 && i < this.display.length) {
          const b = this.display[i];
          let best = p, bestD = Infinity;
          for (const v of [b.open, b.high, b.low, b.close]) {
            const vy = conv.pToY(v);
            if (vy === null) continue;
            const dd = Math.abs(vy - y);
            if (dd < bestD) { bestD = dd; best = v; }
          }
          if (bestD < 40) { p = best; t = b.time; }
        }
      }
    }
    return { t, p };
  }

  private stop(e: Event) {
    e.stopPropagation();
    e.preventDefault();
  }

  private onTouchStart = (e: TouchEvent) => {
    const st = this.state();
    if (e.touches.length !== 1) return;
    if (st.tool === 'cursor' && !(st.replay?.status === 'select' && st.replay.paneId === this.paneId)) return;
    const t = e.touches[0];
    this.handleDown(t.clientX, t.clientY, e, true);
  };

  private onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    this.handleDown(e.clientX, e.clientY, e, false);
  };

  private handleDown(clientX: number, clientY: number, e: Event, touch: boolean) {
    const st = this.state();
    if (!this.isActive()) st.setActivePane(this.paneId);
    const { x, y } = this.local({ clientX, clientY });
    const conv = this.conv();
    if (!this.inPlot(x, y, conv)) return;

    // Replay start selection
    if (st.replay?.status === 'select' && st.replay.paneId === this.paneId) {
      this.stop(e);
      const l = this.logicalAtX(x);
      if (l !== null) {
        this.startReplayAt(Math.round(l));
        st.set({ replay: { ...st.replay, status: 'paused' } });
      }
      return;
    }

    if (st.tool !== 'cursor') {
      this.stop(e);
      const pt = this.snap(x, y, conv);
      const tool = st.tool;
      if (this.temp) {
        // next point of a multi-click drawing
        this.temp.points[this.temp.points.length - 1] = pt;
        if (this.temp.points.length >= POINTS_NEEDED[this.temp.type]) this.finishTemp();
        else this.temp.points.push({ ...pt });
        return;
      }
      if (tool === 'ruler') this.ruler = null;
      const d: Drawing = { id: uid(), type: tool, points: [pt], color: DEFAULT_COLOR[tool] };
      if (tool === 'long' || tool === 'short') {
        const vis = this.chart.timeScale().getVisibleLogicalRange();
        const span = vis ? Math.max(8, Math.round((vis.to - vis.from) * 0.12)) : 20;
        const top = conv.yToP(0), bottom = conv.yToP(conv.height);
        const range = top !== null && bottom !== null ? Math.abs(top - bottom) * 0.08 : pt.p * 0.01;
        const dir = tool === 'long' ? 1 : -1;
        const endT = this.logicalToT(this.tToLogical(pt.t) + span);
        d.points = [pt, { t: endT, p: pt.p + dir * range * 1.5 }, { t: endT, p: pt.p - dir * range }];
      }
      if (POINTS_NEEDED[tool] === 1) {
        this.temp = d;
        this.finishTemp();
        if (tool === 'text') st.set({ textDialog: { open: true, drawingId: d.id, initial: '' } });
        return;
      }
      d.points.push({ ...pt });
      this.temp = d;
      this.dragCreateStart = { x, y };
      this.lastSig = '';
      return;
    }

    // cursor mode
    if (this.ruler) { this.ruler = null; this.lastSig = ''; }
    if (st.drawingsHidden) return;
    const hit = hitTest(this.myDrawings(), { x, y }, conv, st.selectedDrawing);
    if (hit) {
      st.set({ selectedDrawing: hit.id });
      if (st.drawingsLocked || touch) return;
      this.stop(e);
      const d = this.myDrawings().find((dd) => dd.id === hit.id)!;
      this.drag = { id: hit.id, handle: hit.handle, start: { t: conv.xToT(x), p: conv.yToP(y) ?? 0 }, orig: d.points.map((p) => ({ ...p })), moved: false };
      this.el.style.cursor = hit.handle >= 0 ? 'grabbing' : 'move';
    } else if (st.selectedDrawing) {
      st.set({ selectedDrawing: null });
    }
  }

  private dragCreateStart: { x: number; y: number } | null = null;

  private finishTemp() {
    const d = this.temp;
    if (!d) return;
    this.temp = null;
    this.dragCreateStart = null;
    const st = this.state();
    if (d.type === 'ruler') {
      this.ruler = d;
    } else {
      st.setDrawings(this.symbol, [...this.myDrawings(), d]);
      st.set({ selectedDrawing: d.id });
    }
    if (!st.keepTool) st.setTool('cursor');
    this.lastSig = '';
  }

  cancelTemp() {
    this.temp = null;
    this.ruler = null;
    this.dragCreateStart = null;
    this.lastSig = '';
  }

  private onMove = (e: MouseEvent) => {
    const { x, y } = this.local(e);
    this.mouse = { x, y };
    const st = this.state();
    const conv = this.conv();
    if (this.temp) {
      this.temp.points[this.temp.points.length - 1] = this.snap(x, y, conv);
      this.lastSig = '';
      return;
    }
    if (this.drag) {
      this.stop(e);
      const cur = { t: conv.xToT(x), p: conv.yToP(y) ?? this.drag.start.p };
      const target = st.magnet ? this.snap(x, y, conv) : cur;
      const dt = cur.t - this.drag.start.t, dp = cur.p - this.drag.start.p;
      const list = this.myDrawings();
      const d = list.find((dd) => dd.id === this.drag!.id);
      if (!d) return;
      let pts: Point[];
      const o = this.drag.orig;
      if (this.drag.handle < 0) {
        pts = o.map((p) => ({ t: d.type === 'hline' ? p.t : p.t + dt, p: d.type === 'vline' ? p.p : p.p + dp }));
      } else if (d.type === 'long' || d.type === 'short') {
        pts = o.map((p) => ({ ...p }));
        const h = this.drag.handle;
        if (h === 0) pts[0] = { t: o[0].t, p: target.p };
        if (h === 1) pts[1] = { t: o[1].t, p: target.p };
        if (h === 2) pts[2] = { t: o[2].t, p: target.p };
        if (h === 3) { const nt = Math.max(o[0].t + conv.tfSec, o[1].t + dt); pts[1] = { ...pts[1], t: nt }; pts[2] = { ...pts[2], t: nt }; }
      } else if (d.type === 'hline') {
        pts = [{ t: o[0].t, p: target.p }];
      } else if (d.type === 'vline') {
        pts = [{ t: target.t, p: o[0].p }];
      } else {
        pts = o.map((p) => ({ ...p }));
        pts[this.drag.handle] = target;
      }
      if (!this.drag.moved) {
        // record undo once at the first movement
        st.setDrawings(this.symbol, list);
        this.drag.moved = true;
      }
      st.setDrawings(this.symbol, list.map((dd) => (dd.id === d.id ? { ...dd, points: pts } : dd)), false);
      return;
    }
    // hover feedback
    if (st.tool !== 'cursor' || (st.replay?.status === 'select' && st.replay.paneId === this.paneId)) {
      this.el.style.cursor = 'crosshair';
      if (st.replay?.status === 'select') this.lastSig = '';
      return;
    }
    if (st.drawingsHidden || !this.inPlot(x, y, conv)) { this.el.style.cursor = ''; return; }
    const hit = hitTest(this.myDrawings(), { x, y }, conv, st.selectedDrawing);
    this.el.style.cursor = hit ? (hit.handle >= 0 ? 'grab' : st.drawingsLocked ? 'pointer' : 'move') : '';
  };

  private onUp = (e: MouseEvent) => {
    if (this.drag) {
      this.drag = null;
      this.el.style.cursor = '';
      return;
    }
    // drag-to-create: release far enough from the press point finishes 2-point drawings
    if (this.temp && this.dragCreateStart && POINTS_NEEDED[this.temp.type] === 2) {
      const { x, y } = this.local(e);
      if (Math.hypot(x - this.dragCreateStart.x, y - this.dragCreateStart.y) > 6) {
        this.temp.points[1] = this.snap(x, y, this.conv());
        this.finishTemp();
      } else {
        this.dragCreateStart = null;
      }
    }
  };

  private onLeave = () => {
    this.mouse = null;
    this.ev.onCrosshair(null);
    this.lastSig = '';
  };

  private onDbl = (e: MouseEvent) => {
    const st = this.state();
    const { x, y } = this.local(e);
    const hit: Hit | null = hitTest(this.myDrawings(), { x, y }, this.conv(), st.selectedDrawing);
    if (!hit) return;
    const d = this.myDrawings().find((dd) => dd.id === hit.id);
    if (d?.type === 'text') {
      this.stop(e);
      st.set({ textDialog: { open: true, drawingId: d.id, initial: d.text ?? '' } });
    }
  };

  /* ------------------------------ render loop ----------------------------- */

  private resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.lastSig = '';
  }

  private loop = () => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.display.length) {
      if (this.lastSig !== 'empty') { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.lastSig = 'empty'; }
      return;
    }
    const st = this.state();
    const conv = this.conv();
    const range = this.chart.timeScale().getVisibleLogicalRange();
    const last = this.display[this.display.length - 1];
    const ly = conv.pToY(last.close);
    const ry = conv.pToY(last.close * 1.01 + 1e-9);
    const sec = Math.floor(Date.now() / 1000);
    const drawingsRef = st.drawings[this.symbol];
    const replaySel = st.replay?.status === 'select' && st.replay.paneId === this.paneId;
    const sig = [conv.width, conv.height, range?.from, range?.to, ly, ry, sec, st.selectedDrawing, st.drawingsHidden, st.theme,
      replaySel ? `${this.mouse?.x}` : '', this.canvas.width, this.canvas.height].join('|');
    if (sig === this.lastSig && (drawingsRef as any) === this.lastDrawingsRef) return;
    this.lastSig = sig;
    this.lastDrawingsRef = drawingsRef;
    this.draw(conv, st.selectedDrawing, st.drawingsHidden, replaySel);
  };
  private lastDrawingsRef: unknown = null;

  private draw(conv: Conv, selected: string | null, hidden: boolean, replaySel: boolean) {
    const dpr = window.devicePixelRatio || 1;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
    const theme = { text: this.colors.text, bg: this.colors.bg, up: this.colors.up, down: this.colors.down, handleFill: this.colors.handleFill };

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, conv.width, conv.height);
    ctx.clip();
    if (!hidden) {
      for (const d of this.myDrawings()) renderDrawing(ctx, d, conv, theme, d.id === selected);
    }
    if (this.temp) renderDrawing(ctx, this.temp, conv, theme, true);
    if (this.ruler) renderDrawing(ctx, this.ruler, conv, theme, false);
    if (replaySel && this.mouse) {
      ctx.fillStyle = 'rgba(41,98,255,0.12)';
      ctx.fillRect(this.mouse.x, 0, conv.width - this.mouse.x, conv.height);
      ctx.strokeStyle = '#2962ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.mouse.x, 0);
      ctx.lineTo(this.mouse.x, conv.height);
      ctx.stroke();
    }
    ctx.restore();

    // countdown to candle close, under the last price label (like TradingView)
    if (this.replayIdx === null && this.chartType !== 'line') {
      const last = this.display[this.display.length - 1];
      const y = conv.pToY(last.close);
      const sec = tfSeconds(this.tf);
      const remain = last.time + sec - Math.floor(Date.now() / 1000);
      if (y !== null && y > 0 && y < conv.height && remain > 0 && remain <= sec) {
        const h = Math.floor(remain / 3600), m = Math.floor((remain % 3600) / 60), s = remain % 60;
        const txt = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        const scaleW = this.chart.priceScale('right').width();
        const up = last.close >= last.open;
        ctx.fillStyle = up ? this.colors.up : this.colors.down;
        ctx.fillRect(conv.width + 1, y + 10, scaleW - 1, 16);
        ctx.fillStyle = '#fff';
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, conv.width + 6, y + 18.5);
      }
    }
  }

  screenshot(title: string): HTMLCanvasElement {
    const base = this.chart.takeScreenshot(true, false);
    const out = document.createElement('canvas');
    const header = 36;
    out.width = base.width;
    out.height = base.height + header;
    const c = out.getContext('2d')!;
    c.fillStyle = this.colors.bg;
    c.fillRect(0, 0, out.width, out.height);
    c.drawImage(base, 0, header);
    c.drawImage(this.canvas, 0, 0, this.canvas.width, this.canvas.height, 0, header, base.width, base.height);
    c.fillStyle = this.colors.text;
    c.font = '600 15px Inter, system-ui, sans-serif';
    c.textBaseline = 'middle';
    c.fillText(title, 12, header / 2);
    c.font = '12px Inter, system-ui, sans-serif';
    c.textAlign = 'right';
    c.fillText(`tradingview-gratis.netlify.app · ${new Date().toLocaleString('es-AR')}`, out.width - 12, header / 2);
    return out;
  }
}
