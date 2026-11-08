import { useState } from 'react';
import { IconCalendar, IconCap, IconCheck, IconChevron, IconEdit, IconPlus, IconTimer, IconTrash } from '../../components/Icons';
import { GoalBars } from '../../components/Charts';
import { confirmDialog, Metric, Modal, PageHeader, Section, Seg, toast } from '../../components/UI';
import {
  academicYearOf,
  deleteSemester,
  deleteSubject,
  newSubject,
  saveSemester,
  saveSubject,
  scaleOf,
  semesterLabel,
  SUBJECT_COLORS,
  uid,
  type CourseStatus,
  type Semester,
  type Settings,
  type Subject,
  type UserData,
} from '../../lib/store';
import { ExamDetail } from './ExamDetail';
import { career, daysUntil, fmtAvg, fmtDate, fmtGrade, fmtHours, fmtNum, pacePerDay, parseDayKey, totalsBySubject } from '../../lib/stats';

type Filter = 'all' | 'todo' | 'passed';
const STATUS: Record<CourseStatus, string> = { planned: 'Da iniziare', studying: 'In preparazione', passed: 'Superato' };
const ITALIAN_PERIODS = ['semestre', 'trimestre', 'quadrimestre', 'modulo', 'blocco', 'anno', 'periodo'];

/** "1° semestre" for Italian labels, "Term 1" otherwise. */
const periodName = (label: string, n: number) => (ITALIAN_PERIODS.includes(label.toLowerCase()) ? `${n}° ${label.toLowerCase()}` : `${label} ${n}`);

// Periods with dates come in date order; the rest keep the order they were created in.
const semOrder = (list: Semester[]) =>
  list
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.start && b.s.start ? a.s.start.localeCompare(b.s.start) : a.i - b.i))
    .map((x) => x.s);

export function ExamsPage({ data }: { data: UserData; name: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [editExam, setEditExam] = useState<Subject | null>(null);
  const [editSem, setEditSem] = useState<Semester | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { settings, subjects } = data;
  const cr = settings.creditLabel;
  const scale = settings.gradeScale;
  const c = career(subjects, settings);
  const hours = totalsBySubject(data.sessions);
  const semesters = semOrder(data.semesters);
  const period = settings.periodLabel.toLowerCase();
  const totalStudied = data.sessions.reduce((a, s) => a + s.dur, 0);

  const show = (s: Subject) => filter === 'all' || (filter === 'passed' ? s.status === 'passed' : s.status !== 'passed');
  const groups = [
    ...semesters.map((sem) => ({ sem, list: subjects.filter((s) => s.semesterId === sem.id) })),
    { sem: null, list: subjects.filter((s) => !s.semesterId || !data.semesters.some((x) => x.id === s.semesterId)) },
  ];

  const nextSemester = (): Semester => ({
    id: uid(),
    name: periodName(settings.periodLabel, data.semesters.length + 1),
    academicYear: semesters[semesters.length - 1]?.academicYear ?? academicYearOf(),
    start: '',
    end: '',
  });
  const addExam = (semesterId: string | null) =>
    setEditExam(newSubject({ semesterId, graded: scale !== 'none', color: SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length] }));

  const sub = [settings.programType, settings.degree, cr && settings.degreeCfu ? `${settings.degreeCfu} ${cr}` : ''].filter(Boolean).join(' · ');

  const upcoming = subjects.filter((s) => s.status !== 'passed' && (daysUntil(s.examDate) ?? -1) >= 0).length;

  const modals = (
    <>
      {editExam && <ExamModal data={data} exam={editExam} isNew={!subjects.some((s) => s.id === editExam.id)} onClose={() => setEditExam(null)} />}
      {editSem && (
        <SemesterModal sem={editSem} label={settings.periodLabel} isNew={!data.semesters.some((s) => s.id === editSem.id)} onClose={() => setEditSem(null)} />
      )}
    </>
  );

  const detail = subjects.find((s) => s.id === detailId);
  if (detail)
    return (
      <>
        <ExamDetail data={data} s={detail} onBack={() => setDetailId(null)} onEdit={() => setEditExam(detail)} />
        {modals}
      </>
    );

  const goalRows = subjects
    .filter((s) => s.status !== 'passed' && s.targetHours > 0)
    .map((s) => ({ id: s.id, name: s.name, color: s.color, sec: hours.get(s.id) ?? 0, goal: s.targetHours * 3600 }));

  return (
    <>
      <PageHeader title="Esami" subtitle={sub || 'Il tuo percorso'}>
        <button className="btn" onClick={() => setEditSem(nextSemester())}>
          <IconCalendar size={12} /> Nuovo {period}
        </button>
        <button className="btn primary" onClick={() => addExam(semesters[semesters.length - 1]?.id ?? null)}>
          <IconPlus size={12} /> Nuovo esame
        </button>
      </PageHeader>

      <div className="grid cols-4">
        {scale !== 'none' && (
          <Metric
            color="var(--green)"
            icon={<IconCap size={13} />}
            label={cr ? 'Media ponderata' : 'Media'}
            value={fmtAvg(cr ? c.weighted : c.avg)}
            note={cr ? `aritmetica ${fmtAvg(c.avg)}` : `su ${scaleOf(scale).max}`}
          />
        )}
        {scale === '30' ? (
          <Metric
            color="var(--purple)"
            icon={<IconCap size={13} />}
            label="Base di laurea"
            value={c.base110 === null ? '–' : fmtAvg(c.base110, 1)}
            note="su 110 · media × 110 / 30"
          />
        ) : (
          <Metric color="var(--orange)" icon={<IconTimer size={13} />} label="Ore di studio" value={fmtHours(totalStudied)} note="in totale" />
        )}
        <Metric
          color="var(--blue)"
          icon={<IconCheck size={13} />}
          label="Esami superati"
          value={`${c.passed} di ${subjects.length}`}
          note={c.laudes ? `${c.laudes} con lode` : 'nel piano di studi'}
        />
        {cr ? (
          <Metric
            color="var(--pink)"
            icon={<IconCap size={13} />}
            label={`${cr} conseguiti`}
            value={settings.degreeCfu > 0 ? `${c.cfuDone} di ${settings.degreeCfu}` : String(c.cfuDone)}
            note={settings.degreeCfu > 0 ? `${Math.round(c.cfuPct * 100)}% del percorso` : 'nessun totale impostato'}
            progress={settings.degreeCfu > 0 ? c.cfuPct : undefined}
          />
        ) : (
          <Metric color="var(--pink)" icon={<IconCalendar size={12} />} label="Appelli in programma" value={String(upcoming)} note="con una data fissata" />
        )}
      </div>

      {data.semesters.length === 0 && subjects.length === 0 ? (
        <div className="card empty-hero">
          <span className="empty-icon">
            <IconCalendar size={28} />
          </span>
          <h2>Crea il tuo primo {period}</h2>
          <p>Poi aggiungi gli esami{cr ? ` con ${cr}` : ''}, docente e date d’appello. Timer e statistiche si organizzano da soli.</p>
          <button className="btn primary" onClick={() => setEditSem(nextSemester())}>
            <IconPlus size={12} /> Crea {period}
          </button>
        </div>
      ) : (
        <>
          <div className="filter-row">
            <Seg<Filter>
              label="Filtro"
              value={filter}
              onChange={setFilter}
              options={[
                { id: 'all', label: 'Tutti' },
                { id: 'todo', label: 'Da sostenere' },
                { id: 'passed', label: 'Superati' },
              ]}
            />
          </div>
          {goalRows.length > 0 && filter !== 'passed' && (
            <Section title="Obiettivo e studiato" note="tratteggio = ore previste">
              <div className="card pad">
                <GoalBars rows={goalRows} />
              </div>
            </Section>
          )}
          {groups.map(({ sem, list }) => {
            if (!sem && list.length === 0) return null;
            const shown = list.filter(show);
            const sc = career(list, settings);
            const credits = list.reduce((a, s) => a + s.cfu, 0);
            const avg = cr ? sc.weighted : sc.avg;
            const meta = [
              sem?.academicYear,
              sem?.start && sem?.end
                ? `${fmtDate(parseDayKey(sem.start), { day: 'numeric', month: 'short' })} – ${fmtDate(parseDayKey(sem.end), { day: 'numeric', month: 'short', year: 'numeric' })}`
                : '',
              cr ? `${credits} ${cr}` : `${list.length} ${list.length === 1 ? 'esame' : 'esami'}`,
              avg !== null ? `media ${fmtAvg(avg)}` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Section
                key={sem?.id ?? 'none'}
                title={sem ? semesterLabel(sem) : `Senza ${period}`}
                note={meta}
                accessory={
                  sem && (
                    <button className="btn icon plain" aria-label={`Modifica ${period}`} title={`Modifica ${period}`} onClick={() => setEditSem(sem)}>
                      <IconEdit />
                    </button>
                  )
                }
              >
                <div className="card list">
                  {shown.map((s) => (
                    <ExamRow key={s.id} s={s} settings={settings} sec={hours.get(s.id) ?? 0} onClick={() => setDetailId(s.id)} />
                  ))}
                  {shown.length === 0 && <p className="list-empty">{list.length ? 'Nessun esame con questo filtro' : `Nessun esame in questo ${period}`}</p>}
                  {sem && (
                    <button className="list-add" onClick={() => addExam(sem.id)}>
                      <IconPlus size={12} /> Aggiungi esame
                    </button>
                  )}
                </div>
              </Section>
            );
          })}
        </>
      )}

      {modals}
    </>
  );
}

function ExamRow({ s, settings, sec, onClick }: { s: Subject; settings: Settings; sec: number; onClick: () => void }) {
  const days = daysUntil(s.examDate);
  const open = s.status !== 'passed';
  const pct = s.targetHours && open ? Math.min(1, sec / (s.targetHours * 3600)) : null;
  const pace = pacePerDay(s, sec);
  const meta = [
    settings.creditLabel ? `${s.cfu} ${settings.creditLabel}` : '',
    s.professor,
    open ? STATUS[s.status] : '',
    sec > 0 ? `${fmtHours(sec)} di studio${pct !== null ? ` su ${s.targetHours} h` : ''}` : '',
  ].filter(Boolean);
  return (
    <button className="list-row pressable" onClick={onClick}>
      <span className="dot lg" style={{ background: s.color }} />
      <div className="list-text">
        <span className="list-title">{s.name}</span>
        <span className="list-sub">{meta.join(' · ')}</span>
        {pct !== null && (
          <span className="progress" aria-label={`${Math.round(pct * 100)}% delle ore previste`}>
            <i style={{ width: `${pct * 100}%`, background: s.color }} />
          </span>
        )}
      </div>
      {pace !== null && (
        <span className="pace" title="Ore al giorno necessarie per arrivare all’appello con le ore previste">
          {pace === 0 ? 'Ore raggiunte' : `≈ ${fmtNum(pace / 3600, 1)} h al giorno`}
        </span>
      )}
      {!open ? (
        <span className="grade" data-laude={(s.laude && settings.gradeScale === '30') || undefined}>
          {fmtGrade(s, settings.gradeScale)}
        </span>
      ) : days !== null && days >= 0 ? (
        <span className="badge" data-tone={days <= 7 ? 'warn' : undefined}>
          {days === 0 ? 'Oggi' : days === 1 ? 'Domani' : `tra ${days} gg`}
        </span>
      ) : null}
      <IconChevron className="chevron" />
    </button>
  );
}

function ExamModal({ data, exam, isNew, onClose }: { data: UserData; exam: Subject; isNew: boolean; onClose: () => void }) {
  const [s, setS] = useState(exam);
  const set = (p: Partial<Subject>) => setS((x) => ({ ...x, ...p }));
  const { creditLabel: cr, gradeScale, periodLabel } = data.settings;
  const scale = scaleOf(gradeScale);
  const semesters = semOrder(data.semesters);
  const withGrade = gradeScale !== 'none' && s.graded;
  const submit = (close: () => void) => {
    if (!s.name.trim()) return toast('Dai un nome all’esame');
    if (s.status === 'passed' && withGrade && s.grade === null) return toast('Inserisci il voto');
    saveSubject({ ...s, name: s.name.trim(), professor: s.professor.trim(), laude: gradeScale === '30' && s.grade === 30 && s.laude });
    toast(isNew ? 'Esame aggiunto' : 'Esame aggiornato');
    close();
  };
  return (
    <Modal title={isNew ? 'Nuovo esame' : s.name || 'Esame'} onClose={onClose}>
      {(close) => (
        <>
          <div className="form-grid">
            <div className="field full">
              <span className="field-label">Nome dell’esame</span>
              <input className="in" value={s.name} autoFocus={isNew} placeholder="Es. Econometria" onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className={`field ${cr ? '' : 'full'}`}>
              <span className="field-label">{periodLabel}</span>
              <select className="in" value={s.semesterId ?? ''} onChange={(e) => set({ semesterId: e.target.value || null })}>
                <option value="">Nessuno</option>
                {semesters.map((x) => (
                  <option key={x.id} value={x.id}>
                    {semesterLabel(x)}
                    {x.academicYear ? ` (${x.academicYear})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {cr && (
              <div className="field">
                <span className="field-label">{cr}</span>
                <input
                  className="in"
                  type="number"
                  min={0}
                  max={60}
                  step={0.5}
                  value={s.cfu}
                  onChange={(e) => set({ cfu: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })}
                />
              </div>
            )}
            <div className="field full">
              <span className="field-label">Docente</span>
              <input className="in" value={s.professor} placeholder="Facoltativo" onChange={(e) => set({ professor: e.target.value })} />
            </div>
            <div className="field full">
              <span className="field-label">Colore</span>
              <div className="swatches">
                {SUBJECT_COLORS.map((c) => (
                  <button key={c} aria-label={c} aria-pressed={s.color === c} style={{ background: c }} onClick={() => set({ color: c })} />
                ))}
              </div>
            </div>
            {gradeScale !== 'none' && (
              <div className="field">
                <span className="field-label">Valutazione</span>
                <Seg<'g' | 'i'>
                  value={s.graded ? 'g' : 'i'}
                  onChange={(v) => set({ graded: v === 'g' })}
                  options={[
                    { id: 'g', label: 'Con voto' },
                    { id: 'i', label: 'Idoneità' },
                  ]}
                />
              </div>
            )}
            <div className={`field ${gradeScale === 'none' ? 'full' : ''}`}>
              <span className="field-label">Stato</span>
              <Seg<CourseStatus>
                value={s.status}
                onChange={(v) => set({ status: v, passedDate: v === 'passed' && !s.passedDate ? new Date().toISOString().slice(0, 10) : s.passedDate })}
                options={[
                  { id: 'planned', label: 'Da iniziare' },
                  { id: 'studying', label: 'In corso' },
                  { id: 'passed', label: 'Superato' },
                ]}
              />
            </div>

            {s.status === 'passed' ? (
              <>
                {withGrade && (
                  <div className="field">
                    <span className="field-label">Voto</span>
                    {gradeScale === '30' ? (
                      <div className="inline">
                        <select className="in" value={s.grade ?? ''} onChange={(e) => set({ grade: Number(e.target.value) || null })}>
                          <option value="">–</option>
                          {Array.from({ length: 13 }, (_, i) => 30 - i).map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                        <label className="check">
                          <input
                            type="checkbox"
                            role="switch"
                            className="switch"
                            disabled={s.grade !== 30}
                            checked={s.grade === 30 && s.laude}
                            onChange={(e) => set({ laude: e.target.checked })}
                          />
                          Lode
                        </label>
                      </div>
                    ) : (
                      <div className="inline">
                        <input
                          className="in"
                          type="number"
                          min={scale.min}
                          max={scale.max}
                          step={scale.step}
                          value={s.grade ?? ''}
                          placeholder={`${scale.min}–${scale.max}`}
                          onChange={(e) => set({ grade: e.target.value === '' ? null : Math.max(scale.min, Math.min(scale.max, Number(e.target.value))) })}
                        />
                        <span className="text-3">/ {scale.max}</span>
                      </div>
                    )}
                  </div>
                )}
                <div className={`field ${withGrade ? '' : 'full'}`}>
                  <span className="field-label">Data</span>
                  <input className="in" type="date" value={s.passedDate} onChange={(e) => set({ passedDate: e.target.value })} />
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <span className="field-label">Prossimo appello</span>
                  <input className="in" type="date" value={s.examDate} onChange={(e) => set({ examDate: e.target.value })} />
                </div>
                <div className="field">
                  <span className="field-label">Ore di studio previste</span>
                  <div className="inline">
                    <input
                      className="in"
                      type="number"
                      min={0}
                      max={999}
                      value={s.targetHours || ''}
                      placeholder="–"
                      onChange={(e) => set({ targetHours: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                    />
                    {cr && s.cfu > 0 && (
                      <button
                        className="btn"
                        type="button"
                        title={`1 ${cr} ≈ 25 ore di impegno complessivo`}
                        onClick={() => set({ targetHours: Math.round(s.cfu * 25) })}
                      >
                        Stima {Math.round(s.cfu * 25)} h
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
            <div className="field full">
              <span className="field-label">Note</span>
              <textarea
                className="in"
                value={s.notes}
                placeholder="Modalità d’esame, libri di testo, appunti…"
                onChange={(e) => set({ notes: e.target.value })}
              />
            </div>
          </div>
          <footer className="modal-foot">
            <div>
              {!isNew && (
                <button
                  className="btn destructive"
                  onClick={async () => {
                    if (
                      await confirmDialog({
                        title: `Eliminare “${exam.name}”?`,
                        message: 'Le sessioni restano nel calendario, senza esame.',
                        confirmLabel: 'Elimina',
                        destructive: true,
                      })
                    ) {
                      deleteSubject(exam.id);
                      close();
                    }
                  }}
                >
                  <IconTrash /> Elimina
                </button>
              )}
            </div>
            <div className="modal-buttons">
              <button className="btn" onClick={close}>
                Annulla
              </button>
              <button className="btn primary" onClick={() => submit(close)}>
                {isNew ? 'Aggiungi' : 'Salva'}
              </button>
            </div>
          </footer>
        </>
      )}
    </Modal>
  );
}

function SemesterModal({ sem, label, isNew, onClose }: { sem: Semester; label: string; isNew: boolean; onClose: () => void }) {
  const [s, setS] = useState(sem);
  const set = (p: Partial<Semester>) => setS((x) => ({ ...x, ...p }));
  const lower = label.toLowerCase();
  const suggestions = [1, 2, 3].map((n) => periodName(label, n)).concat(['Annuale', 'Estivo', 'Sessione d’esami']);
  const submit = (close: () => void) => {
    if (!s.name.trim()) return toast('Dai un nome al periodo');
    if (s.start && s.end && s.end < s.start) return toast('La fine deve venire dopo l’inizio');
    saveSemester({ ...s, name: s.name.trim(), academicYear: s.academicYear.trim() });
    toast(isNew ? 'Creato' : 'Aggiornato');
    close();
  };
  return (
    <Modal title={isNew ? `Nuovo ${lower}` : `Modifica ${lower}`} onClose={onClose}>
      {(close) => (
        <>
          <div className="form-grid">
            <div className="field full">
              <span className="field-label">Nome</span>
              <input
                className="in"
                autoFocus
                value={s.name}
                placeholder="Es. Term 1, Modulo di econometria, 2° anno · 1° semestre"
                onChange={(e) => set({ name: e.target.value })}
              />
              <div className="chips small">
                {suggestions.map((x) => (
                  <button key={x} type="button" className="chip" aria-pressed={s.name === x} onClick={() => set({ name: x })}>
                    {x}
                  </button>
                ))}
              </div>
            </div>
            <div className="field full">
              <span className="field-label">Anno accademico o etichetta (facoltativo)</span>
              <input
                className="in"
                value={s.academicYear}
                placeholder="Es. 2026/27, Anno 1, Gap year"
                onChange={(e) => set({ academicYear: e.target.value })}
              />
            </div>
            <div className="field">
              <span className="field-label">Inizio</span>
              <input className="in" type="date" value={s.start} onChange={(e) => set({ start: e.target.value })} />
            </div>
            <div className="field">
              <span className="field-label">Fine</span>
              <input className="in" type="date" value={s.end} onChange={(e) => set({ end: e.target.value })} />
            </div>
          </div>
          <footer className="modal-foot">
            <div>
              {!isNew && (
                <button
                  className="btn destructive"
                  onClick={async () => {
                    if (await confirmDialog({ title: `Eliminare “${sem.name}”?`, message: `Gli esami restano, senza ${lower}.`, confirmLabel: 'Elimina', destructive: true })) {
                      deleteSemester(sem.id);
                      close();
                    }
                  }}
                >
                  <IconTrash /> Elimina
                </button>
              )}
            </div>
            <div className="modal-buttons">
              <button className="btn" onClick={close}>
                Annulla
              </button>
              <button className="btn primary" onClick={() => submit(close)}>
                {isNew ? 'Crea' : 'Salva'}
              </button>
            </div>
          </footer>
        </>
      )}
    </Modal>
  );
}
