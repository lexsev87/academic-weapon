import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || fallback);
    const ro = new ResizeObserver(() => setW(el.clientWidth || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w] as const;
}
import { fmtDur } from '../lib/stats';

export interface ColumnDatum {
  label: string;
  tip: string;
  sec: number;
  parts?: { color: string; sec: number }[]; // stacked by exam (bottom → top)
  goal?: number; // per-bar goal in seconds, drawn as a short dash
}

/* Column chart (study time per day/month): optionally stacked by exam colour, with goal marks and a hover tooltip. */
export function Columns({ data, goalSec, height = 200, labelEvery = 1 }: { data: ColumnDatum[]; goalSec?: number; height?: number; labelEvery?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth<HTMLDivElement>(600);
  const uid = useRef(Math.random().toString(36).slice(2, 7)).current;
  const H = height;
  const padL = 34;
  const padB = 22;
  const padT = 8;
  const maxV = Math.max(goalSec ?? 0, ...data.map((d) => Math.max(d.sec, d.goal ?? 0)), 3600);
  const stepH = maxV <= 4 * 3600 ? 3600 : maxV <= 10 * 3600 ? 2 * 3600 : maxV <= 40 * 3600 ? 10 * 3600 : 50 * 3600;
  const top = Math.ceil(maxV / stepH) * stepH;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const n = data.length;
  const slot = (W - padL) / n;
  const bw = Math.max(2, Math.min(34, slot - Math.max(2, slot * 0.3)));
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += stepH) ticks.push(v);

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ height: H }} role="img" aria-label="Tempo di studio">
        <g className="axis">
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid-l" x1={padL} x2={W} y1={y(t)} y2={y(t)} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end">
                {t / 3600}h
              </text>
            </g>
          ))}
        </g>
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - bw) / 2;
          const h = Math.max(0, y(0) - y(d.sec));
          const r = Math.min(5, bw / 2, h);
          const shape = `M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + bw - r} Q${x + bw},${y(0) - h} ${x + bw},${y(0) - h + r} V${y(0)} Z`;
          let acc = 0;
          return (
            <g key={i} opacity={hover === null || hover === i ? 1 : 0.5}>
              {h > 0 &&
                (d.parts?.length ? (
                  <>
                    <clipPath id={`c${uid}${i}`}>
                      <path d={shape} />
                    </clipPath>
                    <g clipPath={`url(#c${uid}${i})`}>
                      {d.parts.map((p, k) => {
                        const y1 = y(acc);
                        acc += p.sec;
                        return <rect key={k} x={x} y={y(acc)} width={bw} height={Math.max(0, y1 - y(acc))} fill={p.color} />;
                      })}
                    </g>
                  </>
                ) : (
                  <path d={shape} fill="var(--accent)" />
                ))}
              {d.goal ? <line className="goal-mark" x1={x - 3} x2={x + bw + 3} y1={y(d.goal)} y2={y(d.goal)} /> : null}
              <rect x={padL + i * slot} y={0} width={slot} height={H - padB} fill="transparent" onMouseEnter={() => setHover(i)} />
              {i % labelEvery === 0 && (
                <text className="axis" x={x + bw / 2} y={H - 6} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--muted)' }}>
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        {goalSec ? <line className="goal-l" x1={padL} x2={W} y1={y(goalSec)} y2={y(goalSec)} /> : null}
      </svg>
      {hover !== null && ref.current && (
        <div className="tip" style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%`, top: y(data[hover].sec) }}>
          <b>{fmtDur(data[hover].sec)}</b>
          {data[hover].goal ? ` di ${fmtDur(data[hover].goal!)}` : ''} · {data[hover].tip}
        </div>
      )}
    </div>
  );
}

/** Mini activity ring (Apple Fitness style). */
export function MiniRing({ pct, color, size = 34, stroke = 5 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={stroke} />
      {p > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} />}
    </svg>
  );
}

/* Horizontal bars, one per subject, each labelled with name and value (no legend needed). */
export function HBars({ rows }: { rows: { id: string | null; name: string; color: string; sec: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.sec));
  if (!rows.length) return <Empty text="Nessun dato in questo periodo" />;
  return (
    <div>
      {rows.map((r) => (
        <div className="hbar" key={String(r.id)} title={`${r.name}: ${fmtDur(r.sec)}`}>
          <span className="nm">
            <span className="dot" style={{ background: r.color }} />
            {r.name}
          </span>
          <span className="tr">
            <i style={{ width: `${(r.sec / max) * 100}%`, background: r.color }} />
          </span>
          <span className="v">{fmtDur(r.sec)}</span>
        </div>
      ))}
    </div>
  );
}

/* Calendar heatmap, sequential single hue (light → dark = less → more). */
export function Heatmap({ byDay, weeks = 20, weekStart }: { byDay: Map<string, number>; weeks?: number; weekStart: 0 | 1 }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const heat = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (heat.current) heat.current.scrollLeft = heat.current.scrollWidth;
  }, []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const offset = (today.getDay() - weekStart + 7) % 7;
  const start = new Date(today);
  start.setDate(start.getDate() - offset - (weeks - 1) * 7);
  const cells: { key: string; sec: number; date: Date; future: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    cells.push({ key, sec: byDay.get(key) ?? 0, date: d, future: d > today });
  }
  const level = (s: number) => (s <= 0 ? 0 : s < 1800 ? 1 : s < 3600 ? 2 : s < 7200 ? 3 : s < 4 * 3600 ? 4 : 5);
  const days = weekStart === 1 ? ['L', '', 'M', '', 'V', '', 'D'] : ['D', '', 'M', '', 'G', '', 'S'];
  return (
    <div ref={box} style={{ position: 'relative' }} onMouseLeave={() => setTip(null)}>
      <div className="heat-wrap">
        <div className="heat-days">
          {days.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="heat" ref={heat}>
          {cells.map((c) => (
            <i
              key={c.key}
              style={{ background: c.future ? 'transparent' : `var(--seq-${level(c.sec)})` }}
              onMouseEnter={(e) => {
                const r = (e.target as HTMLElement).getBoundingClientRect();
                const p = box.current!.getBoundingClientRect();
                setTip({
                  x: r.left - p.left + 6,
                  y: r.top - p.top,
                  text: `${c.date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}: ${c.sec ? fmtDur(c.sec) : 'nessuno studio'}`,
                });
              }}
            />
          ))}
        </div>
      </div>
      <div className="legend" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
        <span>meno</span>
        {[0, 1, 2, 3, 4, 5].map((l) => (
          <i key={l} style={{ width: 11, height: 11, borderRadius: 3, background: `var(--seq-${l})`, display: 'inline-block' }} />
        ))}
        <span>più</span>
      </div>
      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

export function Ring({ pct, size = 120, stroke = 12, color = 'var(--accent)', track = 'var(--track)', children }: { pct: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {p > 0 && <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
          className="ring-progress"
        />}
      </svg>
      <div className="center">{children}</div>
    </div>
  );
}

export function Empty({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {text}
      {children && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}

/* Cumulative trend: studied minus goal, day by day. Above zero = ahead of plan, below = behind. */
export function TrendChart({ series, height = 180 }: { series: { date: Date; studied: number; goal: number; delta: number }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth<HTMLDivElement>(600);
  const uid = useRef(Math.random().toString(36).slice(2, 7)).current;
  if (series.length < 2) return <Empty text="Servono almeno due giorni di dati" />;
  const H = height;
  const padL = 40;
  const padB = 22;
  const padT = 10;
  const lo = Math.min(0, ...series.map((p) => p.delta));
  const hi = Math.max(0, ...series.map((p) => p.delta));
  const span = Math.max(3600, hi - lo);
  const stepH = span <= 6 * 3600 ? 3600 : span <= 30 * 3600 ? 5 * 3600 : span <= 100 * 3600 ? 20 * 3600 : 50 * 3600;
  const top = Math.ceil(hi / stepH) * stepH || stepH;
  const bot = Math.floor(lo / stepH) * stepH;
  const y = (v: number) => padT + (H - padT - padB) * ((top - v) / (top - bot));
  const x = (i: number) => padL + ((W - padL - 4) * i) / (series.length - 1);
  const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.delta).toFixed(1)}`).join(' ');
  const area = `${line} L${x(series.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks: number[] = [];
  for (let v = bot; v <= top; v += stepH) ticks.push(v);
  const labelEvery = Math.max(1, Math.ceil(series.length / Math.max(3, Math.min(8, Math.floor(W / 80)))));
  const last = series[series.length - 1];
  const h = hover === null ? null : series[hover];

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ height: H }}
        role="img"
        aria-label={`Andamento: ${last.delta >= 0 ? 'in vantaggio' : 'in ritardo'} di ${fmtDur(Math.abs(last.delta))}`}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          setHover(Math.max(0, Math.min(series.length - 1, Math.round(((px - padL) / (W - padL - 4)) * (series.length - 1)))));
        }}
      >
        <defs>
          <clipPath id={`up${uid}`}>
            <rect x={0} y={0} width={W} height={y(0)} />
          </clipPath>
          <clipPath id={`dn${uid}`}>
            <rect x={0} y={y(0)} width={W} height={H} />
          </clipPath>
        </defs>
        <g className="axis">
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid-l" x1={padL} x2={W} y1={y(t)} y2={y(t)} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end">
                {t > 0 ? '+' : ''}
                {Math.round(t / 3600)}h
              </text>
            </g>
          ))}
        </g>
        <path d={area} fill="var(--green)" fillOpacity={0.16} clipPath={`url(#up${uid})`} />
        <path d={area} fill="var(--orange)" fillOpacity={0.16} clipPath={`url(#dn${uid})`} />
        <line x1={padL} x2={W} y1={y(0)} y2={y(0)} stroke="var(--label-3)" strokeWidth={1} />
        <path d={line} fill="none" stroke="var(--green)" strokeWidth={2} strokeLinejoin="round" clipPath={`url(#up${uid})`} />
        <path d={line} fill="none" stroke="var(--orange)" strokeWidth={2} strokeLinejoin="round" clipPath={`url(#dn${uid})`} />
        {series.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--muted)' }}>
              {p.date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
            </text>
          ) : null,
        )}
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="var(--separator-strong)" />
            <circle cx={x(hover)} cy={y(h.delta)} r={4} fill={h.delta >= 0 ? 'var(--green)' : 'var(--orange)'} stroke="var(--bg)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%`, top: y(h.delta) }}>
          <b>
            {h.delta >= 0 ? '+' : '−'}
            {fmtDur(Math.abs(h.delta))}
          </b>{' '}
          · {fmtDur(h.studied)} di {fmtDur(h.goal)} · {h.date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
        </div>
      )}
    </div>
  );
}

/* Donut with the total in the middle; segments in the rows' own colours. */
export function Donut({ rows, size = 150, stroke = 22, label }: { rows: { id: string | null; name: string; color: string; sec: number }[]; size?: number; stroke?: number; label?: string }) {
  const total = rows.reduce((a, r) => a + r.sec, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = rows.length > 1 ? 2 : 0;
  let acc = 0;
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} role="img" aria-label={rows.map((x) => `${x.name} ${fmtDur(x.sec)}`).join(', ')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {total > 0 &&
          rows.map((x) => {
            const len = (x.sec / total) * c;
            const el = (
              <circle key={String(x.id)} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={x.color} strokeWidth={stroke} strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-acc}>
                <title>{`${x.name}: ${fmtDur(x.sec)}`}</title>
              </circle>
            );
            acc += len;
            return el;
          })}
      </svg>
      <div className="center">
        <span className="donut-value tnum">{fmtDur(total, true)}</span>
        {label && <span className="donut-label">{label}</span>}
      </div>
    </div>
  );
}

/* Paired horizontal bars: goal (track) vs studied (fill), one row each. */
export function GoalBars({ rows }: { rows: { id: string; name: string; color: string; sec: number; goal: number }[] }) {
  if (!rows.length) return <Empty text="Nessun esame con un obiettivo di ore" />;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.sec, r.goal)));
  return (
    <div>
      {rows.map((r) => (
        <div className="hbar goal-bar" key={r.id} title={`${r.name}: ${fmtDur(r.sec)} di ${fmtDur(r.goal)}`}>
          <span className="nm">
            <span className="dot" style={{ background: r.color }} />
            {r.name}
          </span>
          <span className="tr">
            <b style={{ width: `${(r.goal / max) * 100}%`, borderColor: r.color }} />
            <i style={{ width: `${(r.sec / max) * 100}%`, background: r.color }} />
          </span>
          <span className="v tnum">{r.goal ? `${Math.round((r.sec / r.goal) * 100)}%` : fmtDur(r.sec)}</span>
        </div>
      ))}
    </div>
  );
}
