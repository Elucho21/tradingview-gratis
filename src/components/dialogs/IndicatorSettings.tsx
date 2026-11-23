import { useState } from 'react';
import type { Indicator } from '../../types';
import { indicatorDef } from '../../chart/indicators';
import { Dialog } from '../ui';

const SWATCHES = ['#f7a600', '#2962ff', '#e91e63', '#26c6da', '#7e57c2', '#66bb6a', '#ef5350', '#ab47bc', '#787b86', '#ffffff'];

export function IndicatorSettingsDialog({ indicator, onClose, onSave }: {
  indicator: Indicator; onClose: () => void; onSave: (patch: Partial<Indicator>) => void;
}) {
  const def = indicatorDef(indicator.type);
  const [params, setParams] = useState<Record<string, number>>({ ...indicator.params });
  const [color, setColor] = useState(indicator.color);
  const reset = () => setParams(Object.fromEntries(def.params.map((p) => [p.key, p.def])));
  const save = () => onSave({ params, color });

  return (
    <Dialog title={def.name} size="sm" onClose={onClose}
      footer={<>
        <button className="btn sm ghost" style={{ marginRight: 'auto' }} onClick={reset}>Valores por defecto</button>
        <button className="btn sm" style={{ border: '1px solid var(--border)' }} onClick={onClose}>Cancelar</button>
        <button className="btn sm solid" onClick={save}>Aplicar</button>
      </>}>
      <form className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
        {def.params.length === 0 && <div className="muted">Este indicador no tiene parámetros.</div>}
        <div className="grid2">
          {def.params.map((p) => (
            <div className="field" key={p.key}>
              <label>{p.label}</label>
              <input className="input num" type="number" step={p.step ?? 1} min={p.min ?? 0} value={params[p.key] ?? p.def}
                onChange={(e) => setParams({ ...params, [p.key]: e.target.value === '' ? p.def : +e.target.value })} autoFocus={p === def.params[0]} />
            </div>
          ))}
        </div>
        <div className="field">
          <label>Color</label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {SWATCHES.map((c) => (
              <button type="button" key={c} onClick={() => setColor(c)} aria-label={c}
                style={{ width: 24, height: 24, borderRadius: 4, background: c, outline: color === c ? '2px solid var(--blue)' : '1px solid var(--border)', outlineOffset: 1 }} />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 28, height: 26, border: 0, background: 'none', padding: 0 }} />
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
