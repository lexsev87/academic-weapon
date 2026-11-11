import { Empty } from '../../components/Charts';
import { Section } from '../../components/UI';
import { FOCUS_MIN_N, focusInsights, type FocusGroup } from '../../lib/insights';
import { addDays, startOfDay } from '../../lib/stats';
import type { UserData } from '../../lib/store';

const f = (v: number) => v.toFixed(1).replace('.', ',');

function Bars({ title, groups }: { title: string; groups: FocusGroup[] }) {
  return (
    <div className="card pad focus-group">
      <h3 className="card-title">{title}</h3>
      {groups.length === 0 ? (
        <p className="secondary">Ancora nessun dato.</p>
      ) : (
        groups.map((g) => (
          <div className="hbar" key={g.key} data-thin={g.n < FOCUS_MIN_N || undefined} title={`${g.n} ${g.n === 1 ? 'sessione valutata' : 'sessioni valutate'}`}>
            <span className="nm">
              {g.color && <span className="dot" style={{ background: g.color }} />}
              {g.label}
            </span>
            <span className="tr">
              <i style={{ width: `${(g.avg / 5) * 100}%`, background: g.color ?? 'var(--purple)' }} />
            </span>
            <span className="v tnum">
              {f(g.avg)} <small>· {g.n}</small>
            </span>
          </div>
        ))
      )}
    </div>
  );
}

/** What the 1–5 ratings say: best time of day, best activity, fatigue through the day, cost of pauses. */
export function FocusInsights({ data }: { data: UserData }) {
  const to = addDays(startOfDay(new Date()), 1).getTime();
  const r = focusInsights(data, to - 90 * 86400000, to);
  return (
    <Section title="Concentrazione" note={r.rated ? `${r.rated} sessioni valutate negli ultimi 90 giorni · media ${f(r.avg)} su 5` : 'ultimi 90 giorni'}>
      {r.rated < FOCUS_MIN_N ? (
        <div className="card">
          <Empty text="Valuta la concentrazione a fine blocco: dopo qualche sessione qui vedi quando e come studi meglio." />
        </div>
      ) : (
        <>
          <div className="card pad findings">
            {r.findings.length ? (
              <ul>
                {r.findings.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className="secondary">Per ora nessuna differenza netta tra orari, attività e blocchi: servono più sessioni valutate, o stai andando in modo uniforme.</p>
            )}
            {r.pausesPerBlock > 0 && (
              <p className="secondary tnum">
                In media {f(r.pausesPerBlock)} pause per blocco; {Math.round(r.pausedShare * 100)}% dei blocchi ne ha almeno una.
              </p>
            )}
          </div>
          <div className="grid cols-3">
            <Bars title="Momento della giornata" groups={r.byTime} />
            <Bars title="Attività" groups={r.byActivity} />
            <Bars title="Blocco del giorno" groups={r.byOrder} />
          </div>
        </>
      )}
    </Section>
  );
}
