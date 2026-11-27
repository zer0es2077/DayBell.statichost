import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarCheck2, Check } from 'lucide-react';
import type {
  AppLanguage,
  CommutePlace,
  ExemptionKind,
  LessonSlot,
  ParsedCommandIntent,
  RuleDayOfWeek,
  RuleEffectKind,
  RuleTriggerKind,
  ScheduleExemption,
  TaskLocationConstraint,
  UserSettings,
} from '../types';
import { tr } from '../utils/i18n';
import {
  addDaysYmd,
  formatShortDate,
  formatWeekdayShort,
  getNextSchoolDayYmd,
  getStudyPhaseSplit,
  getTestLeadDays,
} from '../utils/packingEngine';
import {
  ALL_RULE_DAYS,
  SCHOOL_RULE_DAYS,
  findNextSubjectDate,
  ruleWeekdayLabel,
  solveTaskPlacement,
  type ConveniencePreference,
} from '../utils/smartEngine';

export type WizardKind = 'one-off-task' | 'homework' | 'test' | 'exemption' | 'smart-rule';

interface StepAddWizardProps {
  todayYmd: string;
  timetable: LessonSlot[];
  commutePlaces: CommutePlace[];
  exemptions: ScheduleExemption[];
  settings: UserSettings;
  initialKind?: WizardKind | null;
  onCommitIntent: (intent: ParsedCommandIntent) => void;
}

const ALL_SCHOOL_SUBJECTS = [
  'Matematyka',
  'Język polski',
  'Język angielski',
  'Język niemiecki',
  'Język hiszpański',
  'Język francuski',
  'Biologia',
  'Chemia',
  'Fizyka',
  'Geografia',
  'Historia',
  'WOS',
  'HiT',
  'Informatyka',
  'Wychowanie fizyczne',
  'Plastyka',
  'Muzyka',
  'Technika',
  'Przyroda',
  'Edukacja dla bezpieczeństwa',
  'Biznes i zarządzanie',
  'Religia',
  'Etyka',
  'Filozofia',
  'Godzina wychowawcza',
];

export function StepAddWizard({
  todayYmd,
  timetable,
  commutePlaces,
  exemptions,
  settings,
  initialKind = null,
  onCommitIntent,
}: StepAddWizardProps) {
  const lang: AppLanguage = settings.language || 'pl';

  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialKind ? 2 : 1);
  const [kind, setKind] = useState<WizardKind>(initialKind ?? 'one-off-task');

  useEffect(() => {
    if (initialKind) {
      setKind(initialKind);
      setStep(2);
    } else {
      setStep(1);
    }
  }, [initialKind]);

  // Shared / tailored fields
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'urgent' | 'normal'>('urgent');
  const [subject, setSubject] = useState('Plastyka');
  const [supplies, setSupplies] = useState('');
  const [testCategory, setTestCategory] = useState('Sprawdzian');
  const [exemptionKind, setExemptionKind] = useState<ExemptionKind>('skip-subject');
  const [earlyTime, setEarlyTime] = useState('11:35');

  // Deadline step (Step 3)
  const [deadlineMode, setDeadlineMode] = useState<'date' | 'before-subject'>('date');
  const [beforeSubject, setBeforeSubject] = useState('Wychowanie fizyczne');
  const [deadlineDate, setDeadlineDate] = useState<string>(() => addDaysYmd(todayYmd, 2));

  // Convenience & placement step (Step 4 for Task)
  const [location, setLocation] = useState<TaskLocationConstraint>('at-school');
  const [commutePlaceName, setCommutePlaceName] = useState<string>('');
  const [convenience, setConvenience] = useState<ConveniencePreference>('earliest');
  const [preferredTime, setPreferredTime] = useState<string>('auto');

  // Smart Rule fields
  const [ruleTrigger, setRuleTrigger] = useState<RuleTriggerKind>('always');
  const [ruleEffect, setRuleEffect] = useState<RuleEffectKind>('add-task');
  const [ruleEffectText, setRuleEffectText] = useState<string>('');
  const [ruleEffectItem, setRuleEffectItem] = useState<string>('');
  const [ruleSubject, setRuleSubject] = useState<string>('*');
  const [ruleRequireSupplies, setRuleRequireSupplies] = useState<boolean>(false);
  const [rulePlace, setRulePlace] = useState<string>('');
  const [ruleDays, setRuleDays] = useState<RuleDayOfWeek[]>([...SCHOOL_RULE_DAYS]);
  const [ruleTiming, setRuleTiming] = useState<'at-dismissal' | 'before-school' | 'evening' | 'custom'>(
    'at-dismissal',
  );
  const [ruleCustomTime, setRuleCustomTime] = useState<string>('16:00');
  const [ruleNotify, setRuleNotify] = useState<boolean>(true);

  const subjectSuggestions = useMemo(() => {
    const fromTimetable: string[] = [];
    const seen = new Set<string>();
    for (const lesson of timetable) {
      if (lesson.isCancelled) continue;
      const clean = lesson.subject.trim();
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      fromTimetable.push(clean);
    }
    return fromTimetable.length > 0 ? fromTimetable : ALL_SCHOOL_SUBJECTS;
  }, [timetable]);

  const totalSteps = kind === 'one-off-task' ? 4 : kind === 'smart-rule' ? 2 : 3;

  const nextSelectedSubjectDate = useMemo(() => {
    const targetSub = kind === 'one-off-task' ? beforeSubject : subject;
    if (!targetSub.trim()) return null;
    return findNextSubjectDate(targetSub, timetable, exemptions, addDaysYmd(todayYmd, 1));
  }, [kind, beforeSubject, subject, timetable, exemptions, todayYmd]);

  const placementPreview = useMemo(() => {
    if (kind !== 'one-off-task') return null;
    return solveTaskPlacement({
      todayYmd,
      deadlineMode,
      explicitDeadlineDate: deadlineDate,
      beforeSubject: deadlineMode === 'before-subject' ? beforeSubject : undefined,
      location,
      commutePlaceName: location === 'after-school' ? commutePlaceName : undefined,
      convenience,
      preferredTime,
      timetable,
      commutePlaces,
      exemptions,
      studyStartTime: settings.studyStartTime,
      lang,
    });
  }, [
    kind,
    todayYmd,
    deadlineMode,
    deadlineDate,
    beforeSubject,
    location,
    commutePlaceName,
    convenience,
    preferredTime,
    timetable,
    commutePlaces,
    exemptions,
    settings.studyStartTime,
    lang,
  ]);

  const testSplitPreview = useMemo(() => {
    if (kind !== 'test') return null;
    const dummy = {
      id: 'preview',
      date: deadlineDate,
      subject,
      category: testCategory,
      title,
      description: notes,
      teacher: '',
      source: 'manual' as const,
    };
    const lead = getTestLeadDays(dummy, settings.majorTestLeadDays, settings.quizLeadDays);
    return { lead, ...getStudyPhaseSplit(lead) };
  }, [kind, deadlineDate, subject, testCategory, title, notes, settings]);

  const resetForm = () => {
    setStep(1);
    setTitle('');
    setNotes('');
    setSupplies('');
    setPreferredTime('auto');
    setRuleEffectText('');
    setRuleEffectItem('');
  };

  const canProceedFromStep2 = () => {
    if (kind === 'exemption' && exemptionKind === 'early-dismissal') {
      return Boolean(earlyTime.trim());
    }
    if (kind === 'exemption' && exemptionKind === 'skip-subject') {
      return Boolean(subject.trim());
    }
    if (kind === 'smart-rule') {
      if (ruleDays.length === 0) return false;
      if (ruleEffect === 'pack-item' || ruleEffect === 'skip-pack-item') {
        return ruleEffectItem.trim().length >= 2;
      }
      // For homework trigger, effect text can be left blank to auto-fill from homework title/supplies
      if (ruleTrigger === 'on-homework') return true;
      return ruleEffectText.trim().length >= 2 || title.trim().length >= 2;
    }
    return title.trim().length >= 2;
  };

  const handleFinish = () => {
    if (kind === 'one-off-task' && placementPreview) {
      onCommitIntent({
        intent: 'one-off-task',
        explanation: tr(
          lang,
          `Dopasowano: ${placementPreview.reason}`,
          `Placed on ${placementPreview.reason}`,
        ),
        task: {
          title: title.trim(),
          notes: notes.trim() || undefined,
          priority,
          location,
          beforeSubject: deadlineMode === 'before-subject' ? beforeSubject.trim() : undefined,
          deadlineDate: placementPreview.deadlineDate,
          targetDate: placementPreview.targetDate,
          triggerTime: placementPreview.triggerTime,
        },
      });
    } else if (kind === 'homework') {
      const supplyList = supplies
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      onCommitIntent({
        intent: 'homework',
        explanation:
          supplyList.length > 0
            ? tr(
                lang,
                `Dodano pracę domową (${formatShortDate(deadlineDate, lang)}) z materiałami: ${supplyList.join(', ')}`,
                `Homework added (${formatShortDate(deadlineDate, lang)}) with supplies: ${supplyList.join(', ')}`,
              )
            : tr(
                lang,
                `Dodano pracę domową na ${formatShortDate(deadlineDate, lang)}.`,
                `Homework added for ${formatShortDate(deadlineDate, lang)}.`,
              ),
        homework: {
          subject: subject.trim() || tr(lang, 'Ogólne', 'General'),
          dueDate: deadlineDate,
          title: title.trim(),
          notes: notes.trim() || undefined,
          neededSupplies: supplyList,
        },
      });
    } else if (kind === 'test') {
      onCommitIntent({
        intent: 'test',
        explanation: tr(
          lang,
          `Dodano: ${testCategory} — w kanale dnia zaplanowano ${testSplitPreview?.learningDays ?? 1} dni nauki i ${testSplitPreview?.repeatingDays ?? 0} dni powtórki.`,
          `${testCategory} added — ${testSplitPreview?.learningDays ?? 1}d Learn & ${testSplitPreview?.repeatingDays ?? 0}d Repeat queued in your feed.`,
        ),
        test: {
          date: deadlineDate,
          subject: subject.trim() || tr(lang, 'Ogólne', 'General'),
          category: testCategory,
          title: title.trim(),
          description: notes.trim() || title.trim(),
          teacher: '',
        },
      });
    } else if (kind === 'exemption') {
      onCommitIntent({
        intent: 'exemption',
        explanation: tr(
          lang,
          `Zastosowano zwolnienie na ${formatShortDate(deadlineDate, lang)}.`,
          `Exemption applied for ${formatShortDate(deadlineDate, lang)}.`,
        ),
        exemption: {
          date: deadlineDate,
          kind: exemptionKind,
          subject: exemptionKind === 'skip-subject' ? subject.trim() : undefined,
          itemLabel:
            exemptionKind === 'skip-item' || exemptionKind === 'add-item'
              ? title.trim()
              : undefined,
          customDismissalTime: exemptionKind === 'early-dismissal' ? earlyTime : undefined,
          reason:
            notes.trim() ||
            (exemptionKind === 'skip-subject'
              ? tr(lang, `Bez lekcji: ${subject.trim()}`, `Skip ${subject.trim()}`)
              : exemptionKind === 'early-dismissal'
                ? tr(lang, `Wcześniejsze wyjście o ${earlyTime}`, `Early dismissal at ${earlyTime}`)
                : title.trim()),
        },
      });
    } else if (kind === 'smart-rule') {
      const cleanSub = ruleTrigger === 'always' ? '*' : ruleSubject.trim() || '*';
      const cleanPlace = rulePlace.trim();
      const cleanItem = ruleEffectItem.trim();
      const cleanText = ruleEffectText.trim();
      const sortedDays = [...ruleDays].sort((a, b) => a - b) as RuleDayOfWeek[];
      const daysText = sortedDays.map((d) => ruleWeekdayLabel(d, lang)).join(', ');
      const subjectDisplay =
        cleanSub === '*' ? tr(lang, 'Wszystkie przedmioty', 'All subjects') : cleanSub;

      let defaultName = title.trim();
      if (!defaultName) {
        if (ruleEffect === 'pack-item') {
          defaultName = tr(lang, `Spakuj: ${cleanItem}`, `Pack: ${cleanItem}`);
        } else if (ruleEffect === 'skip-pack-item') {
          defaultName = tr(lang, `Nie pakuj: ${cleanItem}`, `Skip: ${cleanItem}`);
        } else if (cleanText) {
          defaultName = cleanText;
        } else {
          defaultName = cleanPlace
            ? `${subjectDisplay} · ${cleanPlace}`
            : `${subjectDisplay} (${daysText})`;
        }
      }

      const defaultTemplate =
        cleanText ||
        (ruleTrigger === 'on-homework'
          ? ruleRequireSupplies
            ? cleanPlace
              ? tr(
                  lang,
                  'Kupić {supplies} na {subject} ({place})',
                  'Buy {supplies} for {subject} at {place}',
                )
              : tr(lang, 'Przygotować {supplies} na {subject}', 'Prepare {supplies} for {subject}')
            : cleanPlace
              ? tr(lang, '{subject}: {supplies} ({place})', '{subject}: {supplies} ({place})')
              : tr(lang, '{subject}: {supplies}', '{subject}: {supplies}')
          : defaultName);

      const effectSummary =
        ruleEffect === 'pack-item'
          ? tr(lang, `doda „${cleanItem}” do plecaka`, `adds "${cleanItem}" to packing list`)
          : ruleEffect === 'skip-pack-item'
            ? tr(lang, `pominie „${cleanItem}” przy pakowaniu`, `skips "${cleanItem}" from packing`)
            : ruleEffect === 'notify-only'
              ? tr(lang, `wyśle powiadomienie „${defaultTemplate}”`, `sends alert "${defaultTemplate}"`)
              : tr(lang, `doda zadanie „${defaultTemplate}”`, `adds task "${defaultTemplate}"`);

      onCommitIntent({
        intent: 'smart-rule',
        explanation: tr(
          lang,
          `Aktywna reguła (${daysText}): ${effectSummary}.`,
          `Rule active (${daysText}): ${effectSummary}.`,
        ),
        rule: {
          name: defaultName,
          naturalText: `${daysText}: ${effectSummary}`,
          enabled: true,
          triggerKind: ruleTrigger,
          effectKind: ruleEffect,
          effectText:
            ruleEffect === 'add-task' || ruleEffect === 'notify-only' ? cleanText || undefined : undefined,
          effectItem:
            ruleEffect === 'pack-item' || ruleEffect === 'skip-pack-item' ? cleanItem : undefined,
          customTime: ruleTiming === 'custom' ? ruleCustomTime : undefined,
          subjectMatch: cleanSub,
          requireHomework: ruleTrigger === 'on-homework',
          requireSupplies: ruleTrigger === 'on-homework' && ruleRequireSupplies,
          placeName: cleanPlace,
          activeDays: sortedDays,
          timing: ruleTiming,
          offsetMinutes: 0,
          taskTemplate: defaultTemplate,
          notifyBrowser: ruleEffect === 'notify-only' ? true : ruleNotify,
        },
      });
    }
    resetForm();
  };

  const stepHeadline = () => {
    if (step === 1) return tr(lang, 'Krok 1: Co chcesz dodać?', 'Step 1: What are you adding?');
    if (step === 2) {
      if (kind === 'one-off-task') {
        return tr(lang, 'Krok 2: Co trzeba zrobić?', 'Step 2: What needs to be done?');
      }
      if (kind === 'homework') {
        return tr(lang, 'Krok 2: Praca domowa i materiały', 'Step 2: Homework & supplies');
      }
      if (kind === 'test') {
        return tr(lang, 'Krok 2: Szczegóły sprawdzianu', 'Step 2: Test details');
      }
      if (kind === 'exemption') {
        return tr(lang, 'Krok 2: Rodzaj zwolnienia / zmiany', 'Step 2: Exception details');
      }
      return tr(lang, 'Krok 2: Ustaw regułę i dni działania', 'Step 2: Rule trigger & active days');
    }
    if (step === 3) {
      return kind === 'test'
        ? tr(lang, 'Krok 3: Data sprawdzianu', 'Step 3: Test date')
        : kind === 'exemption'
          ? tr(lang, 'Krok 3: Którego dnia obowiązuje?', 'Step 3: Which day does it apply?')
          : tr(lang, 'Krok 3: Najpóźniejszy termin', 'Step 3: Latest deadline');
    }
    return tr(
      lang,
      'Krok 4: Gdzie i kiedy będzie najwygodniej?',
      'Step 4: Where & when is most convenient?',
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
      {/* Clear Step Progress Header */}
      <div className="shrink-0 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base sm:text-lg font-bold text-blue-200">{stepHeadline()}</h3>
          <span className="font-mono text-xs tabular-nums text-blue-400 shrink-0">
            {tr(lang, `Krok ${step} z ${totalSteps}`, `Step ${step} of ${totalSteps}`)}
          </span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: totalSteps }, (_, idx) => {
            const active = idx + 1 <= step;
            return (
              <div
                key={idx}
                className={`flex-1 h-1.5 rounded-full transition-colors ${
                  active ? 'bg-blue-500' : 'bg-blue-950'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Spacious Scrollable Step Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 pb-2 space-y-5">
        {step === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                [
                  'one-off-task',
                  tr(lang, 'Zadanie / Sprawa do załatwienia', 'Task / Errand'),
                  tr(
                    lang,
                    'Aplikacja sama dopasuje najlepszy dzień i godzinę w planie lekcji',
                    'Auto-fits into the best day & time in your timetable',
                  ),
                ],
                [
                  'homework',
                  tr(lang, 'Praca domowa', 'Homework'),
                  tr(
                    lang,
                    'Pilnuje terminu oraz potrzebnych materiałów (np. blok, klej)',
                    'Tracks due date, supplies & after-school rules',
                  ),
                ],
                [
                  'test',
                  tr(lang, 'Sprawdzian / Kartkówka', 'Test / Quiz'),
                  tr(
                    lang,
                    'Automatycznie dzieli dni w kanale na Naukę i Powtórkę',
                    'Splits advance days in your feed into Learn & Repeat',
                  ),
                ],
                [
                  'exemption',
                  tr(lang, 'Zwolnienie / Zmiana w dniu', 'Exemption / Day Change'),
                  tr(
                    lang,
                    'Odwołana lekcja, pominięcie podręcznika lub wcześniejsze wyjście',
                    'Skip class/book, add extra item, or early dismissal',
                  ),
                ],
                [
                  'smart-rule',
                  tr(lang, 'Reguła automatyczna', 'Automatic Rule'),
                  tr(
                    lang,
                    'Automatyczne przypomnienia i zadania w wybrane dni tygodnia',
                    'Automatic reminders and tasks on the days you choose',
                  ),
                ],
              ] as Array<[WizardKind, string, string]>
            ).map(([k, label, sub]) => {
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setStep(2);
                  }}
                  className={`min-h-[82px] p-4 sm:p-5 text-left rounded-2xl border transition-colors flex flex-col justify-center gap-1 ${
                    active
                      ? 'bg-blue-950/60 border-blue-500 text-blue-200'
                      : 'bg-black border-blue-900/80 hover:border-blue-400 text-blue-200'
                  }`}
                >
                  <div className="text-sm sm:text-base font-bold text-blue-200">{label}</div>
                  <div className="text-xs text-blue-400 leading-relaxed">{sub}</div>
                </button>
              );
            })}
          </div>
        )}

        {step === 2 && kind === 'one-off-task' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-blue-300">
                {tr(lang, 'Nazwa zadania', 'Task name')}
              </label>
              <input
                type="text"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tr(
                  lang,
                  'np. Znaleźć zgubiony worek na WF, wydrukować rozprawkę, kupić teczkę...',
                  'e.g. Find lost PE bag, print essay, buy folder...',
                )}
                className="w-full min-h-[48px] px-4 py-3 text-sm sm:text-base bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-blue-300">
                {tr(lang, 'Krótka notatka (opcjonalnie)', 'Short note (optional)')}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={tr(
                  lang,
                  'np. Sprawdzić w szatni i u woźnego',
                  'e.g. Check locker room & Lost & Found',
                )}
                className="w-full min-h-[46px] px-4 py-2.5 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-950 rounded-xl focus:outline-none focus:border-blue-400"
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-300">
                {tr(lang, 'Priorytet', 'Priority')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ['urgent', tr(lang, 'Pilne', 'Urgent')],
                    ['normal', tr(lang, 'Zwykłe', 'Normal')],
                  ] as const
                ).map(([p, label]) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`min-h-[46px] px-4 text-sm font-semibold rounded-xl border transition-colors ${
                      priority === p
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 2 && kind === 'homework' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-300">
                {tr(lang, 'Przedmioty z planu lekcji', 'Subjects from your lesson plan')}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto overscroll-contain pr-1">
                {subjectSuggestions.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setSubject(sub)}
                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${
                      subject.trim().toLowerCase() === sub.toLowerCase()
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-blue-300">
                  {tr(lang, 'Lub wpisz inny przedmiot', 'Or type any subject')}
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={tr(lang, 'Wpisz dowolny przedmiot...', 'Type any subject...')}
                  className="w-full min-h-[46px] px-4 py-2.5 text-sm bg-black text-blue-200 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-blue-300">
                  {tr(lang, 'Treść zadania', 'Homework task')}
                </label>
                <input
                  type="text"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tr(
                    lang,
                    'np. Zadania 3.14–3.19 ze zbioru',
                    'e.g. Exercises 3.14–3.19',
                  )}
                  className="w-full min-h-[46px] px-4 py-2.5 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-blue-300">
                {tr(
                  lang,
                  'Potrzebne materiały do przyniesienia / kupienia (oddziel przecinkiem)',
                  'Supplies needed? (comma-separated)',
                )}
              </label>
              <input
                type="text"
                value={supplies}
                onChange={(e) => setSupplies(e.target.value)}
                placeholder={tr(
                  lang,
                  'np. blok akwarelowy A3, płaski pędzel',
                  'e.g. A3 watercolor pad, flat brush',
                )}
                className="w-full min-h-[46px] px-4 py-2.5 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-950 rounded-xl focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
        )}

        {step === 2 && kind === 'test' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-300">
                {tr(lang, 'Rodzaj', 'Type')}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {['Sprawdzian', 'Kartkówka', 'Praca klasowa', 'Odpowiedź'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setTestCategory(cat)}
                    className={`min-h-[44px] px-3 text-xs sm:text-sm font-semibold rounded-xl border transition-colors ${
                      testCategory === cat
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-300">
                {tr(lang, 'Przedmioty z planu lekcji', 'Subjects from your lesson plan')}
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto overscroll-contain pr-1">
                {subjectSuggestions.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setSubject(sub)}
                    className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-xl border transition-colors ${
                      subject.trim().toLowerCase() === sub.toLowerCase()
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-blue-300">
                  {tr(lang, 'Lub wpisz inny przedmiot', 'Or type any subject')}
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={tr(lang, 'np. Matematyka', 'e.g. Matematyka')}
                  className="w-full min-h-[46px] px-4 py-2.5 text-sm bg-black text-blue-200 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-blue-300">
                  {tr(lang, 'Temat', 'Topic')}
                </label>
                <input
                  type="text"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tr(lang, 'np. Funkcja kwadratowa', 'e.g. Quadratic Equations')}
                  className="w-full min-h-[46px] px-4 py-2.5 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-blue-300">
                {tr(
                  lang,
                  'Wspólne notatki / zakres materiału dla klasy (opcjonalnie)',
                  'Shared class notes / exam scope (optional)',
                )}
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={tr(
                  lang,
                  'np. Dział 4, str. 82–105, wzory do zapamiętania, co nauczyciel mówił że będzie...',
                  'e.g. Chapter 4, pages 82–105, formulas to know, teacher tips...',
                )}
                className="w-full resize-none px-4 py-2.5 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-950 rounded-xl focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
        )}

        {step === 2 && kind === 'exemption' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(
                [
                  ['skip-subject', tr(lang, 'Pomiń lekcję i jej książki', 'Skip class & books')],
                  ['skip-item', tr(lang, 'Nie pakuj 1 rzeczy', 'Skip 1 packed item')],
                  ['add-item', tr(lang, 'Dodaj 1 rzecz na ten dzień', 'Add 1-day extra item')],
                  ['early-dismissal', tr(lang, 'Wcześniejsze wyjście ze szkoły', 'Early dismissal time')],
                ] as Array<[ExemptionKind, string]>
              ).map(([ek, label]) => (
                <button
                  key={ek}
                  type="button"
                  onClick={() => setExemptionKind(ek)}
                  className={`min-h-[50px] px-4 py-3 text-sm font-semibold rounded-xl border text-left transition-colors ${
                    exemptionKind === ek
                      ? 'bg-blue-500 text-black border-blue-500'
                      : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {exemptionKind === 'skip-subject' ? (
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={tr(
                  lang,
                  'Który przedmiot pominąć? (np. Wychowanie fizyczne)',
                  'Subject to skip (e.g. Wychowanie fizyczne)',
                )}
                className="w-full min-h-[48px] px-4 py-3 text-sm bg-black text-blue-200 border border-blue-900 rounded-xl"
              />
            ) : exemptionKind === 'early-dismissal' ? (
              <input
                type="time"
                value={earlyTime}
                onChange={(e) => setEarlyTime(e.target.value)}
                className="w-full min-h-[48px] px-4 py-3 text-sm font-mono bg-black text-blue-200 border border-blue-900 rounded-xl"
              />
            ) : (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  exemptionKind === 'skip-item'
                    ? tr(lang, 'Co zostawić w domu? (np. Podręcznik do matmy)', 'Item to leave at home (e.g. Math textbook)')
                    : tr(lang, 'Co dodatkowo spakować? (np. Zgoda na wycieczkę)', 'Extra item to pack (e.g. Signed trip slip)')
                }
                className="w-full min-h-[48px] px-4 py-3 text-sm bg-black text-blue-200 border border-blue-900 rounded-xl"
              />
            )}

            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tr(lang, 'Powód (opcjonalnie, np. Zwolnienie od lekarza)', 'Reason (optional, e.g. Doctor note)')}
              className="w-full min-h-[46px] px-4 py-2.5 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-950 rounded-xl"
            />
          </div>
        )}

        {step === 2 && kind === 'smart-rule' && (
          <div className="space-y-4">
            {/* 1. Active days picker (Mon - Sun) */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-blue-300">
                  {tr(lang, '1. W jakie dni reguła obowiązuje?', '1. Which days does this rule take effect?')}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRuleDays([...SCHOOL_RULE_DAYS])}
                    className="px-2 py-1 text-[11px] font-semibold text-blue-400 hover:text-blue-200 border border-blue-950 hover:border-blue-700 rounded-lg transition-colors"
                  >
                    {tr(lang, 'Pn–Pt', 'Mon–Fri')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRuleDays([...ALL_RULE_DAYS])}
                    className="px-2 py-1 text-[11px] font-semibold text-blue-400 hover:text-blue-200 border border-blue-950 hover:border-blue-700 rounded-lg transition-colors"
                  >
                    {tr(lang, 'Codziennie', 'Every day')}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {ALL_RULE_DAYS.map((dow) => {
                  const active = ruleDays.includes(dow);
                  return (
                    <button
                      key={dow}
                      type="button"
                      onClick={() =>
                        setRuleDays((prev) =>
                          prev.includes(dow)
                            ? prev.filter((d) => d !== dow)
                            : [...prev, dow].sort((a, b) => a - b),
                        )
                      }
                      className={`min-h-[44px] text-xs font-semibold rounded-xl border transition-colors ${
                        active
                          ? 'bg-blue-500 text-black border-blue-500'
                          : 'bg-black border-blue-900 text-blue-400 hover:border-blue-500 hover:text-blue-200'
                      }`}
                    >
                      {ruleWeekdayLabel(dow, lang)}
                    </button>
                  );
                })}
              </div>
              {ruleDays.length === 0 && (
                <p className="text-xs text-rose-400">
                  {tr(lang, 'Wybierz co najmniej jeden dzień tygodnia.', 'Pick at least one weekday.')}
                </p>
              )}
            </div>

            {/* 2. Trigger condition */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-300">
                {tr(lang, '2. Kiedy reguła ma zadziałać?', '2. When should this rule trigger?')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(
                  [
                    ['always', tr(lang, 'W każdy wybrany dzień', 'Every chosen day')],
                    ['on-subject-day', tr(lang, 'Gdy jest wybrana lekcja', 'When subject is in plan')],
                    ['on-homework', tr(lang, 'Gdy jest praca domowa', 'When homework is due')],
                  ] as Array<[RuleTriggerKind, string]>
                ).map(([tk, label]) => (
                  <button
                    key={tk}
                    type="button"
                    onClick={() => setRuleTrigger(tk)}
                    className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-xl border text-left transition-colors ${
                      ruleTrigger === tk
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {ruleTrigger !== 'always' && (
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto overscroll-contain pr-1">
                    <button
                      type="button"
                      onClick={() => setRuleSubject('*')}
                      className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-xl border transition-colors ${
                        ruleSubject === '*'
                          ? 'bg-blue-500 text-black border-blue-500'
                          : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                      }`}
                    >
                      {tr(lang, 'Dowolny (*)', 'Any (*)')}
                    </button>
                    {subjectSuggestions.map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setRuleSubject(sub)}
                        className={`min-h-[34px] px-3 py-1 text-xs font-semibold rounded-xl border transition-colors ${
                          ruleSubject.trim().toLowerCase() === sub.toLowerCase()
                            ? 'bg-blue-500 text-black border-blue-500'
                            : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={ruleSubject}
                    onChange={(e) => setRuleSubject(e.target.value)}
                    placeholder={tr(lang, 'Wpisz przedmiot lub * dla wszystkich', 'Type subject or * for all')}
                    className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-black text-blue-200 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
                  />
                  {ruleTrigger === 'on-homework' && (
                    <label className="flex items-center gap-2 text-xs text-blue-300 cursor-pointer pt-0.5">
                      <input
                        type="checkbox"
                        checked={ruleRequireSupplies}
                        onChange={(e) => setRuleRequireSupplies(e.target.checked)}
                        className="accent-blue-500 h-4 w-4"
                      />
                      <span>
                        {tr(
                          lang,
                          'Tylko gdy praca domowa wymaga przyniesienia/kupienia materiałów',
                          'Only when homework lists needed supplies',
                        )}
                      </span>
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* 3. Adjustable Effect */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-300">
                {tr(lang, '3. Jaki efekt ma wywołać?', '3. What effect should it have?')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(
                  [
                    [
                      'add-task',
                      tr(lang, 'Dodaj zadanie / przypomnienie', 'Add task / reminder'),
                      tr(lang, 'Pojawi się w Kanale dnia i Kalendarzu', 'Appears in Feed & Calendar'),
                    ],
                    [
                      'pack-item',
                      tr(lang, 'Spakuj dodatkową rzecz', 'Add item to packing list'),
                      tr(lang, 'Automatycznie dopisuje rzecz do plecaka', 'Auto-adds an item to your bag'),
                    ],
                    [
                      'skip-pack-item',
                      tr(lang, 'Nie pakuj rzeczy', 'Remove item from packing list'),
                      tr(lang, 'Ukrywa wskazaną książkę/rzecz w te dni', 'Hides a matching item on those days'),
                    ],
                    [
                      'notify-only',
                      tr(lang, 'Wyślij powiadomienie (Alert)', 'Send alert notification'),
                      tr(lang, 'Przypomnienie o wybranej godzinie', 'Triggers an alert at chosen time'),
                    ],
                  ] as Array<[RuleEffectKind, string, string]>
                ).map(([ek, label, sub]) => (
                  <button
                    key={ek}
                    type="button"
                    onClick={() => setRuleEffect(ek)}
                    className={`min-h-[58px] px-3.5 py-2.5 rounded-xl border text-left transition-colors ${
                      ruleEffect === ek
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-black border-blue-900 text-blue-200 hover:border-blue-500'
                    }`}
                  >
                    <div className="text-xs sm:text-sm font-bold">{label}</div>
                    <div
                      className={`text-[11px] mt-0.5 ${
                        ruleEffect === ek ? 'text-black/75' : 'text-blue-400'
                      }`}
                    >
                      {sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Effect Details */}
            {ruleEffect === 'pack-item' || ruleEffect === 'skip-pack-item' ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-blue-300">
                  {ruleEffect === 'pack-item'
                    ? tr(lang, 'Co automatycznie dodać do pakowania?', 'What item to auto-add to packing?')
                    : tr(lang, 'Jaką rzecz pominąć przy pakowaniu?', 'Which item to skip from packing?')}
                </label>
                <input
                  type="text"
                  value={ruleEffectItem}
                  onChange={(e) => setRuleEffectItem(e.target.value)}
                  placeholder={
                    ruleEffect === 'pack-item'
                      ? tr(lang, 'np. Strój na basen, Kalkulator, Klucz do szafki', 'e.g. Swim gear, Calculator, Locker key')
                      : tr(lang, 'np. Podręcznik do matematyki, Atlas', 'e.g. Math textbook, Atlas')
                  }
                  className="w-full min-h-[46px] px-4 py-2.5 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-blue-300">
                    {ruleEffect === 'notify-only'
                      ? tr(lang, 'Treść powiadomienia', 'Alert message')
                      : tr(lang, 'Treść zadania / przypomnienia', 'Task / reminder text')}
                  </label>
                  <input
                    type="text"
                    value={ruleEffectText}
                    onChange={(e) => setRuleEffectText(e.target.value)}
                    placeholder={
                      ruleTrigger === 'on-homework'
                        ? tr(
                            lang,
                            'Opcjonalnie (np. Kupić {supplies} na {subject}) — puste uzupełni się samo',
                            'Optional (e.g. Buy {supplies} for {subject}) — blank auto-fills',
                          )
                        : tr(
                            lang,
                            'np. Sprawdź wiadomości w Librusie, Oddaj książkę do biblioteki...',
                            'e.g. Check Librus messages, Return library book...',
                          )
                    }
                    className="w-full min-h-[46px] px-4 py-2.5 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
                  />
                </div>

                {/* Time of day */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-blue-300">
                    {tr(lang, 'O jakiej porze ma zadziałać?', 'Time of day?')}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        ['before-school', tr(lang, 'Przed szkołą', 'Before school')],
                        ['at-dismissal', tr(lang, 'Po lekcjach', 'After school')],
                        ['evening', tr(lang, 'Wieczorem', 'Evening')],
                        ['custom', tr(lang, 'Własna godz.', 'Custom time')],
                      ] as const
                    ).map(([t, label]) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setRuleTiming(t)}
                        className={`min-h-[42px] px-3 text-xs font-semibold rounded-xl border transition-colors ${
                          ruleTiming === t
                            ? 'bg-blue-500 text-black border-blue-500'
                            : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {ruleTiming === 'custom' && (
                    <input
                      type="time"
                      value={ruleCustomTime}
                      onChange={(e) => setRuleCustomTime(e.target.value)}
                      className="w-full sm:w-44 min-h-[42px] px-3.5 py-2 text-sm font-mono bg-black text-blue-200 border border-blue-900 rounded-xl"
                    />
                  )}
                </div>

                {ruleEffect === 'add-task' && (
                  <label className="flex items-center gap-2 text-xs text-blue-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ruleNotify}
                      onChange={(e) => setRuleNotify(e.target.checked)}
                      className="accent-blue-500 h-4 w-4"
                    />
                    <span>
                      {tr(lang, 'Dodaj też alert w Centrum alertów', 'Also schedule an Alert Center notification')}
                    </span>
                  </label>
                )}
              </div>
            )}

            {/* Optional place + name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-blue-300">
                  {tr(lang, 'Miejsce (opcjonalnie)', 'Place (optional)')}
                </label>
                <input
                  type="text"
                  value={rulePlace}
                  onChange={(e) => setRulePlace(e.target.value)}
                  placeholder={tr(lang, 'np. Sklep, Biblioteka, Dom', 'e.g. Shop, Library, Home')}
                  className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-950 rounded-xl focus:outline-none focus:border-blue-400"
                />
                {commutePlaces.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {commutePlaces.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setRulePlace(p.name);
                          if (p.daysOfWeek.length > 0) {
                            setRuleDays([...p.daysOfWeek]);
                          }
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-black border border-blue-900 hover:border-blue-500 text-blue-400 hover:text-blue-200 rounded-lg transition-colors"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-blue-300">
                  {tr(lang, 'Nazwa reguły (opcjonalnie)', 'Rule name (optional)')}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tr(lang, 'Uzupełni się automatycznie', 'Auto-filled if left blank')}
                  className="w-full min-h-[42px] px-3.5 py-2 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-950 rounded-xl focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>

            {/* Live effect preview */}
            {ruleDays.length > 0 && (
              <div className="p-3.5 bg-black border border-cyan-500/40 rounded-xl text-xs text-cyan-300 leading-relaxed">
                <span className="font-bold text-blue-200">
                  {tr(lang, 'Podgląd działania: ', 'Live effect preview: ')}
                </span>
                {ruleDays.map((d) => ruleWeekdayLabel(d, lang)).join(', ')}
                {ruleTrigger === 'on-subject-day'
                  ? tr(
                      lang,
                      ` (gdy w planie jest ${ruleSubject || '*'})`,
                      ` (when ${ruleSubject || '*'} is scheduled)`,
                    )
                  : ruleTrigger === 'on-homework'
                    ? tr(lang, ' (przed pracą domową)', ' (before matching homework)')
                    : ''}
                {' → '}
                {ruleEffect === 'pack-item'
                  ? tr(
                      lang,
                      `doda „${ruleEffectItem.trim() || '...'}” do Twojej listy pakowania.`,
                      `adds "${ruleEffectItem.trim() || '...'}" to your packing checklist.`,
                    )
                  : ruleEffect === 'skip-pack-item'
                    ? tr(
                        lang,
                        `usunie „${ruleEffectItem.trim() || '...'}” z listy pakowania.`,
                        `removes "${ruleEffectItem.trim() || '...'}" from your packing checklist.`,
                      )
                    : ruleEffect === 'notify-only'
                      ? tr(
                          lang,
                          `wyśle alert „${ruleEffectText.trim() || title.trim() || '...'}”${ruleTiming === 'custom' ? ` o ${ruleCustomTime}` : ''}.`,
                          `sends alert "${ruleEffectText.trim() || title.trim() || '...'}"${ruleTiming === 'custom' ? ` at ${ruleCustomTime}` : ''}.`,
                        )
                      : tr(
                          lang,
                          `doda kartę zadania „${ruleEffectText.trim() || title.trim() || '...'}” w Kanale i Kalendarzu${ruleTiming === 'custom' ? ` (${ruleCustomTime})` : ''}.`,
                          `adds task card "${ruleEffectText.trim() || title.trim() || '...'}" to Feed & Calendar${ruleTiming === 'custom' ? ` (${ruleCustomTime})` : ''}.`,
                        )}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {kind === 'one-off-task' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDeadlineMode('before-subject')}
                  className={`min-h-[60px] px-4 py-3 text-sm font-semibold rounded-2xl border text-left transition-colors ${
                    deadlineMode === 'before-subject'
                      ? 'bg-blue-500 text-black border-blue-500'
                      : 'bg-black border-blue-900 text-blue-200 hover:border-blue-500'
                  }`}
                >
                  <div>{tr(lang, 'Przed następną lekcją...', 'Before next class of...')}</div>
                  <div
                    className={`text-xs mt-0.5 ${
                      deadlineMode === 'before-subject' ? 'text-black/75' : 'text-blue-400'
                    }`}
                  >
                    {tr(lang, 'Sprawdzi Twój plan lekcji automatycznie', 'Auto-finds date from timetable')}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setDeadlineMode('date')}
                  className={`min-h-[60px] px-4 py-3 text-sm font-semibold rounded-2xl border text-left transition-colors ${
                    deadlineMode === 'date'
                      ? 'bg-blue-500 text-black border-blue-500'
                      : 'bg-black border-blue-900 text-blue-200 hover:border-blue-500'
                  }`}
                >
                  <div>{tr(lang, 'Do konkretnej daty', 'By a specific date')}</div>
                  <div
                    className={`text-xs mt-0.5 ${
                      deadlineMode === 'date' ? 'text-black/75' : 'text-blue-400'
                    }`}
                  >
                    {tr(lang, 'Wybierz najpóźniejszy dzień z kalendarza', 'Pick the latest allowed date')}
                  </div>
                </button>
              </div>
            )}

            {kind === 'one-off-task' && deadlineMode === 'before-subject' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {subjectSuggestions.map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setBeforeSubject(sub)}
                      className={`min-h-[40px] px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                        beforeSubject === sub
                          ? 'bg-blue-500 text-black border-blue-500'
                          : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={beforeSubject}
                  onChange={(e) => setBeforeSubject(e.target.value)}
                  placeholder={tr(lang, 'Nazwa przedmiotu', 'Subject name')}
                  className="w-full min-h-[48px] px-4 py-3 text-sm bg-black text-blue-200 border border-blue-900 rounded-xl"
                />
                <div className="p-3.5 bg-black border border-cyan-500/40 rounded-xl text-xs sm:text-sm text-cyan-300">
                  {nextSelectedSubjectDate
                    ? tr(
                        lang,
                        `Najbliższa lekcja (${beforeSubject}) w planie: ${formatWeekdayShort(nextSelectedSubjectDate, lang)} ${formatShortDate(nextSelectedSubjectDate, lang)}`,
                        `Next ${beforeSubject} in your timetable: ${formatWeekdayShort(nextSelectedSubjectDate, lang)} ${formatShortDate(nextSelectedSubjectDate, lang)}`,
                      )
                    : tr(
                        lang,
                        `Nie znaleziono lekcji „${beforeSubject}” w planie — użyję daty ${formatShortDate(deadlineDate, lang)}.`,
                        `No upcoming ${beforeSubject} found in timetable — will use ${formatShortDate(deadlineDate, lang)}.`,
                      )}
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDeadlineDate(todayYmd)}
                    className={`min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors ${
                      deadlineDate === todayYmd
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                    }`}
                  >
                    {tr(lang, 'Dziś', 'Today')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeadlineDate(addDaysYmd(todayYmd, 1))}
                    className={`min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors ${
                      deadlineDate === addDaysYmd(todayYmd, 1)
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                    }`}
                  >
                    {tr(lang, 'Jutro', 'Tomorrow')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeadlineDate(getNextSchoolDayYmd(todayYmd))}
                    className={`min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors ${
                      deadlineDate === getNextSchoolDayYmd(todayYmd)
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                    }`}
                  >
                    {tr(lang, 'Następny dzień szkolny', 'Next school day')}
                  </button>
                  {nextSelectedSubjectDate && (kind === 'homework' || kind === 'test') && (
                    <button
                      type="button"
                      onClick={() => setDeadlineDate(nextSelectedSubjectDate)}
                      className={`min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition-colors ${
                        deadlineDate === nextSelectedSubjectDate
                          ? 'bg-blue-500 text-black border-blue-500'
                          : 'bg-black border-blue-800 text-cyan-300 hover:border-cyan-400'
                      }`}
                    >
                      {tr(lang, 'Następne:', 'Next')} {subject} ({formatShortDate(nextSelectedSubjectDate, lang)})
                    </button>
                  )}
                </div>

                <input
                  type="date"
                  value={deadlineDate}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="w-full min-h-[48px] px-4 py-3 text-sm font-mono bg-black text-blue-200 border border-blue-900 rounded-xl"
                />

                {kind === 'test' && testSplitPreview && (
                  <div className="p-3.5 bg-black border border-cyan-500/40 rounded-xl text-xs sm:text-sm text-cyan-300">
                    {tr(
                      lang,
                      `Automatycznie zaplanuje ${testSplitPreview.lead} dni przygotowań w kanale dnia: ${testSplitPreview.learningDays} dni nauki + ${testSplitPreview.repeatingDays} dni powtórki.`,
                      `Auto-schedules ${testSplitPreview.lead} study days in Moment Feed: ${testSplitPreview.learningDays}d Learn + ${testSplitPreview.repeatingDays}d Repeat.`,
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 4 && kind === 'one-off-task' && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-300">
                {tr(lang, 'Gdzie trzeba to zrobić?', 'Where does it need to happen?')}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(
                  [
                    ['at-school', tr(lang, 'W szkole', 'At school')],
                    ['after-school', tr(lang, 'Po szkole', 'After school')],
                    ['at-home', tr(lang, 'W domu', 'At home')],
                    ['anywhere', tr(lang, 'Gdziekolwiek', 'Anywhere')],
                  ] as Array<[TaskLocationConstraint, string]>
                ).map(([loc, label]) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setLocation(loc)}
                    className={`min-h-[48px] px-3 text-xs sm:text-sm font-semibold rounded-xl border transition-colors ${
                      location === loc
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {location === 'after-school' && commutePlaces.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-blue-300">
                  {tr(lang, 'W dzień, kiedy mijasz po drodze:', 'On a day passing:')}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCommutePlaceName('')}
                    className={`min-h-[42px] px-3.5 text-xs font-semibold rounded-xl border transition-colors ${
                      !commutePlaceName
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-black border-blue-900 text-blue-300'
                    }`}
                  >
                    {tr(lang, 'Dowolny dzień szkolny', 'Any school day')}
                  </button>
                  {commutePlaces.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCommutePlaceName(p.name)}
                      className={`min-h-[42px] px-3.5 text-xs font-semibold rounded-xl border transition-colors ${
                        commutePlaceName === p.name
                          ? 'bg-blue-500 text-black border-blue-500'
                          : 'bg-black border-blue-900 text-blue-300'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-300">
                {tr(lang, 'Który dzień będzie najwygodniejszy?', 'Which day is most convenient?')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(
                  [
                    ['earliest', tr(lang, 'Jak najszybciej (najbliższy wolny dzień)', 'Earliest valid day')],
                    ['lightest-day', tr(lang, 'Najlżejszy dzień w planie (najwcześniejszy koniec)', 'Lightest school day (earliest out)')],
                    ['day-before', tr(lang, 'Ostatni dzień przed terminem', 'Last day before deadline')],
                    ['today', tr(lang, 'Dzisiaj', 'Today')],
                  ] as Array<[ConveniencePreference, string]>
                ).map(([pref, label]) => (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => setConvenience(pref)}
                    className={`min-h-[48px] px-4 py-2.5 text-left text-xs sm:text-sm font-semibold rounded-xl border transition-colors ${
                      convenience === pref
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-blue-300">
                {tr(lang, 'Preferowana pora', 'Preferred time')}
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['auto', tr(lang, 'Automatycznie z planu', 'Auto from timetable')],
                    ['09:45', tr(lang, '09:45 (Przerwa)', '09:45 (Break)')],
                    ['12:30', tr(lang, '12:30 (Południe)', '12:30 (Midday)')],
                    ['16:30', tr(lang, '16:30 (Popołudnie)', '16:30 (Afternoon)')],
                    ['19:00', tr(lang, '19:00 (Wieczór)', '19:00 (Evening)')],
                  ] as const
                ).map(([timeVal, label]) => (
                  <button
                    key={timeVal}
                    type="button"
                    onClick={() => setPreferredTime(timeVal)}
                    className={`min-h-[42px] px-3.5 text-xs font-semibold rounded-xl border transition-colors ${
                      preferredTime === timeVal
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {placementPreview && (
              <div className="p-4 bg-black border border-cyan-500/50 rounded-2xl flex items-start gap-3 text-xs sm:text-sm text-cyan-300 leading-relaxed">
                <CalendarCheck2 className="h-5 w-5 shrink-0 mt-0.5 text-cyan-300" />
                <span>
                  <strong className="text-blue-200">
                    {tr(lang, 'Dopasowanie do planu:', 'Auto-fit:')}
                  </strong>{' '}
                  {placementPreview.reason}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Generous Pinned Navigation Footer */}
      {step > 1 && (
        <div className="shrink-0 flex items-center justify-between gap-3 pt-4 border-t border-blue-950">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)}
            className="inline-flex items-center gap-2 px-4 min-h-[48px] text-sm font-semibold text-blue-300 hover:text-blue-200 bg-black border border-blue-900 hover:border-blue-500 rounded-xl transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="h-4 w-4" />
            {tr(lang, 'Wstecz', 'Back')}
          </button>

          {step < totalSteps ? (
            <button
              type="button"
              disabled={step === 2 && !canProceedFromStep2()}
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
              className="inline-flex items-center gap-2 px-6 min-h-[48px] text-sm font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-40 rounded-xl transition-colors whitespace-nowrap"
            >
              {tr(lang, 'Dalej', 'Next')}
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={step === 2 && !canProceedFromStep2()}
              onClick={handleFinish}
              className="inline-flex items-center gap-2 px-6 min-h-[48px] text-sm font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-40 rounded-xl transition-colors whitespace-nowrap"
            >
              <Check className="h-4 w-4" />
              {tr(lang, 'Dodaj do planu i kalendarza', 'Add to Feed & Calendar')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
