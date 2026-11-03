import { useState } from 'react';
import { Columns, HBars, Heatmap, type ColumnDatum } from '../../components/Charts';
import { IconCalendar, IconChart, IconCheck, IconTimer } from '../../components/Icons';
import { Metric, PageHeader, Section, Seg } from '../../components/UI';
import type { UserData } from '../../lib/store';
import { FOCUS_LEVELS } from './FocusOverlay';
import { addDays, bySubject, dayKey, fmtDur, fmtNum, goalFor, parseDayKey, partsByDay, startOfDay, totalsByDay } from '../../lib/stats';

type Range = '7' | '30' | '90' | '365';

export function StatsPage({ data }: { data: UserData; name: string }) {
  const [range, setRange] = useState<Range>('30');
  const [table, setTable] = useState(false);
  const { sessions, subjects, settings } = data;
  const days = Number(range);
  const today0 = startOfDay(new Date());
  const from = addDays(today0, -(days - 1)).getTime();
  const to = Date.now() + 1;
  const inRange = sessions.filter((s) => s.start >= from && s.start < to);
  const byDay = totalsByDay(inRange);
  const total = inRange.reduce((a, s) => a + s.dur, 0);
  const activeDays = [...byDay.values()].filter((v) => v > 0).length;
  const best = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const goalDays = [...byDay.entries()].filter(([k, v]) => { const g = goalFor(settings, parseDayKey(k)); return g > 0 && v >= g; }).length;
  const parts = partsByDay(inRange, subjects);
  const rated = inRange.filter((x) => x.focus > 0);
  const focusAvg = rated.length ? rated.reduce((a, x) => a + x.focus, 0) / rated.length : 0;

  let series: ColumnDatum[];
  let labelEvery = 1;
  if (range === '365') {
    series = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(today0.getFullYear(), today0.getMonth() - 11 + i, 1);
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const sec = inRange.filter((s) => s.start >= d.getTime() && s.start < e.getTime()).reduce((a, s) => a + s.dur, 0);
      return { label: d.toLocaleDateString('it-IT', { month: 'narrow' }), tip: d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }), sec };
    });
  } else {
    series = Array.from({ length: days }, (_, i) => {
      const d = addDays(today0, i - days + 1);
      return {
        label: days === 7 ? d.toLocaleDateString('it-IT', { weekday: 'short' }) : String(d.getDate()),
        tip: d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }),
        sec: byDay.get(dayKey(d)) ?? 0,
        parts: parts(dayKey(d)),
        goal: goalFor(settings, d),
      };
    });
    labelEvery = days === 7 ? 1 : days === 30 ? 3 : 10;
  }

  const hours = Array.from({ length: 24 }, (_, h) => ({ label: String(h), tip: `ore ${h}:00–${h + 1}:00`, sec: 0 }));
  for (const s of inRange) {
    // spread each session over the clock hours it covers
    let t = s.start;
    const end = s.start + s.dur * 1000;
    while (t < end) {
      const d = new Date(t);
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      const seg = Math.min(end, next) - t;
      hours[d.getHours()].sec += seg / 1000;
      t += seg;
    }
  }
  const wdNames = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const order = settings.weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const wd = order.map((i) => ({ label: wdNames[i], tip: `media del ${wdNames[i]}`, sec: 0, n: 0 }));
  for (let i = 0; i < days; i++) {
    const d = addDays(today0, -i);
    const idx = order.indexOf(d.getDay());
    wd[idx].sec += byDay.get(dayKey(d)) ?? 0;
    wd[idx].n++;
  }
  const wdAvg = wd.map((w) => ({ label: w.label, tip: w.tip, sec: w.n ? w.sec / w.n : 0 }));

  return (
    <>
      <PageHeader title="Statistiche" subtitle="Come stai andando nel periodo scelto.">
        <Seg<Range>
          label="Periodo"
          value={range}
          onChange={setRange}
          options={[
            { id: '7', label: '7 giorni' },
            { id: '30', label: '30 giorni' },
            { id: '90', label: '90 giorni' },
            { id: '365', label: '12 mesi' },
          ]}
        />
      </PageHeader>

      <div className="grid cols-4">
        <Metric color="var(--blue)" icon={<IconTimer size={13} />} label="Totale" value={fmtDur(total, true)} note={`${inRange.length} ${inRange.length === 1 ? 'sessione' : 'sessioni'}`} />
        <Metric color="var(--orange)" icon={<IconCalendar size={12} />} label="Media al giorno" value={fmtDur(total / days, true)} note={`${activeDays} giorni attivi su ${days}`} />
        <Metric
          color="var(--purple)"
          icon={<IconChart size={12} />}
          label="Concentrazione"
          value={rated.length ? `${fmtNum(focusAvg, 1)} / 5` : '–'}
          note={rated.length ? `${FOCUS_LEVELS[Math.round(focusAvg) - 1]} · ${rated.length} valutate` : 'valuta le sessioni a fine blocco'}
        />
        <Metric
          color="var(--green)"
          icon={<IconCheck size={13} />}
          label="Obiettivo raggiunto"
          value={`${goalDays} ${goalDays === 1 ? 'giorno' : 'giorni'}`}
          note={best ? `record ${fmtDur(best[1], true)} il ${new Date(best[0] + 'T00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}` : 'nessun record ancora'}
        />
      </div>

      <Section
        title={`Tempo di studio ${range === '365' ? 'per mese' : 'per giorno'}`}
        note={range === '365' ? undefined : 'colori = esami · trattino = obiettivo'}
        accessory={
          <Seg<'chart' | 'table'>
            size="sm"
            label="Visualizzazione"
            value={table ? 'table' : 'chart'}
            onChange={(v) => setTable(v === 'table')}
            options={[
              { id: 'chart', label: 'Grafico' },
              { id: 'table', label: 'Tabella' },
            ]}
          />
        }
      >
        <div className="card pad">
          {table ? (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{range === '365' ? 'Mese' : 'Giorno'}</th>
                    <th className="num">Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {[...series].reverse().map((r) => (
                    <tr key={r.tip}>
                      <td className="capitalize">{r.tip}</td>
                      <td className="num tnum">{r.sec ? fmtDur(r.sec) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Columns data={series} labelEvery={labelEvery} height={230} />
          )}
        </div>
      </Section>

      <div className="grid cols-2">
        <Section title="Per esame">
          <div className="card pad">
            <HBars rows={bySubject(inRange, subjects, from, to)} />
          </div>
        </Section>
        <Section title="Giorno della settimana" note="media">
          <div className="card pad">
            <Columns data={wdAvg} height={180} />
          </div>
        </Section>
      </div>
      <Section title="Ore del giorno" note="quando studi di più">
        <div className="card pad">
          <Columns data={hours} height={170} labelEvery={3} />
        </div>
      </Section>
      <Section title="Costanza" note="ultime 26 settimane">
        <div className="card pad">
          <Heatmap byDay={totalsByDay(sessions)} weeks={26} weekStart={settings.weekStart} />
        </div>
      </Section>
    </>
  );
}
