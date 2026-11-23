import type { Drawing, DrawingType, Point } from '../types';

export interface Conv {
  tToX: (t: number) => number | null;
  pToY: (p: number) => number | null;
  xToT: (x: number) => number;
  yToP: (y: number) => number | null;
  width: number; // plot width (without price scale)
  height: number; // main pane height
  fmt: (p: number) => string;
  bars: (t1: number, t2: number) => number;
  tfSec: number;
}

export interface Theme {
  text: string;
  bg: string;
  up: string;
  down: string;
  handleFill: string;
}

export const POINTS_NEEDED: Record<DrawingType, number> = {
  hline: 1, vline: 1, text: 1, long: 1, short: 1,
  trend: 2, ray: 2, rect: 2, fib: 2, ruler: 2, fibext: 3,
};

export const TOOL_LABEL: Record<DrawingType, string> = {
  hline: 'Línea horizontal', vline: 'Línea vertical', trend: 'Línea de tendencia', ray: 'Rayo',
  rect: 'Rectángulo', fib: 'Retroceso de Fibonacci', fibext: 'Extensión de Fibonacci',
  long: 'Posición larga', short: 'Posición corta', text: 'Texto', ruler: 'Regla / Medir',
};

export const DEFAULT_COLOR: Record<DrawingType, string> = {
  hline: '#2962ff', vline: '#2962ff', trend: '#2962ff', ray: '#2962ff', rect: '#9c27b0',
  fib: '#787b86', fibext: '#787b86', long: '#089981', short: '#f23645', text: '#d1d4dc', ruler: '#2962ff',
};

export const FIB_LEVELS = [
  { l: 0, c: '#787b86' }, { l: 0.236, c: '#f23645' }, { l: 0.382, c: '#ff9800' }, { l: 0.5, c: '#4caf50' },
  { l: 0.618, c: '#089981' }, { l: 0.786, c: '#00bcd4' }, { l: 1, c: '#787b86' },
];
export const FIBEXT_LEVELS = [
  { l: 0, c: '#787b86' }, { l: 0.618, c: '#f23645' }, { l: 1, c: '#089981' }, { l: 1.272, c: '#ff9800' },
  { l: 1.618, c: '#2962ff' }, { l: 2, c: '#9c27b0' }, { l: 2.618, c: '#e91e63' },
];

type XY = { x: number; y: number };

function px(conv: Conv, pt: Point): XY | null {
  const x = conv.tToX(pt.t), y = conv.pToY(pt.p);
  if (x === null || y === null) return null;
  return { x, y };
}

function alpha(hex: string, a: number) {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function extendToEdge(a: XY, b: XY, w: number, h: number): XY {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return b;
  let tMax = Infinity;
  if (dx > 0) tMax = Math.min(tMax, (w - a.x) / dx);
  if (dx < 0) tMax = Math.min(tMax, (0 - a.x) / dx);
  if (dy > 0) tMax = Math.min(tMax, (h + 2000 - a.y) / dy);
  if (dy < 0) tMax = Math.min(tMax, (-2000 - a.y) / dy);
  if (!isFinite(tMax)) tMax = 1;
  return { x: a.x + dx * tMax, y: a.y + dy * tMax };
}

/** Long/short geometry: points[0]=entry, points[1]=target (t = right edge), points[2]=stop */
export function positionPoints(d: Drawing) {
  const [e, tg, st] = d.points;
  return { entry: e, target: tg, stop: st ?? { t: tg.t, p: 2 * e.p - tg.p } };
}

/** Handles (draggable points) in pixel space */
export function handles(d: Drawing, conv: Conv): (XY | null)[] {
  if (d.type === 'hline') {
    const y = conv.pToY(d.points[0].p);
    return [y === null ? null : { x: conv.width - 40, y }];
  }
  if (d.type === 'vline') {
    const x = conv.tToX(d.points[0].t);
    return [x === null ? null : { x, y: conv.height / 2 }];
  }
  if (d.type === 'long' || d.type === 'short') {
    const { entry, target, stop } = positionPoints(d);
    const xe = conv.tToX(entry.t), xr = conv.tToX(target.t);
    const ye = conv.pToY(entry.p), yt = conv.pToY(target.p), ys = conv.pToY(stop.p);
    if (xe === null || xr === null || ye === null || yt === null || ys === null) return [];
    return [{ x: xe, y: ye }, { x: xe, y: yt }, { x: xe, y: ys }, { x: xr, y: ye }];
  }
  return d.points.map((p) => px(conv, p));
}

function distToSeg(p: XY, a: XY, b: XY) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export interface Hit { id: string; handle: number } // handle -1 = body

export function hitTest(list: Drawing[], m: XY, conv: Conv, selected: string | null): Hit | null {
  // handles of the selected drawing first
  if (selected) {
    const d = list.find((x) => x.id === selected);
    if (d) {
      const hs = handles(d, conv);
      for (let i = 0; i < hs.length; i++) {
        const h = hs[i];
        if (h && Math.hypot(h.x - m.x, h.y - m.y) <= 7) return { id: d.id, handle: i };
      }
    }
  }
  for (let k = list.length - 1; k >= 0; k--) {
    const d = list[k];
    if (bodyHit(d, m, conv)) return { id: d.id, handle: -1 };
  }
  return null;
}

function bodyHit(d: Drawing, m: XY, conv: Conv): boolean {
  const T = 6;
  switch (d.type) {
    case 'hline': {
      const y = conv.pToY(d.points[0].p);
      return y !== null && Math.abs(y - m.y) <= T;
    }
    case 'vline': {
      const x = conv.tToX(d.points[0].t);
      return x !== null && Math.abs(x - m.x) <= T;
    }
    case 'trend': case 'ray': case 'ruler': {
      const a = px(conv, d.points[0]), b0 = px(conv, d.points[1]);
      if (!a || !b0) return false;
      const b = d.type === 'ray' ? extendToEdge(a, b0, conv.width, conv.height) : b0;
      return distToSeg(m, a, b) <= T;
    }
    case 'rect': case 'fib': {
      const a = px(conv, d.points[0]), b = px(conv, d.points[1]);
      if (!a || !b) return false;
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
      if (d.type === 'rect') return m.x >= x1 - T && m.x <= x2 + T && m.y >= y1 - T && m.y <= y2 + T;
      if (m.x < x1 - T || m.x > x2 + T) return false;
      return FIB_LEVELS.some(({ l }) => {
        const y = conv.pToY(d.points[1].p + (d.points[0].p - d.points[1].p) * l);
        return y !== null && Math.abs(y - m.y) <= T;
      }) || distToSeg(m, a, b) <= T;
    }
    case 'fibext': {
      const [A, B, C] = d.points.map((p) => px(conv, p));
      if (!A || !B || !C) return false;
      if (distToSeg(m, A, B) <= T || distToSeg(m, B, C) <= T) return true;
      const x2 = C.x + Math.max(60, Math.abs(B.x - A.x));
      if (m.x < C.x - T || m.x > x2 + T) return false;
      return FIBEXT_LEVELS.some(({ l }) => {
        const y = conv.pToY(d.points[2].p + (d.points[1].p - d.points[0].p) * l);
        return y !== null && Math.abs(y - m.y) <= T;
      });
    }
    case 'long': case 'short': {
      const h = handles(d, conv);
      if (h.length < 4) return false;
      const [e, t, s, r] = h as XY[];
      const x1 = Math.min(e.x, r.x), x2 = Math.max(e.x, r.x);
      const y1 = Math.min(t.y, s.y), y2 = Math.max(t.y, s.y);
      return m.x >= x1 && m.x <= x2 && m.y >= y1 && m.y <= y2;
    }
    case 'text': {
      const a = px(conv, d.points[0]);
      if (!a) return false;
      const w = Math.max(30, (d.text?.length ?? 5) * 7.5);
      return m.x >= a.x - 4 && m.x <= a.x + w && m.y >= a.y - 18 && m.y <= a.y + 6;
    }
  }
  return false;
}

/* ------------------------------- rendering ------------------------------- */

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, fg = '#fff', align: 'left' | 'right' | 'center' = 'left') {
  ctx.font = '11px Inter, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 10;
  const h = 18;
  let lx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = bg;
  roundRect(ctx, lx, y - h / 2, w, h, 3);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, lx + 5, y + 0.5);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function line(ctx: CanvasRenderingContext2D, a: XY, b: XY) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function fmtDuration(sec: number) {
  const s = Math.abs(sec);
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(s < 36000 ? 1 : 0)}h`;
  return `${(s / 86400).toFixed(s < 864000 ? 1 : 0)}d`;
}

export function renderDrawing(ctx: CanvasRenderingContext2D, d: Drawing, conv: Conv, theme: Theme, selected: boolean) {
  ctx.save();
  ctx.lineWidth = selected ? 2 : 1.5;
  ctx.strokeStyle = d.color;
  ctx.setLineDash([]);
  const W = conv.width, H = conv.height;

  switch (d.type) {
    case 'hline': {
      const y = conv.pToY(d.points[0].p);
      if (y === null) break;
      line(ctx, { x: 0, y }, { x: W, y });
      label(ctx, conv.fmt(d.points[0].p), W - 2, y, d.color, '#fff', 'right');
      break;
    }
    case 'vline': {
      const x = conv.tToX(d.points[0].t);
      if (x === null) break;
      line(ctx, { x, y: 0 }, { x, y: H });
      break;
    }
    case 'trend': case 'ray': {
      const a = px(conv, d.points[0]), b0 = px(conv, d.points[1]);
      if (!a || !b0) break;
      const b = d.type === 'ray' ? extendToEdge(a, b0, W, H) : b0;
      line(ctx, a, b);
      if (selected && d.type === 'trend') {
        const pct = ((d.points[1].p - d.points[0].p) / d.points[0].p) * 100;
        label(ctx, `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, b0.x + 8, b0.y, alpha(d.color, 0.85));
      }
      break;
    }
    case 'rect': {
      const a = px(conv, d.points[0]), b = px(conv, d.points[1]);
      if (!a || !b) break;
      ctx.fillStyle = alpha(d.color, 0.15);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      break;
    }
    case 'fib': {
      const a = px(conv, d.points[0]), b = px(conv, d.points[1]);
      if (!a || !b) break;
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
      const lv = FIB_LEVELS.map((f) => ({ ...f, price: d.points[1].p + (d.points[0].p - d.points[1].p) * f.l }))
        .map((f) => ({ ...f, y: conv.pToY(f.price) }));
      for (let i = 0; i < lv.length - 1; i++) {
        const y1 = lv[i].y, y2 = lv[i + 1].y;
        if (y1 === null || y2 === null) continue;
        ctx.fillStyle = alpha(lv[i + 1].c, 0.1);
        ctx.fillRect(x1, Math.min(y1, y2), x2 - x1, Math.abs(y2 - y1));
      }
      ctx.lineWidth = 1;
      for (const f of lv) {
        if (f.y === null) continue;
        ctx.strokeStyle = f.c;
        line(ctx, { x: x1, y: f.y }, { x: x2, y: f.y });
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillStyle = f.c;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${f.l} (${conv.fmt(f.price)})`, x1 - 4, f.y + 5);
      }
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = alpha('#787b86', 0.8);
      line(ctx, a, b);
      break;
    }
    case 'fibext': {
      const P = d.points.map((p) => px(conv, p));
      if (P.some((p) => !p)) break;
      const [A, B, C] = P as XY[];
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = alpha('#787b86', 0.9);
      line(ctx, A, B);
      line(ctx, B, C);
      ctx.setLineDash([]);
      if (d.points.length < 3 || (C.x === B.x && C.y === B.y)) break;
      const x1 = C.x, x2 = C.x + Math.max(60, Math.abs(B.x - A.x));
      const range = d.points[1].p - d.points[0].p;
      ctx.lineWidth = 1;
      for (const f of FIBEXT_LEVELS) {
        const price = d.points[2].p + range * f.l;
        const y = conv.pToY(price);
        if (y === null) continue;
        ctx.strokeStyle = f.c;
        line(ctx, { x: x1, y }, { x: x2, y });
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.fillStyle = f.c;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${f.l} (${conv.fmt(price)})`, x2 + 4, y + 5);
      }
      break;
    }
    case 'ruler': {
      const a = px(conv, d.points[0]), b = px(conv, d.points[1]);
      if (!a || !b) break;
      const up = d.points[1].p >= d.points[0].p;
      const col = up ? '#2962ff' : '#f23645';
      ctx.fillStyle = alpha(col, 0.15);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      line(ctx, { x: midX, y: a.y }, { x: midX, y: b.y });
      line(ctx, { x: a.x, y: midY }, { x: b.x, y: midY });
      const diff = d.points[1].p - d.points[0].p;
      const pct = (diff / d.points[0].p) * 100;
      const bars = conv.bars(d.points[0].t, d.points[1].t);
      const dur = fmtDuration(d.points[1].t - d.points[0].t);
      const txt1 = `${diff >= 0 ? '+' : ''}${conv.fmt(diff)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
      const txt2 = `${bars} velas, ${dur}`;
      const ly = up ? Math.min(a.y, b.y) - 30 : Math.max(a.y, b.y) + 12;
      ctx.font = '12px Inter, system-ui, sans-serif';
      const w = Math.max(ctx.measureText(txt1).width, ctx.measureText(txt2).width) + 16;
      ctx.fillStyle = col;
      roundRect(ctx, midX - w / 2, ly - 4, w, 38, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(txt1, midX, ly);
      ctx.fillText(txt2, midX, ly + 16);
      break;
    }
    case 'long': case 'short': {
      const h = handles(d, conv);
      if (h.length < 4) break;
      const [e, t, s, r] = h as XY[];
      const { entry, target, stop } = positionPoints(d);
      const x1 = Math.min(e.x, r.x), w = Math.abs(r.x - e.x);
      ctx.fillStyle = alpha(theme.up, 0.2);
      ctx.fillRect(x1, Math.min(e.y, t.y), w, Math.abs(t.y - e.y));
      ctx.fillStyle = alpha(theme.down, 0.2);
      ctx.fillRect(x1, Math.min(e.y, s.y), w, Math.abs(s.y - e.y));
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#787b86';
      line(ctx, { x: x1, y: e.y }, { x: x1 + w, y: e.y });
      const tPct = ((target.p - entry.p) / entry.p) * 100;
      const sPct = ((stop.p - entry.p) / entry.p) * 100;
      const rr = Math.abs(target.p - entry.p) / Math.max(1e-12, Math.abs(entry.p - stop.p));
      const cx = x1 + w / 2;
      label(ctx, `Objetivo: ${conv.fmt(target.p)} (${tPct >= 0 ? '+' : ''}${tPct.toFixed(2)}%)`, cx, t.y + (t.y < e.y ? -12 : 12), theme.up, '#fff', 'center');
      label(ctx, `Stop: ${conv.fmt(stop.p)} (${sPct >= 0 ? '+' : ''}${sPct.toFixed(2)}%)`, cx, s.y + (s.y < e.y ? -12 : 12), theme.down, '#fff', 'center');
      label(ctx, `${d.type === 'long' ? 'Long' : 'Short'} · R:R ${rr.toFixed(2)}`, cx, e.y, '#5d606b', '#fff', 'center');
      break;
    }
    case 'text': {
      const a = px(conv, d.points[0]);
      if (!a) break;
      ctx.font = '500 13px Inter, system-ui, sans-serif';
      ctx.fillStyle = d.color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(d.text || 'Texto', a.x, a.y);
      if (selected) {
        const w = ctx.measureText(d.text || 'Texto').width;
        ctx.strokeStyle = alpha('#2962ff', 0.8);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(a.x - 4, a.y - 16, w + 8, 22);
      }
      break;
    }
  }

  if (selected) {
    ctx.setLineDash([]);
    for (const hp of handles(d, conv)) {
      if (!hp) continue;
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = theme.handleFill;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#2962ff';
      ctx.stroke();
    }
  }
  ctx.restore();
}
