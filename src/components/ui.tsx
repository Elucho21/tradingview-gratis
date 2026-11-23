import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Popover({ anchor, open, onClose, children, align = 'left', width }: {
  anchor: RefObject<HTMLElement | null> | { x: number; y: number };
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: 'left' | 'right';
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;
  const anchorKey = 'current' in anchor ? anchor : `${anchor.x},${anchor.y}`;

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const anchor = anchorRef.current;
      const el = ref.current;
      const w = el?.offsetWidth ?? width ?? 200;
      const h = el?.offsetHeight ?? 200;
      let left: number, top: number;
      if ('current' in anchor) {
        const r = anchor.current?.getBoundingClientRect();
        if (!r) return;
        left = align === 'right' ? r.right - w : r.left;
        top = r.bottom + 4;
        if (top + h > window.innerHeight - 8 && r.top - h - 4 > 8) top = r.top - h - 4;
      } else {
        left = anchor.x;
        top = anchor.y;
        if (top + h > window.innerHeight - 8) top = Math.max(8, anchor.y - h);
      }
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
    };
    place();
    const id = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', place); };
  }, [open, anchorKey, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const anchor = anchorRef.current;
      if (ref.current?.contains(t)) return;
      if ('current' in anchor && anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey, true); };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div ref={ref} className="pop" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width }} role="menu">
      {children}
    </div>,
    document.body,
  );
}

export function Dialog({ title, onClose, children, footer, size, headerExtra }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm'; headerExtra?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dialog ${size ?? ''}`} role="dialog" aria-modal="true">
        <div className="dialog-head">
          <span>{title}</span>
          <div className="row" style={{ gap: 4 }}>
            {headerExtra}
            <button className="btn sm ghost" onClick={onClose} aria-label="Cerrar"><X /></button>
          </div>
        </div>
        {children}
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function SymbolIcon({ symbol, size = 20 }: { symbol: string; size?: number }) {
  const base = symbol.replace(/(USDT|FDUSD|USDC|BTC|ETH)$/, '') || symbol;
  const letter = base.replace(/[^A-Z0-9]/gi, '').slice(0, 1) || '?';
  let h = 0;
  for (const ch of base) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const known: Record<string, string> = { BTC: '#f7931a', ETH: '#627eea', SOL: '#9945ff', BNB: '#f0b90b', XRP: '#23292f', DOGE: '#c2a633', ADA: '#0033ad', AVAX: '#e84142', LINK: '#2a5ada', TRX: '#ef0027', DOT: '#e6007a', LTC: '#345d9d', SUI: '#4da2ff', PEPE: '#3d8130' };
  const bg = known[base] ?? `hsl(${h} 55% 45%)`;
  return <span className="symicon" style={{ background: bg, width: size, height: size, fontSize: size * 0.48 }}>{letter}</span>;
}

export function fmtPrice(p: number | null | undefined, ref?: number) {
  if (p === null || p === undefined || !isFinite(p)) return '—';
  const r = ref ?? p;
  const prec = r >= 10 ? 2 : r >= 1 ? 4 : Math.min(10, Math.max(4, Math.ceil(-Math.log10(Math.abs(r) || 1)) + 3));
  return p.toLocaleString('en-US', { minimumFractionDigits: prec, maximumFractionDigits: prec });
}

export function fmtCompact(n: number | null | undefined) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (a >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(2);
}

export function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};
