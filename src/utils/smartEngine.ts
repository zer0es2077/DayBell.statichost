import type {
  AppLanguage,
  AppNotification,
  CommutePlace,
  DayOfWeek,
  DerivedSmartTask,
  HomeworkItem,
  LessonSlot,
  OneOffTask,
  RuleDayOfWeek,
  ScheduleExemption,
  SchoolTest,
  SmartRule,
} from '../types';
import { tr } from './i18n';
import {
  addDaysYmd,
  daysBetweenYmd,
  formatShortDate,
  formatWeekdayShort,
  getDayOfWeekNumber,
  parseYmd,
  type ClassifiedTest,
  type DailyPackingPlan,
} from './packingEngine';

export function addMinutesToTime(hhmm: string, deltaMinutes: number): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number.parseInt(hStr || '14', 10);
  const m = Number.parseInt(mStr || '0', 10);
  const total = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + deltaMinutes));
  const outH = Math.floor(total / 60);
  const outM = total % 60;
  return `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
}

function tokenMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 4) {
    return a.includes(b) || b.includes(a);
  }
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  const escaped = shorter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(longer);
}

export function subjectMatches(actual: string, pattern: string): boolean {
  const a = actual.trim().toLowerCase();
  const p = pattern.trim().toLowerCase();
  if (!p || p === '*' || p === 'all' || p === 'any') return true;
  if (tokenMatch(a, p)) return true;
  // Common Polish <-> English aliases
  const pairs: Array<[string[], string[]]> = [
    [['plastyka', 'art'], ['plastyka', 'art']],
    [['wf', 'pe', 'wychowanie fizyczne'], ['wf', 'pe', 'wychowanie fizyczne']],
    [['matematyka', 'math', 'mathematics'], ['matematyka', 'math', 'mathematics']],
    [['polski', 'język polski', 'polish'], ['polski', 'język polski', 'polish']],
    [['angielski', 'język angielski', 'english'], ['angielski', 'język angielski', 'english']],
    [['chemia', 'chemistry'], ['chemia', 'chemistry']],
    [['biologia', 'biology'], ['biologia', 'biology']],
    [['fizyka', 'physics'], ['fizyka', 'physics']],
    [['historia', 'history'], ['historia', 'history']],
  ];
  for (const [group] of pairs) {
    if (group.some((g) => tokenMatch(a, g)) && group.some((g) => tokenMatch(p, g))) {
      return true;
    }
  }
  return false;
}

export interface DayScheduleResolution {
  date: string;
  activeLessons: LessonSlot[];
  skippedLessons: LessonSlot[];
  dismissalTime: string | null;
  dismissalNote?: string;
  dayExemptions: ScheduleExemption[];
}

export function getDaySchedule(
  date: string,
  timetable: LessonSlot[],
  exemptions: ScheduleExemption[],
): DayScheduleResolution {
  const dow = parseYmd(date).getDay();
  const dayExemptions = exemptions.filter((ex) => ex.date === date);

  if (dow === 0 || dow === 6) {
    return {
      date,
      activeLessons: [],
      skippedLessons: [],
      dismissalTime: null,
      dayExemptions,
    };
  }

  const targetDow = dow as DayOfWeek;
  const seenSlots = new Set<string>();
  const dayLessons = timetable
    .filter((l) => l.dayOfWeek === targetDow)
    .sort((a, b) => a.lessonNumber - b.lessonNumber || a.startTime.localeCompare(b.startTime))
    .filter((l) => {
      const slotKey = `${l.lessonNumber}|${l.startTime}|${l.subject.trim().toLowerCase()}`;
      if (seenSlots.has(slotKey)) return false;
      seenSlots.add(slotKey);
      return true;
    });

  const skipSubjectExemptions = dayExemptions.filter((e) => e.kind === 'skip-subject' && e.subject);
  const earlyDismissal = dayExemptions.find(
    (e) => e.kind === 'early-dismissal' && e.customDismissalTime,
  );

  const activeLessons: LessonSlot[] = [];
  const skippedLessons: LessonSlot[] = [];

  for (const lesson of dayLessons) {
    const matchingSkip = skipSubjectExemptions.find((ex) =>
      subjectMatches(lesson.subject, ex.subject || ''),
    );
    if (lesson.isCancelled || matchingSkip) {
      skippedLessons.push({
        ...lesson,
        isCancelled: true,
        note: matchingSkip ? `Exemption: ${matchingSkip.reason}` : lesson.note,
      });
    } else {
      activeLessons.push(lesson);
    }
  }

  const lastActive = activeLessons[activeLessons.length - 1];
  const computedDismissal = earlyDismissal?.customDismissalTime || lastActive?.endTime || null;

  return {
    date,
    activeLessons,
    skippedLessons,
    dismissalTime: computedDismissal,
    dismissalNote: earlyDismissal
      ? `Early dismissal (${earlyDismissal.reason})`
      : lastActive
        ? `After Period ${lastActive.lessonNumber} (${lastActive.subject})`
        : undefined,
    dayExemptions,
  };
}

export function getCommutePlacesForDate(date: string, commutePlaces: CommutePlace[]): CommutePlace[] {
  const dow = parseYmd(date).getDay();
  if (dow < 1 || dow > 5) return [];
  return commutePlaces.filter((p) => p.daysOfWeek.includes(dow as DayOfWeek));
}

export function evaluateSmartRules(params: {
  rules: SmartRule[];
  homework: HomeworkItem[];
  timetable: LessonSlot[];
  commutePlaces: CommutePlace[];
  exemptions: ScheduleExemption[];
  todayYmd: string;
  completedIds: Record<string, boolean>;
  lang?: AppLanguage;
}): DerivedSmartTask[] {
  const {
    rules,
    homework,
    timetable,
    commutePlaces,
    exemptions,
    todayYmd,
    completedIds,
    lang = 'pl',
  } = params;
  const derived: DerivedSmartTask[] = [];

  const resolveRuleTriggerTime = (rule: SmartRule, dismissalTime: string): string => {
    if (rule.timing === 'custom' && rule.customTime && /^\d{2}:\d{2}$/.test(rule.customTime)) {
      return rule.customTime;
    }
    if (rule.timing === 'before-school') return '07:30';
    if (rule.timing === 'evening') return '18:00';
    return addMinutesToTime(dismissalTime, rule.offsetMinutes || 0);
  };

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const effectKind = rule.effectKind ?? 'add-task';
    // Packing effects (pack-item / skip-pack-item) are applied directly inside buildDailyPackingPlan
    if (effectKind === 'pack-item' || effectKind === 'skip-pack-item') continue;

    const triggerKind = rule.triggerKind ?? (rule.requireHomework ? 'on-homework' : 'always');
    const trimmedPlace = rule.placeName.trim();
    const place = trimmedPlace
      ? (commutePlaces.find(
          (p) =>
            p.name.toLowerCase().includes(trimmedPlace.toLowerCase()) ||
            trimmedPlace.toLowerCase().includes(p.name.toLowerCase()),
        ) ?? null)
      : null;

    const explicitActiveDays =
      Array.isArray(rule.activeDays) && rule.activeDays.length > 0 ? rule.activeDays : null;
    const allowedDays: RuleDayOfWeek[] = explicitActiveDays
      ? explicitActiveDays
      : place && place.daysOfWeek.length > 0
        ? place.daysOfWeek
        : [1, 2, 3, 4, 5];

    const resolvedPlaceName = place?.name || trimmedPlace;

    if (triggerKind === 'always' || triggerKind === 'on-subject-day') {
      // Generate concrete tasks/reminders across the next 14 days on matching activeDays
      for (let offset = 0; offset < 14; offset++) {
        const candidate = addDaysYmd(todayYmd, offset);
        const jsDow = parseYmd(candidate).getDay();
        const isoDow: RuleDayOfWeek = (jsDow === 0 ? 7 : jsDow) as RuleDayOfWeek;
        if (!allowedDays.includes(isoDow)) continue;

        const schedule = getDaySchedule(candidate, timetable, exemptions);
        const isWildcard =
          !rule.subjectMatch.trim() ||
          rule.subjectMatch.trim() === '*' ||
          rule.subjectMatch.trim().toLowerCase() === 'all';

        let matchedSubject = isWildcard ? '' : rule.subjectMatch.trim();
        if (triggerKind === 'on-subject-day') {
          if (isWildcard) {
            if (schedule.activeLessons.length === 0) continue;
          } else {
            const foundLesson = schedule.activeLessons.find((l) =>
              subjectMatches(l.subject, rule.subjectMatch),
            );
            if (!foundLesson) continue;
            matchedSubject = foundLesson.subject;
          }
        }

        const dismissal = schedule.dismissalTime || '14:30';
        const triggerTime = resolveRuleTriggerTime(rule, dismissal);

        const rawTitle = (rule.effectText || '').trim() || rule.name;
        let title = rawTitle
          .replace(/\{subject\}/gi, matchedSubject || tr(lang, 'Szkoła', 'School'))
          .replace(/\{supplies\}/gi, matchedSubject || tr(lang, 'zadanie', 'task'));
        if (resolvedPlaceName) {
          title = title.replace(/\{place\}/gi, resolvedPlaceName);
        } else {
          title = title
            .replace(/\s*\(\{place\}\)/gi, '')
            .replace(/\s*(at|w|koło:?)\s*\{place\}/gi, '')
            .replace(/\{place\}/gi, '')
            .trim();
        }

        const triggerDesc =
          triggerKind === 'on-subject-day' && matchedSubject
            ? tr(lang, `W dzień lekcji: ${matchedSubject}`, `On ${matchedSubject} day`)
            : tr(
                lang,
                `Reguła cykliczna (${formatWeekdayShort(candidate, lang)})`,
                `Recurring rule (${formatWeekdayShort(candidate, lang)})`,
              );
        const placePart = resolvedPlaceName ? ` · ${resolvedPlaceName}` : '';
        const timePart =
          rule.timing === 'at-dismissal' && schedule.dismissalTime
            ? tr(lang, ` · Koniec lekcji ${dismissal}`, ` · School ends ${dismissal}`)
            : ` · ${triggerTime}`;

        const id = `smart::${rule.id}::${candidate}`;
        derived.push({
          id,
          ruleId: rule.id,
          ruleName: rule.name,
          homeworkId: '',
          subject: matchedSubject || tr(lang, 'Reguła', 'Rule'),
          supplies: [],
          placeName: resolvedPlaceName,
          targetDate: candidate,
          dismissalTime: dismissal,
          triggerTime,
          timing: rule.timing,
          effectKind,
          title,
          reason: `${triggerDesc}${placePart}${timePart}`,
          notifyBrowser: effectKind === 'notify-only' ? true : rule.notifyBrowser,
          completed: Boolean(completedIds[id]),
        });
      }
      continue;
    }

    // triggerKind === 'on-homework': match incomplete upcoming homework
    const matchingHw = homework.filter((hw) => {
      if (hw.completed) return false;
      if (daysBetweenYmd(todayYmd, hw.dueDate) < 0) return false;
      if (!subjectMatches(hw.subject, rule.subjectMatch)) return false;
      if (rule.requireSupplies && hw.neededSupplies.length === 0) return false;
      return true;
    });

    for (const hw of matchingHw) {
      const daysUntilDue = daysBetweenYmd(todayYmd, hw.dueDate);
      const maxSearchOffset =
        rule.timing === 'before-school' ? Math.max(0, daysUntilDue) : Math.max(0, daysUntilDue - 1);

      let chosenDate: string | null = null;
      let chosenDismissal = '14:30';

      for (let offset = 0; offset <= maxSearchOffset; offset++) {
        const candidate = addDaysYmd(todayYmd, offset);
        const jsDow = parseYmd(candidate).getDay();
        const isoDow: RuleDayOfWeek = (jsDow === 0 ? 7 : jsDow) as RuleDayOfWeek;

        if (!allowedDays.includes(isoDow)) continue;

        const schedule = getDaySchedule(candidate, timetable, exemptions);
        chosenDate = candidate;
        chosenDismissal = schedule.dismissalTime || '14:30';
        break;
      }

      if (!chosenDate) {
        if (explicitActiveDays) {
          continue;
        }
        chosenDate = todayYmd;
        const schedule = getDaySchedule(chosenDate, timetable, exemptions);
        chosenDismissal = schedule.dismissalTime || '14:30';
      }

      const triggerTime = resolveRuleTriggerTime(rule, chosenDismissal);
      const suppliesText =
        hw.neededSupplies.length > 0 ? hw.neededSupplies.join(', ') : hw.title;

      const templateSource = (rule.effectText || '').trim() || rule.taskTemplate || rule.name;
      let title = templateSource
        .replace(/\{supplies\}/gi, suppliesText)
        .replace(/\{subject\}/gi, hw.subject);

      if (resolvedPlaceName) {
        title = title.replace(/\{place\}/gi, resolvedPlaceName);
      } else {
        title = title
          .replace(/\s*\(\{place\}\)/gi, '')
          .replace(/\s*(at|w|koło:?)\s*\{place\}/gi, '')
          .replace(/\{place\}/gi, '')
          .trim();
      }

      const id = `smart::${rule.id}::${hw.id}`;
      const placePart = resolvedPlaceName
        ? tr(
            lang,
            ` · Miejsce: ${resolvedPlaceName} (${formatWeekdayShort(chosenDate, lang)})`,
            ` · Place: ${resolvedPlaceName} (${formatWeekdayShort(chosenDate, lang)})`,
          )
        : tr(
            lang,
            ` · Dzień reguły: ${formatWeekdayShort(chosenDate, lang)}`,
            ` · Rule day: ${formatWeekdayShort(chosenDate, lang)}`,
          );

      const timePart =
        rule.timing === 'at-dismissal'
          ? tr(lang, ` · Koniec lekcji ${chosenDismissal}`, ` · School ends ${chosenDismissal}`)
          : ` · ${triggerTime}`;

      derived.push({
        id,
        ruleId: rule.id,
        ruleName: rule.name,
        homeworkId: hw.id,
        subject: hw.subject,
        supplies: hw.neededSupplies,
        placeName: resolvedPlaceName,
        targetDate: chosenDate,
        dismissalTime: chosenDismissal,
        triggerTime,
        timing: rule.timing,
        effectKind,
        title,
        reason: `${hw.subject} (${formatWeekdayShort(hw.dueDate, lang)} ${formatShortDate(hw.dueDate, lang)})${placePart}${timePart}`,
        notifyBrowser: effectKind === 'notify-only' ? true : rule.notifyBrowser,
        completed: Boolean(completedIds[id]),
      });
    }
  }

  return derived.sort((a, b) =>
    a.targetDate === b.targetDate
      ? a.triggerTime.localeCompare(b.triggerTime)
      : a.targetDate.localeCompare(b.targetDate),
  );
}

export function findNextSubjectDate(
  subjectPattern: string,
  timetable: LessonSlot[],
  exemptions: ScheduleExemption[],
  fromYmd: string,
): string | null {
  for (let offset = 0; offset <= 14; offset++) {
    const candidate = addDaysYmd(fromYmd, offset);
    const schedule = getDaySchedule(candidate, timetable, exemptions);
    if (schedule.activeLessons.some((l) => subjectMatches(l.subject, subjectPattern))) {
      return candidate;
    }
  }
  return null;
}

export type ConveniencePreference =
  | 'earliest'
  | 'lightest-day'
  | 'day-before'
  | 'today';

export interface SmartPlacementResult {
  targetDate: string;
  deadlineDate: string;
  triggerTime: string;
  reason: string;
}

/**
 * Deterministically calculates the best date & time to schedule a task
 * using only the student's timetable, exemptions, commute places, latest
 * deadline, location, and convenience preference — zero AI required.
 */
export function solveTaskPlacement(params: {
  todayYmd: string;
  deadlineMode: 'date' | 'before-subject';
  explicitDeadlineDate: string;
  beforeSubject?: string;
  location: OneOffTask['location'];
  commutePlaceName?: string;
  convenience: ConveniencePreference;
  preferredTime?: string; // 'auto' | HH:MM
  timetable: LessonSlot[];
  commutePlaces: CommutePlace[];
  exemptions: ScheduleExemption[];
  studyStartTime?: string;
  lang?: AppLanguage;
}): SmartPlacementResult {
  const {
    todayYmd,
    deadlineMode,
    explicitDeadlineDate,
    beforeSubject,
    location,
    commutePlaceName,
    convenience,
    preferredTime = 'auto',
    timetable,
    commutePlaces,
    exemptions,
    studyStartTime = '17:00',
    lang = 'pl',
  } = params;

  // 1. Resolve latest deadline date
  let resolvedDeadline = explicitDeadlineDate || todayYmd;
  let deadlineNote = tr(
    lang,
    `najpóźniej ${formatWeekdayShort(resolvedDeadline, lang)} ${formatShortDate(resolvedDeadline, lang)}`,
    `by ${formatWeekdayShort(resolvedDeadline, lang)} ${formatShortDate(resolvedDeadline, lang)}`,
  );

  if (deadlineMode === 'before-subject' && beforeSubject?.trim()) {
    const nextClass = findNextSubjectDate(beforeSubject, timetable, exemptions, addDaysYmd(todayYmd, 1));
    if (nextClass) {
      resolvedDeadline = nextClass;
      deadlineNote = tr(
        lang,
        `przed lekcją: ${beforeSubject.trim()} (${formatWeekdayShort(nextClass, lang)} ${formatShortDate(nextClass, lang)})`,
        `before ${beforeSubject.trim()} (${formatWeekdayShort(nextClass, lang)} ${formatShortDate(nextClass, lang)})`,
      );
    } else {
      const sameDayClass = findNextSubjectDate(beforeSubject, timetable, exemptions, todayYmd);
      if (sameDayClass) {
        resolvedDeadline = sameDayClass;
        deadlineNote = tr(
          lang,
          `przed lekcją: ${beforeSubject.trim()} (${formatShortDate(sameDayClass, lang)})`,
          `before ${beforeSubject.trim()} (${formatShortDate(sameDayClass, lang)})`,
        );
      }
    }
  }

  const totalSpan = daysBetweenYmd(todayYmd, resolvedDeadline);
  // If must happen strictly before a subject class, prefer days strictly before resolvedDeadline when possible
  const lastAllowedOffset =
    deadlineMode === 'before-subject' && totalSpan >= 1
      ? totalSpan - 1
      : Math.max(0, totalSpan);

  const matchedPlace = commutePlaceName
    ? commutePlaces.find(
        (p) => p.name.toLowerCase() === commutePlaceName.trim().toLowerCase(),
      ) ?? null
    : null;

  interface CandidateDay {
    date: string;
    offset: number;
    isWeekday: boolean;
    lessonCount: number;
    dismissalTime: string | null;
    dismissalMins: number;
    passesPlace: boolean;
  }

  const candidates: CandidateDay[] = [];
  for (let offset = 0; offset <= Math.min(21, lastAllowedOffset); offset++) {
    const date = addDaysYmd(todayYmd, offset);
    const dow = parseYmd(date).getDay();
    const weekday = dow >= 1 && dow <= 5;
    const sched = getDaySchedule(date, timetable, exemptions);
    const passesPlace = matchedPlace
      ? weekday && matchedPlace.daysOfWeek.includes(dow as DayOfWeek)
      : false;

    const dismissalTime = sched.dismissalTime;
    const [dh, dm] = (dismissalTime || '15:00').split(':').map((n) => Number.parseInt(n, 10));
    const dismissalMins = (Number.isFinite(dh) ? dh : 15) * 60 + (Number.isFinite(dm) ? dm : 0);

    candidates.push({
      date,
      offset,
      isWeekday: weekday,
      lessonCount: sched.activeLessons.length,
      dismissalTime,
      dismissalMins,
      passesPlace,
    });
  }

  // 2. Filter candidate pool by location/commute constraints
  let pool = [...candidates];
  if (location === 'at-school' || location === 'after-school') {
    const schoolDays = pool.filter((c) => c.isWeekday);
    if (schoolDays.length > 0) pool = schoolDays;
  }
  if (location === 'after-school' && matchedPlace) {
    const placeDays = pool.filter((c) => c.passesPlace);
    if (placeDays.length > 0) pool = placeDays;
  }

  // 3. Pick best day based on student's convenience preference
  let chosen: CandidateDay = pool[0] ?? {
    date: todayYmd,
    offset: 0,
    isWeekday: isWeekday(todayYmd),
    lessonCount: 0,
    dismissalTime: null,
    dismissalMins: 15 * 60,
    passesPlace: false,
  };

  let convenienceNote = tr(lang, 'najbliższy możliwy dzień', 'earliest available day');

  if (convenience === 'today') {
    chosen = candidates[0] ?? chosen;
    convenienceNote = tr(lang, 'zaplanowano na dziś', 'scheduled for today');
  } else if (convenience === 'day-before') {
    chosen = pool[pool.length - 1] ?? chosen;
    convenienceNote = tr(
      lang,
      'ostatni wygodny dzień przed terminem',
      'last convenient day before deadline',
    );
  } else if (convenience === 'lightest-day') {
    chosen = [...pool].sort((a, b) => {
      // Prefer fewest classes, then earliest dismissal, then earlier date
      if (a.lessonCount !== b.lessonCount) return a.lessonCount - b.lessonCount;
      if (a.dismissalMins !== b.dismissalMins) return a.dismissalMins - b.dismissalMins;
      return a.offset - b.offset;
    })[0] ?? chosen;
    convenienceNote = chosen.dismissalTime
      ? tr(
          lang,
          `najlżejszy dzień w szkole (koniec o ${chosen.dismissalTime})`,
          `lightest school day (out at ${chosen.dismissalTime})`,
        )
      : tr(lang, 'najlżejszy dzień w kalendarzu', 'lightest day on your calendar');
  } else {
    chosen = pool[0] ?? chosen;
    convenienceNote =
      matchedPlace && chosen.passesPlace
        ? tr(
            lang,
            `najbliższy dzień po drodze koło: ${matchedPlace.name}`,
            `earliest day you pass ${matchedPlace.name}`,
          )
        : tr(lang, 'najbliższy pasujący dzień', 'earliest valid day');
  }

  // 4. Resolve trigger time
  let triggerTime = preferredTime;
  if (!triggerTime || triggerTime === 'auto' || !/^\d{2}:\d{2}$/.test(triggerTime)) {
    if (location === 'at-school') {
      triggerTime = '09:45';
    } else if (location === 'after-school') {
      triggerTime = chosen.dismissalTime || '14:30';
    } else if (location === 'at-home') {
      triggerTime = studyStartTime;
    } else {
      triggerTime = chosen.dismissalTime ? addMinutesToTime(chosen.dismissalTime, 30) : '16:30';
    }
  }

  const placeSuffix =
    location === 'after-school' && matchedPlace && chosen.passesPlace
      ? tr(lang, ` · po drodze: ${matchedPlace.name}`, ` · passes ${matchedPlace.name}`)
      : location === 'after-school' && chosen.dismissalTime
        ? tr(lang, ` · koniec lekcji ${chosen.dismissalTime}`, ` · school ends ${chosen.dismissalTime}`)
        : '';

  return {
    targetDate: chosen.date,
    deadlineDate: resolvedDeadline,
    triggerTime,
    reason: `${formatWeekdayShort(chosen.date, lang)} ${formatShortDate(chosen.date, lang)} ${tr(lang, 'o', 'at')} ${triggerTime} (${convenienceNote}${placeSuffix} · ${deadlineNote})`,
  };
}

export function buildScheduledNotifications(params: {
  derivedTasks: DerivedSmartTask[];
  oneOffTasks: OneOffTask[];
  classifiedTests: ClassifiedTest[];
  todayYmd: string;
  leadDays: number;
  firedIds: Record<string, boolean>;
  readIds: Record<string, boolean>;
  dismissedIds: Record<string, boolean>;
  lang?: AppLanguage;
}): AppNotification[] {
  const {
    derivedTasks,
    oneOffTasks,
    classifiedTests,
    todayYmd,
    leadDays,
    firedIds,
    readIds,
    dismissedIds,
    lang = 'pl',
  } = params;

  const list: AppNotification[] = [];

  for (const task of derivedTasks) {
    if (task.completed) continue;
    if (!task.notifyBrowser) continue;
    // Keep alerts focused on the next 3 days so recurring rules don't spam the drawer
    if (daysBetweenYmd(todayYmd, task.targetDate) > 3) continue;
    const id = `notif-smart-${task.id}`;
    if (dismissedIds[id]) continue;
    list.push({
      id,
      title: task.placeName
        ? tr(
            lang,
            `Przypomnienie (${task.triggerTime}) — ${task.placeName}`,
            `Reminder (${task.triggerTime}) — ${task.placeName}`,
          )
        : tr(
            lang,
            `Reguła (${task.triggerTime}) — ${task.ruleName}`,
            `Rule (${task.triggerTime}) — ${task.ruleName}`,
          ),
      body: `${task.title}. ${task.reason}`,
      targetDate: task.targetDate,
      triggerTime: task.triggerTime,
      kind: 'dismissal-errand',
      relatedId: task.id,
      fired: Boolean(firedIds[id]),
      read: Boolean(readIds[id]),
      dismissed: false,
    });
  }

  for (const task of oneOffTasks) {
    if (task.completed) continue;
    const id = `notif-oneoff-${task.id}`;
    if (dismissedIds[id]) continue;
    const locLabel =
      task.location === 'at-school'
        ? tr(lang, 'W szkole', 'At school')
        : task.location === 'after-school'
          ? tr(lang, 'Po szkole', 'After school')
          : task.location === 'at-home'
            ? tr(lang, 'W domu', 'At home')
            : tr(lang, 'Dowolnie', 'Anytime');
    list.push({
      id,
      title: `${task.priority === 'urgent' ? tr(lang, 'Pilne', 'Urgent') : tr(lang, 'Zadanie', 'Task')} (${locLabel}): ${task.title}`,
      body: task.beforeSubject
        ? tr(
            lang,
            `Zrób przed lekcją: ${task.beforeSubject} (${formatShortDate(task.deadlineDate, lang)}).${task.notes ? ` ${task.notes}` : ''}`,
            `Complete before ${task.beforeSubject} (${formatShortDate(task.deadlineDate, lang)}).${task.notes ? ` ${task.notes}` : ''}`,
          )
        : tr(
            lang,
            `Termin: ${formatShortDate(task.targetDate, lang)}${task.notes ? ` — ${task.notes}` : ''}`,
            `Target ${formatShortDate(task.targetDate, lang)}${task.notes ? ` — ${task.notes}` : ''}`,
          ),
      targetDate: task.targetDate,
      triggerTime: task.triggerTime || (task.location === 'at-school' ? '09:45' : '15:00'),
      kind: 'urgent-task',
      relatedId: task.id,
      fired: Boolean(firedIds[id]),
      read: Boolean(readIds[id]),
      dismissed: false,
    });
  }

  for (const test of classifiedTests) {
    if (test.bucket !== 'advance-window' && test.bucket !== 'imminent') continue;
    const id = `notif-test-${test.id}`;
    if (dismissedIds[id]) continue;
    list.push({
      id,
      title: tr(
        lang,
        `${test.subject} (${test.category}) za ${test.daysUntil} ${test.daysUntil === 1 ? 'dzień' : 'dni'}`,
        `${test.subject} ${test.category} in ${test.daysUntil} day${test.daysUntil === 1 ? '' : 's'}`,
      ),
      body: tr(
        lang,
        `${test.title} dnia ${formatShortDate(test.date, lang)}. Aktywne przygotowanie z wyprzedzeniem (${leadDays} dni).`,
        `${test.title} on ${formatShortDate(test.date, lang)}. ${leadDays}+ day advance study window active.`,
      ),
      targetDate: todayYmd,
      triggerTime: '17:00',
      kind: 'test-advance',
      relatedId: test.id,
      fired: Boolean(firedIds[id]),
      read: Boolean(readIds[id]),
      dismissed: false,
    });
  }

  return list.sort((a, b) =>
    a.targetDate === b.targetDate
      ? a.triggerTime.localeCompare(b.triggerTime)
      : a.targetDate.localeCompare(b.targetDate),
  );
}

export interface TimelineEntry {
  id: string;
  phase: 'morning' | 'school' | 'dismissal' | 'evening';
  timeLabel: string;
  title: string;
  subtitle?: string;
  kind: 'pack' | 'lesson' | 'urgent-task' | 'smart-errand' | 'homework' | 'test' | 'exemption';
  checked?: boolean;
  onToggleId?: string;
  toggleType?: 'pack' | 'smart' | 'oneoff' | 'homework';
  priority?: 'urgent' | 'normal';
}

export function buildMomentByMomentDay(params: {
  date: string;
  timetable: LessonSlot[];
  exemptions: ScheduleExemption[];
  packingPlan: DailyPackingPlan;
  nextDayPackingCount: number;
  derivedTasks: DerivedSmartTask[];
  oneOffTasks: OneOffTask[];
  homework: HomeworkItem[];
  tests: SchoolTest[];
  commutePlaces: CommutePlace[];
  checkedPackIds: Record<string, boolean>;
}): {
  schedule: DayScheduleResolution;
  commutePlacesToday: CommutePlace[];
  entries: TimelineEntry[];
} {
  const {
    date,
    timetable,
    exemptions,
    packingPlan,
    nextDayPackingCount,
    derivedTasks,
    oneOffTasks,
    homework,
    tests,
    commutePlaces,
    checkedPackIds,
  } = params;

  const schedule = getDaySchedule(date, timetable, exemptions);
  const commutePlacesToday = getCommutePlacesForDate(date, commutePlaces);
  const entries: TimelineEntry[] = [];

  // Phase 1: Morning Pack & Leave Home
  for (const ex of schedule.dayExemptions) {
    entries.push({
      id: `tl-ex-${ex.id}`,
      phase: 'morning',
      timeLabel: '07:10',
      title: `Exemption active: ${ex.reason}`,
      subtitle:
        ex.kind === 'skip-subject'
          ? `Skipping ${ex.subject || 'class'} today`
          : ex.kind === 'early-dismissal'
            ? `School ends early at ${ex.customDismissalTime}`
            : ex.itemLabel,
      kind: 'exemption',
    });
  }

  for (const item of packingPlan.items) {
    entries.push({
      id: `tl-pack-${item.id}`,
      phase: 'morning',
      timeLabel: '07:20',
      title: `Pack: ${item.label}`,
      subtitle: item.subject || item.detail || 'Morning bag check',
      kind: 'pack',
      checked: Boolean(checkedPackIds[item.id]),
      onToggleId: item.id,
      toggleType: 'pack',
    });
  }

  // Phase 2: At School (urgent school-constrained tasks + lessons + tests today)
  const schoolOneOffs = oneOffTasks.filter(
    (t) =>
      t.location === 'at-school' &&
      (t.targetDate === date ||
        (!t.completed &&
          daysBetweenYmd(t.targetDate, date) >= 0 &&
          daysBetweenYmd(date, t.deadlineDate) >= 0)),
  );

  for (const task of schoolOneOffs) {
    entries.push({
      id: `tl-oneoff-school-${task.id}`,
      phase: 'school',
      timeLabel: task.triggerTime || '09:45',
      title: task.title,
      subtitle: task.beforeSubject
        ? `Must complete at school before ${task.beforeSubject} (${formatShortDate(task.deadlineDate)})`
        : task.notes || 'Complete while at school',
      kind: 'urgent-task',
      checked: task.completed,
      onToggleId: task.id,
      toggleType: 'oneoff',
      priority: task.priority,
    });
  }

  const todayTests = tests.filter((t) => t.date === date);
  for (const t of todayTests) {
    entries.push({
      id: `tl-test-${t.id}`,
      phase: 'school',
      timeLabel: '08:00',
      title: `${t.subject} ${t.category}: ${t.title}`,
      subtitle: t.description,
      kind: 'test',
      priority: 'urgent',
    });
  }

  for (const lesson of schedule.activeLessons) {
    entries.push({
      id: `tl-lesson-${lesson.id}`,
      phase: 'school',
      timeLabel: `${lesson.startTime}`,
      title: `${lesson.subject}`,
      subtitle: `Period ${lesson.lessonNumber} · ${lesson.startTime}–${lesson.endTime} · Room ${lesson.room}${lesson.isSubstitution ? ' · Substitution' : ''}`,
      kind: 'lesson',
    });
  }

  // Phase 3: Right After Dismissal (smart commute errands + after-school tasks)
  const dayDerived = derivedTasks.filter((t) => t.targetDate === date);
  for (const task of dayDerived) {
    entries.push({
      id: `tl-smart-${task.id}`,
      phase: 'dismissal',
      timeLabel: task.triggerTime,
      title: task.title,
      subtitle: `${task.reason} · Notification fires at ${task.triggerTime}`,
      kind: 'smart-errand',
      checked: task.completed,
      onToggleId: task.id,
      toggleType: 'smart',
      priority: 'urgent',
    });
  }

  const afterSchoolOneOffs = oneOffTasks.filter(
    (t) => t.location === 'after-school' && t.targetDate === date,
  );
  for (const task of afterSchoolOneOffs) {
    entries.push({
      id: `tl-oneoff-after-${task.id}`,
      phase: 'dismissal',
      timeLabel: task.triggerTime || schedule.dismissalTime || '14:30',
      title: task.title,
      subtitle: task.notes || 'Right after leaving school',
      kind: 'urgent-task',
      checked: task.completed,
      onToggleId: task.id,
      toggleType: 'oneoff',
      priority: task.priority,
    });
  }

  // Phase 4: Afternoon & Evening (homework due tomorrow/soon, home tasks, tomorrow pack prep)
  const eveningHw = homework.filter((hw) => {
    const diff = daysBetweenYmd(date, hw.dueDate);
    return diff >= 0 && diff <= 2;
  });
  for (const hw of eveningHw) {
    const dueLabel =
      hw.dueDate === date
        ? 'Due today'
        : daysBetweenYmd(date, hw.dueDate) === 1
          ? 'Due tomorrow'
          : `Due ${formatShortDate(hw.dueDate)}`;
    entries.push({
      id: `tl-hw-${hw.id}`,
      phase: 'evening',
      timeLabel: '17:00',
      title: `${hw.subject} homework: ${hw.title}`,
      subtitle:
        hw.neededSupplies.length > 0
          ? `${dueLabel} · Supplies needed: ${hw.neededSupplies.join(', ')}`
          : dueLabel,
      kind: 'homework',
      checked: hw.completed,
      onToggleId: hw.id,
      toggleType: 'homework',
    });
  }

  const homeOneOffs = oneOffTasks.filter(
    (t) => (t.location === 'at-home' || t.location === 'anywhere') && t.targetDate === date,
  );
  for (const task of homeOneOffs) {
    entries.push({
      id: `tl-oneoff-home-${task.id}`,
      phase: 'evening',
      timeLabel: task.triggerTime || '18:30',
      title: task.title,
      subtitle: task.notes || 'Evening task',
      kind: 'urgent-task',
      checked: task.completed,
      onToggleId: task.id,
      toggleType: 'oneoff',
      priority: task.priority,
    });
  }

  if (nextDayPackingCount > 0) {
    entries.push({
      id: `tl-pack-next-${date}`,
      phase: 'evening',
      timeLabel: '20:00',
      title: `Pack bag for next school day (${nextDayPackingCount} items)`,
      subtitle: 'Check tomorrow’s active classes and any newly bought supplies',
      kind: 'pack',
    });
  }

  return {
    schedule,
    commutePlacesToday,
    entries,
  };
}

export function getMonthGridDates(year: number, monthIndex: number): string[] {
  // Returns 35 or 42 YYYY-MM-DD dates starting on Monday
  const first = new Date(year, monthIndex, 1);
  const firstDow = first.getDay(); // 0=Sun, 1=Mon
  const lead = firstDow === 0 ? 6 : firstDow - 1;
  const start = new Date(year, monthIndex, 1 - lead);

  const last = new Date(year, monthIndex + 1, 0);
  const totalCells = lead + last.getDate() > 35 ? 42 : 35;

  const dates: string[] = [];
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

export const ALL_RULE_DAYS: RuleDayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];
export const SCHOOL_RULE_DAYS: RuleDayOfWeek[] = [1, 2, 3, 4, 5];

export function ruleWeekdayLabel(dow: RuleDayOfWeek, lang: AppLanguage = 'pl'): string {
  const plMap: Record<RuleDayOfWeek, string> = {
    1: 'Pon',
    2: 'Wt',
    3: 'Śr',
    4: 'Czw',
    5: 'Pt',
    6: 'Sob',
    7: 'Nd',
  };
  const enMap: Record<RuleDayOfWeek, string> = {
    1: 'Mon',
    2: 'Tue',
    3: 'Wed',
    4: 'Thu',
    5: 'Fri',
    6: 'Sat',
    7: 'Sun',
  };
  return lang === 'pl' ? plMap[dow] : enMap[dow];
}

export function weekdayLabelFromNumber(dow: DayOfWeek, lang: AppLanguage = 'pl'): string {
  return ruleWeekdayLabel(dow, lang);
}

export function getWeekDatesFromMonday(mondayYmd: string): string[] {
  return [0, 1, 2, 3, 4].map((offset) => addDaysYmd(mondayYmd, offset));
}

export function isWeekday(ymd: string): boolean {
  const dow = parseYmd(ymd).getDay();
  return dow >= 1 && dow <= 5;
}

export function getDayOfWeekSafe(ymd: string): DayOfWeek {
  return getDayOfWeekNumber(ymd);
}
