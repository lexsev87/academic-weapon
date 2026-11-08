import { useState } from 'react';
import { Section, Seg } from '../../components/UI';
import { pivot, trackingPeriod, type PivotCols, type PivotMetric, type PivotRows } from '../../lib/insights';
import { readStore, writeStore } from '../../lib/platform';
import { fmtDur } from '../../lib/stats';
import type { UserData } from '../../lib/store';

type Preset = 'subject-month' | 'activity-month' | 'subject-week' | 'subject-activity';
const PRESETS: { id: Preset; label: string; rows: PivotRows; cols: PivotCols }[] = [
  { id: 'subject-month', label: 'Esami × mesi', rows: 'subject', cols: 'month' },
  { id: 'activity-month', label: 'Attività × mesi', rows: 'activity', cols: 'month' },
  { id: 'subject-week', label: 'Esami × settimane', rows: 'subject', cols: 'week' },
  { id: 'subject-activity', label: 'Esami × attività', rows: 'subject', cols: 'activity' },
];

/** Cross tables over the tracking period: rows by exam or activity, columns by month, week or activity. */
export function PivotTables({ data }: { data: UserData }) {
  const [preset, setPresetState] = useState<Preset>(() => (readStore('aw:pivot') as Preset) || 'subject-month');
  const [metric, setMetric] = useState<PivotMetric>('hours');
  const setPreset = (p: Preset) => {
    setPresetState(p);
    writeStore('aw:pivot', p);
  };
  const def = PRESETS.find((p) => p.id === preset)!;
  const { start, end } = trackingPeriod(data.settings);
  const tEnd = def.cols === 'week' ? new Date(Math.min(end.getTime(), Date.now() + 86400000)) : end;
  const t = pivot(data, def.rows, def.cols, start, tEnd);
  const val = (c: { sec: number; n: number }) => (metric === 'hours' ? c.sec : c.n);
  const show = (c: { sec: number; n: number }) => (val(c) ? (metric === 'hours' ? fmtDur(c.sec, true) : String(c.n)) : '–');
  const max = Math.max(1, ...t.rows.flatMap((r) => r.cells.map(val)));
  const range = `${start.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(end.getTime() - 1).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <Section
      title="Tabelle"
      note={range}
      accessory={
        <Seg<PivotMetric>
          size="sm"
          label="Misura"
          value={metric}
          onChange={setMetric}
          options={[
            { id: 'hours', label: 'Ore' },
            { id: 'sessions', label: 'Sessioni' },
          ]}
        />
      }
    >
      <div className="pivot-presets">
        <Seg<Preset> label="Tabella" value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ id: p.id, label: p.label }))} />
      </div>
      <div className="card table-card">
        <table className="data-table pivot">
          <thead>
            <tr>
              <th className="pivot-corner">{def.rows === 'subject' ? 'Esame' : 'Attività'}</th>
              {t.cols.map((c) => (
                <th key={c.key} className="num">
                  {c.label}
                </th>
              ))}
              <th className="num">Totale</th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={String(r.id)}>
                <td className="pivot-corner">
                  <span className="tag">
                    <span className="dot" style={{ background: r.color }} />
                    {r.name}
                  </span>
                </td>
                {r.cells.map((c, i) => (
                  <td key={i} className="num tnum" style={val(c) ? { background: `color-mix(in srgb, ${r.color} ${Math.round(6 + (val(c) / max) * 34)}%, transparent)` } : undefined}>
                    {show(c)}
                  </td>
                ))}
                <td className="num tnum strong">{show(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pivot-corner">Totale</td>
              {t.colTotals.map((c, i) => (
                <td key={i} className="num tnum">
                  {show(c)}
                </td>
              ))}
              <td className="num tnum">{show(t.grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  );
}
