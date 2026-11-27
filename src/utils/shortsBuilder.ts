import type {
  AppLanguage,
  CommutePlace,
  DerivedSmartTask,
  HomeworkItem,
  LessonSlot,
  OneOffTask,
  PersonalBlockCategory,
  PersonalTimeBlock,
  RuleDayOfWeek,
  ScheduleExemption,
  SchoolTest,
  StudyPlan,
  UserSettings,
} from '../types';
import { tr } from './i18n';
import {
  buildDailyUnpackItems,
  daysBetweenYmd,
  formatShortDate,
  formatWeekdayLong,
  getStudyPhaseSplit,
  getTestLeadDays,
  parseYmd,
  type ClassifiedTest,
  type DailyPackingPlan,
} from './packingEngine';
import { getCommutePlacesForDate, getDaySchedule } from './smartEngine';

export type ShortCardKind =
  | 'morning-unpack'
  | 'morning-pack'
  | 'personal-block'
  | 'free-time'
  | 'urgent-oneoff'
  | 'dismissal-errand'
  | 'homework'
  | 'test-study'
  | 'lesson'
  | 'evening-unpack'
  | 'evening-pack'
  | 'section-end';

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = (hhmm || '00:00').split(':').map((v) => Number(v) || 0);
  return ((h % 24) + 24) % 24 * 60 + Math.max(0, Math.min(59, m));
}

export function minutesToHhmm(totalMinutes: number): string {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getPersonalBlockDurationMinutes(startTime: string, endTime: string): number {
  const s = hhmmToMinutes(startTime);
  const e = hhmmToMinutes(endTime);
  if (e === s) return 30;
  return e > s ? e - s : 1440 - s + e;
}

export function formatDurationMinutes(minutes: number, lang: AppLanguage): string {
  const mins = Math.max(1, Math.round(minutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return lang === 'pl' ? `${h} godz.` : `${h}h`;
  return lang === 'pl' ? `${h} godz. ${m} min` : `${h}h ${m}m`;
}

export function personalBlockCategoryLabel(
  category: PersonalBlockCategory,
  lang: AppLanguage,
): string {
  if (category === 'meal') return tr(lang, 'Posiłek', 'Meal');
  if (category === 'transit') return tr(lang, 'Dojazd', 'Transit');
  if (category === 'sleep') return tr(lang, 'Sen', 'Sleep');
  if (category === 'hobby') return tr(lang, 'Hobby / Sport', 'Hobby / Sport');
  return tr(lang, 'Prywatne', 'Personal');
}

export interface ResolvedPersonalTimeBlock {
  block: PersonalTimeBlock;
  startTime: string;
  endTime: string;
  startMin: number;
  endMin: number;
  durationMinutes: number;
  anchorLabel: string;
}

export function describePersonalBlockAnchor(
  block: PersonalTimeBlock,
  allBlocks: PersonalTimeBlock[],
  lang: AppLanguage,
): string {
  const anchor = block.anchor ?? 'fixed';
  const dur =
    anchor === 'fixed'
      ? getPersonalBlockDurationMinutes(block.startTime, block.endTime)
      : Math.max(5, Math.round(block.durationMinutes ?? 30));
  const durText = formatDurationMinutes(dur, lang);
  const gap = Math.max(0, Math.round(block.offsetMinutes ?? 0));
  const gapSuffix =
    gap > 0 ? tr(lang, ` (+${gap}m przerwy)`, ` (+${gap}m buffer)`) : '';

  if (anchor === 'before-school-start') {
    return tr(
      lang,
      `${durText} przed startem lekcji${gapSuffix}`,
      `${durText} before school starts${gapSuffix}`,
    );
  }
  if (anchor === 'after-school-end') {
    return tr(
      lang,
      `${durText} po zakończeniu lekcji${gapSuffix}`,
      `${durText} after school ends${gapSuffix}`,
    );
  }
  if (anchor === 'before-study') {
    return tr(
      lang,
      `${durText} przed nauką / zadaniami${gapSuffix}`,
      `${durText} before homework & study${gapSuffix}`,
    );
  }
  if (anchor === 'after-study') {
    return tr(
      lang,
      `${durText} po nauce / zadaniach${gapSuffix}`,
      `${durText} after homework & study${gapSuffix}`,
    );
  }
  if (anchor === 'before-block' || anchor === 'after-block') {
    const target = allBlocks.find((b) => b.id === block.anchorBlockId);
    const targetName = target?.name || tr(lang, 'innym blokiem', 'another block');
    return anchor === 'before-block'
      ? tr(
          lang,
          `${durText} przed: ${targetName}${gapSuffix}`,
          `${durText} before ${targetName}${gapSuffix}`,
        )
      : tr(
          lang,
          `${durText} po: ${targetName}${gapSuffix}`,
          `${durText} after ${targetName}${gapSuffix}`,
        );
  }
  return `${block.startTime}–${block.endTime} (${durText})`;
}

export function isBlockStudyAnchored(
  block: PersonalTimeBlock,
  allBlocks: PersonalTimeBlock[],
  seen = new Set<string>(),
): boolean {
  if (seen.has(block.id)) return false;
  seen.add(block.id);
  const anchor = block.anchor ?? 'fixed';
  if (anchor === 'before-study' || anchor === 'after-study') return true;
  if ((anchor === 'before-block' || anchor === 'after-block') && block.anchorBlockId) {
    const target = allBlocks.find((b) => b.id === block.anchorBlockId);
    return target ? isBlockStudyAnchored(target, allBlocks, seen) : false;
  }
  return false;
}

function isStudyAnchoredBlock(
  block: PersonalTimeBlock,
  activeById: Map<string, PersonalTimeBlock>,
  seen = new Set<string>(),
): boolean {
  if (seen.has(block.id)) return false;
  seen.add(block.id);
  const anchor = block.anchor ?? 'fixed';
  if (anchor === 'before-study' || anchor === 'after-study') return true;
  if ((anchor === 'before-block' || anchor === 'after-block') && block.anchorBlockId) {
    const target = activeById.get(block.anchorBlockId);
    return target ? isStudyAnchoredBlock(target, activeById, seen) : false;
  }
  return false;
}

export function describeStudyStartAnchor(settings: UserSettings, lang: AppLanguage): string {
  const anchor = settings.studyStartAnchor ?? 'fixed';
  const gap = Math.max(0, Math.round(settings.studyStartOffsetMinutes ?? 0));
  const gapSuffix = gap > 0 ? tr(lang, ` (+${gap} min przerwy)`, ` (+${gap}m rest)`) : '';

  if (anchor === 'after-school-end') {
    return tr(
      lang,
      `Po zakończeniu lekcji${gapSuffix}`,
      `After school ends${gapSuffix}`,
    );
  }
  if (anchor === 'after-block') {
    const blocks = settings.personalTimeBlocks ?? [];
    const target = blocks.find((b) => b.id === settings.studyStartBlockId);
    if (target) {
      return tr(
        lang,
        `Po: ${target.name}${gapSuffix}`,
        `After ${target.name}${gapSuffix}`,
      );
    }
  }
  return tr(
    lang,
    `Stała godzina (${settings.studyStartTime || '17:00'})`,
    `Fixed time (${settings.studyStartTime || '17:00'})`,
  );
}

function computeStudyStartMin(params: {
  settings?: UserSettings;
  lastLessonEndMin: number | null;
  resolvedNonStudyBlocks: ResolvedPersonalTimeBlock[];
}): number {
  const { settings, lastLessonEndMin, resolvedNonStudyBlocks } = params;
  const fallbackMin = hhmmToMinutes(settings?.studyStartTime || '17:00');
  const anchor = settings?.studyStartAnchor ?? 'fixed';
  const gap = Math.max(0, Math.round(settings?.studyStartOffsetMinutes ?? 0));

  if (anchor === 'after-school-end') {
    if (lastLessonEndMin !== null) {
      return Math.min(23 * 60 + 30, lastLessonEndMin + gap);
    }
    return fallbackMin;
  }

  if (anchor === 'after-block' && settings?.studyStartBlockId) {
    const hit = resolvedNonStudyBlocks.find((r) => r.block.id === settings.studyStartBlockId);
    if (hit) {
      const normalizedEnd = hit.endMin >= 1440 ? hit.endMin % 1440 : hit.endMin;
      return Math.min(23 * 60 + 30, normalizedEnd + gap);
    }
    return fallbackMin;
  }

  return fallbackMin;
}

function estimateStudyWindowForDate(params: {
  date: string;
  baseStudyStartMin: number;
  settings?: UserSettings;
  homework?: HomeworkItem[];
  tests?: SchoolTest[];
  studyPlans?: Record<string, StudyPlan>;
  nonStudyBusyIntervals: Array<{ start: number; end: number }>;
}): { startMin: number; endMin: number } {
  const {
    date,
    baseStudyStartMin,
    settings,
    homework = [],
    tests = [],
    studyPlans = {},
    nonStudyBusyIntervals,
  } = params;

  const baseStudyStart = baseStudyStartMin;
  const dailyStudyMins = Math.max(15, settings?.dailyStudyMinutes || 35);
  const freeTimeMins = Math.max(0, Math.round(settings?.freeTimeMinutes ?? 30));
  const showStudyBlocks = settings?.showStudyBlocks !== false;
  const DEFAULT_HW_BLOCK_MINS = 30;

  const relevantHw = homework.filter((hw) => {
    const diff = daysBetweenYmd(date, hw.dueDate);
    return diff >= 0 && diff <= 2;
  });

  const dayStudySessions =
    showStudyBlocks && settings && tests.length > 0
      ? getStudySessionsForDate(date, tests, settings)
      : [];

  if (relevantHw.length === 0 && dayStudySessions.length === 0) {
    const fallbackSlot = findNextFreeSlot(baseStudyStart, dailyStudyMins, nonStudyBusyIntervals);
    return { startMin: fallbackSlot.start, endMin: fallbackSlot.end };
  }

  let cursorMin = baseStudyStart;
  let firstStart: number | null = null;
  let lastEnd: number | null = null;

  const takeSlot = (duration: number) => {
    const slot = findNextFreeSlot(cursorMin, duration, nonStudyBusyIntervals);
    if (firstStart === null) firstStart = slot.start;
    lastEnd = slot.end;
    cursorMin = slot.end;
  };

  for (let i = 0; i < relevantHw.length; i += 1) {
    takeSlot(DEFAULT_HW_BLOCK_MINS);
  }

  let freeInserted = false;
  if (freeTimeMins > 0 && relevantHw.length > 0 && dayStudySessions.length > 0) {
    takeSlot(freeTimeMins);
    freeInserted = true;
  }

  dayStudySessions.forEach((session, idx) => {
    if (!freeInserted && freeTimeMins > 0 && relevantHw.length === 0 && idx === 1) {
      takeSlot(freeTimeMins);
      freeInserted = true;
    }
    const aiPlan = studyPlans[session.test.id];
    const matchedAiStep =
      aiPlan?.steps.find((s) => s.targetDate === date) ?? aiPlan?.steps[session.dayNumber - 1];
    const mins = matchedAiStep?.estimatedMinutes || dailyStudyMins;
    takeSlot(mins);
  });

  if (!freeInserted && freeTimeMins > 0 && (relevantHw.length > 0 || dayStudySessions.length > 0)) {
    takeSlot(freeTimeMins);
  }

  return {
    startMin: firstStart ?? baseStudyStart,
    endMin: lastEnd ?? baseStudyStart + dailyStudyMins,
  };
}

export function resolvePersonalBlocksForDate(params: {
  date: string;
  blocks?: PersonalTimeBlock[];
  timetable: LessonSlot[];
  exemptions?: ScheduleExemption[];
  lang?: AppLanguage;
  settings?: UserSettings;
  homework?: HomeworkItem[];
  tests?: SchoolTest[];
  studyPlans?: Record<string, StudyPlan>;
}): ResolvedPersonalTimeBlock[] {
  const {
    date,
    blocks,
    timetable,
    exemptions = [],
    lang = 'pl',
    settings,
    homework,
    tests,
    studyPlans,
  } = params;
  if (!Array.isArray(blocks) || blocks.length === 0) return [];

  const rawJsDow = parseYmd(date).getDay();
  const isoDow: RuleDayOfWeek = (rawJsDow === 0 ? 7 : rawJsDow) as RuleDayOfWeek;
  const active = blocks.filter(
    (b) => b.enabled && Array.isArray(b.daysOfWeek) && b.daysOfWeek.includes(isoDow),
  );
  if (active.length === 0) return [];

  const schedule = getDaySchedule(date, timetable, exemptions);
  const hasClasses = schedule.activeLessons.length > 0;
  const firstLessonStartMin = hasClasses
    ? hhmmToMinutes(schedule.activeLessons[0].startTime)
    : null;
  const lastLessonEndMin =
    hasClasses && schedule.dismissalTime ? hhmmToMinutes(schedule.dismissalTime) : null;

  const activeById = new Map<string, PersonalTimeBlock>();
  for (const b of active) activeById.set(b.id, b);

  const cache = new Map<string, ResolvedPersonalTimeBlock | null>();
  const visiting = new Set<string>();
  let computedStudyWindow: { startMin: number; endMin: number } | null = null;

  const resolveOne = (
    block: PersonalTimeBlock,
    allowStudyAnchors: boolean,
  ): ResolvedPersonalTimeBlock | null => {
    if (cache.has(block.id)) return cache.get(block.id) ?? null;
    if (visiting.has(block.id)) return null; // Break any accidental cycle safely
    const anchor = block.anchor ?? 'fixed';
    if (!allowStudyAnchors && (anchor === 'before-study' || anchor === 'after-study')) {
      return null;
    }

    visiting.add(block.id);

    const gap = Math.max(0, Math.round(block.offsetMinutes ?? 0));
    let startMin: number | null = null;
    let endMin: number | null = null;
    let durationMinutes = Math.max(5, Math.round(block.durationMinutes ?? 30));

    if (anchor === 'fixed') {
      startMin = hhmmToMinutes(block.startTime);
      durationMinutes = getPersonalBlockDurationMinutes(block.startTime, block.endTime);
      endMin = startMin + durationMinutes;
    } else if (anchor === 'before-school-start') {
      if (firstLessonStartMin !== null) {
        endMin = firstLessonStartMin - gap;
        startMin = endMin - durationMinutes;
      }
    } else if (anchor === 'after-school-end') {
      if (lastLessonEndMin !== null) {
        startMin = lastLessonEndMin + gap;
        endMin = startMin + durationMinutes;
      }
    } else if (anchor === 'before-study' && computedStudyWindow) {
      endMin = computedStudyWindow.startMin - gap;
      startMin = endMin - durationMinutes;
    } else if (anchor === 'after-study' && computedStudyWindow) {
      startMin = computedStudyWindow.endMin + gap;
      endMin = startMin + durationMinutes;
    } else if (anchor === 'before-block' && block.anchorBlockId) {
      const targetBlock = activeById.get(block.anchorBlockId);
      const resolvedTarget = targetBlock ? resolveOne(targetBlock, allowStudyAnchors) : null;
      if (resolvedTarget) {
        endMin = resolvedTarget.startMin - gap;
        startMin = endMin - durationMinutes;
      }
    } else if (anchor === 'after-block' && block.anchorBlockId) {
      const targetBlock = activeById.get(block.anchorBlockId);
      const resolvedTarget = targetBlock ? resolveOne(targetBlock, allowStudyAnchors) : null;
      if (resolvedTarget) {
        startMin = resolvedTarget.endMin + gap;
        endMin = startMin + durationMinutes;
      }
    }

    visiting.delete(block.id);

    if (startMin === null || endMin === null) {
      if (allowStudyAnchors) cache.set(block.id, null);
      return null;
    }

    const wrappedStart = ((startMin % 1440) + 1440) % 1440;
    const resolved: ResolvedPersonalTimeBlock = {
      block,
      startTime: minutesToHhmm(startMin),
      endTime: minutesToHhmm(endMin),
      startMin: wrappedStart,
      endMin: wrappedStart + durationMinutes,
      durationMinutes,
      anchorLabel: describePersonalBlockAnchor(block, blocks, lang),
    };
    cache.set(block.id, resolved);
    return resolved;
  };

  // Pass 1: resolve all blocks that do NOT depend on before-study / after-study
  const resolvedNonStudy: ResolvedPersonalTimeBlock[] = [];
  const nonStudyBusy: Array<{ start: number; end: number }> = [];
  if (firstLessonStartMin !== null && lastLessonEndMin !== null && lastLessonEndMin > firstLessonStartMin) {
    nonStudyBusy.push({ start: firstLessonStartMin, end: lastLessonEndMin });
  }
  for (const b of active) {
    if (isStudyAnchoredBlock(b, activeById)) continue;
    const res = resolveOne(b, false);
    if (res) {
      resolvedNonStudy.push(res);
      nonStudyBusy.push({ start: res.startMin, end: Math.min(1440, res.endMin) });
    }
  }

  // Pass 2: compute exact study/homework window using non-study blocks & study start anchor, then resolve study-anchored blocks
  const needsStudyWindow = active.some((b) => isStudyAnchoredBlock(b, activeById));
  if (needsStudyWindow) {
    const baseStudyStartMin = computeStudyStartMin({
      settings,
      lastLessonEndMin,
      resolvedNonStudyBlocks: resolvedNonStudy,
    });
    computedStudyWindow = estimateStudyWindowForDate({
      date,
      baseStudyStartMin,
      settings,
      homework,
      tests,
      studyPlans,
      nonStudyBusyIntervals: nonStudyBusy,
    });
  }

  const results: ResolvedPersonalTimeBlock[] = [];
  for (const b of active) {
    const res = resolveOne(b, true);
    if (res) results.push(res);
  }
  return results.sort((a, b) => a.startMin - b.startMin);
}

export function resolveStudyStartTimeForDate(params: {
  date: string;
  settings: UserSettings;
  timetable: LessonSlot[];
  exemptions?: ScheduleExemption[];
  lang?: AppLanguage;
}): { startMin: number; startTime: string; usedFallback: boolean } {
  const { date, settings, timetable, exemptions = [], lang = 'pl' } = params;
  const schedule = getDaySchedule(date, timetable, exemptions);
  const lastLessonEndMin =
    schedule.activeLessons.length > 0 && schedule.dismissalTime
      ? hhmmToMinutes(schedule.dismissalTime)
      : null;

  const nonStudyBlocks = (settings.personalTimeBlocks ?? []).filter(
    (b) => !isBlockStudyAnchored(b, settings.personalTimeBlocks ?? []),
  );
  const resolvedNonStudy = resolvePersonalBlocksForDate({
    date,
    blocks: nonStudyBlocks,
    timetable,
    exemptions,
    lang,
  });

  const anchor = settings.studyStartAnchor ?? 'fixed';
  const startMin = computeStudyStartMin({
    settings,
    lastLessonEndMin,
    resolvedNonStudyBlocks: resolvedNonStudy,
  });
  const usedFallback =
    (anchor === 'after-school-end' && lastLessonEndMin === null) ||
    (anchor === 'after-block' &&
      !resolvedNonStudy.some((r) => r.block.id === settings.studyStartBlockId));

  return {
    startMin,
    startTime: minutesToHhmm(startMin),
    usedFallback,
  };
}

export function getActivePersonalBlocksForDate(
  date: string,
  blocks?: PersonalTimeBlock[],
): PersonalTimeBlock[] {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];
  const rawJsDow = parseYmd(date).getDay();
  const isoDow: RuleDayOfWeek = (rawJsDow === 0 ? 7 : rawJsDow) as RuleDayOfWeek;
  return blocks
    .filter(
      (b) =>
        b.enabled &&
        Array.isArray(b.daysOfWeek) &&
        b.daysOfWeek.includes(isoDow),
    )
    .sort((a, b) => hhmmToMinutes(a.startTime) - hhmmToMinutes(b.startTime));
}

function findNextFreeSlot(
  desiredStart: number,
  duration: number,
  busyIntervals: Array<{ start: number; end: number }>,
): { start: number; end: number } {
  const sorted = [...busyIntervals].sort((a, b) => a.start - b.start);
  let cursor = desiredStart;
  for (let pass = 0; pass < sorted.length + 2; pass++) {
    const conflict = sorted.find((iv) => cursor < iv.end && cursor + duration > iv.start);
    if (!conflict) break;
    cursor = conflict.end;
  }
  return { start: cursor, end: cursor + duration };
}

export interface StudySessionForDate {
  test: SchoolTest;
  studyKey: string;
  phase: 'learn' | 'repeat';
  dayNumber: number;
  totalDays: number;
  learningDays: number;
  repeatingDays: number;
  daysUntilTest: number;
}

/**
 * Returns every test study session scheduled on `date` according to the student's
 * advance-day settings:
 * - First half rounded down (min 1 full day) = Learn
 * - Remaining days = Repeat what you learned
 */
export function getStudySessionsForDate(
  date: string,
  tests: SchoolTest[],
  settings: Pick<UserSettings, 'majorTestLeadDays' | 'quizLeadDays' | 'showStudyBlocks'>,
): StudySessionForDate[] {
  if (settings.showStudyBlocks === false) return [];
  const sessions: StudySessionForDate[] = [];

  for (const test of tests) {
    const totalDays = getTestLeadDays(test, settings.majorTestLeadDays, settings.quizLeadDays);
    const daysUntilTest = daysBetweenYmd(date, test.date);
    if (daysUntilTest < 1 || daysUntilTest > totalDays) continue;

    const dayNumber = totalDays - daysUntilTest + 1;
    const { learningDays, repeatingDays } = getStudyPhaseSplit(totalDays);
    const phase: 'learn' | 'repeat' = dayNumber <= learningDays ? 'learn' : 'repeat';

    sessions.push({
      test,
      studyKey: `study::${test.id}::${date}`,
      phase,
      dayNumber,
      totalDays,
      learningDays,
      repeatingDays,
      daysUntilTest,
    });
  }

  return sessions.sort((a, b) => a.daysUntilTest - b.daysUntilTest);
}

export interface MomentShortCard {
  id: string;
  kind: ShortCardKind;
  sectionId: string;
  phaseLabel: string;
  timeLabel: string;
  kicker: string;
  title: string;
  description: string;
  metaLine: string;
  tone: 'neutral' | 'amber' | 'crimson' | 'emerald' | 'blue';
  completed: boolean;
  toggleType?: 'pack' | 'smart' | 'oneoff' | 'homework' | 'study';
  toggleEntityId?: string;
  derivedTask?: DerivedSmartTask;
  testItem?: SchoolTest;
  actionLabel?: string;
  studyPhase?: 'learn' | 'repeat';
  studyDayNumber?: number;
  studyTotalDays?: number;
  studyTasks?: string[];
  studyMinutes?: number;
  milestoneComplete?: boolean;
  milestoneRemainingCount?: number;
  milestoneFirstUncheckedId?: string;
  nextSectionLabel?: string;
  personalBlockCategory?: PersonalBlockCategory;
  timeRangeLabel?: string;
}

export interface MomentFeedSection {
  id: string;
  title: string;
  timeLabel: string;
  items: MomentShortCard[];
  completedCount: number;
  checkableCount: number;
  allComplete: boolean;
  completionHeadline: string;
  completionSubtext: string;
  nextSectionLabel?: string;
}

export interface BuildMomentFeedParams {
  date: string;
  todayYmd: string;
  nextSchoolDayYmd: string;
  timetable: LessonSlot[];
  exemptions: ScheduleExemption[];
  prevPackingPlan?: DailyPackingPlan;
  packingPlan: DailyPackingPlan;
  nextPackingPlan: DailyPackingPlan;
  derivedTasks: DerivedSmartTask[];
  oneOffTasks: OneOffTask[];
  homework: HomeworkItem[];
  classifiedTests: ClassifiedTest[];
  commutePlaces: CommutePlace[];
  checkedPackIds: Record<string, boolean>;
  completedStudyIds: Record<string, boolean>;
  studyPlans: Record<string, StudyPlan>;
  settings: UserSettings;
}

function formatPackingNote(
  item: DailyPackingPlan['items'][number],
  lang: AppLanguage,
): string {
  const subjectLabel = item.subject || '';
  if (item.category === 'homework-supply') {
    return (
      item.detail ||
      (subjectLabel
        ? tr(lang, `Na pracę domową (${subjectLabel})`, `For ${subjectLabel} homework`)
        : tr(lang, 'Materiały na zadanie domowe', 'Homework supply'))
    );
  }
  if (item.category === 'message-extra') {
    return item.detail || tr(lang, 'Z wiadomości w Librusie', 'Requested in Librus notice');
  }
  if (item.category === 'test-prep') {
    return (
      item.detail ||
      (subjectLabel
        ? tr(lang, `Na sprawdzian (${subjectLabel})`, `For ${subjectLabel} test`)
        : tr(lang, 'Przygotowanie na sprawdzian', 'Test preparation'))
    );
  }
  if (item.category === 'essential') {
    return tr(lang, 'Codzienny niezbędnik', 'Daily essential');
  }
  if (item.category === 'custom') {
    return item.detail || tr(lang, 'Własny krok pakowania', 'Personal packing step');
  }
  return subjectLabel ? tr(lang, `Przedmiot: ${subjectLabel}`, `For ${subjectLabel}`) : '';
}

export function buildMomentFeedSections(params: BuildMomentFeedParams): MomentFeedSection[] {
  const {
    date,
    nextSchoolDayYmd,
    timetable,
    exemptions,
    prevPackingPlan,
    packingPlan,
    nextPackingPlan,
    derivedTasks,
    oneOffTasks,
    homework,
    classifiedTests,
    commutePlaces,
    checkedPackIds,
    completedStudyIds,
    studyPlans,
    settings,
  } = params;

  const lang: AppLanguage = settings.language || 'pl';
  const schedule = getDaySchedule(date, timetable, exemptions);
  const placesToday = getCommutePlacesForDate(date, commutePlaces);
  const rawSections: Array<
    Omit<MomentFeedSection, 'completedCount' | 'checkableCount' | 'allComplete' | 'nextSectionLabel'>
  > = [];

  const showMorningPacking =
    settings.packingSchedule === 'morning' || settings.packingSchedule === 'both';
  const showEveningPacking =
    settings.packingSchedule === 'evening' || settings.packingSchedule === 'both';
  const showUnpacking = settings.showUnpacking !== false;
  const showStudyBlocks = settings.showStudyBlocks !== false;
  const freeTimeMinutes = Math.max(0, Math.round(settings.freeTimeMinutes ?? 30));

  // Strictly private personal carved-out time blocks (automatically resolved relative to today's timetable & study window!)
  const resolvedPersonalBlocks = resolvePersonalBlocksForDate({
    date,
    blocks: settings.personalTimeBlocks,
    timetable,
    exemptions,
    lang,
    settings,
    homework,
    tests: classifiedTests,
    studyPlans,
  });
  const activePersonalById = new Map<string, PersonalTimeBlock>();
  for (const r of resolvedPersonalBlocks) activePersonalById.set(r.block.id, r.block);
  const resolvedNonStudyBlocks = resolvedPersonalBlocks.filter(
    (r) => !isStudyAnchoredBlock(r.block, activePersonalById),
  );
  const lastLessonEndMin =
    schedule.activeLessons.length > 0 && schedule.dismissalTime
      ? hhmmToMinutes(schedule.dismissalTime)
      : null;

  const schoolStartMin = schedule.activeLessons[0]?.startTime
    ? hhmmToMinutes(schedule.activeLessons[0].startTime)
    : 8 * 60;
  const studyStartMin = computeStudyStartMin({
    settings,
    lastLessonEndMin,
    resolvedNonStudyBlocks,
  });
  const packReminderMin = hhmmToMinutes(settings.packReminderTime || '20:00');
  const lateCutoffMin = Math.max(packReminderMin, studyStartMin + 60);

  const morningPersonalBlocks: ResolvedPersonalTimeBlock[] = [];
  const afterSchoolPersonalBlocks: ResolvedPersonalTimeBlock[] = [];
  const studyWindowPersonalBlocks: ResolvedPersonalTimeBlock[] = [];
  const latePersonalBlocks: ResolvedPersonalTimeBlock[] = [];

  for (const resolved of resolvedPersonalBlocks) {
    const { block, startMin } = resolved;
    const studyAnchored = isStudyAnchoredBlock(block, activePersonalById);
    if (block.category === 'sleep') {
      latePersonalBlocks.push(resolved);
    } else if (studyAnchored) {
      studyWindowPersonalBlocks.push(resolved);
    } else if (startMin >= lateCutoffMin) {
      latePersonalBlocks.push(resolved);
    } else if (block.anchor === 'before-school-start' || startMin < schoolStartMin) {
      morningPersonalBlocks.push(resolved);
    } else if (startMin < studyStartMin) {
      afterSchoolPersonalBlocks.push(resolved);
    } else {
      studyWindowPersonalBlocks.push(resolved);
    }
  }

  const buildPersonalBlockCard = (
    resolved: ResolvedPersonalTimeBlock,
    sectionId: string,
    phaseLabel: string,
  ): MomentShortCard => {
    const { block, startTime, endTime, durationMinutes, anchorLabel } = resolved;
    const entityId = `pblock::${block.id}::${date}`;
    const checked = Boolean(checkedPackIds[entityId]);
    const durLabel = formatDurationMinutes(durationMinutes, lang);
    const rangeLabel = `${startTime}–${endTime}`;
    const catLabel = personalBlockCategoryLabel(block.category, lang);
    const isRelative = block.anchor && block.anchor !== 'fixed';

    return {
      id: `feed-pblock-${block.id}-${date}`,
      kind: 'personal-block',
      sectionId,
      phaseLabel,
      timeLabel: startTime,
      timeRangeLabel: rangeLabel,
      personalBlockCategory: block.category,
      kicker: `${catLabel} · ${rangeLabel} · ${durLabel} · ${tr(lang, 'Prywatny blok', 'Private block')}`,
      title: block.name,
      description:
        block.note?.trim() ||
        (isRelative
          ? tr(
              lang,
              `Auto-dopasowane (${anchorLabel}) — prywatny blok w Twoim planie.`,
              `Auto-timed (${anchorLabel}) — private block in your personal plan.`,
            )
          : tr(
              lang,
              `Twój prywatny czas (${rangeLabel}, ${durLabel}) — niewidoczny dla klasy.`,
              `Carved out in your personal plan (${rangeLabel}, ${durLabel}) — private to you.`,
            )),
      metaLine: `${rangeLabel} · ${durLabel}`,
      tone: checked ? 'emerald' : block.category === 'sleep' ? 'blue' : 'neutral',
      completed: checked,
      toggleType: 'pack',
      toggleEntityId: entityId,
      actionLabel: checked
        ? tr(lang, 'Zaliczone', 'Done')
        : block.category === 'sleep'
          ? tr(lang, 'Idę spać', 'Ready for Bed')
          : tr(lang, 'Oznacz wykonane', 'Mark Done'),
    };
  };

  // 0. Morning Unpacking (remove items left from previous school day that aren't needed today)
  if (showMorningPacking && showUnpacking && prevPackingPlan && packingPlan.items.length > 0) {
    const morningUnpackItems = buildDailyUnpackItems({
      fromPlan: prevPackingPlan,
      toPlan: packingPlan,
      targetDate: date,
      lang,
    });
    if (morningUnpackItems.length > 0) {
      const unpackSecId = `sec-morning-unpack-${date}`;
      const total = morningUnpackItems.length;
      const phaseTitle = tr(lang, 'Rozpakowanie poranne', 'Morning Unpack');
      const items: MomentShortCard[] = morningUnpackItems.map((item, idx) => {
        const checked = Boolean(checkedPackIds[item.id]);
        return {
          id: `feed-morning-unpack-${item.id}`,
          kind: 'morning-unpack',
          sectionId: unpackSecId,
          phaseLabel: phaseTitle,
          timeLabel: '07:15',
          kicker: tr(
            lang,
            `Wyjmij z plecaka · Krok ${idx + 1} z ${total}`,
            `Unpack Bag · Step ${idx + 1} of ${total}`,
          ),
          title: item.label,
          description: item.reason,
          metaLine: item.subject
            ? tr(lang, `Zbędne (${item.subject})`, `Not needed (${item.subject})`)
            : tr(lang, 'Wyjmij z plecaka', 'Remove from bag'),
          tone: checked ? 'emerald' : 'amber',
          completed: checked,
          toggleType: 'pack',
          toggleEntityId: item.id,
          actionLabel: checked
            ? tr(lang, 'Wyjęte', 'Removed')
            : tr(lang, 'Wyjmij z plecaka', 'Take Out'),
        };
      });

      rawSections.push({
        id: unpackSecId,
        title: phaseTitle,
        timeLabel: '07:15',
        items,
        completionHeadline: tr(lang, 'Zbędne rzeczy wyjęte!', 'Unnecessary items removed!'),
        completionSubtext: tr(
          lang,
          'Plecak jest lżejszy — teraz spakuj rzeczy na dziś.',
          'Your bag is lighter — now pack what you need for today.',
        ),
      });
    }
  }

  // 1. Morning Packing
  if (showMorningPacking && packingPlan.items.length > 0) {
    const secId = `sec-morning-${date}`;
    const total = packingPlan.items.length;
    const phaseTitle = tr(lang, 'Pakowanie poranne', 'Morning Packing');
    const items: MomentShortCard[] = packingPlan.items.map((item, idx) => {
      const isSpecial = item.category === 'homework-supply' || item.category === 'message-extra';
      const checked = Boolean(checkedPackIds[item.id]);
      const subjectLabel = item.subject || '';

      return {
        id: `feed-morning-pack-${item.id}`,
        kind: 'morning-pack',
        sectionId: secId,
        phaseLabel: phaseTitle,
        timeLabel: '07:20',
        kicker: tr(
          lang,
          `Pakowanie poranne · Krok ${idx + 1} z ${total}`,
          `Morning Packing · Step ${idx + 1} of ${total}`,
        ),
        title: item.label,
        description: formatPackingNote(item, lang),
        metaLine: subjectLabel || tr(lang, 'Niezbędnik', 'Essential'),
        tone: checked ? 'emerald' : isSpecial ? 'amber' : 'blue',
        completed: checked,
        toggleType: 'pack',
        toggleEntityId: item.id,
        actionLabel: checked
          ? tr(lang, 'Spakowane', 'Packed')
          : tr(lang, 'Spakuj', 'Pack It'),
      };
    });

    rawSections.push({
      id: secId,
      title: phaseTitle,
      timeLabel: '07:20',
      items,
      completionHeadline: tr(lang, 'Plecak spakowany!', 'Packing complete!'),
      completionSubtext: tr(
        lang,
        'Czas na śniadanie i wyjście do szkoły.',
        'Time for breakfast and school.',
      ),
    });
  }

  // Helper to classify a DerivedSmartTask into morning / after-school / evening
  const dayDerivedAll = derivedTasks.filter((t) => t.targetDate === date);
  const classifyDerivedPhase = (task: DerivedSmartTask): 'morning' | 'after' | 'evening' => {
    if (task.timing === 'before-school') return 'morning';
    if (task.timing === 'evening') return 'evening';
    if (task.timing === 'custom') {
      if (task.triggerTime < '08:30') return 'morning';
      if (task.triggerTime >= '17:00') return 'evening';
      return 'after';
    }
    return 'after';
  };

  const buildDerivedCard = (
    task: DerivedSmartTask,
    sectionId: string,
    phaseLabel: string,
  ): MomentShortCard => {
    const isBuyErrand = task.supplies.length > 0 && Boolean(task.placeName);
    const isNotifyOnly = task.effectKind === 'notify-only';
    const kickerPrefix = isNotifyOnly
      ? tr(lang, 'Powiadomienie z reguły', 'Rule Alert')
      : tr(lang, 'Reguła automatyczna', 'Auto Rule');
    return {
      id: `feed-smart-${task.id}`,
      kind: 'dismissal-errand',
      sectionId,
      phaseLabel,
      timeLabel: task.triggerTime,
      kicker: `${kickerPrefix} · ${task.triggerTime}`,
      title: task.title,
      description: task.reason,
      metaLine: task.placeName || task.ruleName,
      tone: task.completed ? 'emerald' : isNotifyOnly ? 'blue' : 'amber',
      completed: task.completed,
      toggleType: 'smart',
      toggleEntityId: task.id,
      derivedTask: task,
      actionLabel: task.completed
        ? isBuyErrand
          ? tr(lang, 'Kupione', 'Bought')
          : tr(lang, 'Zrobione', 'Done')
        : isBuyErrand
          ? tr(lang, 'Oznacz kupione', 'Mark Bought')
          : isNotifyOnly
            ? tr(lang, 'Potwierdź', 'Acknowledge')
            : tr(lang, 'Oznacz zrobione', 'Mark Done'),
    };
  };

  const morningDerived = dayDerivedAll.filter((t) => classifyDerivedPhase(t) === 'morning');
  if (morningDerived.length > 0 || morningPersonalBlocks.length > 0) {
    const preSecId = `sec-before-school-${date}`;
    const preTitle = tr(lang, 'Przed szkołą', 'Before School');
    const preItems: MomentShortCard[] = [
      ...morningPersonalBlocks.map((b) => buildPersonalBlockCard(b, preSecId, preTitle)),
      ...morningDerived.map((t) => buildDerivedCard(t, preSecId, preTitle)),
    ].sort((a, b) => hhmmToMinutes(a.timeLabel) - hhmmToMinutes(b.timeLabel));
    rawSections.push({
      id: preSecId,
      title: preTitle,
      timeLabel: preItems[0].timeLabel,
      items: preItems,
      completionHeadline: tr(lang, 'Poranek gotowy!', 'Morning routine done!'),
      completionSubtext: tr(lang, 'Wszystko sprawdzone przed wyjściem.', 'All morning checks complete.'),
    });
  }

  // 2. At School
  const schoolItems: MomentShortCard[] = [];
  const schoolSecId = `sec-school-${date}`;
  const schoolOneOffs = oneOffTasks.filter(
    (t) =>
      t.location === 'at-school' &&
      (t.targetDate === date ||
        (!t.completed &&
          daysBetweenYmd(t.targetDate, date) >= 0 &&
          daysBetweenYmd(date, t.deadlineDate) >= 0)),
  );

  for (const task of schoolOneOffs) {
    schoolItems.push({
      id: `feed-oneoff-school-${task.id}`,
      kind: 'urgent-oneoff',
      sectionId: schoolSecId,
      phaseLabel: tr(lang, 'W szkole', 'At School'),
      timeLabel: task.triggerTime || '09:45',
      kicker: tr(lang, 'W szkole · Pilne', 'At School · Urgent'),
      title: task.title,
      description: task.beforeSubject
        ? tr(
            lang,
            `Załatw w szkole przed lekcją: ${task.beforeSubject} (${formatShortDate(task.deadlineDate, lang)})`,
            `Do this at school before ${task.beforeSubject} (${formatShortDate(task.deadlineDate, lang)})`,
          )
        : task.notes ||
          tr(
            lang,
            `Zrób w szkole najpóźniej do ${formatShortDate(task.deadlineDate, lang)}`,
            `Finish at school by ${formatShortDate(task.deadlineDate, lang)}`,
          ),
      metaLine: tr(
        lang,
        `Do ${formatShortDate(task.deadlineDate, lang)}`,
        `By ${formatShortDate(task.deadlineDate, lang)}`,
      ),
      tone: task.completed ? 'emerald' : 'crimson',
      completed: task.completed,
      toggleType: 'oneoff',
      toggleEntityId: task.id,
      actionLabel: task.completed
        ? tr(lang, 'Zrobione', 'Done')
        : tr(lang, 'Oznacz zrobione', 'Mark Done'),
    });
  }

  if (settings.showLessonsInFeed) {
    for (const lesson of schedule.activeLessons) {
      const hasRoom = lesson.room && lesson.room !== 'TBA' && lesson.room !== '—';
      const roomText = hasRoom ? `${tr(lang, 'Sala', 'Room')} ${lesson.room}` : '';
      const teacherText =
        lesson.teacher && lesson.teacher !== 'Teacher' && lesson.teacher !== 'Nauczyciel'
          ? lesson.teacher
          : '';
      schoolItems.push({
        id: `feed-lesson-${lesson.id}`,
        kind: 'lesson',
        sectionId: schoolSecId,
        phaseLabel: tr(lang, `Lekcja ${lesson.lessonNumber}`, `Period ${lesson.lessonNumber}`),
        timeLabel: lesson.startTime,
        kicker: `${tr(lang, `Lekcja ${lesson.lessonNumber}`, `Period ${lesson.lessonNumber}`)} · ${lesson.startTime}–${lesson.endTime}${roomText ? ` · ${roomText}` : ''}`,
        title: lesson.subject,
        description: lesson.isSubstitution
          ? tr(lang, 'Zaplanowane zastępstwo', 'Substitution scheduled')
          : teacherText || (roomText ? tr(lang, `Zajęcia w: ${roomText}`, `Class in ${roomText}`) : ''),
        metaLine: roomText,
        tone: lesson.isSubstitution ? 'amber' : 'blue',
        completed: false,
      });
    }
  }

  if (schoolItems.length > 0) {
    rawSections.push({
      id: schoolSecId,
      title: tr(lang, 'W szkole', 'At School'),
      timeLabel: schedule.activeLessons[0]?.startTime || '08:00',
      items: schoolItems,
      completionHeadline: tr(lang, 'Sprawy w szkole załatwione!', 'School tasks done!'),
      completionSubtext: schedule.dismissalTime
        ? tr(
            lang,
            `Koniec lekcji o ${schedule.dismissalTime}.`,
            `Ready for dismissal at ${schedule.dismissalTime}.`,
          )
        : tr(lang, 'Wszystkie sprawy w szkole odhaczone.', 'All in-school tasks cleared.'),
    });
  }

  // 3. Right After Dismissal
  const afterItems: MomentShortCard[] = [];
  const afterSecId = `sec-after-${date}`;
  const dayDerivedAfter = dayDerivedAll.filter((t) => classifyDerivedPhase(t) === 'after');
  for (const task of dayDerivedAfter) {
    afterItems.push(buildDerivedCard(task, afterSecId, tr(lang, 'Po szkole', 'After School')));
  }

  const afterSchoolOneOffs = oneOffTasks.filter(
    (t) => t.location === 'after-school' && t.targetDate === date,
  );
  for (const task of afterSchoolOneOffs) {
    afterItems.push({
      id: `feed-oneoff-after-${task.id}`,
      kind: 'urgent-oneoff',
      sectionId: afterSecId,
      phaseLabel: tr(lang, 'Po szkole', 'After School'),
      timeLabel: task.triggerTime || schedule.dismissalTime || '14:30',
      kicker: `${tr(lang, 'Po szkole', 'After School')} · ${task.triggerTime || schedule.dismissalTime || '14:30'}`,
      title: task.title,
      description:
        task.notes || tr(lang, 'Załatw zaraz po wyjściu ze szkoły', 'Handle right after dismissal'),
      metaLine: tr(
        lang,
        `Do ${formatShortDate(task.deadlineDate, lang)}`,
        `By ${formatShortDate(task.deadlineDate, lang)}`,
      ),
      tone: task.completed ? 'emerald' : 'amber',
      completed: task.completed,
      toggleType: 'oneoff',
      toggleEntityId: task.id,
      actionLabel: task.completed
        ? tr(lang, 'Zrobione', 'Done')
        : tr(lang, 'Oznacz zrobione', 'Mark Done'),
    });
  }

  for (const block of afterSchoolPersonalBlocks) {
    afterItems.push(
      buildPersonalBlockCard(block, afterSecId, tr(lang, 'Po szkole', 'After School')),
    );
  }

  if (afterItems.length > 0) {
    afterItems.sort((a, b) => hhmmToMinutes(a.timeLabel) - hhmmToMinutes(b.timeLabel));
    rawSections.push({
      id: afterSecId,
      title: tr(lang, 'Po szkole', 'After School'),
      timeLabel: afterItems[0]?.timeLabel || schedule.dismissalTime || '14:30',
      items: afterItems,
      completionHeadline: tr(lang, 'Sprawy po szkole załatwione!', 'After-school routine done!'),
      completionSubtext:
        placesToday.length > 0
          ? tr(
              lang,
              `Załatwione po drodze (${placesToday[0].name}) — wracaj do domu i odpocznij.`,
              `Finished stopping by ${placesToday[0].name} — head home and unwind.`,
            )
          : tr(lang, 'Czas na domowy plan popołudniowy.', 'Ready for your afternoon plan.'),
    });
  }

  // 4. Study, Homework, Free Time & Carved-Out Personal Blocks
  // Schedule Homework -> Free Time -> Test Prep while routing around carved-out personal blocks (e.g. Dinner, Transit, Sleep)
  const studyItems: MomentShortCard[] = [];
  const studySecId = `sec-study-${date}`;

  const eveningDerived = dayDerivedAll.filter((t) => classifyDerivedPhase(t) === 'evening');
  for (const task of eveningDerived) {
    studyItems.push(buildDerivedCard(task, studySecId, tr(lang, 'Wieczorem', 'Evening')));
  }

  // Build busy intervals from school hours + non-study-anchored personal time blocks so study/homework/free-time never collide with lessons, dinner, transit, or sleep
  const busyIntervals: Array<{ start: number; end: number }> = [
    ...(lastLessonEndMin !== null && lastLessonEndMin > schoolStartMin
      ? [{ start: schoolStartMin, end: lastLessonEndMin }]
      : []),
    ...resolvedPersonalBlocks
      .filter((r) => !isStudyAnchoredBlock(r.block, activePersonalById))
      .map((r) => ({
        start: r.startMin,
        end: Math.min(1440, r.endMin),
      })),
  ];

  for (const block of studyWindowPersonalBlocks) {
    studyItems.push(
      buildPersonalBlockCard(block, studySecId, tr(lang, 'Prywatny blok', 'Personal Block')),
    );
  }

  const relevantHw = homework.filter((hw) => {
    const diff = daysBetweenYmd(date, hw.dueDate);
    return diff >= 0 && diff <= 2;
  });

  const dayStudySessions = showStudyBlocks
    ? getStudySessionsForDate(date, classifiedTests, settings)
    : [];

  let cursorMin = studyStartMin;
  const DEFAULT_HW_BLOCK_MINS = 30;

  // 4a. Schedule Homework first
  for (const hw of relevantHw) {
    const slot = findNextFreeSlot(cursorMin, DEFAULT_HW_BLOCK_MINS, busyIntervals);
    cursorMin = slot.end;
    const startHhmm = minutesToHhmm(slot.start);
    const endHhmm = minutesToHhmm(slot.end);
    const rangeLabel = `${startHhmm}–${endHhmm}`;

    const diff = daysBetweenYmd(date, hw.dueDate);
    const dueText =
      diff === 0
        ? tr(lang, 'Na dziś', 'Due today')
        : diff === 1
          ? tr(lang, 'Na jutro', 'Due tomorrow')
          : tr(
              lang,
              `Na ${formatShortDate(hw.dueDate, lang)}`,
              `Due ${formatShortDate(hw.dueDate, lang)}`,
            );
    studyItems.push({
      id: `feed-hw-${hw.id}`,
      kind: 'homework',
      sectionId: studySecId,
      phaseLabel: tr(lang, 'Praca domowa', 'Homework'),
      timeLabel: startHhmm,
      timeRangeLabel: rangeLabel,
      kicker: `${hw.subject} · ${rangeLabel} · ${dueText}`,
      title: hw.title,
      description:
        hw.neededSupplies.length > 0
          ? tr(
              lang,
              `Potrzebne materiały: ${hw.neededSupplies.join(', ')}`,
              `Supplies needed: ${hw.neededSupplies.join(', ')}`,
            )
          : hw.notes || '',
      metaLine: `${rangeLabel} · ${dueText}`,
      tone: hw.completed ? 'emerald' : 'blue',
      completed: hw.completed,
      toggleType: 'homework',
      toggleEntityId: hw.id,
      actionLabel: hw.completed
        ? tr(lang, 'Gotowe', 'Finished')
        : tr(lang, 'Oznacz zrobione', 'Mark Done'),
    });
  }

  const pushFreeTimeCard = (slotIdx: number, contextDescription: string) => {
    if (freeTimeMinutes <= 0) return;
    const slot = findNextFreeSlot(cursorMin, freeTimeMinutes, busyIntervals);
    cursorMin = slot.end;
    const startHhmm = minutesToHhmm(slot.start);
    const endHhmm = minutesToHhmm(slot.end);
    const rangeLabel = `${startHhmm}–${endHhmm}`;
    const durLabel = formatDurationMinutes(freeTimeMinutes, lang);
    const freeEntityId = `free::${date}::${slotIdx}`;
    const checked = Boolean(checkedPackIds[freeEntityId]);

    studyItems.push({
      id: `feed-free-time-${date}-${slotIdx}`,
      kind: 'free-time',
      sectionId: studySecId,
      phaseLabel: tr(lang, 'Czas wolny', 'Free Time'),
      timeLabel: startHhmm,
      timeRangeLabel: rangeLabel,
      kicker: tr(
        lang,
        `Czas wolny · ${rangeLabel} · ${durLabel} · Prywatne`,
        `Free Time · ${rangeLabel} · ${durLabel} · Personal`,
      ),
      title: tr(lang, `Czas wolny (${durLabel})`, `Free Time (${durLabel})`),
      description: contextDescription,
      metaLine: `${rangeLabel} · ${durLabel}`,
      tone: checked ? 'emerald' : 'emerald',
      completed: checked,
      toggleType: 'pack',
      toggleEntityId: freeEntityId,
      actionLabel: checked
        ? tr(lang, 'Przerwa zaliczona', 'Break Taken')
        : tr(lang, 'Koniec przerwy', 'Done Resting'),
    });
  };

  // 4b. Place Free Time right between Homework and Test Preparation
  let freeTimeInserted = false;
  if (freeTimeMinutes > 0 && relevantHw.length > 0 && dayStudySessions.length > 0) {
    pushFreeTimeCard(
      0,
      tr(
        lang,
        'Zaplanowana przerwa między pracą domową a nauką do sprawdzianów.',
        'Scheduled break placed between your homework and test preparation.',
      ),
    );
    freeTimeInserted = true;
  }

  // 4c. Schedule Test Preparation sessions (Learn / Repeat)
  dayStudySessions.forEach((session, sIdx) => {
    // If there was no homework but multiple study sessions, insert Free Time between them
    if (!freeTimeInserted && freeTimeMinutes > 0 && relevantHw.length === 0 && sIdx === 1) {
      pushFreeTimeCard(
        0,
        tr(
          lang,
          'Zaplanowana przerwa między blokami nauki do sprawdzianów.',
          'Scheduled free-time break between your test-prep sessions.',
        ),
      );
      freeTimeInserted = true;
    }

    const { test, studyKey, phase, dayNumber, totalDays, daysUntilTest } = session;
    const isDone = Boolean(completedStudyIds[studyKey]);
    const aiPlan = studyPlans[test.id];
    const matchedAiStep =
      aiPlan?.steps.find((s) => s.targetDate === date) ?? aiPlan?.steps[dayNumber - 1];
    const sessionMins = matchedAiStep?.estimatedMinutes || settings.dailyStudyMinutes;
    const slot = findNextFreeSlot(cursorMin, sessionMins, busyIntervals);
    cursorMin = slot.end;
    const startHhmm = minutesToHhmm(slot.start);
    const endHhmm = minutesToHhmm(slot.end);
    const rangeLabel = `${startHhmm}–${endHhmm}`;

    const phaseVerb =
      phase === 'learn' ? tr(lang, 'Nauka', 'Learn') : tr(lang, 'Powtórka', 'Repeat');
    const countdownText =
      daysUntilTest === 1
        ? tr(lang, 'Sprawdzian jutro', 'Test tomorrow')
        : tr(lang, `${test.category} za ${daysUntilTest} dni`, `${test.category} in ${daysUntilTest}d`);
    const scopeSummary =
      test.description && test.description.trim().toLowerCase() !== test.title.trim().toLowerCase()
        ? test.description.trim()
        : '';

    const defaultFocus =
      phase === 'learn'
        ? tr(
            lang,
            `Nauka nowego materiału (${sessionMins} min)${scopeSummary ? ` — ${scopeSummary}` : ''}`,
            `Learn new material (${sessionMins} min)${scopeSummary ? ` — ${scopeSummary}` : ''}`,
          )
        : tr(
            lang,
            `Powtórz z pamięci to, czego się nauczyłeś (${sessionMins} min)${scopeSummary ? ` — ${scopeSummary}` : ''}`,
            `Repeat what you learned from memory (${sessionMins} min)${scopeSummary ? ` — ${scopeSummary}` : ''}`,
          );

    const description = matchedAiStep
      ? `${matchedAiStep.focus} · ${sessionMins} min`
      : defaultFocus;

    studyItems.push({
      id: `feed-study-${test.id}-${date}`,
      kind: 'test-study',
      sectionId: studySecId,
      phaseLabel: phaseVerb,
      timeLabel: startHhmm,
      timeRangeLabel: rangeLabel,
      kicker: tr(
        lang,
        `${phaseVerb} · ${rangeLabel} · Dzień ${dayNumber} z ${totalDays} · ${countdownText}`,
        `${phaseVerb} · ${rangeLabel} · Day ${dayNumber} of ${totalDays} · ${countdownText}`,
      ),
      title: `${phaseVerb} — ${test.subject}: ${test.title}`,
      description,
      metaLine: `${rangeLabel} · ${sessionMins} min`,
      tone: isDone ? 'emerald' : phase === 'learn' ? 'blue' : 'amber',
      completed: isDone,
      toggleType: 'study',
      toggleEntityId: studyKey,
      testItem: test,
      studyPhase: phase,
      studyDayNumber: dayNumber,
      studyTotalDays: totalDays,
      studyTasks: matchedAiStep?.tasks,
      studyMinutes: sessionMins,
      actionLabel: isDone
        ? tr(lang, 'Przerobione', 'Studied')
        : phase === 'learn'
          ? tr(lang, 'Koniec nauki', 'Done Learning')
          : tr(lang, 'Koniec powtórki', 'Done Repeating'),
    });
  });

  // If only homework OR only a single test-prep session exists today, still schedule the student's Free Time right after it
  if (!freeTimeInserted && freeTimeMinutes > 0 && (relevantHw.length > 0 || dayStudySessions.length > 0)) {
    pushFreeTimeCard(
      0,
      relevantHw.length > 0
        ? tr(
            lang,
            'Twój zaplanowany czas wolny po pracy domowej.',
            'Your scheduled free time right after homework.',
          )
        : tr(
            lang,
            'Twój zaplanowany czas wolny po nauce do sprawdzianu.',
            'Your scheduled free time right after test preparation.',
          ),
    );
  }

  const homeOneOffs = oneOffTasks.filter(
    (t) => (t.location === 'at-home' || t.location === 'anywhere') && t.targetDate === date,
  );
  for (const task of homeOneOffs) {
    studyItems.push({
      id: `feed-oneoff-home-${task.id}`,
      kind: 'urgent-oneoff',
      sectionId: studySecId,
      phaseLabel: tr(lang, 'W domu', 'At Home'),
      timeLabel: task.triggerTime || minutesToHhmm(cursorMin),
      kicker:
        task.priority === 'urgent'
          ? tr(lang, 'W domu · Pilne', 'At Home · Urgent')
          : tr(lang, 'W domu', 'At Home'),
      title: task.title,
      description: task.notes || '',
      metaLine: tr(
        lang,
        `Do ${formatShortDate(task.deadlineDate, lang)}`,
        `By ${formatShortDate(task.deadlineDate, lang)}`,
      ),
      tone: task.completed ? 'emerald' : 'blue',
      completed: task.completed,
      toggleType: 'oneoff',
      toggleEntityId: task.id,
      actionLabel: task.completed
        ? tr(lang, 'Zrobione', 'Done')
        : tr(lang, 'Oznacz zrobione', 'Mark Done'),
    });
  }

  if (studyItems.length > 0) {
    studyItems.sort((a, b) => hhmmToMinutes(a.timeLabel) - hhmmToMinutes(b.timeLabel));
    rawSections.push({
      id: studySecId,
      title:
        freeTimeMinutes > 0 && (relevantHw.length > 0 || dayStudySessions.length > 0)
          ? tr(lang, 'Zadania, czas wolny i nauka', 'Homework, Free Time & Study')
          : tr(lang, 'Nauka i zadania', 'Study & Homework'),
      timeLabel: studyItems[0]?.timeLabel || settings.studyStartTime,
      items: studyItems,
      completionHeadline: tr(lang, 'Popołudniowy plan gotowy!', 'Afternoon plan complete!'),
      completionSubtext: showEveningPacking
        ? tr(lang, 'Czas spakować plecak na następny dzień.', 'Time to prep your bag for tomorrow.')
        : tr(lang, 'Wszystko na dziś zrobione — miłego wieczoru.', 'All caught up for today — enjoy your evening.'),
    });
  }

  // 4.5. Unpack Tonight (remove items from today's bag — or Friday's bag on weekends — that aren't needed on the next school day)
  const unpackSourcePlan =
    packingPlan.items.length > 0 ? packingPlan : prevPackingPlan;
  if (showEveningPacking && showUnpacking && unpackSourcePlan && nextPackingPlan.items.length > 0) {
    const eveningUnpackItems = buildDailyUnpackItems({
      fromPlan: unpackSourcePlan,
      toPlan: nextPackingPlan,
      targetDate: nextSchoolDayYmd,
      lang,
    });
    if (eveningUnpackItems.length > 0) {
      const eveningUnpackSecId = `sec-evening-unpack-${nextSchoolDayYmd}`;
      const total = eveningUnpackItems.length;
      const nextDayName = formatWeekdayLong(nextSchoolDayYmd, lang);
      const phaseTitle = tr(
        lang,
        `Wyjmij z plecaka (zbędne na: ${nextDayName})`,
        `Unpack before ${nextDayName}`,
      );
      const items: MomentShortCard[] = eveningUnpackItems.map((item, idx) => {
        const checked = Boolean(checkedPackIds[item.id]);
        return {
          id: `feed-evening-unpack-${item.id}`,
          kind: 'evening-unpack',
          sectionId: eveningUnpackSecId,
          phaseLabel: phaseTitle,
          timeLabel: settings.packReminderTime,
          kicker: tr(
            lang,
            `Wyjmij zbędne na ${nextDayName} · Krok ${idx + 1} z ${total}`,
            `Unpack for ${nextDayName} · Step ${idx + 1} of ${total}`,
          ),
          title: item.label,
          description: item.reason,
          metaLine: item.subject
            ? tr(lang, `Zbędne (${item.subject})`, `Not needed (${item.subject})`)
            : tr(lang, 'Wyjmij z plecaka', 'Remove from bag'),
          tone: checked ? 'emerald' : 'amber',
          completed: checked,
          toggleType: 'pack',
          toggleEntityId: item.id,
          actionLabel: checked
            ? tr(lang, 'Wyjęte', 'Removed')
            : tr(lang, 'Wyjmij z plecaka', 'Take Out'),
        };
      });

      rawSections.push({
        id: eveningUnpackSecId,
        title: phaseTitle,
        timeLabel: settings.packReminderTime,
        items,
        completionHeadline: tr(lang, 'Zbędne rzeczy wyjęte!', 'Unnecessary items removed!'),
        completionSubtext: tr(
          lang,
          `Plecak jest oczyszczony — spakuj rzeczy na ${nextDayName}.`,
          `Your bag is clear — ready to pack for ${nextDayName}.`,
        ),
      });
    }
  }

  // 5. Pack Tonight for Next School Day
  if (showEveningPacking && nextPackingPlan.items.length > 0) {
    const eveningSecId = `sec-evening-${nextSchoolDayYmd}`;
    const total = nextPackingPlan.items.length;
    const nextDayName = formatWeekdayLong(nextSchoolDayYmd, lang);
    const eveningTitle = tr(lang, `Pakowanie na: ${nextDayName}`, `Pack for ${nextDayName}`);
    const items: MomentShortCard[] = nextPackingPlan.items.map((item, idx) => {
      const isSpecial = item.category === 'homework-supply' || item.category === 'message-extra';
      const checked = Boolean(checkedPackIds[item.id]);
      const subjectLabel = item.subject || '';

      return {
        id: `feed-evening-pack-${item.id}`,
        kind: 'evening-pack',
        sectionId: eveningSecId,
        phaseLabel: eveningTitle,
        timeLabel: settings.packReminderTime,
        kicker: tr(
          lang,
          `Pakowanie na: ${nextDayName} · Krok ${idx + 1} z ${total}`,
          `Pack for ${nextDayName} · Step ${idx + 1} of ${total}`,
        ),
        title: item.label,
        description: formatPackingNote(item, lang),
        metaLine: subjectLabel || tr(lang, 'Niezbędnik', 'Essential'),
        tone: checked ? 'emerald' : isSpecial ? 'amber' : 'blue',
        completed: checked,
        toggleType: 'pack',
        toggleEntityId: item.id,
        actionLabel: checked
          ? tr(lang, 'Spakowane', 'Packed')
          : tr(lang, 'Spakuj', 'Pack It'),
      };
    });

    rawSections.push({
      id: eveningSecId,
      title: eveningTitle,
      timeLabel: settings.packReminderTime,
      items,
      completionHeadline: tr(
        lang,
        `Plecak na ${nextDayName} spakowany!`,
        `Packing complete for ${nextDayName}!`,
      ),
      completionSubtext: tr(
        lang,
        'Twój plecak jest gotowy — miłego wieczoru.',
        'Your bag is ready — enjoy the rest of your evening.',
      ),
    });
  }

  // 6. Late Evening & Sleep (Personal carved-out blocks)
  if (latePersonalBlocks.length > 0) {
    const nightSecId = `sec-night-${date}`;
    const nightTitle = tr(lang, 'Wieczór i sen (osobiste)', 'Evening & Sleep (Personal)');
    const nightItems = latePersonalBlocks
      .map((b) => buildPersonalBlockCard(b, nightSecId, nightTitle))
      .sort((a, b) => hhmmToMinutes(a.timeLabel) - hhmmToMinutes(b.timeLabel));

    rawSections.push({
      id: nightSecId,
      title: nightTitle,
      timeLabel: nightItems[0].timeLabel,
      items: nightItems,
      completionHeadline: tr(lang, 'Dobranoc!', 'Good night!'),
      completionSubtext: tr(
        lang,
        'Twój osobisty plan na dziś został zakończony.',
        'Your personal day plan is complete — rest well.',
      ),
    });
  }

  return rawSections.map((sec, idx) => {
    const checkable = sec.items.filter((i) => Boolean(i.toggleType));
    const completedCount = checkable.filter((i) => i.completed).length;
    const allComplete = checkable.length > 0 && completedCount === checkable.length;
    const nextSec = rawSections[idx + 1];
    return {
      ...sec,
      completedCount,
      checkableCount: checkable.length,
      allComplete,
      nextSectionLabel: nextSec ? nextSec.title : undefined,
    };
  });
}

/**
 * Builds the flat one-item-at-a-time vertical Shorts sequence, inserting
 * clean section-end milestone slides right between sections.
 */
export function buildMomentShortsStream(params: BuildMomentFeedParams): MomentShortCard[] {
  const lang: AppLanguage = params.settings.language || 'pl';
  const sections = buildMomentFeedSections(params);
  const stream: MomentShortCard[] = [];

  for (const sec of sections) {
    stream.push(...sec.items);

    const remainingItems = sec.items.filter((i) => Boolean(i.toggleType) && !i.completed);
    const remainingCount = remainingItems.length;

    stream.push({
      id: `milestone-${sec.id}`,
      kind: 'section-end',
      sectionId: sec.id,
      phaseLabel: sec.title,
      timeLabel: sec.timeLabel,
      kicker: sec.allComplete
        ? tr(lang, `${sec.title} · Gotowe`, `${sec.title} · Complete`)
        : tr(lang, `Koniec etapu: ${sec.title}`, `End of ${sec.title}`),
      title: sec.allComplete
        ? sec.completionHeadline
        : remainingCount > 0
          ? tr(
              lang,
              `Zostało ${remainingCount} ${remainingCount === 1 ? 'element' : remainingCount < 5 ? 'elementy' : 'elementów'} (${sec.title})`,
              `${remainingCount} ${remainingCount === 1 ? 'item' : 'items'} left in ${sec.title}`,
            )
          : tr(lang, `Zakończono: ${sec.title}`, `${sec.title} finished`),
      description: sec.allComplete
        ? sec.completionSubtext
        : remainingCount > 0
          ? tr(
              lang,
              'Dokończ pozostałe punkty powyżej albo przewiń w dół, aby przejść dalej.',
              'Finish the remaining checks above, or scroll down to move on.',
            )
          : sec.nextSectionLabel
            ? tr(lang, `Następnie: ${sec.nextSectionLabel}`, `Up next: ${sec.nextSectionLabel}`)
            : tr(lang, 'Koniec dzisiejszego planu.', 'End of today’s feed.'),
      metaLine: sec.nextSectionLabel
        ? tr(lang, `Dalej: ${sec.nextSectionLabel}`, `Up next: ${sec.nextSectionLabel}`)
        : tr(lang, 'Koniec dnia', 'End of day'),
      tone: sec.allComplete ? 'emerald' : 'blue',
      completed: sec.allComplete,
      milestoneComplete: sec.allComplete,
      milestoneRemainingCount: remainingCount,
      milestoneFirstUncheckedId: remainingItems[0]?.id,
      nextSectionLabel: sec.nextSectionLabel,
    });
  }

  return stream;
}

export function buildMomentShortCards(params: BuildMomentFeedParams): MomentShortCard[] {
  return buildMomentFeedSections(params).flatMap((section) => section.items);
}
