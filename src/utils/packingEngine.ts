import type {
  AppLanguage,
  CustomPackingItem,
  DayOfWeek,
  ExtractedPackingItem,
  HomeworkItem,
  LessonSlot,
  PackingStepConfig,
  RuleDayOfWeek,
  ScheduleExemption,
  SchoolTest,
  SmartRule,
  SubjectKit,
} from '../types';
import { getLocale, tr } from './i18n';

export const DEFAULT_SUBJECT_KITS: SubjectKit[] = [
  {
    subject: 'Matematyka',
    items: ['Podręcznik do matematyki', 'Zeszyt w kratkę', 'Kalkulator naukowy', 'Linijka i ołówek'],
  },
  {
    subject: 'Język polski',
    items: ['Podręcznik do języka polskiego', 'Zeszyt w linię', 'Aktualna lektura'],
  },
  {
    subject: 'Język angielski',
    items: ['Podręcznik do angielskiego', 'Ćwiczenia do angielskiego', 'Zeszyt do słówek'],
  },
  {
    subject: 'Język niemiecki',
    items: ['Podręcznik do niemieckiego', 'Ćwiczenia do niemieckiego', 'Zeszyt'],
  },
  {
    subject: 'Wychowanie fizyczne',
    items: ['Strój na WF (koszulka i spodenki)', 'Buty zmienne na halę', 'Mały ręcznik i woda'],
  },
  {
    subject: 'Chemia',
    items: ['Podręcznik do chemii', 'Zeszyt', 'Układ okresowy pierwiastków'],
  },
  {
    subject: 'Fizyka',
    items: ['Podręcznik do fizyki', 'Zeszyt w kratkę', 'Kalkulator i karta wzorów'],
  },
  {
    subject: 'Biologia',
    items: ['Podręcznik do biologii', 'Zeszyt ćwiczeń', 'Zeszyt'],
  },
  {
    subject: 'Geografia',
    items: ['Podręcznik do geografii', 'Atlas geograficzny', 'Zeszyt'],
  },
  {
    subject: 'Historia',
    items: ['Podręcznik do historii', 'Zeszyt do historii'],
  },
  {
    subject: 'Informatyka',
    items: ['Pendrive', 'Zeszyt'],
  },
  {
    subject: 'WOS',
    items: ['Zeszyt do WOS', 'Teczka na kserówki'],
  },
  {
    subject: 'Plastyka',
    items: ['Blok rysunkowy', 'Kredki i flamastry'],
  },
];

export const ESSENTIAL_DAILY_ITEMS: string[] = [
  'Legitymacja szkolna',
  'Piórnik (długopisy, zakreślacz, gumka)',
  'Butelka wody i drugie śniadanie',
];

export function getEssentialDailyItems(lang: AppLanguage = 'pl'): string[] {
  if (lang === 'en') {
    return [
      'Student ID (Legitymacja szkolna)',
      'Pencil case (pens, highlighter, eraser)',
      'Water bottle & lunch',
    ];
  }
  return ESSENTIAL_DAILY_ITEMS;
}

export const DEFAULT_PACKING_STEPS: PackingStepConfig[] = [
  {
    id: 'step-subjects',
    kind: 'subjects',
    label: 'Subject books & notebooks',
    enabled: true,
    note: 'Auto-filled from your classes & subject kits',
  },
  {
    id: 'step-homework-supplies',
    kind: 'homework-supplies',
    label: 'Homework & project supplies',
    enabled: true,
    note: 'Extra materials needed for homework due that day',
  },
  {
    id: 'step-message-extras',
    kind: 'message-extras',
    label: 'Extra items from Librus notices',
    enabled: true,
    note: 'Slips, PE gear, or items mentioned by teachers',
  },
  {
    id: 'step-test-prep',
    kind: 'test-prep',
    label: 'Test-day materials',
    enabled: true,
    note: 'Revision notes & spare pen on test days',
  },
  {
    id: 'step-essentials',
    kind: 'essentials',
    label: 'Daily essentials',
    enabled: true,
    note: 'Student ID, pencil case, water bottle & lunch',
  },
];

export function getTestLeadDays(
  test: SchoolTest,
  majorLeadDays = 5,
  quizLeadDays = 3,
): number {
  const cat = test.category.toLowerCase();
  const isQuiz =
    cat.includes('kartkówk') ||
    cat.includes('quiz') ||
    cat.includes('odpowiedź') ||
    cat.includes('oral');
  return Math.max(1, isQuiz ? quizLeadDays : majorLeadDays);
}

/**
 * First half rounded down (minimum 1 full day) is Learning;
 * all remaining days are Repeating what was learned.
 */
export function getStudyPhaseSplit(totalDays: number): {
  learningDays: number;
  repeatingDays: number;
} {
  const safeTotal = Math.max(1, Math.floor(totalDays));
  const learningDays = Math.max(1, Math.floor(safeTotal / 2));
  const repeatingDays = Math.max(0, safeTotal - learningDays);
  return { learningDays, repeatingDays };
}

const SUBJECT_ALIASES: Record<string, string> = {
  math: 'Matematyka',
  mathematics: 'Matematyka',
  matematyka: 'Matematyka',
  polish: 'Język polski',
  polski: 'Język polski',
  'język polski': 'Język polski',
  'jezyk polski': 'Język polski',
  english: 'Język angielski',
  angielski: 'Język angielski',
  'język angielski': 'Język angielski',
  'jezyk angielski': 'Język angielski',
  german: 'Język niemiecki',
  niemiecki: 'Język niemiecki',
  'język niemiecki': 'Język niemiecki',
  'jezyk niemiecki': 'Język niemiecki',
  pe: 'Wychowanie fizyczne',
  wf: 'Wychowanie fizyczne',
  'wychowanie fizyczne': 'Wychowanie fizyczne',
  chemistry: 'Chemia',
  chemia: 'Chemia',
  physics: 'Fizyka',
  fizyka: 'Fizyka',
  biology: 'Biologia',
  biologia: 'Biologia',
  geography: 'Geografia',
  geografia: 'Geografia',
  history: 'Historia',
  historia: 'Historia',
  'computer science': 'Informatyka',
  it: 'Informatyka',
  informatyka: 'Informatyka',
  civics: 'WOS',
  wos: 'WOS',
  art: 'Plastyka',
  plastyka: 'Plastyka',
};

export function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayYmd(): string {
  return formatYmd(new Date());
}

export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysYmd(ymd: string, deltaDays: number): string {
  const dt = parseYmd(ymd);
  dt.setDate(dt.getDate() + deltaDays);
  return formatYmd(dt);
}

export function getMondayYmd(ymd: string): string {
  const dt = parseYmd(ymd);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return formatYmd(dt);
}

export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24));
}

export function getNextSchoolDayYmd(todayYmd: string): string {
  const dt = parseYmd(todayYmd);
  const dow = dt.getDay();
  if (dow === 5) return addDaysYmd(todayYmd, 3);
  if (dow === 6) return addDaysYmd(todayYmd, 2);
  return addDaysYmd(todayYmd, 1);
}

export function getPrevSchoolDayYmd(dateYmd: string): string {
  const dt = parseYmd(dateYmd);
  const dow = dt.getDay();
  if (dow === 1) return addDaysYmd(dateYmd, -3); // Monday -> Friday
  if (dow === 0) return addDaysYmd(dateYmd, -2); // Sunday -> Friday
  if (dow === 6) return addDaysYmd(dateYmd, -1); // Saturday -> Friday
  return addDaysYmd(dateYmd, -1);
}

export function formatShortDate(ymd: string, lang: AppLanguage = 'pl'): string {
  const dt = parseYmd(ymd);
  return dt.toLocaleDateString(getLocale(lang), { month: 'short', day: 'numeric' });
}

export function formatWeekdayShort(ymd: string, lang: AppLanguage = 'pl'): string {
  const dt = parseYmd(ymd);
  const raw = dt.toLocaleDateString(getLocale(lang), { weekday: 'short' }).replace(/\.$/, '');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function formatWeekdayLong(ymd: string, lang: AppLanguage = 'pl'): string {
  const dt = parseYmd(ymd);
  const raw = dt.toLocaleDateString(getLocale(lang), { weekday: 'long' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function getDayOfWeekNumber(ymd: string): DayOfWeek {
  const dow = parseYmd(ymd).getDay();
  if (dow >= 1 && dow <= 5) return dow as DayOfWeek;
  return 1;
}

export function getUpcomingSchoolDays(todayYmd: string, count = 5): string[] {
  const days: string[] = [];
  let cursor = todayYmd;
  const startDow = parseYmd(cursor).getDay();
  if (startDow === 6) cursor = addDaysYmd(cursor, 2);
  if (startDow === 0) cursor = addDaysYmd(cursor, 1);

  while (days.length < count) {
    const dow = parseYmd(cursor).getDay();
    if (dow >= 1 && dow <= 5) {
      days.push(cursor);
    }
    cursor = addDaysYmd(cursor, 1);
  }
  return days;
}

function subjectTokenMatch(haystack: string, needle: string): boolean {
  const a = haystack.trim().toLowerCase();
  const b = needle.trim().toLowerCase();
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

export function findItemsForSubject(
  subjectName: string,
  kits: SubjectKit[],
  lang: AppLanguage = 'pl',
): string[] {
  const clean = subjectName.trim().toLowerCase();
  const exact = kits.find((k) => k.subject.trim().toLowerCase() === clean);
  if (exact) return exact.items;

  const partial = kits.find((k) => subjectTokenMatch(clean, k.subject));
  if (partial) return partial.items;

  for (const [alias, canonical] of Object.entries(SUBJECT_ALIASES)) {
    if (subjectTokenMatch(clean, alias)) {
      const aliased = kits.find((k) => k.subject.toLowerCase() === canonical.toLowerCase());
      if (aliased) return aliased.items;
    }
  }

  return [
    tr(lang, `Podręcznik: ${subjectName}`, `${subjectName} textbook`),
    tr(lang, `Zeszyt: ${subjectName}`, `${subjectName} notebook`),
  ];
}

export interface PackingChecklistItem {
  id: string;
  label: string;
  category: 'essential' | 'subject' | 'message-extra' | 'test-prep' | 'homework-supply' | 'custom';
  subject?: string;
  detail?: string;
  sourceMessageId?: string;
  customItemId?: string;
}

export interface DailyPackingPlan {
  date: string;
  activeLessons: LessonSlot[];
  cancelledLessons: LessonSlot[];
  items: PackingChecklistItem[];
}

function looseSubjectMatch(a: string, b: string): boolean {
  const ca = a.trim().toLowerCase();
  const cb = b.trim().toLowerCase();
  if (subjectTokenMatch(ca, cb)) return true;
  const aliasA = SUBJECT_ALIASES[ca];
  const aliasB = SUBJECT_ALIASES[cb];
  return Boolean(aliasA && aliasB && aliasA === aliasB);
}

export function buildDailyPackingPlan(params: {
  date: string;
  timetable: LessonSlot[];
  subjectKits: SubjectKit[];
  extractedItems: ExtractedPackingItem[];
  customItems: CustomPackingItem[];
  tests: SchoolTest[];
  homework?: HomeworkItem[];
  exemptions?: ScheduleExemption[];
  smartRules?: SmartRule[];
  includeEssentials?: boolean;
  dailyEssentials?: string[];
  packingSteps?: PackingStepConfig[];
  lang?: AppLanguage;
}): DailyPackingPlan {
  const {
    date,
    timetable,
    subjectKits,
    extractedItems,
    customItems,
    tests,
    homework = [],
    exemptions = [],
    smartRules = [],
    includeEssentials = true,
    dailyEssentials,
    packingSteps = DEFAULT_PACKING_STEPS,
    lang = 'pl',
  } = params;
  const rawJsDow = parseYmd(date).getDay();
  const isoDow: RuleDayOfWeek = (rawJsDow === 0 ? 7 : rawJsDow) as RuleDayOfWeek;
  const isWeekend = rawJsDow === 0 || rawJsDow === 6;

  const dayExemptions = exemptions.filter((e) => e.date === date);
  const skippedSubjects = dayExemptions.filter((e) => e.kind === 'skip-subject' && e.subject);
  const skippedItemLabels = dayExemptions
    .filter((e) => e.kind === 'skip-item' && e.itemLabel)
    .map((e) => (e.itemLabel || '').toLowerCase());

  // On weekends, never fall back to Monday's recurring classes; on weekdays, use the weekly timetable cleanly without date shadowing
  const rawDayLessons = isWeekend
    ? timetable.filter((l) => l.date === date)
    : timetable.filter((l) => l.dayOfWeek === (rawJsDow as DayOfWeek));

  const seenLessonSlots = new Set<string>();
  const dayLessons = [...rawDayLessons]
    .sort((a, b) => a.lessonNumber - b.lessonNumber || a.startTime.localeCompare(b.startTime))
    .filter((l) => {
      const slotKey = `${l.lessonNumber}|${l.startTime}|${l.subject.trim().toLowerCase()}`;
      if (seenLessonSlots.has(slotKey)) return false;
      seenLessonSlots.add(slotKey);
      return true;
    });

  const activeLessons: LessonSlot[] = [];
  const cancelledLessons: LessonSlot[] = [];

  for (const lesson of dayLessons) {
    const skipEx = skippedSubjects.find((ex) => looseSubjectMatch(lesson.subject, ex.subject || ''));
    if (lesson.isCancelled || skipEx) {
      cancelledLessons.push({
        ...lesson,
        isCancelled: true,
        note: skipEx ? `Exemption: ${skipEx.reason}` : lesson.note,
      });
    } else {
      activeLessons.push(lesson);
    }
  }

  // Evaluate SmartRule packing effects (pack-item / skip-pack-item) for this date
  const ruleMatchesDate = (rule: SmartRule): boolean => {
    if (!rule.enabled) return false;
    const allowed: RuleDayOfWeek[] =
      Array.isArray(rule.activeDays) && rule.activeDays.length > 0
        ? rule.activeDays
        : [1, 2, 3, 4, 5];
    if (!allowed.includes(isoDow)) return false;

    const trigger = rule.triggerKind ?? (rule.requireHomework ? 'on-homework' : 'always');
    const subPattern = (rule.subjectMatch || '*').trim();
    const isWildcard = !subPattern || subPattern === '*' || subPattern.toLowerCase() === 'all';

    if (trigger === 'always') return true;
    if (trigger === 'on-subject-day') {
      if (isWildcard) return activeLessons.length > 0;
      return activeLessons.some((l) => looseSubjectMatch(l.subject, subPattern));
    }
    // 'on-homework'
    return homework.some((hw) => {
      if (hw.completed) return false;
      if (hw.dueDate !== date) return false;
      if (!isWildcard && !looseSubjectMatch(hw.subject, subPattern)) return false;
      if (rule.requireSupplies && hw.neededSupplies.length === 0) return false;
      return true;
    });
  };

  const rulePackAdditions: Array<{ id: string; label: string; rule: SmartRule }> = [];
  for (const rule of smartRules) {
    const eff = rule.effectKind ?? 'add-task';
    if (eff !== 'pack-item' && eff !== 'skip-pack-item') continue;
    const itemText = (rule.effectItem || '').trim();
    if (!itemText) continue;
    if (!ruleMatchesDate(rule)) continue;

    if (eff === 'skip-pack-item') {
      skippedItemLabels.push(itemText.toLowerCase());
    } else if (eff === 'pack-item') {
      rulePackAdditions.push({ id: `${date}::rule::${rule.id}`, label: itemText, rule });
    }
  }

  const isSkippedLabel = (label: string) =>
    skippedItemLabels.some((skip) => label.toLowerCase().includes(skip));

  const items: PackingChecklistItem[] = [];
  const stepsToRun = (packingSteps.length > 0 ? packingSteps : DEFAULT_PACKING_STEPS).filter(
    (s) => s.enabled,
  );
  const hasSchoolActivity =
    activeLessons.length > 0 ||
    homework.some((h) => h.dueDate === date) ||
    tests.some((t) => t.date === date);

  const resolvedEssentials =
    Array.isArray(dailyEssentials) ? dailyEssentials : getEssentialDailyItems(lang);

  for (const step of stepsToRun) {
    if (step.kind === 'essentials') {
      if (includeEssentials && activeLessons.length > 0) {
        resolvedEssentials.forEach((label, idx) => {
          if (!isSkippedLabel(label)) {
            items.push({
              id: `${date}::ess::${idx}`,
              label,
              category: 'essential',
            });
          }
        });
      }
    } else if (step.kind === 'subjects') {
      const seenSubjects = new Set<string>();
      for (const lesson of activeLessons) {
        const key = lesson.subject.trim().toLowerCase();
        if (seenSubjects.has(key)) continue;
        seenSubjects.add(key);

        const kitItems = findItemsForSubject(lesson.subject, subjectKits, lang);
        kitItems.forEach((kitItem, idx) => {
          if (isSkippedLabel(kitItem)) return;
          items.push({
            id: `${date}::sub::${key}::${idx}`,
            label: kitItem,
            category: 'subject',
            subject: lesson.subject,
          });
        });
      }
    } else if (step.kind === 'homework-supplies') {
      const dayHw = homework.filter((h) => h.dueDate === date && h.neededSupplies.length > 0);
      for (const hw of dayHw) {
        hw.neededSupplies.forEach((supply, idx) => {
          if (isSkippedLabel(supply)) return;
          items.push({
            id: `${date}::hw::${hw.id}::${idx}`,
            label: supply,
            category: 'homework-supply',
            subject: hw.subject,
            detail: tr(lang, `Na pracę domową (${hw.subject})`, `For ${hw.subject} homework`),
          });
        });
      }
    } else if (step.kind === 'message-extras') {
      dayExemptions
        .filter((e) => e.kind === 'add-item' && e.itemLabel)
        .forEach((ex) => {
          items.push({
            id: `${date}::ex-add::${ex.id}`,
            label: ex.itemLabel!,
            category: 'message-extra',
            detail: ex.reason,
          });
        });

      const dayExtracted = extractedItems.filter((ex) => ex.targetDate === date);
      for (const ex of dayExtracted) {
        if (isSkippedLabel(ex.item)) continue;
        items.push({
          id: `${date}::msg::${ex.id}`,
          label: ex.item,
          category: 'message-extra',
          subject: ex.subject,
          detail: ex.reason,
          sourceMessageId: ex.sourceMessageId,
        });
      }
    } else if (step.kind === 'test-prep') {
      const dayTests = tests.filter((t) => t.date === date);
      for (const t of dayTests) {
        items.push({
          id: `${date}::test::${t.id}`,
          label: tr(
            lang,
            `Notatki powtórkowe i zapasowy długopis (${t.subject})`,
            `Revision notes & spare pen for ${t.subject}`,
          ),
          category: 'test-prep',
          subject: t.subject,
          detail: `${t.category}: ${t.title}`,
        });
      }
    } else if (step.kind === 'custom') {
      if (hasSchoolActivity && !isSkippedLabel(step.label)) {
        items.push({
          id: `${date}::step::${step.id}`,
          label: step.label,
          category: 'custom',
          detail: step.note || tr(lang, 'Własny krok pakowania', 'Personal packing step'),
        });
      }
    }
  }

  // Date-specific custom items added for this exact date
  const dayCustom = customItems.filter((c) => c.date === date);
  for (const c of dayCustom) {
    items.push({
      id: `${date}::custom::${c.id}`,
      label: c.label,
      category: 'custom',
      detail: c.note,
      customItemId: c.id,
    });
  }

  // Append SmartRule 'pack-item' additions (runs even on custom/weekend days)
  for (const add of rulePackAdditions) {
    if (isSkippedLabel(add.label)) continue;
    items.push({
      id: add.id,
      label: add.label,
      category: 'custom',
      subject:
        add.rule.subjectMatch && add.rule.subjectMatch !== '*' ? add.rule.subjectMatch : undefined,
      detail: tr(lang, `Reguła: ${add.rule.name}`, `Rule: ${add.rule.name}`),
    });
  }

  return {
    date,
    activeLessons,
    cancelledLessons,
    items,
  };
}

export interface UnpackChecklistItem {
  id: string;
  label: string;
  category: PackingChecklistItem['category'];
  subject?: string;
  reason: string;
}

function normalizePackingLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function canonicalSubjectKey(subject?: string): string {
  if (!subject) return '';
  const clean = subject.trim().toLowerCase();
  return (SUBJECT_ALIASES[clean] ?? subject.trim()).toLowerCase();
}

function makeBagItemIdentity(item: Pick<PackingChecklistItem, 'category' | 'subject' | 'label'>): string {
  const normLabel = normalizePackingLabel(item.label);
  if (item.subject) {
    return `${canonicalSubjectKey(item.subject)}::${normLabel}`;
  }
  return normLabel;
}

function formatUnpackItemLabel(item: PackingChecklistItem): string {
  if (!item.subject) return item.label;
  const labelLower = item.label.toLowerCase();
  const subjectWords = item.subject
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  const alreadyMentionsSubject =
    labelLower.includes(item.subject.trim().toLowerCase()) ||
    subjectWords.some((w) => labelLower.includes(w.slice(0, Math.min(w.length, 5))));
  return alreadyMentionsSubject ? item.label : `${item.label} (${item.subject})`;
}

/**
 * Computes items that were packed for `fromPlan` (previous school day)
 * and are NOT needed in `toPlan` (target school day), so the student can
 * remove unnecessary weight from their backpack.
 */
export function buildDailyUnpackItems(params: {
  fromPlan: DailyPackingPlan;
  toPlan: DailyPackingPlan;
  targetDate: string;
  lang?: AppLanguage;
}): UnpackChecklistItem[] {
  const { fromPlan, toPlan, targetDate, lang = 'pl' } = params;
  if (fromPlan.items.length === 0) return [];

  const neededIdentities = new Set<string>();
  const neededNonSubjectLabels = new Set<string>();
  for (const item of toPlan.items) {
    neededIdentities.add(makeBagItemIdentity(item));
    if (!item.subject) {
      neededNonSubjectLabels.add(normalizePackingLabel(item.label));
    }
  }

  const targetDayName = formatWeekdayLong(targetDate, lang);
  const seenKeys = new Set<string>();
  const unpackItems: UnpackChecklistItem[] = [];

  for (const item of fromPlan.items) {
    // Keep daily essentials (student ID, pencil case, water/lunch) unless explicitly removed on a school day
    if (item.category === 'essential') continue;

    const identity = makeBagItemIdentity(item);
    const normLabel = normalizePackingLabel(item.label);
    if (neededIdentities.has(identity) || (!item.subject && neededNonSubjectLabels.has(normLabel))) {
      continue;
    }
    if (seenKeys.has(identity)) continue;
    seenKeys.add(identity);

    let reason: string;
    if (item.category === 'subject' && item.subject) {
      reason = tr(
        lang,
        `Brak lekcji „${item.subject}” (${targetDayName}) — wyjmij z plecaka`,
        `No ${item.subject} on ${targetDayName} — take out of bag`,
      );
    } else if (item.category === 'homework-supply') {
      reason = tr(
        lang,
        'Materiały z poprzedniej pracy domowej — już niepotrzebne',
        'From previous homework — no longer needed',
      );
    } else if (item.category === 'test-prep') {
      reason = item.subject
        ? tr(
            lang,
            `Notatki po sprawdzianie (${item.subject}) — możesz wyjąć`,
            `Post-test notes (${item.subject}) — safe to remove`,
          )
        : tr(lang, 'Notatki po sprawdzianie — możesz wyjąć', 'Post-test notes — safe to remove');
    } else if (item.category === 'message-extra') {
      reason = tr(
        lang,
        'Jednorazowa rzecz z poprzedniego dnia — wyjmij z plecaka',
        'One-time item from previous day — remove from bag',
      );
    } else {
      reason = tr(
        lang,
        `Niepotrzebne na ${targetDayName} — wyjmij z plecaka`,
        `Not needed for ${targetDayName} — remove from bag`,
      );
    }

    unpackItems.push({
      id: `${targetDate}::unpack::${identity}`,
      label: formatUnpackItemLabel(item),
      category: item.category,
      subject: item.subject,
      reason,
    });
  }

  return unpackItems;
}

export type TestUrgencyBucket = 'imminent' | 'advance-window' | 'horizon' | 'past';

export interface ClassifiedTest extends SchoolTest {
  daysUntil: number;
  bucket: TestUrgencyBucket;
  alertTriggerDate: string;
  studyStartDate: string;
}

export function classifyTestsByAdvanceNotice(
  tests: SchoolTest[],
  todayYmd: string,
  majorLeadDays = 3,
  quizLeadDays?: number,
): ClassifiedTest[] {
  const effectiveQuizLead = quizLeadDays ?? majorLeadDays;

  return tests
    .map((test) => {
      const leadDays = getTestLeadDays(test, majorLeadDays, effectiveQuizLead);

      const daysUntil = daysBetweenYmd(todayYmd, test.date);
      const alertTriggerDate = addDaysYmd(test.date, -leadDays);
      let bucket: TestUrgencyBucket;
      if (daysUntil < 0) {
        bucket = 'past';
      } else if (daysUntil < leadDays) {
        bucket = 'imminent';
      } else if (daysUntil <= leadDays + 4) {
        bucket = 'advance-window';
      } else {
        bucket = 'horizon';
      }
      return {
        ...test,
        daysUntil,
        bucket,
        alertTriggerDate,
        studyStartDate: alertTriggerDate,
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

export function formatCountdownLabel(daysUntil: number, lang: AppLanguage = 'pl'): string {
  if (lang === 'pl') {
    if (daysUntil < 0) return `${Math.abs(daysUntil)} dni temu`;
    if (daysUntil === 0) return 'Dziś';
    if (daysUntil === 1) return 'Jutro';
    return `Za ${daysUntil} dni`;
  }
  if (daysUntil < 0) return `${Math.abs(daysUntil)}d ago`;
  if (daysUntil === 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  return `In ${daysUntil} days`;
}
