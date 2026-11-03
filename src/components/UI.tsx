import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { IconMinus, IconPlus, IconX } from './Icons';
import { semesterLabel, type UserData } from '../lib/store';
import { Link } from '../lib/router';

/* Motion timings shared with app.css (--d-*). Exits are faster than entrances. */
const EXIT_MS = 180;
const TOAST_MS = 2600;

/* ---------- toast: enters from the bottom, leaves the same way ---------- */
type ToastState = { id: number; msg: string; leaving: boolean } | null;
let current: ToastState = null;
let seq = 0;
const tl = new Set<() => void>();
const emitToast = () => tl.forEach((l) => l());
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let removeTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string) {
  clearTimeout(hideTimer);
  clearTimeout(removeTimer);
  current = { id: ++seq, msg, leaving: false };
  emitToast();
  const hide = () => {
    // Hold the toast while the window is hidden, so it is not missed.
    if (document.hidden) {
      hideTimer = setTimeout(hide, TOAST_MS);
      return;
    }
    if (current) current = { ...current, leaving: true };
    emitToast();
    removeTimer = setTimeout(() => {
      current = null;
      emitToast();
    }, EXIT_MS);
  };
  hideTimer = setTimeout(hide, TOAST_MS);
}
export function Toaster() {
  const t = useSyncExternalStore(
    (cb) => {
      tl.add(cb);
      return () => tl.delete(cb);
    },
    () => current,
  );
  if (!t) return null;
  return (
    <div className="toast" role="status" key={t.id} data-leaving={t.leaving || undefined}>
      {t.msg}
    </div>
  );
}

/* ---------- modal sheet ---------- */
/**
 * Centered sheet with a dimming scrim. Pointer-initiated closes animate out (faster than
 * the entrance); Escape closes instantly, since keyboard actions shouldn't animate.
 * Children may be a function that receives the animated `close`.
 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode | ((close: () => void) => ReactNode) }) {
  const [leaving, setLeaving] = useState(false);
  const closing = useRef(false);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setLeaving(true);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div className="modal-back" data-leaving={leaving || undefined} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal aria-label={title || undefined}>
        {title && (
          <header className="modal-head">
            <h2>{title}</h2>
            <button className="btn icon plain" onClick={close} aria-label="Chiudi">
              <IconX />
            </button>
          </header>
        )}
        {typeof children === 'function' ? children(close) : children}
      </div>
    </div>
  );
}

/* ---------- exam picker, grouped by period ---------- */
export function SubjectSelect({
  data,
  value,
  onChange,
  allowAll,
}: {
  data: UserData;
  /** '' = no exam, '__all' = every exam (filters only), otherwise a subject id */
  value: string;
  onChange: (v: string) => void;
  allowAll?: boolean;
}) {
  const visible = data.subjects.filter((s) => s.status !== 'passed' || s.id === value);
  const groups = [
    ...data.semesters.map((sem) => ({ id: sem.id, label: semesterLabel(sem), list: visible.filter((s) => s.semesterId === sem.id) })),
    { id: '__none', label: `Senza ${data.settings.periodLabel.toLowerCase()}`, list: visible.filter((s) => !s.semesterId || !data.semesters.some((x) => x.id === s.semesterId)) },
  ].filter((g) => g.list.length);
  return (
    <select className="in" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowAll && <option value="__all">Tutti gli esami</option>}
      <option value="">Senza esame</option>
      {groups.map((g) => (
        <optgroup key={g.id} label={g.label}>
          {g.list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/* ---------- segmented control: equal segments, a sliding thumb shows the selection ---------- */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  size,
  label,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'lg';
  label?: string;
}) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div className={`seg ${size ?? ''}`} role="radiogroup" aria-label={label} style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <span className="seg-thumb" aria-hidden style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${i * 100}%)` }} />
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- stepper row (− value +) ---------- */
export function Stepper({
  label,
  hint,
  unit,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v / step) * step));
  return (
    <div className="row-item">
      <span className="row-label">
        {label}
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <div className="stepper">
        <button type="button" disabled={disabled || value <= min} onClick={() => onChange(clamp(value - step))} aria-label={`Diminuisci ${label}`}>
          <IconMinus size={12} />
        </button>
        <input type="number" value={value} min={min} max={max} disabled={disabled} onChange={(e) => onChange(clamp(Number(e.target.value) || min))} aria-label={label} />
        <button type="button" disabled={disabled || value >= max} onClick={() => onChange(clamp(value + step))} aria-label={`Aumenta ${label}`}>
          <IconPlus size={12} />
        </button>
      </div>
      {unit && <span className="row-unit">{unit}</span>}
    </div>
  );
}

/* ---------- layout helpers ---------- */
/** Large page title, with the page's actions on the right. The compact title lives in the toolbar. */
export function PageHeader({ title, subtitle, eyebrow, children }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-title">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="large-title" data-large-title>
          {title}
        </h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

/** A titled section: header row (title, note, accessory) above a card or list. */
export function Section({ title, note, accessory, children, className }: { title?: ReactNode; note?: ReactNode; accessory?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`section ${className ?? ''}`}>
      {(title || accessory) && (
        <div className="section-head">
          {title && <h2 className="section-title">{title}</h2>}
          {note && <span className="section-note">{note}</span>}
          {accessory && <div className="section-accessory">{accessory}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Health-style metric: tinted label with icon, then a large value. */
export function Metric({
  color,
  icon,
  label,
  value,
  note,
  href,
  progress,
}: {
  color: string;
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  href?: string;
  progress?: number;
}) {
  const body = (
    <>
      <span className="metric-label" style={{ color }}>
        {icon}
        {label}
      </span>
      <span className="metric-value tnum">{value}</span>
      <span className="metric-note">{note}</span>
      {progress !== undefined && (
        <span className="progress">
          <i style={{ width: `${Math.min(1, progress) * 100}%`, background: color }} />
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className="card metric pressable">
      {body}
    </Link>
  ) : (
    <div className="card metric">{body}</div>
  );
}

/* ---------- confirmation alert (replaces window.confirm, which claude.ai doesn't show) ---------- */
type ConfirmRequest = { title: string; message?: string; confirmLabel: string; destructive?: boolean; resolve: (ok: boolean) => void };
let pendingConfirm: ConfirmRequest | null = null;
const cl = new Set<() => void>();
const emitConfirm = () => cl.forEach((l) => l());

/** macOS-style alert; resolves true when confirmed. Destructive alerts focus "Annulla" by default. */
export function confirmDialog(opts: { title: string; message?: string; confirmLabel: string; destructive?: boolean }): Promise<boolean> {
  pendingConfirm?.resolve(false);
  return new Promise((resolve) => {
    pendingConfirm = { ...opts, resolve };
    emitConfirm();
  });
}

export function ConfirmHost() {
  const req = useSyncExternalStore(
    (cb) => {
      cl.add(cb);
      return () => cl.delete(cb);
    },
    () => pendingConfirm,
  );
  if (!req) return null;
  const done = (ok: boolean) => {
    req.resolve(ok);
    if (pendingConfirm === req) pendingConfirm = null;
    emitConfirm();
  };
  return (
    <Modal key={req.title} title="" onClose={() => done(false)}>
      {(close) => (
        <div className="alert" role="alertdialog" aria-labelledby="alert-title">
          <h2 id="alert-title" className="alert-title">
            {req.title}
          </h2>
          {req.message && <p className="alert-message">{req.message}</p>}
          <div className="alert-buttons">
            <button className="btn" autoFocus={req.destructive} onClick={() => (close(), req.resolve(false))}>
              Annulla
            </button>
            <button className={`btn primary ${req.destructive ? 'destructive-fill' : ''}`} autoFocus={!req.destructive} onClick={() => (close(), req.resolve(true))}>
              {req.confirmLabel}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
