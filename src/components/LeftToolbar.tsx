import type { ReactNode } from 'react';
import { MousePointer2, Minus, MoveVertical, TrendingUp, ArrowUpRight, Square, Ruler, Type, Magnet, Lock, Unlock, Eye, EyeOff, Trash2, ArrowUpFromLine, ArrowDownFromLine, AlignHorizontalSpaceAround, Waves } from 'lucide-react';
import type { Tool } from '../types';
import { TOOL_LABEL } from '../chart/drawings';
import { controllers } from '../chart/registry';
import { useActivePane, useStore } from '../store';

export const TOOLS: { id: Tool; icon: ReactNode; key?: string; label: string }[] = [
  { id: 'cursor', icon: <MousePointer2 />, label: 'Cursor' },
  { id: 'trend', icon: <TrendingUp />, key: 'Alt+T', label: TOOL_LABEL.trend },
  { id: 'ray', icon: <ArrowUpRight />, label: TOOL_LABEL.ray },
  { id: 'hline', icon: <Minus />, key: 'Alt+H', label: TOOL_LABEL.hline },
  { id: 'vline', icon: <MoveVertical />, key: 'Alt+V', label: TOOL_LABEL.vline },
  { id: 'rect', icon: <Square />, label: TOOL_LABEL.rect },
  { id: 'fib', icon: <AlignHorizontalSpaceAround />, key: 'Alt+F', label: TOOL_LABEL.fib },
  { id: 'fibext', icon: <Waves />, label: TOOL_LABEL.fibext },
  { id: 'long', icon: <ArrowUpFromLine style={{ color: 'var(--up)' }} />, label: TOOL_LABEL.long },
  { id: 'short', icon: <ArrowDownFromLine style={{ color: 'var(--down)' }} />, label: TOOL_LABEL.short },
  { id: 'text', icon: <Type />, label: TOOL_LABEL.text },
  { id: 'ruler', icon: <Ruler />, key: 'Alt+M', label: TOOL_LABEL.ruler },
];

function useToolActions() {
  const s = useStore();
  const pane = useActivePane();
  const count = (s.drawings[pane.symbol] ?? []).length;
  const pick = (t: Tool) => {
    controllers.forEach((c) => c.cancelTemp());
    s.setTool(s.tool === t && t !== 'cursor' ? 'cursor' : t);
  };
  return { s, pane, count, pick };
}

export function LeftToolbar() {
  const { s, pane, count, pick } = useToolActions();
  return (
    <aside className="lefttools" aria-label="Herramientas de dibujo">
      {TOOLS.map((t, i) => (
        <div key={t.id} style={{ display: 'contents' }}>
          {(i === 1 || i === 6 || i === 8 || i === 10) && <div className="hsep" />}
          <button className={`tool ${s.tool === t.id ? 'on' : ''}`} title={t.key ? `${t.label} (${t.key})` : t.label} onClick={() => pick(t.id)}>{t.icon}</button>
        </div>
      ))}
      <div className="hsep" />
      <button className={`tool ${s.magnet ? 'on' : ''}`} title="Modo imán: ajusta al OHLC de la vela" onClick={() => s.set({ magnet: !s.magnet })}><Magnet /></button>
      <button className={`tool ${s.drawingsLocked ? 'on' : ''}`} title={s.drawingsLocked ? 'Desbloquear dibujos' : 'Bloquear dibujos'} onClick={() => s.set({ drawingsLocked: !s.drawingsLocked })}>{s.drawingsLocked ? <Lock /> : <Unlock />}</button>
      <button className={`tool ${s.drawingsHidden ? 'on' : ''}`} title={s.drawingsHidden ? 'Mostrar dibujos' : 'Ocultar dibujos'} onClick={() => s.set({ drawingsHidden: !s.drawingsHidden })}>{s.drawingsHidden ? <EyeOff /> : <Eye />}</button>
      <button className="tool" title={`Borrar dibujos de ${pane.symbol} (${count})`} disabled={!count}
        style={{ opacity: count ? 1 : 0.35 }}
        onClick={() => { s.clearDrawings(pane.symbol); s.toast({ kind: 'info', title: `Se borraron ${count} dibujos`, body: 'Podés recuperarlos con Ctrl+Z.' }); }}><Trash2 /></button>
    </aside>
  );
}

/** Same tools as a menu (used on mobile from the top bar). */
export function DrawingToolsMenu({ onPick }: { onPick: () => void }) {
  const { s, pane, count, pick } = useToolActions();
  return (
    <>
      {TOOLS.map((t) => (
        <button key={t.id} className={`menu-item ${s.tool === t.id ? 'on' : ''}`} onClick={() => { pick(t.id); onPick(); }}>{t.icon}{t.label}</button>
      ))}
      <div className="menu-sep" />
      <button className={`menu-item ${s.magnet ? 'on' : ''}`} onClick={() => s.set({ magnet: !s.magnet })}><Magnet /> Modo imán</button>
      <button className="menu-item danger" disabled={!count} onClick={() => { s.clearDrawings(pane.symbol); onPick(); }}><Trash2 /> Borrar dibujos ({count})</button>
    </>
  );
}
