import { useEffect, useRef, useState } from 'react';
import { IconCalendar, IconCap, IconChart, IconChat, IconHome, IconSettings, IconTimer } from '../../components/Icons';
import { ConfirmHost, Toaster } from '../../components/UI';
import { useFeedback } from '../../lib/feedback';
import { Link, navigate } from '../../lib/router';
import { useData, type UserData } from '../../lib/store';
import { fmtClock } from '../../lib/stats';
import { setTray } from '../../lib/native';
import { elapsed, PHASE_LABEL, targetMs, useFocusView, useNow, useTimerEngine } from '../../lib/timer';
import { useAutoBackup } from '../../lib/backup';
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

export const APP_NAME = 'Academic Weapon';

type PageProps = { data: UserData; name: string };
const NAV: { href: string; label: string; short?: string; icon: typeof IconHome; page: (p: PageProps) => JSX.Element; group: string; color: string }[] = [
  { href: '/', label: 'Oggi', icon: IconHome, page: Dashboard, group: 'Studio', color: '#007AFF' },
  { href: '/focus', label: 'Focus', icon: IconTimer, page: TimerPage, group: 'Studio', color: '#FF3B30' },
  { href: '/calendario', label: 'Calendario', icon: IconCalendar, page: CalendarPage, group: 'Studio', color: '#FF9500' },
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
  const feedback = useFeedback();
  const running = data.timer.running;
  const now = useNow(running);
  const name = data.settings.name.trim();
  const main = useRef<HTMLElement>(null);

  const [scrolled, setScrolled] = useState(false);

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

  // ⌘1…⌘6 jump between sections, like a native Mac app.
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

  let mini = null;
  let tray = '';
  if (data.timer.running || data.timer.elapsedMs > 0) {
    const t = targetMs(data.timer, data);
    const el = elapsed(data.timer, now);
    const sub = data.subjects.find((s) => s.id === data.timer.subjectId);
    const clock = fmtClock(t === null ? el : t - el);
    const isBreak = data.timer.mode === 'pomodoro' && data.timer.phase !== 'focus';
    tray = data.timer.running ? `${isBreak ? '☕︎' : '●'} ${clock}` : `❚❚ ${clock}`;
    mini = (
      <Link href="/focus" className="side-timer" data-state={isBreak ? 'break' : data.timer.running ? 'focus' : 'paused'}>
        <span className="side-timer-label">
          {data.timer.mode === 'pomodoro' ? PHASE_LABEL[data.timer.phase] : data.timer.mode === 'stopwatch' ? 'Cronometro' : 'Timer'}
          {data.timer.running ? '' : ' · in pausa'}
        </span>
        <span className="side-timer-clock tnum">{clock}</span>
        {sub && <span className="side-timer-sub">{sub.name}</span>}
      </Link>
    );
  }
  useEffect(() => setTray(tray), [tray]);

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
                <NavLink n={n} on={item === n} />
              </div>
            );
          })}
        </div>
        <div className="sidebar-foot">
          {mini}
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
        </div>
        <div className="page">
          <Page data={data} name={name || 'campione'} />
        </div>
      </main>
      {(focusView !== 'off' || data.timer.pending) && <FocusOverlay data={data} closing={focusView === 'closing'} />}
      {!data.settings.setupDone && <Setup data={data} />}
      <ConfirmHost />
      <Toaster />
    </div>
  );
}

function NavLink({ n, on }: { n: (typeof NAV)[number]; on: boolean }) {
  return (
    <Link href={n.href} className="nav-item" aria-current={on ? 'page' : undefined}>
      <span className="nav-icon" style={{ background: n.color }}>
        <n.icon size={13} />
      </span>
      <span className="nav-label">{n.label}</span>
      {n.short && <span className="nav-short">{n.short}</span>}
    </Link>
  );
}
