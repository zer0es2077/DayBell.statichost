import type {
  DayOfWeek,
  HomeworkItem,
  ImportBatchResult,
  LessonSlot,
  SchoolMessage,
  SchoolTest,
} from '../types';
import { addDaysYmd, daysBetweenYmd, getMondayYmd, parseYmd } from './packingEngine';

const KNOWN_SUBJECTS: Array<{ canonical: string; patterns: string[] }> = [
  { canonical: 'Matematyka', patterns: ['matematyka', 'math', 'matma'] },
  { canonical: 'Język polski', patterns: ['język polski', 'jezyk polski', 'j. polski', 'polski', 'polish'] },
  { canonical: 'Język angielski', patterns: ['język angielski', 'jezyk angielski', 'j. angielski', 'angielski', 'english'] },
  { canonical: 'Język niemiecki', patterns: ['język niemiecki', 'jezyk niemiecki', 'j. niemiecki', 'niemiecki', 'german'] },
  { canonical: 'Wychowanie fizyczne', patterns: ['wychowanie fizyczne', 'w-f', 'wf', 'pe'] },
  { canonical: 'Chemia', patterns: ['chemia', 'chemistry'] },
  { canonical: 'Fizyka', patterns: ['fizyka', 'physics'] },
  { canonical: 'Biologia', patterns: ['biologia', 'biology'] },
  { canonical: 'Geografia', patterns: ['geografia', 'geography'] },
  { canonical: 'Historia', patterns: ['historia', 'history'] },
  { canonical: 'Informatyka', patterns: ['informatyka', 'computer science', 'it'] },
  { canonical: 'WOS', patterns: ['wos', 'wiedza o społeczeństwie', 'civics'] },
  { canonical: 'Plastyka', patterns: ['plastyka', 'art'] },
  { canonical: 'Muzyka', patterns: ['muzyka', 'music'] },
  { canonical: 'Religia', patterns: ['religia', 'etyka'] },
  { canonical: 'Godzina wychowawcza', patterns: ['godzina wychowawcza', 'wychowawcza', 'zajęcia z wychowawcą'] },
];

const WEEKDAY_REGEXES: Array<{ dow: DayOfWeek; re: RegExp }> = [
  { dow: 1, re: /\b(poniedziałek|poniedzialek|pon\.?|monday|mon)\b/i },
  { dow: 2, re: /\b(wtorek|wt\.?|tuesday|tue)\b/i },
  { dow: 3, re: /\b(środa|sroda|śr\.?|sr\.?|wednesday|wed)\b/i },
  { dow: 4, re: /\b(czwartek|czw\.?|thursday|thu)\b/i },
  { dow: 5, re: /\b(piątek|piatek|pt\.?|friday|fri)\b/i },
];

function detectSubject(text: string): string | null {
  const lower = text.toLowerCase();
  for (const entry of KNOWN_SUBJECTS) {
    for (const pat of entry.patterns) {
      if (pat.length <= 2) {
        const re = new RegExp(`\\b${pat}\\b`, 'i');
        if (re.test(lower)) return entry.canonical;
      } else if (lower.includes(pat)) {
        return entry.canonical;
      }
    }
  }
  return null;
}

function detectWeekday(text: string): DayOfWeek | null {
  for (const w of WEEKDAY_REGEXES) {
    if (w.re.test(text)) return w.dow;
  }
  return null;
}

function extractDateFromLine(line: string, todayYmd: string, weekStartYmd: string): string | null {
  // 1. YYYY-MM-DD
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(line);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // 2. DD.MM.YYYY or DD/MM/YYYY
  const dmy = /\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/.exec(line);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  // 3. DD.MM (assume current year, or next year if >60 days in the past e.g. Dec -> Jan)
  const dm = /\b(\d{1,2})\.(\d{1,2})\b/.exec(line);
  if (dm) {
    const day = Number.parseInt(dm[1], 10);
    const month = Number.parseInt(dm[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const year = parseYmd(todayYmd).getFullYear();
      const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (daysBetweenYmd(todayYmd, candidate) < -60) {
        return `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      return candidate;
    }
  }

  // 4. Relative words
  if (/\b(jutro|tomorrow)\b/i.test(line)) return addDaysYmd(todayYmd, 1);
  if (/\b(dzisiaj|dziś|dzis|today)\b/i.test(line)) return todayYmd;

  // 5. Weekday name -> upcoming occurrence in current/next week
  const dow = detectWeekday(line);
  if (dow) {
    const inWeek = addDaysYmd(weekStartYmd, dow - 1);
    return inWeek >= todayYmd ? inWeek : addDaysYmd(inWeek, 7);
  }

  return null;
}

function padTime(h: string, m: string): string {
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

/**
 * Instant, 100% browser-local parser for pasted Librus text (zero AI calls).
 * Recognizes timetable lines, sprawdziany/kartkówki, homework + supplies, and notices.
 */
export function parseLibrusTextLocally(
  rawText: string,
  todayYmd: string,
  weekStartYmd: string,
): ImportBatchResult {
  const monday = getMondayYmd(weekStartYmd || todayYmd);
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const stamp = Date.now();
  const lessons: LessonSlot[] = [];
  const homework: HomeworkItem[] = [];
  const tests: SchoolTest[] = [];
  const notices: string[] = [];

  let activeDay: DayOfWeek = Math.min(5, Math.max(1, parseYmd(todayYmd).getDay() || 1)) as DayOfWeek;
  const lessonCounters: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pure weekday heading line (e.g. "Poniedziałek" or "Friday:")
    const headingDow = detectWeekday(line);
    if (headingDow && line.length <= 28 && !/\d{1,2}:\d{2}/.test(line) && !/(sprawdzian|kartkówk|zadanie|homework|test|quiz)/i.test(line)) {
      activeDay = headingDow;
      continue;
    }

    // 1. Timetable line with time range (e.g. "08:00 - 08:45 Matematyka s. 204")
    const timeMatch = /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/.exec(line);
    if (timeMatch) {
      const startTime = padTime(timeMatch[1], timeMatch[2]);
      const endTime = padTime(timeMatch[3], timeMatch[4]);
      const dow = headingDow ?? activeDay;
      const date = addDaysYmd(monday, dow - 1);
      const rest = line
        .replace(timeMatch[0], '')
        .replace(/^\d+\.\s*/, '')
        .trim();

      const roomMatch = /\b(?:s\.|sala|room)\s*([a-z0-9-]+)/i.exec(rest);
      const room = roomMatch ? roomMatch[1] : '';
      const isCancelled = /(odwołan|odwolan|cancel)/i.test(rest);
      const isSubstitution = /(zastępstw|zastepstw|substitut)/i.test(rest);

      const detected = detectSubject(rest);
      const cleanedSubject =
        detected ||
        rest
          .replace(/\b(?:s\.|sala|room)\s*[a-z0-9-]+/gi, '')
          .replace(/(odwołan\w*|odwolan\w*|cancelled|zastępstw\w*|zastepstw\w*|substitution)/gi, '')
          .replace(/[|•·-]+/g, ' ')
          .trim() ||
        'Class';

      lessonCounters[dow] = (lessonCounters[dow] || 0) + 1;
      lessons.push({
        id: `loc-ls-${stamp}-${lessons.length}`,
        date,
        dayOfWeek: dow,
        lessonNumber: lessonCounters[dow],
        startTime,
        endTime,
        subject: cleanedSubject.slice(0, 60),
        teacher: '',
        room,
        isCancelled,
        isSubstitution,
      });
      continue;
    }

    // 2. Test / Exam line (Sprawdzian, Kartkówka, Praca klasowa, Quiz, Test)
    const testMatch = /\b(sprawdzian|kartkówka|kartkowka|praca klasowa|quiz|exam|test)\b/i.exec(line);
    if (testMatch) {
      const rawCat = testMatch[1].toLowerCase();
      const category = rawCat.includes('kartk')
        ? 'Kartkówka'
        : rawCat.includes('klasow')
          ? 'Praca klasowa'
          : rawCat === 'quiz'
            ? 'Quiz'
            : 'Sprawdzian';
      const date = extractDateFromLine(line, todayYmd, monday) || addDaysYmd(todayYmd, 3);
      const subject = detectSubject(line) || 'General';
      const cleanedTitle = line
        .replace(/\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}[./]\d{1,2}(?:[./]20\d{2})?\b/g, '')
        .replace(/\b(sprawdzian|kartkówka|kartkowka|praca klasowa|quiz|exam|test)\b/gi, '')
        .replace(/^[\s:–—-]+|[\s:–—-]+$/g, '')
        .trim();

      tests.push({
        id: `loc-test-${stamp}-${tests.length}`,
        date,
        subject,
        category,
        title: (cleanedTitle || `${subject} ${category}`).slice(0, 120),
        description: line.slice(0, 300),
        teacher: '',
        source: 'librus-import',
      });
      continue;
    }

    // 3. Homework line (zadanie, praca domowa, homework, hw, przynieść, bring)
    if (/\b(zadanie|praca domowa|homework|hw|przynieść|przyniesc|bring|supplies)\b/i.test(line)) {
      const dueDate = extractDateFromLine(line, todayYmd, monday) || addDaysYmd(todayYmd, 1);
      const subject = detectSubject(line) || 'General';

      // Pull supplies after "przynieść:" / "bring:" / "supplies:" / "potrzebne:"
      const supplyMatch = /(?:przynieść|przyniesc|bring|supplies|potrzebne)\s*:?\s*(.+)$/i.exec(line);
      const neededSupplies = supplyMatch
        ? supplyMatch[1]
            .split(/,|;|\bi\b|\band\b|\boraz\b/i)
            .map((s) => s.trim())
            .filter((s) => s.length >= 2 && s.length <= 60)
        : [];

      const title = line
        .replace(/\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}[./]\d{1,2}(?:[./]20\d{2})?\b/g, '')
        .replace(/\b(zadanie domowe|praca domowa|zadanie|homework|hw)\b\s*:?/gi, '')
        .trim();

      homework.push({
        id: `loc-hw-${stamp}-${homework.length}`,
        subject,
        dueDate,
        title: (title || `${subject} homework`).slice(0, 140),
        neededSupplies,
        completed: false,
        source: 'import',
      });
      continue;
    }

    notices.push(line);
  }

  const messages: SchoolMessage[] = [];
  if (notices.length > 0 && (lessons.length === 0 || notices.join(' ').length >= 25)) {
    const combinedBody = notices.join('\n');
    const firstLine = notices[0].slice(0, 80);
    messages.push({
      id: `loc-msg-${stamp}-0`,
      kind: 'announcement',
      title: firstLine,
      author: 'Pasted Note',
      date: todayYmd,
      body: combinedBody.slice(0, 4000),
      unread: true,
      source: 'import',
    });
  }

  return {
    summary: `Parsed locally (0 AI used): ${lessons.length} classes, ${homework.length} homework, ${tests.length} tests, ${messages.length} notices.`,
    lessons,
    homework,
    tests,
    messages,
  };
}

/**
 * Generates a compact prompt the user can copy into their OWN Gemini/ChatGPT app
 * along with a Librus screenshot, then paste the JSON reply back into Librus Pack.
 */
export function buildOwnAiImportPrompt(todayYmd: string, weekStartYmd: string): string {
  return `Extract EVERY timetable lesson across ALL visible days (Monday=1 to Friday=5), plus any homework (with supplies needed), tests/sprawdziany/kartkówki, and school notices from my Librus screenshot or text.
Today is ${todayYmd}. Monday of this week is ${weekStartYmd}.
IMPORTANT: Put every single class slot from the timetable into the "lessons" array with integer dayOfWeek (1=Poniedziałek/Mon, 2=Wtorek/Tue, 3=Środa/Wed, 4=Czwartek/Thu, 5=Piątek/Fri), lessonNumber, startTime (HH:MM), endTime (HH:MM), subject, and room.
Reply ONLY with valid JSON in this exact format (empty arrays if none):
{
  "lessons": [{"dayOfWeek": 1, "date": "${weekStartYmd}", "lessonNumber": 1, "startTime": "08:00", "endTime": "08:45", "subject": "Matematyka", "room": "204", "isCancelled": false}],
  "homework": [{"subject": "Plastyka", "dueDate": "YYYY-MM-DD", "title": "Praca akwarelowa", "neededSupplies": ["blok A3", "płaski pędzel"]}],
  "tests": [{"date": "YYYY-MM-DD", "subject": "Matematyka", "category": "Sprawdzian", "title": "Funkcja kwadratowa", "description": "Dział 3"}],
  "messages": [{"kind": "announcement", "title": "Tytuł ogłoszenia", "author": "Nauczyciel", "date": "${todayYmd}", "body": "Treść wiadomości"}]
}`;
}

function sanitizeYmd(val: unknown, fallback: string): string {
  return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim()) ? val.trim() : fallback;
}

function sanitizeHhmm(val: unknown, fallback: string): string {
  if (typeof val !== 'string') return fallback;
  const m = /(\d{1,2}):(\d{2})/.exec(val.trim());
  if (!m) return fallback;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function sanitizeStr(val: unknown, maxLen: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  return val.trim().slice(0, maxLen) || fallback;
}

function resolveLessonDayOfWeek(rawDay: unknown, rawDate: unknown): DayOfWeek {
  if (typeof rawDay === 'number' && rawDay >= 1 && rawDay <= 5) {
    return Math.floor(rawDay) as DayOfWeek;
  }
  if (typeof rawDay === 'string') {
    const trimmed = rawDay.trim();
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= 5) {
      return Math.floor(numeric) as DayOfWeek;
    }
    const detected = detectWeekday(trimmed);
    if (detected) return detected;
  }
  if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) {
    const jsDay = parseYmd(rawDate.trim()).getDay();
    if (jsDay >= 1 && jsDay <= 5) return jsDay as DayOfWeek;
  }
  return 1;
}

function extractRawLessonsArray(obj: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = [obj.lessons, obj.timetable, obj.schedule, obj.classes, obj.plan, obj.planLekcji];
  for (const cand of candidates) {
    if (Array.isArray(cand)) {
      return cand
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
        .slice(0, 120);
    }
    // Support day-keyed objects like { "Poniedziałek": [...], "Wtorek": [...] }
    if (cand && typeof cand === 'object' && !Array.isArray(cand)) {
      const flattened: Array<Record<string, unknown>> = [];
      for (const [dayKey, dayVal] of Object.entries(cand as Record<string, unknown>)) {
        const dow = detectWeekday(dayKey);
        if (Array.isArray(dayVal)) {
          for (const entry of dayVal) {
            if (entry && typeof entry === 'object') {
              flattened.push({
                ...(entry as Record<string, unknown>),
                dayOfWeek: (entry as Record<string, unknown>).dayOfWeek ?? dow ?? dayKey,
              });
            }
          }
        }
      }
      if (flattened.length > 0) return flattened.slice(0, 120);
    }
  }
  return [];
}

/**
 * Safely parses & validates JSON copied from the user's own Gemini/ChatGPT app.
 */
export function parseOwnAiJsonResponse(
  rawInput: string,
  todayYmd: string,
  weekStartYmd: string,
): { ok: true; batch: ImportBatchResult } | { ok: false; error: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, error: 'Paste the JSON reply from your own Gemini or ChatGPT app first.' };
  }

  // Strip optional markdown ```json ... ``` fences or leading/trailing prose
  let candidate = trimmed;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced) {
    candidate = fenced[1].trim();
  } else {
    const firstObj = trimmed.indexOf('{');
    const firstArr = trimmed.indexOf('[');
    if (firstArr >= 0 && (firstObj < 0 || firstArr < firstObj)) {
      const lastArr = trimmed.lastIndexOf(']');
      if (lastArr > firstArr) candidate = trimmed.slice(firstArr, lastArr + 1);
    } else if (firstObj >= 0) {
      const lastObj = trimmed.lastIndexOf('}');
      if (lastObj > firstObj) candidate = trimmed.slice(firstObj, lastObj + 1);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return {
      ok: false,
      error: 'Could not read valid JSON. Copy the entire JSON block from your AI app and paste it here.',
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Expected a JSON object with lessons, homework, tests, or messages.' };
  }

  const obj: Record<string, unknown> = Array.isArray(parsed)
    ? { lessons: parsed }
    : (parsed as Record<string, unknown>);
  const stamp = Date.now();
  const monday = getMondayYmd(weekStartYmd || todayYmd);

  const rawLessons = extractRawLessonsArray(obj);
  const perDayCounter: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const lessons: LessonSlot[] = rawLessons
    .map((l, idx) => {
      const dow = resolveLessonDayOfWeek(l.dayOfWeek ?? l.day ?? l.weekday, l.date);
      const defaultDate = addDaysYmd(monday, dow - 1);
      perDayCounter[dow] = (perDayCounter[dow] || 0) + 1;
      const rawNum = Number(l.lessonNumber ?? l.period ?? l.number ?? l.nr);
      const lessonNum = !Number.isNaN(rawNum) && rawNum > 0 ? Math.floor(rawNum) : perDayCounter[dow];
      const subject = sanitizeStr(l.subject ?? l.name ?? l.title ?? l.przedmiot, 80, '');
      if (!subject) return null;

      // Support combined time string like "08:00-08:45" if startTime/endTime not split
      let startCandidate = l.startTime ?? l.start ?? l.from;
      let endCandidate = l.endTime ?? l.end ?? l.to;
      if (typeof l.time === 'string' && l.time.includes('-')) {
        const [tStart, tEnd] = l.time.split('-');
        startCandidate = startCandidate ?? tStart;
        endCandidate = endCandidate ?? tEnd;
      }

      const startHour = Math.min(20, 7 + lessonNum);
      return {
        id: `ownai-ls-${stamp}-${idx}`,
        date: sanitizeYmd(l.date, defaultDate),
        dayOfWeek: dow,
        lessonNumber: lessonNum,
        startTime: sanitizeHhmm(startCandidate, `${String(startHour).padStart(2, '0')}:00`),
        endTime: sanitizeHhmm(endCandidate, `${String(startHour).padStart(2, '0')}:45`),
        subject,
        teacher: sanitizeStr(l.teacher ?? l.nauczyciel, 80, ''),
        room: sanitizeStr(l.room ?? l.sala, 30, ''),
        isCancelled: Boolean(l.isCancelled ?? l.cancelled),
        isSubstitution: Boolean(l.isSubstitution ?? l.substitution),
        note: sanitizeStr(l.note ?? l.notes, 200) || undefined,
      } as LessonSlot;
    })
    .filter((item): item is LessonSlot => item !== null);

  const rawHomework = Array.isArray(obj.homework) ? obj.homework.slice(0, 60) : [];
  const homework: HomeworkItem[] = rawHomework
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((h, idx) => ({
      id: `ownai-hw-${stamp}-${idx}`,
      subject: sanitizeStr(h.subject, 80, 'Ogólne'),
      dueDate: sanitizeYmd(h.dueDate, addDaysYmd(todayYmd, 1)),
      title: sanitizeStr(h.title, 180, 'Praca domowa'),
      notes: sanitizeStr(h.notes, 300) || undefined,
      neededSupplies: Array.isArray(h.neededSupplies)
        ? h.neededSupplies
            .map((s) => sanitizeStr(s, 80))
            .filter(Boolean)
            .slice(0, 15)
        : [],
      completed: false,
      source: 'import',
    }));

  const rawTests = Array.isArray(obj.tests) ? obj.tests.slice(0, 40) : [];
  const tests: SchoolTest[] = rawTests
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((t, idx) => ({
      id: `ownai-test-${stamp}-${idx}`,
      date: sanitizeYmd(t.date, addDaysYmd(todayYmd, 3)),
      subject: sanitizeStr(t.subject, 80, 'Ogólne'),
      category: sanitizeStr(t.category, 40, 'Sprawdzian'),
      title: sanitizeStr(t.title, 160, 'Sprawdzian'),
      description: sanitizeStr(t.description, 400, sanitizeStr(t.title, 160, 'Sprawdzian')),
      teacher: sanitizeStr(t.teacher, 80, ''),
      source: 'librus-import',
    }));

  const rawMessages = Array.isArray(obj.messages) ? obj.messages.slice(0, 40) : [];
  const messages: SchoolMessage[] = rawMessages
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map(
      (m, idx): SchoolMessage => ({
        id: `ownai-msg-${stamp}-${idx}`,
        kind: m.kind === 'message' ? 'message' : 'announcement',
        title: sanitizeStr(m.title, 160, 'Ogłoszenie'),
        author: sanitizeStr(m.author, 80, 'Nauczyciel'),
        date: sanitizeYmd(m.date, todayYmd),
        body: sanitizeStr(m.body, 3000, ''),
        unread: true,
        source: 'import',
      }),
    )
    .filter((m) => m.body.length > 0);

  if (lessons.length + homework.length + tests.length + messages.length === 0) {
    return {
      ok: false,
      error: 'The JSON was valid, but contained 0 lessons, homework, tests, or messages.',
    };
  }

  return {
    ok: true,
    batch: {
      summary: `${lessons.length} lekcji / classes · ${homework.length} zadań / HW · ${tests.length} sprawdzianów / tests · ${messages.length} ogłoszeń / notices`,
      lessons,
      homework,
      tests,
      messages,
    },
  };
}
