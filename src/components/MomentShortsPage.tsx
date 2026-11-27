import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  Backpack,
  BellRing,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Coffee,
  FileText,
  Layers,
  LayoutList,
  Loader2,
  Lock,
  PackageMinus,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  AppLanguage,
  CommutePlace,
  CustomPackingItem,
  DerivedSmartTask,
  ExtractedPackingItem,
  FeedViewMode,
  HomeworkItem,
  LessonSlot,
  OneOffTask,
  ScheduleExemption,
  SchoolTest,
  SmartRule,
  StudyPlan,
  SubjectKit,
  UserSettings,
} from '../types';
import { tr } from '../utils/i18n';
import {
  buildDailyPackingPlan,
  formatShortDate,
  formatWeekdayShort,
  getNextSchoolDayYmd,
  getPrevSchoolDayYmd,
  getUpcomingSchoolDays,
  type ClassifiedTest,
} from '../utils/packingEngine';
import {
  buildMomentFeedSections,
  buildMomentShortsStream,
  type MomentShortCard,
} from '../utils/shortsBuilder';

interface MomentShortsPageProps {
  isActivePage: boolean;
  todayYmd: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  timetable: LessonSlot[];
  tests: SchoolTest[];
  classifiedTests: ClassifiedTest[];
  homework: HomeworkItem[];
  commutePlaces: CommutePlace[];
  oneOffTasks: OneOffTask[];
  exemptions: ScheduleExemption[];
  smartRules: SmartRule[];
  derivedTasks: DerivedSmartTask[];
  subjectKits: SubjectKit[];
  extractedPackingItems: ExtractedPackingItem[];
  customPackingItems: CustomPackingItem[];
  checkedPackIds: Record<string, boolean>;
  completedStudyIds: Record<string, boolean>;
  studyPlans: Record<string, StudyPlan>;
  generatingStudyTestId: string | null;
  settings: UserSettings;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  onTogglePackItem: (id: string) => void;
  onToggleSmartTask: (id: string) => void;
  onToggleOneOffTask: (id: string) => void;
  onToggleHomework: (id: string) => void;
  onToggleStudyDay: (studyKey: string) => void;
  onDeleteHomework: (id: string) => void;
  onDeleteTest: (id: string) => void;
  onOpenExamNotes: (test: SchoolTest) => void;
  onGenerateInlineStudyPlan: (test: SchoolTest) => void;
  onPreviewTaskAlert: (task: DerivedSmartTask) => void;
  onOpenQuickAddSheet: () => void;
  onOpenPackingEditor: () => void;
  onOpenRoutineEditor: () => void;
  onLoadExampleWeek: () => void;
  hasWorkspace: boolean;
  ownerAiUnlocked: boolean;
}

export function MomentShortsPage({
  isActivePage,
  todayYmd,
  selectedDate,
  onSelectDate,
  timetable,
  tests,
  classifiedTests,
  homework,
  commutePlaces,
  oneOffTasks,
  exemptions,
  smartRules,
  derivedTasks,
  subjectKits,
  extractedPackingItems,
  customPackingItems,
  checkedPackIds,
  completedStudyIds,
  studyPlans,
  generatingStudyTestId,
  settings,
  onUpdateSettings,
  onTogglePackItem,
  onToggleSmartTask,
  onToggleOneOffTask,
  onToggleHomework,
  onToggleStudyDay,
  onDeleteHomework,
  onDeleteTest,
  onOpenExamNotes,
  onGenerateInlineStudyPlan,
  onPreviewTaskAlert,
  onOpenQuickAddSheet,
  onOpenPackingEditor,
  onOpenRoutineEditor,
  onLoadExampleWeek,
  hasWorkspace,
  ownerAiUnlocked,
}: MomentShortsPageProps) {
  const lang: AppLanguage = settings.language || 'pl';
  const viewMode: FeedViewMode = settings.feedViewMode === 'plan' ? 'plan' : 'focus';
  const [activeIdx, setActiveIdx] = useState(0);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const dayTabs = useMemo(() => {
    const upcoming = getUpcomingSchoolDays(todayYmd, 5);
    const base = upcoming.includes(todayYmd) ? upcoming : [todayYmd, ...upcoming.slice(0, 4)];
    if (!base.includes(selectedDate)) {
      return [selectedDate, ...base];
    }
    return base;
  }, [todayYmd, selectedDate]);

  const { slides, sections } = useMemo(() => {
    const prevDay = getPrevSchoolDayYmd(selectedDate);
    const nextDay = getNextSchoolDayYmd(selectedDate);
    const prevPackPlan = buildDailyPackingPlan({
      date: prevDay,
      timetable,
      subjectKits,
      extractedItems: extractedPackingItems,
      customItems: customPackingItems,
      tests,
      homework,
      exemptions,
      smartRules,
      dailyEssentials: settings.dailyEssentials,
      packingSteps: settings.packingSteps,
      lang,
    });
    const packPlan = buildDailyPackingPlan({
      date: selectedDate,
      timetable,
      subjectKits,
      extractedItems: extractedPackingItems,
      customItems: customPackingItems,
      tests,
      homework,
      exemptions,
      smartRules,
      dailyEssentials: settings.dailyEssentials,
      packingSteps: settings.packingSteps,
      lang,
    });
    const nextPackPlan = buildDailyPackingPlan({
      date: nextDay,
      timetable,
      subjectKits,
      extractedItems: extractedPackingItems,
      customItems: customPackingItems,
      tests,
      homework,
      exemptions,
      smartRules,
      dailyEssentials: settings.dailyEssentials,
      packingSteps: settings.packingSteps,
      lang,
    });
    const feedParams = {
      date: selectedDate,
      todayYmd,
      nextSchoolDayYmd: nextDay,
      timetable,
      exemptions,
      prevPackingPlan: prevPackPlan,
      packingPlan: packPlan,
      nextPackingPlan: nextPackPlan,
      derivedTasks,
      oneOffTasks,
      homework,
      classifiedTests,
      commutePlaces,
      checkedPackIds,
      completedStudyIds,
      studyPlans,
      settings,
    };
    return {
      slides: buildMomentShortsStream(feedParams),
      sections: buildMomentFeedSections(feedParams),
    };
  }, [
    selectedDate,
    todayYmd,
    timetable,
    exemptions,
    smartRules,
    subjectKits,
    extractedPackingItems,
    customPackingItems,
    tests,
    homework,
    derivedTasks,
    oneOffTasks,
    classifiedTests,
    commutePlaces,
    checkedPackIds,
    completedStudyIds,
    studyPlans,
    settings,
    lang,
  ]);

  const planTotals = useMemo(() => {
    let checkable = 0;
    let done = 0;
    for (const sec of sections) {
      checkable += sec.checkableCount;
      done += sec.completedCount;
    }
    return { checkable, done };
  }, [sections]);

  useEffect(() => {
    setActiveIdx(0);
    if (feedRef.current) {
      feedRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [selectedDate]);

  useEffect(() => {
    setActiveIdx((prev) => (slides.length === 0 ? 0 : Math.min(prev, slides.length - 1)));
  }, [slides.length]);

  const scrollToSlide = (index: number) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, index));
    setActiveIdx(clamped);
    const container = feedRef.current;
    if (!container) return;
    container.scrollTo({
      top: clamped * container.clientHeight,
      behavior: 'smooth',
    });
  };

  const scrollToSlideById = (slideId: string) => {
    const idx = slides.findIndex((s) => s.id === slideId);
    if (idx >= 0) scrollToSlide(idx);
  };

  useEffect(() => {
    if (!isActivePage || viewMode !== 'focus' || slides.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToSlide(activeIdx + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToSlide(activeIdx - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isActivePage, viewMode, slides.length, activeIdx]);

  const handleScrollSync = () => {
    const container = feedRef.current;
    if (!container || container.clientHeight === 0) return;
    const idx = Math.round(container.scrollTop / container.clientHeight);
    if (idx !== activeIdx && idx >= 0 && idx < slides.length) {
      setActiveIdx(idx);
    }
  };

  const toggleCardEntity = (card: MomentShortCard) => {
    if (!card.toggleType || !card.toggleEntityId) return;
    if (card.toggleType === 'pack') {
      onTogglePackItem(card.toggleEntityId);
    } else if (card.toggleType === 'smart') {
      onToggleSmartTask(card.toggleEntityId);
    } else if (card.toggleType === 'oneoff') {
      onToggleOneOffTask(card.toggleEntityId);
    } else if (card.toggleType === 'homework') {
      onToggleHomework(card.toggleEntityId);
    } else if (card.toggleType === 'study') {
      onToggleStudyDay(card.toggleEntityId);
    }
  };

  const handleToggleSlide = (slide: MomentShortCard, idx: number) => {
    if (!slide.toggleType || !slide.toggleEntityId) return;
    const wasCompleted = slide.completed;
    toggleCardEntity(slide);

    if (!wasCompleted && settings.autoAdvanceOnCheck && idx < slides.length - 1) {
      setTimeout(() => scrollToSlide(idx + 1), 240);
    }
  };

  const toneClass = (tone: MomentShortCard['tone']) => {
    if (tone === 'crimson') return 'text-rose-400';
    if (tone === 'amber') return 'text-amber-300';
    if (tone === 'emerald') return 'text-cyan-300';
    return 'text-blue-400';
  };

  return (
    <div className="h-full w-full overflow-hidden flex flex-col bg-black">
      {/* Top Day Switcher & Feed Controls (2 clean rows on mobile/tablet, 1 row on desktop) */}
      <div className="shrink-0 w-full max-w-5xl mx-auto px-3 sm:px-6 py-2 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 border-b border-blue-950/80">
        {/* Row 1 on mobile: Full-width scrollable Day Switcher */}
        <div
          data-no-swipe="true"
          className="w-full lg:w-auto lg:flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar"
        >
          {dayTabs.map((d) => {
            const active = d === selectedDate;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onSelectDate(d)}
                className={`px-3 py-1.5 min-h-[34px] text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-blue-500 text-black border-blue-500'
                    : 'bg-[#070B14] border-blue-950 text-blue-300 hover:border-blue-700 hover:text-blue-100'
                }`}
              >
                {d === todayYmd
                  ? tr(lang, 'Dziś', 'Today')
                  : formatWeekdayShort(d, lang)}{' '}
                <span className="font-mono tabular-nums opacity-80">
                  {formatShortDate(d, lang)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Row 2 on mobile: Feed Controls */}
        <div
          data-no-swipe="true"
          className="w-full lg:w-auto flex items-center justify-between lg:justify-end gap-1.5 overflow-x-auto no-scrollbar shrink-0"
        >
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Focus (1-at-a-time) vs Laid-out Plan Switcher */}
            <div
              role="group"
              aria-label={tr(lang, 'Tryb widoku kanału', 'Feed layout mode')}
              className="flex items-center p-0.5 bg-[#070B14] border border-blue-950 rounded-lg shrink-0"
            >
              <button
                type="button"
                onClick={() => onUpdateSettings({ feedViewMode: 'focus' })}
                title={tr(lang, 'Po kolei (1 rzecz na ekranie)', 'One at a time (Focus)')}
                className={`inline-flex items-center gap-1 px-2 min-h-[30px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  viewMode === 'focus'
                    ? 'bg-blue-500 text-black'
                    : 'text-blue-400 hover:text-blue-200'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{tr(lang, 'Karty', 'Focus')}</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ feedViewMode: 'plan' })}
                title={tr(lang, 'Rozłożony plan całego dnia', 'Laid-out full day plan')}
                className={`inline-flex items-center gap-1 px-2 min-h-[30px] text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  viewMode === 'plan'
                    ? 'bg-blue-500 text-black'
                    : 'text-blue-400 hover:text-blue-200'
                }`}
              >
                <LayoutList className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{tr(lang, 'Plan', 'Plan')}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => onUpdateSettings({ showLessonsInFeed: !settings.showLessonsInFeed })}
              className={`inline-flex items-center px-2.5 min-h-[34px] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                settings.showLessonsInFeed
                  ? 'text-blue-200 bg-blue-950/60 border border-blue-800'
                  : 'text-blue-500 hover:text-blue-300 border border-blue-950'
              }`}
            >
              {settings.showLessonsInFeed
                ? tr(lang, 'Lekcje: Wł.', 'Classes: On')
                : tr(lang, 'Lekcje: Wył.', 'Classes: Off')}
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenRoutineEditor}
              aria-label={tr(lang, 'Mój dzień i czas wolny (prywatne)', 'My Day & Free Time (private)')}
              className="inline-flex items-center gap-1.5 px-2.5 min-h-[34px] text-xs font-semibold text-blue-200 bg-[#070B14] border border-blue-900 hover:border-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Clock className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">{tr(lang, 'Mój dzień', 'My Day')}</span>
            </button>

            <button
              type="button"
              onClick={onOpenPackingEditor}
              aria-label={tr(lang, 'Ustaw co pakować', 'Edit what to pack')}
              className="inline-flex items-center gap-1.5 px-2.5 min-h-[34px] text-xs font-semibold text-blue-200 bg-[#070B14] border border-blue-900 hover:border-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Backpack className="h-3.5 w-3.5 text-cyan-300" />
              <span className="hidden sm:inline">{tr(lang, 'Co pakować', 'Packing')}</span>
            </button>

            <button
              type="button"
              onClick={onOpenQuickAddSheet}
              className="inline-flex items-center gap-1.5 px-3 min-h-[34px] text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              {tr(lang, 'Dodaj', 'Add')}
            </button>
          </div>
        </div>
      </div>

      {/* Feed Content: Empty State | Laid-out Full Day Plan | 1-Thing-at-a-Time Focus Stream */}
      {slides.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center px-6">
          <div className="max-w-md text-center space-y-4">
            <h2 className="text-2xl font-bold text-blue-200">
              {hasWorkspace
                ? tr(lang, 'Nic nie zaplanowano na ten dzień', 'Nothing scheduled for this day')
                : tr(lang, 'Twój kanał dnia jest pusty', 'Your Moment Feed is empty')}
            </h2>
            <p className="text-sm text-blue-400 leading-relaxed">
              {hasWorkspace
                ? tr(
                    lang,
                    'Wybierz inny dzień szkolny powyżej albo dodaj nowe zadanie.',
                    'Pick another school day above or add a task.',
                  )
                : tr(
                    lang,
                    'Wczytaj przykładowy tydzień albo przejdź na ekran główny, żeby dodać plan lekcji i zadania.',
                    'Load the Example Week or swipe left to Home to add your schedule and tasks.',
                  )}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              {!hasWorkspace && (
                <button
                  type="button"
                  onClick={onLoadExampleWeek}
                  className="px-5 py-3 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-xl whitespace-nowrap"
                >
                  {tr(lang, 'Przykładowy tydzień', 'Load Example Week')}
                </button>
              )}
              <button
                type="button"
                onClick={onOpenQuickAddSheet}
                className="px-5 py-3 text-xs font-semibold text-blue-200 border border-blue-900 hover:border-blue-500 rounded-xl whitespace-nowrap"
              >
                {tr(lang, 'Dodaj zadanie', 'Add Task')}
              </button>
            </div>
          </div>
        </div>
      ) : viewMode === 'plan' ? (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 space-y-5 pb-10">
            {/* Day Progress Header */}
            <div className="bg-[#070B14] border border-blue-950 rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-blue-200">
                    {tr(lang, 'Plan dnia', 'Day Plan')} ·{' '}
                    <span className="text-blue-400 font-semibold">
                      {formatWeekdayShort(selectedDate, lang)} {formatShortDate(selectedDate, lang)}
                    </span>
                  </h2>
                  <p className="text-xs text-blue-400 mt-0.5">
                    {tr(
                      lang,
                      'Wszystkie etapy dnia rozłożone chronologicznie na jednym ekranie.',
                      'Every part of your day laid out chronologically on one screen.',
                    )}
                  </p>
                </div>
                {planTotals.checkable > 0 && (
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold tabular-nums text-cyan-300">
                      {planTotals.done} / {planTotals.checkable}
                    </div>
                    <div className="text-[11px] text-blue-400">
                      {tr(lang, 'odhaczone', 'completed')}
                    </div>
                  </div>
                )}
              </div>

              {planTotals.checkable > 0 && (
                <div className="h-1.5 w-full bg-blue-950 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{
                      width: `${Math.round((planTotals.done / planTotals.checkable) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Chronological Phase Cards */}
            {sections.map((section) => {
              const uncheckedPackItems = section.items.filter(
                (it) => it.toggleType === 'pack' && !it.completed,
              );
              const isUnpackSection =
                section.items.length > 0 &&
                section.items.every(
                  (it) => it.kind === 'morning-unpack' || it.kind === 'evening-unpack',
                );
              const isPackSection =
                section.items.length > 0 &&
                section.items.every(
                  (it) =>
                    it.kind === 'morning-pack' ||
                    it.kind === 'evening-pack' ||
                    it.kind === 'morning-unpack' ||
                    it.kind === 'evening-unpack',
                );

              return (
                <section
                  key={section.id}
                  className={`bg-[#070B14] border rounded-2xl overflow-hidden ${
                    isUnpackSection ? 'border-amber-900/70' : 'border-blue-950'
                  }`}
                >
                  {/* Section Header */}
                  <div className="px-4 sm:px-5 py-3.5 border-b border-blue-950 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`font-mono text-xs font-semibold tabular-nums px-2 py-0.5 bg-black border rounded-md shrink-0 ${
                          isUnpackSection
                            ? 'text-amber-300 border-amber-900/70'
                            : 'text-blue-400 border-blue-950'
                        }`}
                      >
                        {section.timeLabel}
                      </span>
                      {isUnpackSection && (
                        <PackageMinus className="h-4 w-4 text-amber-300 shrink-0" />
                      )}
                      <h3 className="text-sm sm:text-base font-bold text-blue-200 truncate">
                        {section.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isPackSection && uncheckedPackItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            for (const item of uncheckedPackItems) {
                              if (item.toggleEntityId) onTogglePackItem(item.toggleEntityId);
                            }
                          }}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                            isUnpackSection
                              ? 'text-amber-300 hover:text-black hover:bg-amber-400 border-amber-500/40'
                              : 'text-cyan-300 hover:text-black hover:bg-cyan-400 border-cyan-500/40'
                          }`}
                        >
                          {isUnpackSection
                            ? tr(lang, 'Wyjmij wszystko', 'Unpack all')
                            : tr(lang, 'Spakuj wszystko', 'Pack all')}
                        </button>
                      )}
                      {section.checkableCount > 0 && (
                        <span
                          className={`font-mono text-xs font-semibold tabular-nums ${
                            section.allComplete ? 'text-cyan-300' : 'text-blue-400'
                          }`}
                        >
                          {section.completedCount}/{section.checkableCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Section Rows */}
                  <div className="divide-y divide-blue-950/70">
                    {section.items.map((item) => {
                      const isGeneratingThisStudy =
                        item.kind === 'test-study' &&
                        item.testItem &&
                        generatingStudyTestId === item.testItem.id;

                      const isFreeTime = item.kind === 'free-time';
                      const isPersonalBlock = item.kind === 'personal-block';

                      return (
                        <div
                          key={item.id}
                          className={`px-4 sm:px-5 py-3 flex items-start justify-between gap-3 transition-colors ${
                            isFreeTime
                              ? 'bg-emerald-950/15 hover:bg-emerald-950/25'
                              : isPersonalBlock
                                ? 'bg-blue-950/15 hover:bg-blue-950/25'
                                : 'hover:bg-blue-950/20'
                          }`}
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            {item.toggleType ? (
                              <button
                                type="button"
                                role="checkbox"
                                aria-checked={item.completed}
                                aria-label={
                                  item.completed
                                    ? tr(lang, `Odznacz: ${item.title}`, `Uncheck: ${item.title}`)
                                    : tr(lang, `Zaznacz: ${item.title}`, `Check: ${item.title}`)
                                }
                                title={
                                  item.completed
                                    ? tr(lang, 'Kliknij, aby odznaczyć', 'Click to uncheck')
                                    : tr(lang, 'Kliknij, aby zaznaczyć', 'Click to check off')
                                }
                                onClick={() => toggleCardEntity(item)}
                                className={`mt-0.5 h-6 w-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                                  item.completed
                                    ? 'bg-cyan-400 hover:bg-cyan-300 border-cyan-400 text-black'
                                    : isFreeTime
                                      ? 'bg-black border-emerald-700 hover:border-emerald-400 text-transparent'
                                      : 'bg-black border-blue-800 hover:border-blue-400 text-transparent'
                                }`}
                              >
                                <Check className="h-3.5 w-3.5 stroke-[3]" />
                              </button>
                            ) : (
                              <span className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums text-blue-400 w-12 shrink-0">
                                {item.timeLabel}
                              </span>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                {item.toggleType ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleCardEntity(item)}
                                    className={`inline-flex items-center gap-1.5 text-left text-sm font-semibold leading-snug transition-colors cursor-pointer ${
                                      item.completed
                                        ? 'line-through text-blue-600 hover:text-blue-400'
                                        : isFreeTime
                                          ? 'text-emerald-300 hover:text-emerald-200'
                                          : 'text-blue-200 hover:text-blue-100'
                                    }`}
                                  >
                                    {isFreeTime && <Coffee className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                                    {isPersonalBlock && <Lock className="h-3 w-3 text-cyan-400/80 shrink-0" />}
                                    <span>{item.title}</span>
                                  </button>
                                ) : (
                                  <span
                                    className={`text-sm font-semibold leading-snug ${
                                      item.completed
                                        ? 'line-through text-blue-600'
                                        : 'text-blue-200'
                                    }`}
                                  >
                                    {item.title}
                                  </span>
                                )}
                                {item.metaLine && (
                                  <span
                                    className={`text-[11px] font-medium ${
                                      isFreeTime ? 'text-emerald-400' : toneClass(item.tone)
                                    }`}
                                  >
                                    · {item.metaLine}
                                  </span>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-blue-400 mt-0.5 leading-relaxed">
                                  {item.description}
                                </p>
                              )}
                              {item.studyTasks && item.studyTasks.length > 0 && !item.completed && (
                                <ul className="mt-2 space-y-1 text-xs text-blue-300">
                                  {item.studyTasks.slice(0, 3).map((t, i) => (
                                    <li key={i} className="leading-snug">
                                      <span className="font-mono text-blue-500 mr-1.5">
                                        {i + 1}.
                                      </span>
                                      {t}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {item.kind === 'test-study' &&
                                item.testItem?.sharedNotes &&
                                item.testItem.sharedNotes.length > 0 && (
                                  <div className="mt-2 p-2.5 bg-black border border-cyan-950 rounded-xl space-y-1">
                                    <div className="text-[11px] font-semibold text-cyan-300">
                                      {tr(
                                        lang,
                                        `Notatki klasy (${item.testItem.sharedNotes.length})`,
                                        `Class Notes (${item.testItem.sharedNotes.length})`,
                                      )}
                                    </div>
                                    {item.testItem.sharedNotes.slice(0, 2).map((n) => (
                                      <p
                                        key={n.id}
                                        className="text-xs text-blue-300 leading-snug line-clamp-2 whitespace-pre-wrap"
                                      >
                                        <span className="text-blue-500">{n.author}:</span> {n.text}
                                      </p>
                                    ))}
                                  </div>
                                )}
                            </div>
                          </div>

                          {/* Row Secondary Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {item.toggleType &&
                              item.timeLabel &&
                              item.kind !== 'morning-pack' &&
                              item.kind !== 'evening-pack' &&
                              item.kind !== 'morning-unpack' &&
                              item.kind !== 'evening-unpack' && (
                              <span className="hidden sm:inline font-mono text-[11px] tabular-nums text-blue-500">
                                {item.timeLabel}
                              </span>
                            )}
                            {item.derivedTask && (
                              <button
                                type="button"
                                onClick={() => onPreviewTaskAlert(item.derivedTask!)}
                                title={tr(lang, 'Testuj alert', 'Test alert')}
                                className="p-1.5 text-blue-400 hover:text-blue-200 border border-blue-950 hover:border-blue-600 rounded-lg transition-colors"
                              >
                                <BellRing className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {ownerAiUnlocked &&
                              item.kind === 'test-study' &&
                              item.testItem &&
                              !item.completed &&
                              (!item.studyTasks || item.studyTasks.length === 0) && (
                                <button
                                  type="button"
                                  disabled={Boolean(isGeneratingThisStudy)}
                                  onClick={() => onGenerateInlineStudyPlan(item.testItem!)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-blue-300 border border-blue-900 hover:border-blue-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                                >
                                  {isGeneratingThisStudy ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-3 w-3" />
                                  )}
                                  {tr(lang, 'Rozpisz', 'Split')}
                                </button>
                              )}
                            {item.kind === 'homework' && item.toggleEntityId && (
                              <button
                                type="button"
                                onClick={() => onDeleteHomework(item.toggleEntityId!)}
                                aria-label={tr(lang, 'Usuń pracę domową', 'Delete homework')}
                                title={tr(lang, 'Usuń pracę domową', 'Delete homework')}
                                className="p-1.5 text-blue-500 hover:text-rose-400 border border-transparent hover:border-rose-900/60 rounded-lg transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {item.kind === 'test-study' && item.testItem && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onOpenExamNotes(item.testItem!)}
                                  title={tr(lang, 'Wspólne notatki klasy', 'Shared class notes')}
                                  className={`inline-flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                                    (item.testItem.sharedNotes?.length ?? 0) > 0
                                      ? 'border-cyan-500/50 text-cyan-300 bg-cyan-950/25 hover:border-cyan-400'
                                      : 'border-blue-900 text-blue-300 hover:border-blue-500'
                                  }`}
                                >
                                  <FileText className="h-3 w-3" />
                                  <span>
                                    {(item.testItem.sharedNotes?.length ?? 0) > 0
                                      ? tr(
                                          lang,
                                          `Notatki (${item.testItem.sharedNotes!.length})`,
                                          `Notes (${item.testItem.sharedNotes!.length})`,
                                        )
                                      : tr(lang, 'Notatki', 'Notes')}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteTest(item.testItem!.id)}
                                  aria-label={tr(lang, 'Usuń sprawdzian', 'Delete exam')}
                                  title={tr(lang, 'Usuń sprawdzian', 'Delete exam')}
                                  className="p-1.5 text-blue-500 hover:text-rose-400 border border-transparent hover:border-rose-900/60 rounded-lg transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Completed Banner */}
                  {section.checkableCount > 0 && section.allComplete && (
                    <div className="px-4 sm:px-5 py-2.5 bg-cyan-950/20 border-t border-cyan-500/20 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-cyan-300">
                        {section.completionHeadline}
                      </span>
                      <span className="text-blue-400 truncate">{section.completionSubtext}</span>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 relative w-full overflow-hidden">
          <div
            ref={feedRef}
            onScroll={handleScrollSync}
            className="h-full w-full overflow-y-auto snap-y snap-mandatory no-scrollbar scroll-smooth"
          >
            {slides.map((slide, idx) => {
              const isMilestone = slide.kind === 'section-end';
              const isGeneratingThisStudy =
                slide.kind === 'test-study' &&
                slide.testItem &&
                generatingStudyTestId === slide.testItem.id;

              return (
                <section
                  key={slide.id}
                  className="h-full w-full shrink-0 snap-start snap-always flex flex-col items-center justify-center px-6 sm:px-12 relative"
                >
                  {/* Centered Pure Typography Stage — Zero Card Boxes */}
                  <div className="w-full max-w-xl flex flex-col items-center text-center space-y-5">
                    {/* Minimal Relevant Kicker */}
                    <div
                      className={`text-xs sm:text-sm font-semibold tracking-wide ${toneClass(slide.tone)}`}
                    >
                      {slide.kicker}
                    </div>

                    {/* Primary Single Focus Headline */}
                    <h2
                      className={`text-3xl sm:text-5xl font-bold tracking-tight leading-[1.15] ${
                        isMilestone && slide.milestoneComplete
                          ? 'text-cyan-300'
                          : slide.completed
                            ? 'line-through text-blue-700'
                            : 'text-blue-200'
                      }`}
                    >
                      {slide.title}
                    </h2>

                    {/* Relevant Context Line */}
                    {slide.description && (
                      <p
                        className={`text-base sm:text-lg max-w-md leading-relaxed ${
                          isMilestone && slide.milestoneComplete
                            ? 'text-blue-200 font-medium'
                            : 'text-blue-400'
                        }`}
                      >
                        {slide.description}
                      </p>
                    )}

                    {/* Inline AI Study Breakdown Steps (pure borderless text, only on study slides) */}
                    {slide.studyTasks && slide.studyTasks.length > 0 && !slide.completed && (
                      <ul className="space-y-1.5 text-sm sm:text-base text-blue-300 max-w-md">
                        {slide.studyTasks.slice(0, 3).map((t, i) => (
                          <li key={i} className="leading-snug">
                            <span className="text-blue-500 mr-2 font-mono">{i + 1}.</span>
                            {t}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Shared Class Notes Preview on Exam Study Slides */}
                    {slide.kind === 'test-study' &&
                      slide.testItem?.sharedNotes &&
                      slide.testItem.sharedNotes.length > 0 && (
                        <div className="w-full max-w-md text-left p-3.5 bg-[#070B14] border border-cyan-950 rounded-2xl space-y-1.5">
                          <div className="text-xs font-semibold text-cyan-300">
                            {tr(
                              lang,
                              `Wspólne notatki klasy (${slide.testItem.sharedNotes.length})`,
                              `Shared Class Notes (${slide.testItem.sharedNotes.length})`,
                            )}
                          </div>
                          {slide.testItem.sharedNotes.slice(0, 2).map((n) => (
                            <p
                              key={n.id}
                              className="text-xs sm:text-sm text-blue-200 leading-snug line-clamp-2 whitespace-pre-wrap"
                            >
                              <span className="text-blue-400 font-medium">{n.author}:</span> {n.text}
                            </p>
                          ))}
                        </div>
                      )}

                    {/* Single Primary Action Right Under the Focus Text */}
                    <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
                      {isMilestone ? (
                        <>
                          {slide.milestoneFirstUncheckedId && (
                            <button
                              type="button"
                              onClick={() => scrollToSlideById(slide.milestoneFirstUncheckedId!)}
                              className="inline-flex items-center justify-center gap-2 min-h-[52px] px-7 text-sm font-semibold text-blue-200 border border-blue-800 hover:border-blue-400 rounded-2xl transition-colors whitespace-nowrap"
                            >
                                <RotateCcw className="h-4 w-4 text-blue-400" />
                                {tr(lang, 'Wróć do nieodhaczonych', 'Review Unchecked')}
                              </button>
                            )}

                            {idx < slides.length - 1 ? (
                              <button
                                type="button"
                                onClick={() => scrollToSlide(idx + 1)}
                                className="inline-flex items-center justify-center gap-2 min-h-[52px] px-8 text-sm font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-2xl transition-colors whitespace-nowrap"
                              >
                                <span>
                                  {slide.nextSectionLabel
                                    ? tr(
                                        lang,
                                        `Przejdź: ${slide.nextSectionLabel}`,
                                        `Continue to ${slide.nextSectionLabel}`,
                                      )
                                    : tr(lang, 'Dalej', 'Next')}
                                </span>
                                <ArrowDown className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => scrollToSlide(0)}
                                className="inline-flex items-center justify-center gap-2 min-h-[52px] px-8 text-sm font-semibold text-blue-300 border border-blue-900 hover:border-blue-500 rounded-2xl transition-colors whitespace-nowrap"
                              >
                                {tr(lang, 'Wróć na początek', 'Back to Start')}
                              </button>
                            )}
                          </>
                        ) : slide.toggleType ? (
                          <>
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={slide.completed}
                              title={
                                slide.completed
                                  ? tr(lang, 'Kliknij, aby odznaczyć', 'Click to uncheck')
                                  : undefined
                              }
                              onClick={() => handleToggleSlide(slide, idx)}
                              className={`inline-flex items-center justify-center gap-2.5 min-h-[56px] min-w-[200px] px-8 text-base font-bold rounded-2xl transition-colors whitespace-nowrap cursor-pointer ${
                                slide.completed
                                  ? 'bg-black text-cyan-300 border border-cyan-500/70 hover:border-blue-400 hover:text-blue-200'
                                  : slide.kind === 'morning-unpack' ||
                                      slide.kind === 'evening-unpack'
                                    ? 'bg-amber-400 hover:bg-amber-300 text-black'
                                    : slide.kind === 'free-time'
                                      ? 'bg-emerald-400 hover:bg-emerald-300 text-black'
                                      : 'bg-blue-500 hover:bg-blue-400 text-black'
                              }`}
                            >
                              {slide.kind === 'morning-unpack' || slide.kind === 'evening-unpack' ? (
                                slide.completed ? (
                                  <Check className="h-5 w-5 stroke-[2.75]" />
                                ) : (
                                  <PackageMinus className="h-5 w-5 stroke-[2.25]" />
                                )
                              ) : slide.kind === 'free-time' && !slide.completed ? (
                                <Coffee className="h-5 w-5 stroke-[2.25]" />
                              ) : (
                                <Check className="h-5 w-5 stroke-[2.75]" />
                              )}
                              <span>
                                {slide.actionLabel ||
                                  (slide.completed
                                    ? tr(lang, 'Zrobione', 'Done')
                                    : tr(lang, 'Oznacz zrobione', 'Mark Done'))}
                              </span>
                              {slide.completed && (
                                <span className="text-xs font-medium opacity-75">
                                  · {tr(lang, 'Odznacz', 'Undo')}
                                </span>
                              )}
                            </button>

                            {slide.derivedTask && (
                              <button
                                type="button"
                                onClick={() => onPreviewTaskAlert(slide.derivedTask!)}
                                className="inline-flex items-center justify-center gap-2 min-h-[56px] px-5 text-xs font-semibold text-blue-300 border border-blue-900 hover:border-blue-500 rounded-2xl transition-colors whitespace-nowrap"
                              >
                                <BellRing className="h-4 w-4 text-blue-400" />
                                {tr(lang, 'Testuj alert', 'Test Ping')}
                              </button>
                            )}

                            {ownerAiUnlocked &&
                              slide.kind === 'test-study' &&
                              slide.testItem &&
                              !slide.completed &&
                              (!slide.studyTasks || slide.studyTasks.length === 0) && (
                                <button
                                  type="button"
                                  disabled={Boolean(isGeneratingThisStudy)}
                                  onClick={() => onGenerateInlineStudyPlan(slide.testItem!)}
                                  className="inline-flex items-center justify-center gap-2 min-h-[56px] px-5 text-xs font-semibold text-blue-300 border border-blue-900 hover:border-blue-500 disabled:opacity-50 rounded-2xl transition-colors whitespace-nowrap"
                                >
                                  {isGeneratingThisStudy ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                                  ) : (
                                    <Sparkles className="h-4 w-4 text-blue-400" />
                                  )}
                                  {isGeneratingThisStudy
                                    ? tr(lang, 'Planowanie...', 'Planning...')
                                    : tr(lang, 'Rozpisz z AI', 'Break down with AI')}
                                </button>
                              )}

                            {slide.kind === 'homework' && slide.toggleEntityId && (
                              <button
                                type="button"
                                onClick={() => onDeleteHomework(slide.toggleEntityId!)}
                                aria-label={tr(lang, 'Usuń pracę domową', 'Delete homework')}
                                className="inline-flex items-center justify-center gap-1.5 min-h-[56px] px-4 text-xs font-semibold text-rose-400 border border-rose-900/70 hover:bg-rose-950/30 rounded-2xl transition-colors whitespace-nowrap"
                              >
                                <Trash2 className="h-4 w-4" />
                                {tr(lang, 'Usuń', 'Delete')}
                              </button>
                            )}

                            {slide.kind === 'test-study' && slide.testItem && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onOpenExamNotes(slide.testItem!)}
                                  className="inline-flex items-center justify-center gap-2 min-h-[56px] px-5 text-xs font-semibold text-cyan-300 border border-cyan-500/50 hover:border-cyan-400 rounded-2xl transition-colors whitespace-nowrap"
                                >
                                  <FileText className="h-4 w-4" />
                                  {(slide.testItem.sharedNotes?.length ?? 0) > 0
                                    ? tr(
                                        lang,
                                        `Notatki klasy (${slide.testItem.sharedNotes!.length})`,
                                        `Class Notes (${slide.testItem.sharedNotes!.length})`,
                                      )
                                    : tr(lang, 'Notatki klasy', 'Class Notes')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteTest(slide.testItem!.id)}
                                  aria-label={tr(lang, 'Usuń sprawdzian', 'Delete exam')}
                                  className="inline-flex items-center justify-center gap-1.5 min-h-[56px] px-4 text-xs font-semibold text-rose-400 border border-rose-900/70 hover:bg-rose-950/30 rounded-2xl transition-colors whitespace-nowrap"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {tr(lang, 'Usuń sprawdzian', 'Delete Exam')}
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          idx < slides.length - 1 && (
                            <button
                              type="button"
                              onClick={() => scrollToSlide(idx + 1)}
                              className="inline-flex items-center justify-center gap-2 min-h-[52px] px-7 text-sm font-semibold text-blue-300 border border-blue-900 hover:border-blue-500 rounded-2xl transition-colors whitespace-nowrap"
                            >
                              <span>{tr(lang, 'Dalej', 'Next')}</span>
                              <ArrowDown className="h-4 w-4" />
                            </button>
                          )
                        )}
                    </div>
                  </div>

                  {/* Subtle bottom scroll cue (non-intrusive, no box) */}
                  {idx < slides.length - 1 && !isMilestone && (
                    <button
                      type="button"
                      onClick={() => scrollToSlide(idx + 1)}
                      className="absolute bottom-5 text-xs font-mono text-blue-600 hover:text-blue-400 transition-colors inline-flex items-center gap-1"
                    >
                      <span>
                        {idx + 1} / {slides.length}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  )}
                </section>
              );
            })}
          </div>

          {/* Subtle Up/Down Navigation Controls on Right Edge */}
          <div className="hidden sm:flex flex-col items-center gap-2.5 absolute right-5 top-1/2 -translate-y-1/2 z-20">
            <button
              type="button"
              onClick={() => scrollToSlide(activeIdx - 1)}
              disabled={activeIdx === 0}
              aria-label="Previous item"
              className="min-h-[42px] min-w-[42px] rounded-full border border-blue-950 hover:border-blue-500 disabled:opacity-25 flex items-center justify-center text-blue-400 hover:text-blue-200 bg-black/80 transition-colors"
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <span className="font-mono text-[11px] tabular-nums text-blue-500">
              {activeIdx + 1}/{slides.length}
            </span>
            <button
              type="button"
              onClick={() => scrollToSlide(activeIdx + 1)}
              disabled={activeIdx >= slides.length - 1}
              aria-label="Next item"
              className="min-h-[42px] min-w-[42px] rounded-full border border-blue-950 hover:border-blue-500 disabled:opacity-25 flex items-center justify-center text-blue-400 hover:text-blue-200 bg-black/80 transition-colors"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
