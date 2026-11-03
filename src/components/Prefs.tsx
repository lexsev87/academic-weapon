import { useState, type ReactNode } from 'react';
import { IconPlay } from './Icons';
import { Seg, Stepper } from './UI';
import { GRADE_SCALES, type GradeScale, type Settings } from '../lib/store';
import { fmtBlocks, fmtDur } from '../lib/stats';
import { playSound, SOUNDS } from '../lib/native';

/* Preference blocks shared by the first-run setup and the Settings page. */
type Props = { s: Settings; set: (p: Partial<Settings>) => void };

export const PROGRAM_PRESETS: { label: string; p: Partial<Settings> }[] = [
  { label: 'Laurea triennale', p: { creditLabel: 'CFU', degreeCfu: 180, gradeScale: '30', periodLabel: 'Semestre' } },
  { label: 'Laurea magistrale', p: { creditLabel: 'CFU', degreeCfu: 120, gradeScale: '30', periodLabel: 'Semestre' } },
  { label: 'Ciclo unico', p: { creditLabel: 'CFU', degreeCfu: 300, gradeScale: '30', periodLabel: 'Semestre' } },
  { label: 'Bachelor', p: { creditLabel: 'ECTS', degreeCfu: 180, periodLabel: 'Term' } },
  { label: 'Master', p: { creditLabel: 'ECTS', degreeCfu: 90, periodLabel: 'Term' } },
  { label: 'Anno quantitativo', p: { creditLabel: '', degreeCfu: 0, gradeScale: '100', periodLabel: 'Modulo' } },
  { label: 'Gap year', p: { creditLabel: '', degreeCfu: 0, gradeScale: 'none', periodLabel: 'Blocco' } },
  { label: 'Dottorato', p: { creditLabel: '', degreeCfu: 0, gradeScale: 'none', periodLabel: 'Anno' } },
  { label: 'Corsi singoli', p: { creditLabel: 'CFU', degreeCfu: 0, periodLabel: 'Semestre' } },
];
const CREDITS = ['CFU', 'ECTS', 'Crediti'];
const PERIODS = ['Semestre', 'Trimestre', 'Quadrimestre', 'Term', 'Modulo', 'Blocco'];

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="row-item">
      <span className="row-label">
        {label}
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <div className="row-control">{children}</div>
    </div>
  );
}
export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row-item">
      <span className="row-label">
        {label}
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** Pick one of a few common values or type your own. */
function ChipsOrCustom({ options, value, onChange, placeholder, noneLabel }: { options: string[]; value: string; onChange: (v: string) => void; placeholder: string; noneLabel?: string }) {
  const custom = value !== '' && !options.includes(value);
  const [editing, setEditing] = useState(custom);
  return (
    <div className="choice">
      <div className="chips">
        {options.map((o) => (
          <button key={o} type="button" className="chip" aria-pressed={value === o && !editing} onClick={() => (setEditing(false), onChange(o))}>
            {o}
          </button>
        ))}
        {noneLabel !== undefined && (
          <button type="button" className="chip" aria-pressed={value === '' && !editing} onClick={() => (setEditing(false), onChange(''))}>
            {noneLabel}
          </button>
        )}
        <button type="button" className="chip" aria-pressed={editing || custom} onClick={() => setEditing(true)}>
          Altro…
        </button>
      </div>
      {(editing || custom) && <input className="in" autoFocus={editing && !custom} value={custom ? value : ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

export function ProgramFields({ s, set }: Props) {
  return (
    <>
      <div className="field">
        <span className="field-label">Che percorso stai facendo?</span>
        <ChipsOrCustom
          options={PROGRAM_PRESETS.map((x) => x.label)}
          value={s.programType}
          placeholder="Es. Pre-master in finanza quantitativa"
          onChange={(v) => set({ programType: v, ...PROGRAM_PRESETS.find((x) => x.label === v)?.p })}
        />
      </div>
      <div className="field">
        <span className="field-label">Nome del corso o del programma</span>
        <input className="in" value={s.degree} placeholder="Es. Economia e Finanza, MSc Quantitative Finance…" onChange={(e) => set({ degree: e.target.value })} />
      </div>
      <div className="field">
        <span className="field-label">Crediti</span>
        <ChipsOrCustom options={CREDITS} value={s.creditLabel} noneLabel="Nessuno" placeholder="Es. US credits" onChange={(v) => set({ creditLabel: v })} />
        {s.creditLabel && (
          <div className="card list nested">
            <Stepper label={`${s.creditLabel} totali da conseguire`} unit="0 = nessuno" value={s.degreeCfu} min={0} max={600} step={5} onChange={(v) => set({ degreeCfu: v })} />
          </div>
        )}
      </div>
      <div className="field">
        <span className="field-label">Come vengono valutati gli esami?</span>
        <select className="in" value={s.gradeScale} onChange={(e) => set({ gradeScale: e.target.value as GradeScale })}>
          {GRADE_SCALES.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="field-label">Come si chiamano i periodi didattici?</span>
        <ChipsOrCustom options={PERIODS} value={s.periodLabel} placeholder="Es. Sessione, Quarter…" onChange={(v) => set({ periodLabel: v || 'Periodo' })} />
      </div>
    </>
  );
}

const DAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
export function GoalFields({ s, set }: Props) {
  const g = s.dayGoals;
  const uniform = [1, 2, 3, 4].every((i) => g[i] === g[5]) && g[0] === g[6];
  const [perDay, setPerDay] = useState(!uniform);
  const setDays = (days: number[], min: number) => set({ dayGoals: g.map((v, i) => (days.includes(i) ? min : v)) });
  const order = s.weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const week = g.reduce((a, v) => a + v, 0) * 60;
  return (
    <>
      <div className="center-row">
        <Seg<'simple' | 'day'>
          label="Come impostare gli obiettivi"
          value={perDay ? 'day' : 'simple'}
          onChange={(v) => setPerDay(v === 'day')}
          options={[
            { id: 'simple', label: 'Feriali e weekend' },
            { id: 'day', label: 'Giorno per giorno' },
          ]}
        />
      </div>
      <div className="card list nested">
        {perDay ? (
          order.map((i) => <Stepper key={i} label={DAYS[i]} unit="ore" value={g[i] / 60} min={0} max={16} step={0.5} onChange={(v) => setDays([i], v * 60)} />)
        ) : (
          <>
            <Stepper label="Da lunedì a venerdì" unit="ore" value={g[1] / 60} min={0} max={16} step={0.5} onChange={(v) => setDays([1, 2, 3, 4, 5], v * 60)} />
            <Stepper label="Sabato e domenica" unit="ore" value={g[6] / 60} min={0} max={16} step={0.5} onChange={(v) => setDays([0, 6], v * 60)} />
          </>
        )}
      </div>
      <div className="card list nested">
        <Toggle
          label="Conta in blocchi, pausa inclusa"
          hint={`Un blocco = ${s.focusMin} min di studio + ${s.shortMin} di pausa. Così ${fmtDur(g[1] * 60)} = ${fmtBlocks(g[1] / (s.focusMin + s.shortMin))} blocchi.`}
          checked={s.goalInBlocks}
          onChange={(v) => set({ goalInBlocks: v })}
        />
      </div>
      <p className="group-foot">
        In tutto {fmtDur(week)} a settimana{s.goalInBlocks ? `, cioè ${fmtBlocks(week / 60 / (s.focusMin + s.shortMin))} blocchi` : ''}. 0 ore = giorno libero.
      </p>
    </>
  );
}

export function SoundFields({ s, set }: Props) {
  const pick = (key: 'soundFocusEnd' | 'soundBreakEnd', label: string, hint: string) => (
    <Row label={label} hint={hint}>
      <select className="in compact" value={s[key]} disabled={!s.sound} onChange={(e) => (set({ [key]: e.target.value }), playSound(e.target.value, s.volume))}>
        {SOUNDS.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
      <button type="button" className="btn icon" aria-label="Ascolta" title="Ascolta" disabled={!s.sound} onClick={() => playSound(s[key], s.volume)}>
        <IconPlay size={11} />
      </button>
    </Row>
  );
  return (
    <>
      <Toggle label="Suoni" checked={s.sound} onChange={(v) => set({ sound: v })} />
      {pick('soundFocusEnd', 'Fine concentrazione', 'È ora della pausa')}
      {pick('soundBreakEnd', 'Fine pausa', 'Si torna a studiare')}
      <Row label="Volume">
        <input
          type="range"
          className="range"
          min={0.1}
          max={1}
          step={0.05}
          value={s.volume}
          disabled={!s.sound}
          onChange={(e) => set({ volume: Number(e.target.value) })}
          onMouseUp={() => playSound(s.soundFocusEnd, s.volume)}
        />
      </Row>
    </>
  );
}
