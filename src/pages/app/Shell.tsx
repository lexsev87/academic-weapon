import { useEffect, useRef, useState } from 'react';
import { IconCalendar, IconCap, IconChart, IconChat, IconHome, IconList, IconPause, IconPlay, IconPlus, IconSettings, IconTimer } from '../../components/Icons';
import { ConfirmHost, Toaster } from '../../components/UI';
import { Notices } from '../../components/Notices';
import { Celebration } from '../../components/Celebration';
import { IconFlame } from '../../components/Icons';
import { streak } from '../../lib/streak';
import { useFeedback } from '../../lib/feedback';
import { Link, navigate } from '../../lib/router';
import { NO_SUBJECT_COLOR, useData, type UserData } from '../../lib/store';
import { fmtClock } from '../../lib/stats';
import { setTray } from '../../lib/native';
import { elapsed, pause, PHASE_LABEL, start, targetMs, useFocusView, useNow, useTimerEngine } from '../../lib/timer';
import { SessionModal } from './Sessions';
import { SessionsPage } from './SessionsPage';
import { useAutoBackup } from '../../lib/backup';
import { useClaudeBridge } from '../../lib/claudeBridge';
import { isWeb } from '../../lib/platform';
import { Dashboard } from './Dashboard';
import { TimerPage } from './TimerPage';
import { CalendarPage } from './CalendarPage';
import { FocusOverlay } from './FocusOverlay';
import { ExamsPage } from './ExamsPage';
import { StatsPage } from './StatsPage';
import { SettingsPage } from './SettingsPage';
import { Setup } from './Setup';
import logoUrl from '../../assets/logo.png';

const APP_NAME = 'Academic Weapon';

type PageProps = { data: UserData; name: string };
const NAV: { href: string; label: string; short?: string; icon: typeof IconHome; page: (p: PageProps) => JSX.Element; group: string; color: string }[] = [
  { href: '/', label: 'Oggi', icon: IconHome, page: Dashboard, group: 'Studio', color: '#007AFF' },
  { href: '/focus', label: 'Focus', icon: IconTimer, page: TimerPage, group: 'Studio', color: '#FF3B30' },
  { href: '/sessioni', label: 'Sessioni', icon: IconList, page: SessionsPage, group: 'Studio', color: '#30B0C7' },
  { href: '/calendario', label: 'Calendario', short: 'Agenda', icon: IconCalendar, page: CalendarPage, group: 'Studio', color: '#FF9500' },
  { href: '/esami', label: 'Esami', icon: IconCap, page: ExamsPage, group: 'Percorso', color: '#34C759' },
  { href: '/statistiche', label: 'Statistiche', short: 'Stats', icon: IconChart, page: StatsPage, group: 'Percorso', color: '#AF52DE' },
  { href: '/impostazioni', label: 'Impostazioni', short: 'Opzioni', icon: IconSettings, page: SettingsPage, group: '', color: '#8E8E93' },
];

export function Shell({ path }: { path: string }) {
  const data = useData();
  useTimerEngine(data);
  const item = NAV.find((n) => n.href === (path === '/diario' ? '/calendario' : path)) ?? NAV[0];
  const focusView = useFocusView();
  useAutoBackup();
  useClaudeBridge(data);
  const feedback = useFeedback();
  const running = data.timer.running;
  const now = useNow(running);
  const name = data.settings.name.trim();
  const main = useRef<HTMLElement>(null);

  const [scrolled, setScrolled] = useState(false);
  const [newSession, setNewSession] = useState(false);

  // New page: back to the top. The large title scrolling under the toolbar reveals the
  // compact title and the toolbar material (state indication, so it fades; navigation itself is instant).
  useEffect(() => {
    const m = main.current;
    if (!m) return;
    m.scrollTo(0, 0);
    setScrolled(false);
    const title = m.querySelector('[data-large-title]');
    if (!title) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { root: m, rootMargin: '-52px 0px 0px 0px', threshold: 0 });
    io.observe(title);
    return () => io.disconnect();
  }, [item.href]);

  useEffect(() => {
    if (!running) document.title = `${item.label} · ${APP_NAME}`;
  }, [item.label, running]);

  // ⌘1…⌘7 jump between sections, like a native Mac app.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!e.metaKey || e.altKey || e.ctrlKey) return;
      const n = NAV[Number(e.key) - 1];
      if (n) {
        e.preventDefault();
        navigate(n.href);
      }
      if (e.key === ',') {
        e.preventDefault();
        navigate('/impostazioni');
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  let timerPill = null;
  let tray = '';
  if (data.timer.running || data.timer.elapsedMs > 0) {
    const t = targetMs(data.timer, data);
    const el = elapsed(data.timer, now);
    const sub = data.subjects.find((s) => s.id === data.timer.subjectId);
    const clock = fmtClock(t === null ? el : t - el);
    const isBreak = data.timer.mode === 'pomodoro' && data.timer.phase !== 'focus';
    const label = isBreak ? PHASE_LABEL[data.timer.phase] : (sub?.name ?? (data.timer.mode === 'stopwatch' ? 'Cronometro' : 'Concentrazione'));
    tray = data.timer.running ? `${isBreak ? '☕︎' : '●'} ${clock}` : `❚❚ ${clock}`;
    timerPill = (
      <div className="timer-pill" data-state={isBreak ? 'break' : data.timer.running ? 'focus' : 'paused'}>
        <button className="timer-pill-toggle" onClick={() => (data.timer.running ? pause() : start())} aria-label={data.timer.running ? 'Pausa' : 'Riprendi'}>
          {data.timer.running ? <IconPause size={11} /> : <IconPlay size={11} />}
        </button>
        <Link href="/focus" className="timer-pill-body" title="Apri Focus">
          <span className="dot" style={{ background: isBreak ? 'var(--green)' : (sub?.color ?? NO_SUBJECT_COLOR) }} />
          <span className="timer-pill-label">{label}</span>
          <span className="timer-pill-clock tnum">{clock}</span>
        </Link>
      </div>
    );
  }
  useEffect(() => setTray(tray), [tray]);

  const st = streak(data.sessions, data.settings, new Date(now));
  const flame = st.current ? (
    <span className="nav-badge tnum" data-on={st.today || undefined} title={`${st.current} giorni di fila`}>
      <IconFlame size={11} filled={st.today} />
      {st.current}
    </span>
  ) : undefined;
  const Page = item.page;
  let group = '';
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Sezioni">
        <div className="sidebar-titlebar" />
        <Link href="/" className="brand">
          <img src={logoUrl} alt="" width={30} height={30} />
          <span className="brand-name">Academic Weapon</span>
          {isWeb && <span className="beta-badge">Beta</span>}
        </Link>
        <div className="sidebar-list">
          {NAV.filter((n) => n.group).map((n) => {
            const head = n.group !== group ? n.group : null;
            group = n.group;
            return (
              <div key={n.href}>
                {head && <div className="sidebar-group">{head}</div>}
                <NavLink n={n} on={item === n} badge={n.href === '/' ? flame : undefined} />
              </div>
            );
          })}
        </div>
        <div className="sidebar-foot">
          {feedback.available && (
            <button className="nav-item feedback-item" onClick={() => feedback.open(main.current?.querySelector('.page-head') ?? main.current)}>
              <span className="nav-icon" style={{ background: '#5856D6' }}>
                <IconChat size={13} />
              </span>
              Invia feedback
            </button>
          )}
          {NAV.filter((n) => !n.group).map((n) => (
            <NavLink key={n.href} n={n} on={item === n} />
          ))}
        </div>
      </nav>
      <main className="content" ref={main}>
        <div className="toolbar" data-scrolled={scrolled || undefined}>
          <span className="toolbar-title">{item.label}</span>
          <div className="toolbar-actions">
            {timerPill}
            <button className="btn primary toolbar-add" onClick={() => setNewSession(true)} title="Registra una sessione già fatta">
              <IconPlus size={12} /> Sessione
            </button>
          </div>
        </div>
        <div className="page">
          {data.settings.setupDone && <Notices data={data} />}
          <Page data={data} name={name || 'campione'} />
        </div>
      </main>
      {(focusView !== 'off' || data.timer.pending) && <FocusOverlay data={data} closing={focusView === 'closing'} />}
      {!data.settings.setupDone && <Setup data={data} />}
      {data.settings.setupDone && !data.timer.pending && focusView === 'off' && <Celebration data={data} />}
      {newSession && <SessionModal data={data} session={null} onClose={() => setNewSession(false)} />}
      <ConfirmHost />
      <Toaster />
    </div>
  );
}

function NavLink({ n, on, badge }: { n: (typeof NAV)[number]; on: boolean; badge?: JSX.Element }) {
  return (
    <Link href={n.href} className="nav-item" aria-current={on ? 'page' : undefined}>
      <span className="nav-icon" style={{ background: n.color }}>
        <n.icon size={13} />
      </span>
      <span className="nav-label">{n.label}</span>
      {n.short && <span className="nav-short">{n.short}</span>}
      {badge}
    </Link>
  );
}
