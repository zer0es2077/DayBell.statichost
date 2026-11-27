import type {
  CommutePlace,
  DayOfWeek,
  HomeworkItem,
  LessonSlot,
  LibrusWorkspaceData,
  OneOffTask,
  ScheduleExemption,
  SchoolMessage,
  SchoolTest,
  SmartRule,
} from '../types';
import { addDaysYmd, getMondayYmd, getNextSchoolDayYmd, parseYmd } from '../utils/packingEngine';

export function createExampleSchoolWeek(todayYmd: string): LibrusWorkspaceData {
  const monday = getMondayYmd(todayYmd);
  const nextSchoolDay = getNextSchoolDayYmd(todayYmd);
  const dayDates = [0, 1, 2, 3, 4].map((offset) => addDaysYmd(monday, offset));

  // Ensure Plastyka due date is upcoming (Friday of this week, or next Friday if today is Fri/weekend)
  const todayDow = parseYmd(todayYmd).getDay();
  const plastykaDueDate = todayDow >= 5 || todayDow === 0 ? addDaysYmd(monday, 11) : dayDates[4];
  // Next PE day (Friday if Mon-Thu, or Monday next week)
  const nextPeDate = todayDow >= 5 || todayDow === 0 ? addDaysYmd(monday, 7) : dayDates[4];

  const template: Array<{
    dayIdx: number;
    lessonNumber: number;
    startTime: string;
    endTime: string;
    subject: string;
    teacher: string;
    room: string;
    isCancelled?: boolean;
    isSubstitution?: boolean;
    note?: string;
  }> = [
    // Monday (ends 13:30)
    { dayIdx: 0, lessonNumber: 1, startTime: '08:00', endTime: '08:45', subject: 'Matematyka', teacher: 'mgr Anna Kowalska', room: '204' },
    { dayIdx: 0, lessonNumber: 2, startTime: '08:55', endTime: '09:40', subject: 'Matematyka', teacher: 'mgr Anna Kowalska', room: '204' },
    { dayIdx: 0, lessonNumber: 3, startTime: '09:50', endTime: '10:35', subject: 'Język polski', teacher: 'mgr Marek Zieliński', room: '112' },
    { dayIdx: 0, lessonNumber: 4, startTime: '10:50', endTime: '11:35', subject: 'Język angielski', teacher: 'mgr Julia Nowak', room: '308' },
    { dayIdx: 0, lessonNumber: 5, startTime: '11:45', endTime: '12:30', subject: 'Wychowanie fizyczne', teacher: 'mgr Piotr Wiśniewski', room: 'Sala A' },
    { dayIdx: 0, lessonNumber: 6, startTime: '12:45', endTime: '13:30', subject: 'Historia', teacher: 'mgr Tomasz Wójcik', room: '115' },

    // Tuesday (ends 13:30)
    { dayIdx: 1, lessonNumber: 1, startTime: '08:00', endTime: '08:45', subject: 'Chemia', teacher: 'mgr Ewa Kamińska', room: 'Lab 2' },
    { dayIdx: 1, lessonNumber: 2, startTime: '08:55', endTime: '09:40', subject: 'Biologia', teacher: 'mgr Katarzyna Lewandowska', room: '210' },
    { dayIdx: 1, lessonNumber: 3, startTime: '09:50', endTime: '10:35', subject: 'Matematyka', teacher: 'mgr Anna Kowalska', room: '204' },
    { dayIdx: 1, lessonNumber: 4, startTime: '10:50', endTime: '11:35', subject: 'Język polski', teacher: 'mgr Marek Zieliński', room: '112' },
    { dayIdx: 1, lessonNumber: 5, startTime: '11:45', endTime: '12:30', subject: 'Język niemiecki', teacher: 'mgr Monika Szymańska', room: '305' },
    { dayIdx: 1, lessonNumber: 6, startTime: '12:45', endTime: '13:30', subject: 'Informatyka', teacher: 'mgr Michał Dąbrowski', room: 'Comp 1' },

    // Wednesday (ends 12:30 — Shopping Centre day!)
    { dayIdx: 2, lessonNumber: 1, startTime: '08:00', endTime: '08:45', subject: 'Fizyka', teacher: 'mgr Paweł Kozłowski', room: '218' },
    { dayIdx: 2, lessonNumber: 2, startTime: '08:55', endTime: '09:40', subject: 'Geografia', teacher: 'mgr Agnieszka Jankowska', room: '109' },
    { dayIdx: 2, lessonNumber: 3, startTime: '09:50', endTime: '10:35', subject: 'Język angielski', teacher: 'mgr Julia Nowak', room: '308' },
    { dayIdx: 2, lessonNumber: 4, startTime: '10:50', endTime: '11:35', subject: 'Matematyka', teacher: 'mgr Anna Kowalska', room: '204' },
    { dayIdx: 2, lessonNumber: 5, startTime: '11:45', endTime: '12:30', subject: 'Wychowanie fizyczne', teacher: 'mgr Piotr Wiśniewski', room: 'Sala A' },

    // Thursday (ends 13:30 — Shopping Centre day!)
    { dayIdx: 3, lessonNumber: 1, startTime: '08:00', endTime: '08:45', subject: 'Język polski', teacher: 'mgr Marek Zieliński', room: '112' },
    { dayIdx: 3, lessonNumber: 2, startTime: '08:55', endTime: '09:40', subject: 'Język polski', teacher: 'mgr Marek Zieliński', room: '112' },
    { dayIdx: 3, lessonNumber: 3, startTime: '09:50', endTime: '10:35', subject: 'Chemia', teacher: 'mgr Ewa Kamińska', room: 'Lab 2', isSubstitution: true, note: 'Substitution: mgr K. Lewandowska' },
    { dayIdx: 3, lessonNumber: 4, startTime: '10:50', endTime: '11:35', subject: 'Historia', teacher: 'mgr Tomasz Wójcik', room: '115', isCancelled: true, note: 'Cancelled — teacher conference' },
    { dayIdx: 3, lessonNumber: 5, startTime: '11:45', endTime: '12:30', subject: 'Matematyka', teacher: 'mgr Anna Kowalska', room: '204' },
    { dayIdx: 3, lessonNumber: 6, startTime: '12:45', endTime: '13:30', subject: 'WOS', teacher: 'mgr Tomasz Wójcik', room: '115' },

    // Friday (Plastyka + PE!)
    { dayIdx: 4, lessonNumber: 1, startTime: '08:00', endTime: '08:45', subject: 'Język angielski', teacher: 'mgr Julia Nowak', room: '308' },
    { dayIdx: 4, lessonNumber: 2, startTime: '08:55', endTime: '09:40', subject: 'Plastyka', teacher: 'mgr Zofia Krawczyk', room: 'Art 1' },
    { dayIdx: 4, lessonNumber: 3, startTime: '09:50', endTime: '10:35', subject: 'Biologia', teacher: 'mgr Katarzyna Lewandowska', room: '210' },
    { dayIdx: 4, lessonNumber: 4, startTime: '10:50', endTime: '11:35', subject: 'Geografia', teacher: 'mgr Agnieszka Jankowska', room: '109' },
    { dayIdx: 4, lessonNumber: 5, startTime: '11:45', endTime: '12:30', subject: 'Wychowanie fizyczne', teacher: 'mgr Piotr Wiśniewski', room: 'Sala A' },
  ];

  const timetable: LessonSlot[] = template.map((slot) => ({
    id: `ex-${dayDates[slot.dayIdx]}-${slot.lessonNumber}`,
    date: dayDates[slot.dayIdx],
    dayOfWeek: (slot.dayIdx + 1) as DayOfWeek,
    lessonNumber: slot.lessonNumber,
    startTime: slot.startTime,
    endTime: slot.endTime,
    subject: slot.subject,
    teacher: slot.teacher,
    room: slot.room,
    isCancelled: slot.isCancelled,
    isSubstitution: slot.isSubstitution,
    note: slot.note,
  }));

  const homework: HomeworkItem[] = [
    {
      id: 'ex-hw-1',
      subject: 'Plastyka',
      dueDate: plastykaDueDate,
      title: 'Autumn Perspective Watercolor Study',
      notes: 'Bring fresh watercolor block and wide flat brush to class.',
      neededSupplies: ['A3 watercolor paper pad', 'Flat brush #8'],
      completed: false,
      source: 'manual',
    },
    {
      id: 'ex-hw-2',
      subject: 'Matematyka',
      dueDate: nextSchoolDay,
      title: 'Workbook exercises 3.14 – 3.19',
      notes: 'Graphing parabola vertex form.',
      neededSupplies: [],
      completed: false,
      source: 'manual',
    },
  ];

  const commutePlaces: CommutePlace[] = [
    {
      id: 'place-shopping-centre',
      name: 'Shopping Centre',
      daysOfWeek: [1, 3, 4], // Mon, Wed, Thu
      when: 'after-school',
      notes: 'Walk past Galeria on the way to the bus stop after school.',
    },
  ];

  const smartRules: SmartRule[] = [
    {
      id: 'rule-plastyka-supplies',
      name: 'Plastyka supply stop at Shopping Centre',
      naturalText:
        'If there is a Plastyka lesson this week and homework needs supplies, check when I get out of school on a day I walk past the Shopping Centre, push a notification right as I leave school, and create a task that day.',
      enabled: true,
      subjectMatch: 'Plastyka',
      requireHomework: true,
      requireSupplies: true,
      placeName: 'Shopping Centre',
      activeDays: [1, 3, 4],
      timing: 'at-dismissal',
      offsetMinutes: 0,
      taskTemplate: 'Buy {supplies} for {subject} at {place}',
      notifyBrowser: true,
    },
  ];

  const oneOffTasks: OneOffTask[] = [
    {
      id: 'ex-oneoff-pebag',
      title: 'Find lost PE bag (check locker room & Lost & Found)',
      notes: 'Must be done at school before the day with PE.',
      priority: 'urgent',
      location: 'at-school',
      beforeSubject: 'Wychowanie fizyczne',
      deadlineDate: nextPeDate,
      targetDate: todayYmd,
      triggerTime: '09:45',
      completed: false,
      naturalSource: 'I LOST MY PE BAG, I have to find it at school before the day with PE',
    },
  ];

  const exemptions: ScheduleExemption[] = [
    {
      id: 'ex-exempt-1',
      date: dayDates[3],
      kind: 'skip-subject',
      subject: 'Historia',
      reason: 'Teacher away at conference (books excluded from Thursday bag)',
    },
  ];

  const tests: SchoolTest[] = [
    {
      id: 'ex-test-1',
      date: addDaysYmd(todayYmd, 3),
      subject: 'Matematyka',
      category: 'Sprawdzian',
      title: 'Quadratic Functions & Inequalities',
      description: 'Canonical form, roots, parabola graphing, and quadratic inequalities (Chapters 3.1–3.6). Calculator allowed.',
      teacher: 'mgr Anna Kowalska',
      source: 'librus-import',
    },
    {
      id: 'ex-test-2',
      date: addDaysYmd(todayYmd, 5),
      subject: 'Biologia',
      category: 'Sprawdzian',
      title: 'Cell Division: Mitosis & Meiosis',
      description: 'Phases of mitosis and meiosis, chromosome counts, DNA replication, and comparing somatic vs germ cell division.',
      teacher: 'mgr Katarzyna Lewandowska',
      source: 'librus-import',
    },
    {
      id: 'ex-test-3',
      date: addDaysYmd(todayYmd, 2),
      subject: 'Język angielski',
      category: 'Kartkówka',
      title: 'Unit 4 Phrasal Verbs & Passive Voice',
      description: 'Short 15-minute vocabulary and grammar quiz covering pages 52–57 of the student book.',
      teacher: 'mgr Julia Nowak',
      source: 'librus-import',
    },
    {
      id: 'ex-test-4',
      date: addDaysYmd(todayYmd, 9),
      subject: 'Historia',
      category: 'Praca klasowa',
      title: 'Interwar Poland (1918–1939)',
      description: 'Regaining independence, border formation, March Constitution, May Coup, and economic reforms of Grabski & Kwiatkowski.',
      teacher: 'mgr Tomasz Wójcik',
      source: 'librus-import',
    },
  ];

  const messages: SchoolMessage[] = [
    {
      id: 'ex-msg-1',
      kind: 'message',
      title: 'Przybory na lekcję matematyki + powtórzenie',
      author: 'mgr Anna Kowalska',
      date: todayYmd,
      unread: true,
      source: 'import',
      body: `Dzień dobry, przypominam że na jutrzejszą lekcję (${nextSchoolDay}) każdy uczeń musi przynieść cyrkiel, ekierkę oraz papier milimetrowy do konstrukcji wykresów. Sprawdzian z funkcji kwadratowej odbędzie się za 3 dni (${addDaysYmd(todayYmd, 3)}). Proszę przejrzeć zadania z działu 3.`,
    },
    {
      id: 'ex-msg-2',
      kind: 'announcement',
      title: 'Wyjście klasowe do teatru — zgody i wpłata',
      author: 'Wychowawca 2B (mgr Marek Zieliński)',
      date: todayYmd,
      unread: true,
      source: 'import',
      body: `Uwaga klasa 2B! Na jutro (${nextSchoolDay}) proszę obowiązkowo przynieść podpisaną przez rodzica zgodę na wyjście do Teatru Współczesnego oraz 35 zł odliczonej gotówki na bilet. Dodatkowo na lekcję języka polskiego zabierzcie egzemplarz lektury "Lalka" B. Prusa.`,
    },
    {
      id: 'ex-msg-3',
      kind: 'message',
      title: 'Zajęcia laboratoryjne z chemii i mała kartkówka',
      author: 'mgr Ewa Kamińska',
      date: addDaysYmd(todayYmd, -1),
      unread: true,
      source: 'import',
      body: `W związku z nadchodzącym doświadczeniem chemicznym w dniu ${addDaysYmd(todayYmd, 4)}, proszę o przyniesienie fartucha laboratoryjnego oraz gumki do włosów dla osób z długimi włosami. Na początku tej samej lekcji (${addDaysYmd(todayYmd, 4)}) napiszemy krótką kartkówkę z bilansowania równań reakcji (5 zadań).`,
    },
  ];

  return {
    studentName: 'Example Student (2B)',
    schoolClass: '2B Liceum',
    accountMode: 'sample',
    lastUpdatedAt: new Date().toISOString(),
    weekStart: monday,
    timetable,
    tests,
    messages,
    homework,
    commutePlaces,
    smartRules,
    oneOffTasks,
    exemptions,
  };
}
