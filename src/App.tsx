import { X } from 'lucide-react';
import { useStore } from './store';
import { TopBar } from './components/TopBar';
import { LeftToolbar } from './components/LeftToolbar';
import { RightPanel, RightRail } from './components/RightPanel';
import { BottomBar } from './components/BottomBar';
import { Journal } from './components/Journal';
import { ChartPane } from './components/ChartPane';
import { SymbolSearch } from './components/dialogs/SymbolSearch';
import { IndicatorsDialog } from './components/dialogs/IndicatorsDialog';
import { AlertDialog, SettingsDialog, ShortcutsDialog, TextDialog, TimeframePrompt } from './components/dialogs/Misc';
import { useAlertEngine, useKeyboard, useTitleAndUrl } from './hooks';
import { TOOL_LABEL } from './chart/drawings';

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <div style={{ flex: 1 }}>
            <div className="tt">{t.title}</div>
            {t.body && <div className="tb">{t.body}</div>}
          </div>
          <button className="btn sm ghost" style={{ height: 22, minWidth: 22 }} onClick={() => dismiss(t.id)} aria-label="Cerrar"><X /></button>
        </div>
      ))}
    </div>
  );
}

function ToolHint() {
  const tool = useStore((s) => s.tool);
  if (tool === 'cursor') return null;
  const multi = tool === 'fibext' ? 'Hacé 3 clics: inicio, fin del impulso y retroceso.' : ['trend', 'ray', 'rect', 'fib', 'ruler'].includes(tool) ? 'Clic en el punto inicial y clic (o arrastrá) hasta el final.' : 'Hacé clic en el gráfico.';
  return (
    <div style={{ position: 'fixed', top: 54, left: '50%', transform: 'translateX(-50%)', zIndex: 40, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, boxShadow: 'var(--shadow)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
      <b>{TOOL_LABEL[tool]}</b> · <span className="muted">{multi} Esc para cancelar.</span>
    </div>
  );
}

export default function App() {
  const layout = useStore((s) => s.layout);
  const panes = useStore((s) => s.panes);
  const focus = useStore((s) => s.focusMode);
  const journalOpen = useStore((s) => s.journalOpen);
  const search = useStore((s) => s.search);
  const indicatorsOpen = useStore((s) => s.indicatorsOpen);
  const shortcutsOpen = useStore((s) => s.shortcutsOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const alertDialog = useStore((s) => s.alertDialog);
  const textDialog = useStore((s) => s.textDialog);
  const tfPrompt = useStore((s) => s.tfPrompt);

  useKeyboard();
  useAlertEngine();
  useTitleAndUrl();

  return (
    <div className={`app ${focus ? 'focus' : ''}`}>
      <TopBar />
      <div className="body">
        <LeftToolbar />
        <main className="center">
          <div className={`grid l${layout}`}>
            {panes.map((p) => <ChartPane key={p.id} pane={p} multi={panes.length > 1} />)}
          </div>
          {journalOpen && <Journal />}
        </main>
        <RightPanel />
        <RightRail />
      </div>
      <BottomBar />

      <ToolHint />
      <Toasts />
      {search.open && <SymbolSearch key={search.mode + search.initial} />}
      {indicatorsOpen && <IndicatorsDialog />}
      {shortcutsOpen && <ShortcutsDialog />}
      {settingsOpen && <SettingsDialog />}
      {alertDialog.open && <AlertDialog key={`${alertDialog.editId}-${alertDialog.price}`} />}
      {textDialog.open && <TextDialog key={textDialog.drawingId} />}
      {tfPrompt.open && <TimeframePrompt />}
    </div>
  );
}
