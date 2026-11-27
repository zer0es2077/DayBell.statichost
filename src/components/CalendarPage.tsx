import { useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Lock,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  CommutePlace,
  DerivedSmartTask,
  HomeworkItem,
  LessonSlot,
  OneOffTask,
  RuleDayOfWeek,
  ScheduleExemption,
  SchoolTest,
  UserSettings,
} from '../types';
import { getLocale, tr } from '../utils/i18n';
import {
  addDaysYmd,
  formatShortDate,
  formatWeekdayLong,
  formatWeekdayShort,
  getMondayYmd,
  parseYmd,
} from '../utils/packingEngine';
import {
  formatDurationMinutes,
  getStudySessionsForDate,
  resolvePersonalBlocksForDate,
} from '../utils/shortsBuilder';
import {
  getCommutePlacesForDate,
  getDaySchedule,
  getMonthGridDates,
  getWeekDatesFromMonday,
} from '../utils/smartEngine';
import { PersonalBlocksManager, type RoutineScope } from './PersonalBlocksManager';
import { StudyStartAnchorControl } from './StudyStartAnchorControl';

interface CalendarPageProps {
  todayYmd: string;
  timetable: LessonSlot[];
  tests: SchoolTest[];
  homework: HomeworkItem[];
  commutePlaces: CommutePlace[];
  oneOffTasks: OneOffTask[];
  exemptions: ScheduleExemption[];
  derivedTasks: DerivedSmartTask[];
  settings: UserSettings;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  onOpenDayInShorts: (date: string) => void;
  onOpenQuickAddSheet: () => void;
  onOpenRoutineEditor: () => void;
  onOpenTestStudyInFeed: (test: SchoolTest) => void;
  onOpenExamNotes: (test: SchoolTest) => void;
  onDeleteTest: (id: string) => void;
  onDeleteHomework: (id: string) => void;
  onDeleteOneOff: (id: string) => void;
  onDeleteExemption: (id: string) => void;
}

export function CalendarPage({
  todayYmd,
  timetable,
  tests,
  homework,
  commutePlaces,
  oneOffTasks,
  exemptions,
  derivedTasks,
  settings,
  onUpdateSettings,
  onOpenDayInShorts,
  onOpenQuickAddSheet,
  onOpenRoutineEditor,
  onOpenTestStudyInFeed,
  onOpenExamNotes,
  onDeleteTest,
  onDeleteHomework,
  onDeleteOneOff,
  onDeleteExemption,
}: CalendarPageProps) {
  const lang: AppLanguage = settings.language || 'pl';
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'list'>('week');
  const [selectedDate, setSelectedDate] = useState<string>(todayYmd);
  const [cursorMonday, setCursorMonday] = useState<string>(() => getMondayYmd(todayYmd));
  const [cursorMonth, setCursorMonth] = useState<{ year: number; month: number }>(() => {
    const dt = parseYmd(todayYmd);
    return { year: dt.getFullYear(), month: dt.getMonth() };
  });
  const [routineWindowState, setRoutineWindowState] = useState<
    { open: false } | { open: true; initialScope: RoutineScope; initialEditBlockId: string | null }
  >({ open: false });

  const allPersonalBlocks = settings.personalTimeBlocks ?? [];

  const selectedIsoDow: RuleDayOfWeek = useMemo(() => {
    const jsDow = parseYmd(selectedDate).getDay();
    return (jsDow === 0 ? 7 : jsDow) as RuleDayOfWeek;
  }, [selectedDate]);

  const openRoutineWindow = (
    initialScope: RoutineScope = selectedIsoDow,
    initialEditBlockId: string | null = null,
  ) => {
    setRoutineWindowState({ open: true, initialScope, initialEditBlockId });
  };

  const weekDates = useMemo(() => getWeekDatesFromMonday(cursorMonday), [cursorMonday]);
  const monthDates = useMemo(
    () => getMonthGridDates(cursorMonth.year, cursorMonth.month),
    [cursorMonth],
  );

  const selectedSchedule = useMemo(
    () => getDaySchedule(selectedDate, timetable, exemptions),
    [selectedDate, timetable, exemptions],
  );
  const selectedPlaces = useMemo(
    () => getCommutePlacesForDate(selectedDate, commutePlaces),
    [selectedDate, commutePlaces],
  );
  const selectedDerived = derivedTasks.filter((t) => t.targetDate === selectedDate);
  const selectedOneOffs = oneOffTasks.filter((t) => t.targetDate === selectedDate);
  const selectedHw = homework.filter((h) => h.dueDate === selectedDate);
  const selectedTests = tests.filter((t) => t.date === selectedDate);
  const selectedStudySessions = useMemo(
    () =>
      settings.showStudyBlocks === false
        ? []
        : getStudySessionsForDate(selectedDate, tests, settings),
    [selectedDate, tests, settings],
  );
  const selectedPersonalBlocks = useMemo(
    () =>
      resolvePersonalBlocksForDate({
        date: selectedDate,
        blocks: settings.personalTimeBlocks,
        timetable,
        exemptions,
        lang,
        settings,
        homework,
        tests,
      }),
    [selectedDate, settings, timetable, exemptions, lang, homework, tests],
  );

  const handlePrev = () => {
    if (viewMode === 'week') {
      setCursorMonday((m) => addDaysYmd(m, -7));
    } else {
      setCursorMonth((prev) =>
        prev.month === 0
          ? { year: prev.year - 1, month: 11 }
          : { year: prev.year, month: prev.month - 1 },
      );
    }
  };

  const handleNext = () => {
    if (viewMode === 'week') {
      setCursorMonday((m) => addDaysYmd(m, 7));
    } else {
      setCursorMonth((prev) =>
        prev.month === 11
          ? { year: prev.year + 1, month: 0 }
          : { year: prev.year, month: prev.month + 1 },
      );
    }
  };

  const handleToday = () => {
    setSelectedDate(todayYmd);
    setCursorMonday(getMondayYmd(todayYmd));
    const dt = parseYmd(todayYmd);
    setCursorMonth({ year: dt.getFullYear(), month: dt.getMonth() });
  };

  const sortedAllTests = useMemo(
    () => [...tests].sort((a, b) => a.date.localeCompare(b.date)),
    [tests],
  );
  const sortedAllHomework = useMemo(
    () => [...homework].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [homework],
  );

  const heading =
    viewMode === 'list'
      ? tr(lang, 'Sprawdziany i zadania', 'Exams & Homework')
      : viewMode === 'week'
        ? `${formatShortDate(weekDates[0], lang)} – ${formatShortDate(weekDates[4], lang)}`
        : new Date(cursorMonth.year, cursorMonth.month, 1).toLocaleDateString(getLocale(lang), {
            month: 'long',
            year: 'numeric',
          });

  return (
    <div className="h-full w-full overflow-hidden flex flex-col max-w-6xl mx-auto px-4 sm:px-6 py-4 gap-4">
      {/* Top Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#070B14] border border-blue-950 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'week' ? 'bg-blue-500 text-black' : 'text-blue-400 hover:text-blue-200'
              }`}
            >
              {tr(lang, 'Tydzień', 'Week')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'month'
                  ? 'bg-blue-500 text-black'
                  : 'text-blue-400 hover:text-blue-200'
              }`}
            >
              {tr(lang, 'Miesiąc', 'Month')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                viewMode === 'list'
                  ? 'bg-blue-500 text-black'
                  : 'text-blue-400 hover:text-blue-200'
              }`}
            >
              {tr(lang, 'Lista', 'List')}
            </button>
          </div>

          <h1 className="text-sm sm:text-base font-bold font-mono tabular-nums text-blue-200 whitespace-nowrap capitalize">
            {heading}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {viewMode !== 'list' && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label={tr(lang, 'Poprzedni', 'Previous')}
                className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center bg-[#070B14] border border-blue-950 hover:border-blue-500 rounded-lg text-blue-300"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="px-3 min-h-[36px] text-xs font-semibold bg-[#070B14] border border-blue-950 hover:border-blue-500 rounded-lg text-blue-300 whitespace-nowrap"
              >
                {tr(lang, 'Dziś', 'Today')}
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label={tr(lang, 'Następny', 'Next')}
                className="p-2 min-h-[36px] min-w-[36px] flex items-center justify-center bg-[#070B14] border border-blue-950 hover:border-blue-500 rounded-lg text-blue-300"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onOpenQuickAddSheet}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[36px] text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-lg whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            {tr(lang, 'Dodaj', 'Add Event')}
          </button>
        </div>
      </div>

      {/* Main Split: scrolls cleanly inside its own pane on mobile, side-by-side on desktop */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 gap-4 overflow-hidden">
        {/* Calendar Grid / All Exams & Homework List Pane */}
        <div className="flex-1 min-h-0 lg:col-span-8 overflow-y-auto no-scrollbar">
          {viewMode === 'list' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* All Exams & Quizzes */}
              <section className="bg-[#070B14] border border-blue-950 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="pb-2.5 border-b border-blue-950 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-rose-400">
                    {tr(
                      lang,
                      `Sprawdziany i kartkówki (${sortedAllTests.length})`,
                      `Exams & Quizzes (${sortedAllTests.length})`,
                    )}
                  </h2>
                </div>
                {sortedAllTests.length === 0 ? (
                  <p className="text-xs text-blue-500">
                    {tr(lang, 'Brak zapisanych sprawdzianów.', 'No exams or quizzes scheduled.')}
                  </p>
                ) : (
                  <div className="divide-y divide-blue-950/80">
                    {sortedAllTests.map((t) => {
                      const noteCount = t.sharedNotes?.length ?? 0;
                      return (
                        <div
                          key={t.id}
                          className="py-2.5 flex items-start justify-between gap-2 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedDate(t.date)}
                            className="min-w-0 flex-1 text-left hover:opacity-90"
                          >
                            <div className="font-mono text-[11px] text-rose-400 tabular-nums">
                              {formatShortDate(t.date, lang)} · {t.category}
                            </div>
                            <div className="text-blue-200 font-semibold mt-0.5 truncate">
                              {t.subject}: {t.title}
                            </div>
                            {noteCount > 0 && (
                              <div className="text-[11px] text-cyan-300/90 truncate mt-0.5">
                                {t.sharedNotes![noteCount - 1].text}
                              </div>
                            )}
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => onOpenExamNotes(t)}
                              title={tr(lang, 'Wspólne notatki klasy', 'Shared class notes')}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                                noteCount > 0
                                  ? 'border-cyan-500/50 text-cyan-300 bg-cyan-950/25 hover:border-cyan-400'
                                  : 'border-blue-900 text-blue-300 hover:border-blue-500'
                              }`}
                            >
                              <FileText className="h-3 w-3" />
                              <span>
                                {noteCount > 0
                                  ? tr(lang, `Notatki (${noteCount})`, `Notes (${noteCount})`)
                                  : tr(lang, 'Notatki', 'Notes')}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteTest(t.id)}
                              aria-label={tr(
                                lang,
                                `Usuń sprawdzian ${t.subject}`,
                                `Delete exam ${t.subject}`,
                              )}
                              title={tr(lang, 'Usuń sprawdzian', 'Delete exam')}
                              className="p-1.5 text-blue-500 hover:text-rose-400 border border-transparent hover:border-rose-900/60 rounded-lg transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* All Homework */}
              <section className="bg-[#070B14] border border-blue-950 rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="pb-2.5 border-b border-blue-950 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-blue-300">
                    {tr(
                      lang,
                      `Prace domowe (${sortedAllHomework.length})`,
                      `Homework (${sortedAllHomework.length})`,
                    )}
                  </h2>
                </div>
                {sortedAllHomework.length === 0 ? (
                  <p className="text-xs text-blue-500">
                    {tr(lang, 'Brak zapisanych prac domowych.', 'No homework saved.')}
                  </p>
                ) : (
                  <div className="divide-y divide-blue-950/80">
                    {sortedAllHomework.map((h) => (
                      <div
                        key={h.id}
                        className="py-2.5 flex items-start justify-between gap-2.5 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedDate(h.dueDate)}
                          className="min-w-0 flex-1 text-left hover:opacity-90"
                        >
                          <div className="font-mono text-[11px] text-blue-400 tabular-nums">
                            {formatShortDate(h.dueDate, lang)} · {h.subject}
                          </div>
                          <div
                            className={`font-semibold mt-0.5 truncate ${
                              h.completed ? 'line-through text-blue-600' : 'text-blue-200'
                            }`}
                          >
                            {h.title}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteHomework(h.id)}
                          aria-label={tr(
                            lang,
                            `Usuń pracę domową ${h.subject}`,
                            `Delete homework ${h.subject}`,
                          )}
                          title={tr(lang, 'Usuń pracę domową', 'Delete homework')}
                          className="p-1.5 text-blue-500 hover:text-rose-400 border border-transparent hover:border-rose-900/60 rounded-lg shrink-0 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : viewMode === 'week' ? (
            <div className="grid grid-cols-1 sm:grid-cols-5 bg-[#070B14] border border-blue-950 rounded-2xl divide-y sm:divide-y-0 sm:divide-x divide-blue-950 overflow-hidden lg:min-h-full">
              {weekDates.map((date) => {
                const isSelected = date === selectedDate;
                const isToday = date === todayYmd;
                const sched = getDaySchedule(date, timetable, exemptions);
                const places = getCommutePlacesForDate(date, commutePlaces);
                const dDerived = derivedTasks.filter((t) => t.targetDate === date);
                const dOneOffs = oneOffTasks.filter((t) => t.targetDate === date);
                const dHw = homework.filter((h) => h.dueDate === date);
                const dTests = tests.filter((t) => t.date === date);
                const dStudy = getStudySessionsForDate(date, tests, settings);

                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    className={`p-3.5 text-left flex flex-col gap-2.5 transition-colors min-w-0 ${
                      isSelected ? 'bg-blue-950/60' : 'hover:bg-blue-950/30'
                    }`}
                  >
                    <div className="pb-2 border-b border-blue-950 w-full">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`text-xs font-bold ${
                            isToday ? 'text-blue-200' : 'text-blue-300'
                          }`}
                        >
                          {formatWeekdayShort(date, lang)}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-blue-400">
                          {formatShortDate(date, lang)}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] tabular-nums text-blue-500 mt-0.5">
                        {sched.dismissalTime
                          ? tr(lang, `Koniec ${sched.dismissalTime}`, `Out ${sched.dismissalTime}`)
                          : tr(lang, 'Brak lekcji', 'No classes')}
                      </div>
                      {places.length > 0 && (
                        <div className="text-[11px] text-cyan-300 truncate">
                          {places.map((p) => p.name).join(', ')}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 text-xs w-full min-w-0">
                      {dDerived.map((t) => (
                        <div key={t.id} className="min-w-0">
                          <div className="font-mono text-[10px] font-semibold text-amber-300 truncate">
                            {t.triggerTime} · {t.placeName}
                          </div>
                          <div className="text-blue-200 line-clamp-2">{t.title}</div>
                        </div>
                      ))}
                      {dOneOffs.map((t) => (
                        <div key={t.id} className="min-w-0">
                          <div className="text-[10px] font-semibold text-rose-400">
                            {t.location === 'at-school'
                              ? tr(lang, 'W szkole', 'At school')
                              : tr(lang, 'Pilne', 'Urgent')}
                          </div>
                          <div className="text-blue-100 line-clamp-2">{t.title}</div>
                        </div>
                      ))}
                      {dTests.map((t) => (
                        <div key={t.id} className="min-w-0">
                          <div className="text-[10px] font-semibold text-rose-400">
                            {t.category}
                          </div>
                          <div className="text-blue-200 truncate">{t.subject}</div>
                        </div>
                      ))}
                      {dStudy.map((s) => (
                        <div key={s.studyKey} className="min-w-0">
                          <div className="text-[10px] font-semibold text-cyan-300 truncate">
                            {s.phase === 'learn'
                              ? tr(lang, 'Nauka', 'Learn')
                              : tr(lang, 'Powtórka', 'Repeat')}{' '}
                            · D{s.dayNumber}/{s.totalDays}
                          </div>
                          <div className="text-blue-300 truncate">{s.test.subject}</div>
                        </div>
                      ))}
                      {dHw.map((h) => (
                        <div key={h.id} className="min-w-0">
                          <div className="text-[10px] text-blue-400 truncate">
                            {tr(lang, 'PD', 'HW')} · {h.subject}
                          </div>
                          <div className="text-blue-300 truncate">{h.title}</div>
                        </div>
                      ))}
                      {sched.dayExemptions.map((ex) => (
                        <div key={ex.id} className="text-[11px] text-cyan-300 truncate">
                          {tr(lang, 'Zwoln.:', 'Exempt:')} {ex.subject || ex.reason}
                        </div>
                      ))}
                      {sched.activeLessons.length > 0 && (
                        <div className="pt-1.5 mt-1 border-t border-blue-950/80 space-y-1">
                          {sched.activeLessons.map((lesson) => (
                            <div
                              key={lesson.id}
                              className="flex items-baseline gap-1.5 text-[11px] min-w-0"
                            >
                              <span className="font-mono text-[10px] tabular-nums text-blue-500 shrink-0">
                                {lesson.startTime}
                              </span>
                              <span className="text-blue-300 truncate">{lesson.subject}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="bg-[#070B14] border border-blue-950 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-7 border-b border-blue-950 text-[11px] font-semibold text-blue-400">
                {(lang === 'pl'
                  ? ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz']
                  : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                ).map((d) => (
                  <div key={d} className="px-2 py-2">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 divide-x divide-y divide-blue-950">
                {monthDates.map((date) => {
                  const dt = parseYmd(date);
                  const inMonth = dt.getMonth() === cursorMonth.month;
                  const isSelected = date === selectedDate;
                  const isToday = date === todayYmd;
                  const dDerived = derivedTasks.filter((t) => t.targetDate === date);
                  const dOneOffs = oneOffTasks.filter((t) => t.targetDate === date);
                  const dTests = tests.filter((t) => t.date === date);
                  const dHw = homework.filter((h) => h.dueDate === date);

                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={`min-h-[76px] p-1.5 sm:p-2 text-left flex flex-col gap-0.5 transition-colors min-w-0 ${
                        isSelected ? 'bg-blue-950/60' : 'hover:bg-blue-950/30'
                      } ${!inMonth ? 'opacity-35' : ''}`}
                    >
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          isToday ? 'font-bold text-blue-200 underline' : 'text-blue-300'
                        }`}
                      >
                        {dt.getDate()}
                      </span>
                      {dDerived.slice(0, 1).map((t) => (
                        <span key={t.id} className="text-[10px] truncate text-amber-300 font-medium">
                          {t.triggerTime} {t.placeName}
                        </span>
                      ))}
                      {dOneOffs.slice(0, 1).map((t) => (
                        <span key={t.id} className="text-[10px] truncate text-rose-400 font-medium">
                          {t.title}
                        </span>
                      ))}
                      {dTests.slice(0, 1).map((t) => (
                        <span key={t.id} className="text-[10px] truncate text-rose-400">
                          {t.subject}
                        </span>
                      ))}
                      {dHw.slice(0, 1).map((h) => (
                        <span key={h.id} className="text-[10px] truncate text-blue-400">
                          HW: {h.subject}
                        </span>
                      ))}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Selected Day Inspector */}
        <section className="shrink-0 lg:col-span-4 max-h-[240px] lg:max-h-none bg-[#070B14] border border-blue-950 rounded-2xl p-4 sm:p-5 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-3.5 pr-0.5">
            <div className="pb-2.5 border-b border-blue-950">
              <div className="text-sm sm:text-base font-bold text-blue-200">
                {formatWeekdayLong(selectedDate, lang)}, {formatShortDate(selectedDate, lang)}
              </div>
              <div className="text-xs text-blue-400 mt-0.5">
                {selectedSchedule.dismissalTime
                  ? tr(
                      lang,
                      `Koniec lekcji o ${selectedSchedule.dismissalTime}`,
                      `Out at ${selectedSchedule.dismissalTime}`,
                    )
                  : tr(lang, 'Brak lekcji', 'No classes')}
                {selectedPlaces.length > 0 && (
                  <>
                    {' · '}
                    <span className="text-cyan-300">
                      {tr(lang, 'Po drodze:', 'Passes')}{' '}
                      {selectedPlaces.map((p) => p.name).join(', ')}
                    </span>
                  </>
                )}
              </div>
            </div>

            {selectedDerived.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-amber-300">
                  {tr(lang, 'Sprawy po lekcjach', 'Dismissal Errands')}
                </div>
                {selectedDerived.map((t) => (
                  <div key={t.id} className="text-xs text-blue-200">
                    <span className="font-mono tabular-nums text-blue-400">{t.triggerTime}</span> ·{' '}
                    {t.title}
                  </div>
                ))}
              </div>
            )}

            {selectedOneOffs.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-rose-400">
                  {tr(lang, 'Zadania i sprawy', 'Urgent One-Offs')}
                </div>
                {selectedOneOffs.map((t) => (
                  <div key={t.id} className="flex items-start justify-between gap-2 text-xs">
                    <span className="text-blue-200">{t.title}</span>
                    <button
                      type="button"
                      onClick={() => onDeleteOneOff(t.id)}
                      aria-label={tr(lang, 'Usuń zadanie', 'Remove task')}
                      className="text-blue-500 hover:text-rose-400 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedStudySessions.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-cyan-300">
                  {tr(lang, 'Nauka w kanale dnia', 'Study in Feed')}
                </div>
                {selectedStudySessions.map((s) => {
                  const noteCount = s.test.sharedNotes?.length ?? 0;
                  return (
                    <div key={s.studyKey} className="flex items-start justify-between gap-2 text-xs">
                      <span className="text-blue-200 min-w-0">
                        <span className="font-mono text-blue-400">
                          {s.phase === 'learn'
                            ? tr(lang, 'Nauka', 'Learn')
                            : tr(lang, 'Powtórka', 'Repeat')}{' '}
                          {s.dayNumber}/{s.totalDays}
                        </span>{' '}
                        · {s.test.subject}: {s.test.title}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenExamNotes(s.test)}
                          title={tr(lang, 'Wspólne notatki', 'Shared notes')}
                          className="text-cyan-300 hover:text-blue-200 underline whitespace-nowrap"
                        >
                          {noteCount > 0
                            ? tr(lang, `Notatki (${noteCount})`, `Notes (${noteCount})`)
                            : tr(lang, 'Notatki', 'Notes')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTest(s.test.id)}
                          aria-label={tr(lang, 'Usuń sprawdzian', 'Remove exam')}
                          title={tr(lang, 'Usuń sprawdzian', 'Delete exam')}
                          className="text-blue-500 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedTests.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-rose-400">
                  {tr(lang, 'Sprawdziany', 'Tests')}
                </div>
                {selectedTests.map((t) => {
                  const noteCount = t.sharedNotes?.length ?? 0;
                  return (
                    <div key={t.id} className="flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="text-blue-200">
                          {t.subject} ({t.category}): {t.title}
                        </div>
                        {noteCount > 0 && (
                          <div className="text-[11px] text-cyan-300/90 truncate mt-0.5">
                            {t.sharedNotes![noteCount - 1].text}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenExamNotes(t)}
                          className="text-cyan-300 hover:text-blue-200 underline whitespace-nowrap"
                        >
                          {noteCount > 0
                            ? tr(lang, `Notatki (${noteCount})`, `Notes (${noteCount})`)
                            : tr(lang, 'Notatki', 'Notes')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenTestStudyInFeed(t)}
                          className="text-blue-400 hover:text-blue-200 underline whitespace-nowrap"
                        >
                          {tr(lang, 'Nauka', 'Study')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTest(t.id)}
                          aria-label={tr(lang, 'Usuń sprawdzian', 'Remove exam')}
                          title={tr(lang, 'Usuń sprawdzian', 'Delete exam')}
                          className="text-blue-500 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedHw.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-blue-400">
                  {tr(lang, 'Prace domowe', 'Homework Due')}
                </div>
                {selectedHw.map((h) => (
                  <div key={h.id} className="flex items-start justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="text-blue-200 font-medium">
                        {h.subject}: {h.title}
                      </div>
                      {h.neededSupplies.length > 0 && (
                        <div className="text-amber-300">
                          {tr(lang, 'Materiały:', 'Supplies:')} {h.neededSupplies.join(', ')}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteHomework(h.id)}
                      aria-label={tr(lang, 'Usuń pracę domową', 'Remove homework')}
                      className="text-blue-500 hover:text-rose-400 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedSchedule.dayExemptions.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-cyan-300">
                  {tr(lang, 'Zwolnienia', 'Exemptions')}
                </div>
                {selectedSchedule.dayExemptions.map((ex) => (
                  <div key={ex.id} className="flex items-start justify-between gap-2 text-xs">
                    <span className="text-blue-200">{ex.reason}</span>
                    <button
                      type="button"
                      onClick={() => onDeleteExemption(ex.id)}
                      aria-label={tr(lang, 'Usuń zwolnienie', 'Remove exemption')}
                      className="text-blue-500 hover:text-rose-400 shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedSchedule.activeLessons.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-blue-300">
                  {tr(
                    lang,
                    `Plan lekcji (${selectedSchedule.activeLessons.length})`,
                    `Lessons (${selectedSchedule.activeLessons.length})`,
                  )}
                </div>
                <div className="divide-y divide-blue-950/70">
                  {selectedSchedule.activeLessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className="py-1.5 flex items-baseline justify-between gap-2 text-xs"
                    >
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="font-mono text-[11px] tabular-nums text-blue-400 shrink-0">
                          {lesson.startTime}
                        </span>
                        <span className="text-blue-200 font-medium truncate">{lesson.subject}</span>
                      </div>
                      {lesson.room && lesson.room !== 'TBA' && lesson.room !== '—' && (
                        <span className="font-mono text-[10px] text-blue-500 shrink-0">
                          {tr(lang, `s. ${lesson.room}`, `rm ${lesson.room}`)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Strictly Private Personal Routine Blocks & Free Time */}
            <div className="space-y-2 pt-2 border-t border-blue-950/70">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                  <Lock className="h-3 w-3" />
                  {tr(lang, 'Mój dzień (prywatne)', 'My Day (Private)')}
                </span>
                <button
                  type="button"
                  onClick={() => openRoutineWindow(selectedIsoDow, null)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:text-black hover:bg-cyan-400 bg-black border border-cyan-500/50 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Pencil className="h-3 w-3" />
                  {tr(lang, 'Edytuj dni / tydzień', 'Edit Days / Week')}
                </button>
              </div>
              {selectedPersonalBlocks.length > 0 ? (
                <div className="divide-y divide-blue-950/60">
                  {selectedPersonalBlocks.map((resolved) => (
                    <button
                      key={resolved.block.id}
                      type="button"
                      onClick={() => openRoutineWindow(selectedIsoDow, resolved.block.id)}
                      title={tr(lang, 'Kliknij, aby edytować blok', 'Click to edit block')}
                      className="w-full py-1.5 flex items-baseline justify-between gap-2 text-xs text-left hover:bg-blue-950/30 rounded px-1 -mx-1 transition-colors"
                    >
                      <span className="text-blue-200 font-medium truncate">
                        {resolved.block.name}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-cyan-300 shrink-0">
                        {resolved.startTime}–{resolved.endTime}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-blue-500">
                  {allPersonalBlocks.length > 0
                    ? tr(
                        lang,
                        'Brak aktywnych bloków w ten dzień. Kliknij „Edytuj dni / tydzień”, aby dodać lub zmienić.',
                        'No active blocks on this day. Click “Edit Days / Week” to add or change blocks.',
                      )
                    : tr(
                        lang,
                        'Dodaj dojazd, obiad lub sen — tylko w Twoim prywatnym planie.',
                        'Carve out transit, dinner, or sleep — private to your plan.',
                      )}
                </p>
              )}
              {(settings.freeTimeMinutes ?? 30) > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 pt-0.5">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>
                    {tr(
                      lang,
                      `Czas wolny między zadaniami a nauką: ${formatDurationMinutes(settings.freeTimeMinutes ?? 30, lang)}`,
                      `Free time between homework & test prep: ${formatDurationMinutes(settings.freeTimeMinutes ?? 30, lang)}`,
                    )}
                  </span>
                </div>
              )}
            </div>

            {selectedDerived.length === 0 &&
              selectedOneOffs.length === 0 &&
              selectedStudySessions.length === 0 &&
              selectedTests.length === 0 &&
              selectedHw.length === 0 &&
              selectedSchedule.dayExemptions.length === 0 &&
              selectedSchedule.activeLessons.length === 0 && (
                <p className="text-xs text-blue-400">
                  {tr(
                    lang,
                    'Wolny dzień — brak lekcji i terminów.',
                    'Free day — no classes or deadlines scheduled.',
                  )}
                </p>
              )}
          </div>

          <button
            type="button"
            onClick={() => onOpenDayInShorts(selectedDate)}
            className="mt-3 w-full inline-flex items-center justify-between px-4 min-h-[44px] text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            <span>
              {tr(
                lang,
                `Otwórz ${formatWeekdayShort(selectedDate, lang)} w kanale dnia`,
                `Open ${formatWeekdayShort(selectedDate, lang)} in Moment Feed`,
              )}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" />
          </button>
        </section>
      </div>

      {/* Spacious 8-Tab Day-of-Week + Whole Week Personal Blocks Window */}
      {routineWindowState.open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-6"
          onClick={() => setRoutineWindowState({ open: false })}
        >
          <div
            className="w-full max-w-2xl max-h-[88dvh] flex flex-col bg-[#070B14] border border-blue-900 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-blue-950 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-cyan-300 shrink-0" />
                  <h2 className="text-sm sm:text-base font-bold text-blue-100 truncate">
                    {tr(lang, 'Mój dzień — edytor bloków', 'My Day — Personal Blocks Editor')}
                  </h2>
                </div>
                <p className="text-[11px] text-blue-400 mt-0.5">
                  {tr(
                    lang,
                    '100% prywatne. Kliknij dzień tygodnia albo 8. zakładkę „Tydzień”, aby dodawać, edytować lub usuwać bloki.',
                    '100% private. Pick a day of the week or the 8th “All Week” tab to add, edit, or remove blocks.',
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setRoutineWindowState({ open: false });
                    onOpenRoutineEditor();
                  }}
                  className="text-[11px] font-medium text-blue-400 hover:text-blue-200 underline whitespace-nowrap hidden sm:inline"
                >
                  {tr(lang, 'Czas wolny', 'Free time')}
                </button>
                <button
                  type="button"
                  onClick={() => setRoutineWindowState({ open: false })}
                  aria-label={tr(lang, 'Zamknij', 'Close')}
                  className="p-1.5 text-blue-400 hover:text-blue-100 rounded-lg border border-blue-950 hover:border-blue-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-4 sm:p-5 space-y-4">
              <StudyStartAnchorControl
                settings={settings}
                timetable={timetable}
                exemptions={exemptions}
                referenceDateYmd={selectedDate}
                onUpdateSettings={onUpdateSettings}
                compact
              />

              <PersonalBlocksManager
                blocks={allPersonalBlocks}
                timetable={timetable}
                exemptions={exemptions}
                referenceDateYmd={selectedDate}
                lang={lang}
                settings={settings}
                homework={homework}
                tests={tests}
                initialScope={routineWindowState.initialScope}
                initialEditBlockId={routineWindowState.initialEditBlockId}
                onSaveBlocks={(next) => {
                  const patch: Partial<UserSettings> = { personalTimeBlocks: next };
                  if (
                    settings.studyStartAnchor === 'after-block' &&
                    settings.studyStartBlockId &&
                    !next.some((b) => b.id === settings.studyStartBlockId)
                  ) {
                    patch.studyStartAnchor = 'fixed';
                    patch.studyStartBlockId = undefined;
                  }
                  onUpdateSettings(patch);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
