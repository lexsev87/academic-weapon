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
