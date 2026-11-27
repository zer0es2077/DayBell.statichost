import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  BellRing,
  Globe,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import type {
  AppLanguage,
  CommutePlace,
  DayOfWeek,
  LessonSlot,
  PackingScheduleMode,
  PackingStepConfig,
  RuleDayOfWeek,
  RuleEffectKind,
  RuleTriggerKind,
  ScheduleExemption,
  SharedClassLink,
  SmartRule,
  SubjectKit,
  UserSettings,
} from '../types';
import { getLocalizedPackingStep, tr } from '../utils/i18n';
import {
  DEFAULT_PACKING_STEPS,
  formatShortDate,
  getEssentialDailyItems,
  getStudyPhaseSplit,
} from '../utils/packingEngine';
import { describeStudyStartAnchor } from '../utils/shortsBuilder';
import {
  ALL_RULE_DAYS,
  SCHOOL_RULE_DAYS,
  ruleWeekdayLabel,
  weekdayLabelFromNumber,
} from '../utils/smartEngine';
import {
  GoogleDriveSyncPanel,
  type GoogleAccountSummary,
  type PersonalSyncStats,
} from './GoogleDriveSyncPanel';
import type { OwnerPinState } from './HomeImportPage';
import { PersonalRoutineSection } from './PersonalRoutineSection';
import { SubjectKitsView } from './SubjectKitsView';

export type SettingsTab = 'study' | 'routine' | 'packing' | 'rules' | 'kits' | 'sync';

interface SettingsPageProps {
  settings: UserSettings;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  browserPermission: NotificationPermission | 'unsupported';
  onRequestBrowserPermission: () => void;
  onSendPreviewNotification: () => void;
  commutePlaces: CommutePlace[];
  smartRules: SmartRule[];
  exemptions: ScheduleExemption[];
  onToggleRule: (ruleId: string) => void;
  onUpdateRule: (ruleId: string, patch: Partial<SmartRule>) => void;
  onDeleteRule: (ruleId: string) => void;
  onDeleteExemption: (id: string) => void;
  onUpdatePlaceDays: (placeId: string, days: DayOfWeek[]) => void;
  onAddCommutePlace: (name: string, days: DayOfWeek[]) => void;
  onDeleteCommutePlace: (placeId: string) => void;
  subjectKits: SubjectKit[];
  onUpdateKits: (kits: SubjectKit[]) => void;
  timetable: LessonSlot[];
  weekStartYmd: string;
  onUpdateTimetable: (lessons: LessonSlot[]) => void;
  isExampleWorkspace: boolean;
  onLoadExampleWeek: () => void;
  onClearExampleSchedule: () => void;
  onResetWorkspace: () => void;
  ownerPin: OwnerPinState;
  onUnlockOwnerPin: (pin: string) => Promise<string | null>;
  onSetupOwnerPin: (pin: string) => Promise<string | null>;
  onLockOwnerPin: () => void;
  googleUser: GoogleAccountSummary | null;
  hasGoogleToken: boolean;
  googleSigningIn: boolean;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  personalLastSyncedAt: string | null;
  personalStats: PersonalSyncStats;
  onSavePersonalSync: () => Promise<void>;
  onLoadPersonalSync: () => Promise<void>;
  classLink: SharedClassLink | null;
  onCreateSharedClass: (className: string, shareRole: 'writer' | 'reader') => Promise<void>;
  onJoinSharedClass: (codeOrUrl: string) => Promise<void>;
  onPullSharedClass: () => Promise<void>;
  onPushSharedClass: () => Promise<void>;
  onLeaveSharedClass: () => void;
  initialTab?: SettingsTab;
}

const WEEKDAY_NUMS: DayOfWeek[] = [1, 2, 3, 4, 5];

export function SettingsPage({
  settings,
  onUpdateSettings,
  browserPermission,
  onRequestBrowserPermission,
  onSendPreviewNotification,
  commutePlaces,
  smartRules,
  exemptions,
  onToggleRule,
  onUpdateRule,
  onDeleteRule,
  onDeleteExemption,
  onUpdatePlaceDays,
  onAddCommutePlace,
  onDeleteCommutePlace,
  subjectKits,
  onUpdateKits,
  timetable,
  weekStartYmd,
  onUpdateTimetable,
  isExampleWorkspace,
  onLoadExampleWeek,
  onClearExampleSchedule,
  onResetWorkspace,
  ownerPin,
  onUnlockOwnerPin,
  onSetupOwnerPin,
  onLockOwnerPin,
  googleUser,
  hasGoogleToken,
  googleSigningIn,
  onGoogleSignIn,
  onGoogleSignOut,
  personalLastSyncedAt,
  personalStats,
  onSavePersonalSync,
  onLoadPersonalSync,
  classLink,
  onCreateSharedClass,
  onJoinSharedClass,
  onPullSharedClass,
  onPushSharedClass,
  onLeaveSharedClass,
  initialTab,
}: SettingsPageProps) {
  const lang: AppLanguage = settings.language || 'pl';
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'study');

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
    }
  }, [initialTab]);
  const [newPlaceName, setNewPlaceName] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [newStepLabel, setNewStepLabel] = useState('');
  const [newStepNote, setNewStepNote] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const handlePinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (pinInput.trim().length < 4) {
      setPinError(
        tr(lang, 'PIN musi mieć co najmniej 4 znaki.', 'PIN must be at least 4 characters.'),
      );
      return;
    }
    setPinSubmitting(true);
    try {
      const err = ownerPin.configured
        ? await onUnlockOwnerPin(pinInput.trim())
        : await onSetupOwnerPin(pinInput.trim());
      if (err) {
        setPinError(err);
      } else {
        setPinInput('');
      }
    } finally {
      setPinSubmitting(false);
    }
  };

  const majorSplit = getStudyPhaseSplit(settings.majorTestLeadDays);
  const quizSplit = getStudyPhaseSplit(settings.quizLeadDays);

  const activeSteps =
    settings.packingSteps && settings.packingSteps.length > 0
      ? settings.packingSteps
      : DEFAULT_PACKING_STEPS;

  const moveStep = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= activeSteps.length) return;
    const next = [...activeSteps];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onUpdateSettings({ packingSteps: next });
  };

  const toggleStepEnabled = (stepId: string) => {
    const next = activeSteps.map((s) => (s.id === stepId ? { ...s, enabled: !s.enabled } : s));
    onUpdateSettings({ packingSteps: next });
  };

  const deleteCustomStep = (stepId: string) => {
    const next = activeSteps.filter((s) => s.id !== stepId);
    onUpdateSettings({ packingSteps: next });
  };

  const handleAddCustomStep = (e: FormEvent) => {
    e.preventDefault();
    if (!newStepLabel.trim()) return;
    const created: PackingStepConfig = {
      id: `step-custom-${Date.now()}`,
      kind: 'custom',
      label: newStepLabel.trim(),
      enabled: true,
      note: newStepNote.trim() || undefined,
    };
    onUpdateSettings({ packingSteps: [...activeSteps, created] });
    setNewStepLabel('');
    setNewStepNote('');
  };

  const permissionLabel =
    browserPermission === 'granted'
      ? tr(lang, 'włączone', 'granted')
      : browserPermission === 'denied'
        ? tr(lang, 'zablokowane', 'denied')
        : browserPermission === 'unsupported'
          ? tr(lang, 'nieobsługiwane', 'unsupported')
          : tr(lang, 'nie ustawiono', 'default');

  return (
    <div className="h-full w-full overflow-hidden flex flex-col max-w-5xl mx-auto px-4 sm:px-6 py-4 gap-4">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-blue-200">
            {tr(lang, 'Ustawienia', 'Settings')}
          </h1>
          <p className="text-xs text-blue-400">
            {tr(
              lang,
              'Język, plan nauki, kolejność pakowania, trasy i zestawy przedmiotów',
              'Language, study schedule, step-by-step packing routine, commute routes & kits',
            )}
          </p>
        </div>

        <div
          data-no-swipe="true"
          className="flex items-center gap-1 p-1 bg-[#070B14] border border-blue-950 rounded-lg overflow-x-auto no-scrollbar"
        >
          {(
            [
              ['study', tr(lang, 'Nauka i alerty', 'Study & Alerts')],
              ['routine', tr(lang, 'Mój dzień (prywatne)', 'My Day (Private)')],
              ['kits', tr(lang, 'Co pakować i plan', 'What to Pack & Plan')],
              ['packing', tr(lang, 'Kolejność pakowania', 'Packing Order')],
              ['rules', tr(lang, 'Trasy i reguły', 'Routes & Rules')],
              ['sync', tr(lang, 'Sync i Klasa', 'Sync & Class')],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                tab === id ? 'bg-blue-500 text-black' : 'text-blue-400 hover:text-blue-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-6">
        {tab === 'study' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Language Switcher Card */}
            <section className="md:col-span-2 bg-[#070B14] border border-blue-950 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5 text-blue-400 shrink-0" />
                <div>
                  <h2 className="text-sm font-semibold text-blue-200">
                    {tr(lang, 'Język aplikacji / App Language', 'App Language / Język aplikacji')}
                  </h2>
                  <p className="text-xs text-blue-400 mt-0.5">
                    {tr(
                      lang,
                      'Przełącz cały interfejs między polskim a angielskim',
                      'Switch the entire interface between Polish and English',
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ language: 'pl' })}
                  className={`min-h-[42px] px-4 text-xs font-bold rounded-lg border transition-colors whitespace-nowrap ${
                    lang === 'pl'
                      ? 'bg-blue-500 text-black border-blue-500'
                      : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                  }`}
                >
                  Polski (PL)
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ language: 'en' })}
                  className={`min-h-[42px] px-4 text-xs font-bold rounded-lg border transition-colors whitespace-nowrap ${
                    lang === 'en'
                      ? 'bg-blue-500 text-black border-blue-500'
                      : 'bg-black border-blue-900 text-blue-300 hover:border-blue-500'
                  }`}
                >
                  English (EN)
                </button>
              </div>
            </section>

            {/* Sprawdziany & Kartkówki Advance Study Feed */}
            <section className="bg-[#070B14] border border-blue-950 rounded-2xl p-5 space-y-5">
              <div className="pb-3 border-b border-blue-950 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-blue-200">
                    {tr(lang, 'Harmonogram nauki w Kanale', 'Study Schedule in Moment Feed')}
                  </h2>
                  <p className="text-xs text-blue-400 mt-0.5">
                    {tr(
                      lang,
                      'Pierwsza połowa (zaokrąglona w dół, min. 1 dzień) to Nauka; reszta dni to Powtórka',
                      'First half (rounded down, min 1 day) is Learn; remaining days are Repeat',
                    )}
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-blue-300 cursor-pointer shrink-0 select-none">
                  <input
                    type="checkbox"
                    checked={settings.showStudyBlocks !== false}
                    onChange={(e) => onUpdateSettings({ showStudyBlocks: e.target.checked })}
                    className="h-4 w-4 accent-blue-500 cursor-pointer"
                  />
                  <span>{tr(lang, 'Czas nauki', 'Learning time')}</span>
                </label>
              </div>

              <div className={settings.showStudyBlocks === false ? 'opacity-45 space-y-5' : 'space-y-5'}>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-blue-300">
                    {tr(
                      lang,
                      'Wyprzedzenie dla sprawdzianów',
                      'Sprawdziany / Major Tests advance days',
                    )}
                  </label>
                  <span className="font-mono text-[11px] text-cyan-300">
                    {tr(
                      lang,
                      `${majorSplit.learningDays}d Nauka · ${majorSplit.repeatingDays}d Powtórka`,
                      `${majorSplit.learningDays}d Learn · ${majorSplit.repeatingDays}d Repeat`,
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {[2, 3, 4, 5, 7, 10].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onUpdateSettings({ majorTestLeadDays: d })}
                      className={`flex-1 min-h-[40px] font-mono text-xs font-bold rounded-lg border transition-colors ${
                        settings.majorTestLeadDays === d
                          ? 'bg-blue-500 text-black border-blue-500'
                          : 'bg-black border-blue-950 text-blue-300 hover:border-blue-600'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-blue-300">
                    {tr(
                      lang,
                      'Wyprzedzenie dla kartkówek',
                      'Kartkówki / Quizzes advance days',
                    )}
                  </label>
                  <span className="font-mono text-[11px] text-cyan-300">
                    {tr(
                      lang,
                      `${quizSplit.learningDays}d Nauka${quizSplit.repeatingDays > 0 ? ` · ${quizSplit.repeatingDays}d Powtórka` : ''}`,
                      `${quizSplit.learningDays}d Learn${quizSplit.repeatingDays > 0 ? ` · ${quizSplit.repeatingDays}d Repeat` : ''}`,
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onUpdateSettings({ quizLeadDays: d })}
                      className={`flex-1 min-h-[40px] font-mono text-xs font-bold rounded-lg border transition-colors ${
                        settings.quizLeadDays === d
                          ? 'bg-blue-500 text-black border-blue-500'
                          : 'bg-black border-blue-950 text-blue-300 hover:border-blue-600'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-blue-300">
                  {tr(lang, 'Dzienny czas nauki', 'Planned study duration per day')}
                </label>
                <div className="flex items-center gap-1.5">
                  {[15, 20, 30, 35, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => onUpdateSettings({ dailyStudyMinutes: mins })}
                      className={`flex-1 min-h-[40px] font-mono text-xs font-bold rounded-lg border transition-colors ${
                        settings.dailyStudyMinutes === mins
                          ? 'bg-blue-500 text-black border-blue-500'
                          : 'bg-black border-blue-950 text-blue-300 hover:border-blue-600'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label
                    htmlFor="study-start-time"
                    className="block text-xs font-medium text-blue-300 mb-1"
                  >
                    {(settings.studyStartAnchor ?? 'fixed') === 'fixed'
                      ? tr(lang, 'Godzina nauki', 'Study block time')
                      : tr(lang, 'Zapasowa godzina nauki', 'Fallback study time')}
                  </label>
                  <input
                    id="study-start-time"
                    type="time"
                    value={settings.studyStartTime}
                    onChange={(e) => onUpdateSettings({ studyStartTime: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono bg-black text-blue-200 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                  <button
                    type="button"
                    onClick={() => setTab('routine')}
                    className="mt-1.5 text-[11px] text-cyan-300 hover:text-cyan-200 underline text-left"
                  >
                    {(settings.studyStartAnchor ?? 'fixed') === 'fixed'
                      ? tr(lang, 'Lub ustaw start nauki po wybranym bloku →', 'Or start studying after a block/event →')
                      : `${describeStudyStartAnchor(settings, lang)} · ${tr(lang, 'Zmień', 'Change')}`}
                  </button>
                </div>
                <div>
                  <label
                    htmlFor="pack-reminder-time"
                    className="block text-xs font-medium text-blue-300 mb-1"
                  >
                    {tr(lang, 'Przypomnienie o pakowaniu', 'Pack tonight reminder')}
                  </label>
                  <input
                    id="pack-reminder-time"
                    type="time"
                    value={settings.packReminderTime}
                    onChange={(e) => onUpdateSettings({ packReminderTime: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono bg-black text-blue-200 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
            </section>

            {/* Notifications, Shorts Feed & Workspace Data */}
            <section className="bg-[#070B14] border border-blue-950 rounded-2xl p-5 space-y-5">
              <div className="pb-3 border-b border-blue-950">
                <h2 className="text-sm font-semibold text-blue-200">
                  {tr(lang, 'Powiadomienia i działanie Kanału', 'Notifications & Feed Behavior')}
                </h2>
                <p className="text-xs text-blue-400 mt-0.5">
                  {tr(
                    lang,
                    'Alerty po lekcjach, przewijanie kart i lokalne dane',
                    'Dismissal push alerts, Shorts ergonomics, and local data',
                  )}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs">
                    <div className="font-semibold text-blue-200">
                      {tr(lang, 'Powiadomienia przeglądarki', 'Browser dismissal notifications')}
                    </div>
                    <div className="text-blue-400">
                      {tr(lang, `Status: ${permissionLabel}`, `Status: ${permissionLabel}`)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {browserPermission === 'default' && (
                      <button
                        type="button"
                        onClick={onRequestBrowserPermission}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-lg whitespace-nowrap"
                      >
                        <Bell className="h-3.5 w-3.5" />
                        {tr(lang, 'Włącz', 'Enable')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onSendPreviewNotification}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-200 bg-black border border-blue-900 hover:border-blue-500 rounded-lg whitespace-nowrap"
                    >
                      <BellRing className="h-3.5 w-3.5 text-blue-400" />
                      {tr(lang, 'Testuj', 'Test')}
                    </button>
                  </div>
                </div>

                <label className="flex items-center justify-between gap-3 py-2.5 border-t border-blue-950 cursor-pointer">
                  <span className="text-xs text-blue-300">
                    {tr(
                      lang,
                      'Automatycznie przewiń do następnej karty po odhaczeniu',
                      'Auto-scroll to next item right after checking done',
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.autoAdvanceOnCheck}
                    onChange={(e) => onUpdateSettings({ autoAdvanceOnCheck: e.target.checked })}
                    className="h-4 w-4 accent-blue-500"
                  />
                </label>

                <label className="flex items-center justify-between gap-3 py-2.5 border-t border-blue-950 cursor-pointer">
                  <span className="text-xs text-blue-300">
                    {tr(
                      lang,
                      'Pokazuj zwykłe lekcje jako karty w Kanale',
                      'Include routine class periods inside Moment Feed',
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.showLessonsInFeed}
                    onChange={(e) => onUpdateSettings({ showLessonsInFeed: e.target.checked })}
                    className="h-4 w-4 accent-blue-500"
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-blue-950">
                  {isExampleWorkspace ? (
                    <button
                      type="button"
                      onClick={onClearExampleSchedule}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-300 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/70 rounded-lg whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {tr(lang, 'Wyczyść przykład', 'Clear Example Schedule')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onLoadExampleWeek}
                      className="px-3.5 py-2 text-xs font-semibold text-blue-200 bg-black border border-blue-900 hover:border-blue-500 rounded-lg whitespace-nowrap"
                    >
                      {tr(lang, 'Wczytaj przykład', 'Load Example Week')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onResetWorkspace}
                    className="px-3.5 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-950/30 border border-rose-900/60 rounded-lg whitespace-nowrap"
                  >
                    {tr(lang, 'Wyczyść dane lokalne', 'Clear Local Data')}
                  </button>
                </div>
              </div>
            </section>

            {/* Owner AI PIN Lock (only shown when server AI backend is running) */}
            {ownerPin.available && (
              <section className="md:col-span-2 bg-[#070B14] border border-blue-950 rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-blue-950">
                  <div className="flex items-center gap-2">
                    {ownerPin.token ? (
                      <LockOpen className="h-4 w-4 text-cyan-300" />
                    ) : (
                      <Lock className="h-4 w-4 text-blue-400" />
                    )}
                    <div>
                      <h2 className="text-sm font-semibold text-blue-200">
                        {tr(lang, 'Blokada PIN właściciela (AI)', 'Owner AI PIN Lock')}
                      </h2>
                      <p className="text-xs text-blue-400">
                        {tr(
                          lang,
                          'Chroni wbudowane AI na serwerze, żeby znajomi nie zużywali Twojego limitu',
                          'Protects built-in server AI so friends cannot spend your AI quota',
                        )}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-semibold px-2.5 py-1 rounded border ${
                      ownerPin.token
                        ? 'border-cyan-500/60 text-cyan-300'
                        : 'border-blue-900 text-blue-400'
                    }`}
                  >
                    {ownerPin.token
                      ? tr(lang, 'Odblokowane (tylko ta sesja)', 'Unlocked (this session only)')
                      : ownerPin.configured
                        ? tr(lang, 'Zablokowane', 'Locked')
                        : tr(lang, 'Nieustawione — ustaw PIN', 'Unclaimed — Set PIN')}
                  </span>
                </div>

                {ownerPin.token ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-blue-300">
                      {tr(
                        lang,
                        'Wbudowane skanowanie screenów, skróty wiadomości i podział nauki AI działają tylko w tej karcie przeglądarki do momentu zablokowania lub odświeżenia.',
                        'Built-in screenshot scanning, AI summaries, and AI study breakdowns are enabled only in this browser tab until you lock or refresh.',
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={onLockOwnerPin}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-200 bg-black border border-blue-900 hover:border-blue-500 rounded-lg whitespace-nowrap"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      {tr(lang, 'Zablokuj AI teraz', 'Lock AI Now')}
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={handlePinSubmit}
                    className="flex flex-wrap items-center gap-2.5"
                  >
                    <input
                      type="password"
                      autoComplete="off"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder={
                        ownerPin.configured
                          ? tr(
                              lang,
                              'Wpisz PIN właściciela, aby odblokować wbudowane AI...',
                              'Enter Owner PIN to unlock built-in AI...',
                            )
                          : tr(
                              lang,
                              'Ustaw nowy PIN właściciela (min. 4 znaki)...',
                              'Set a new 4+ character Owner PIN...',
                            )
                      }
                      className="flex-1 min-w-[200px] px-3 py-2 text-xs bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
                    />
                    <button
                      type="submit"
                      disabled={pinSubmitting}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-50 rounded-lg whitespace-nowrap"
                    >
                      {pinSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {ownerPin.configured
                        ? tr(lang, 'Odblokuj AI właściciela', 'Unlock Owner AI')
                        : tr(lang, 'Ustaw PIN właściciela', 'Set Owner PIN')}
                    </button>
                    {pinError && <p className="w-full text-xs text-rose-400">{pinError}</p>}
                  </form>
                )}
              </section>
            )}
          </div>
        )}

        {tab === 'routine' && (
          <PersonalRoutineSection
            settings={settings}
            timetable={timetable}
            exemptions={exemptions}
            weekStartYmd={weekStartYmd}
            onUpdateSettings={onUpdateSettings}
          />
        )}

        {tab === 'packing' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Step-by-Step Packing Sequence */}
            <section className="lg:col-span-7 bg-[#070B14] border border-blue-950 rounded-2xl p-5 space-y-4">
              <div className="pb-3 border-b border-blue-950 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-blue-200">
                    {tr(lang, 'Kolejność pakowania krok po kroku', 'Step-by-Step Packing Routine')}
                  </h2>
                  <p className="text-xs text-blue-400 mt-0.5">
                    {tr(
                      lang,
                      'Kanał prowadzi Cię przez pakowanie dokładnie w tej kolejności',
                      'Your Moment Feed walks through these steps in this exact order',
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ packingSteps: DEFAULT_PACKING_STEPS })}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-200 border border-blue-950 hover:border-blue-700 rounded-lg whitespace-nowrap"
                >
                  <RotateCcw className="h-3 w-3" />
                  {tr(lang, 'Domyślna kolejność', 'Reset Order')}
                </button>
              </div>

              <div className="divide-y divide-blue-950">
                {activeSteps.map((step, idx) => {
                  const localized = getLocalizedPackingStep(step, lang);
                  return (
                    <div
                      key={step.id}
                      className={`py-3 flex items-center justify-between gap-3 ${
                        !step.enabled ? 'opacity-45' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="font-mono text-xs text-blue-500 tabular-nums mt-0.5 w-5 shrink-0">
                          {idx + 1}.
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-blue-200 truncate">
                            {localized.label}
                          </div>
                          {localized.note && (
                            <div className="text-xs text-blue-400 truncate mt-0.5">
                              {localized.note}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveStep(idx, -1)}
                          disabled={idx === 0}
                          aria-label={tr(
                            lang,
                            `Przesuń ${localized.label} w górę`,
                            `Move ${localized.label} up`,
                          )}
                          className="p-1.5 text-blue-400 hover:text-blue-200 disabled:opacity-25"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStep(idx, 1)}
                          disabled={idx === activeSteps.length - 1}
                          aria-label={tr(
                            lang,
                            `Przesuń ${localized.label} w dół`,
                            `Move ${localized.label} down`,
                          )}
                          className="p-1.5 text-blue-400 hover:text-blue-200 disabled:opacity-25"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleStepEnabled(step.id)}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded border ml-1 ${
                            step.enabled
                              ? 'border-cyan-400/60 text-cyan-300'
                              : 'border-blue-900 text-blue-500'
                          }`}
                        >
                          {step.enabled ? tr(lang, 'Wł.', 'On') : tr(lang, 'Wył.', 'Off')}
                        </button>
                        {step.kind === 'custom' && (
                          <button
                            type="button"
                            onClick={() => deleteCustomStep(step.id)}
                            aria-label={tr(
                              lang,
                              `Usuń ${localized.label}`,
                              `Delete ${localized.label}`,
                            )}
                            className="p-1.5 text-blue-500 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Right Column: Add Custom Step & Packing Timing */}
            <div className="lg:col-span-5 space-y-4">
              <section className="bg-[#070B14] border border-blue-950 rounded-2xl p-5 space-y-4">
                <div className="pb-3 border-b border-blue-950">
                  <h2 className="text-sm font-semibold text-blue-200">
                    {tr(lang, 'Kiedy się pakujesz?', 'When Do You Pack?')}
                  </h2>
                  <p className="text-xs text-blue-400 mt-0.5">
                    {tr(
                      lang,
                      'Wybierz, kiedy karty pakowania pojawiają się w Kanale',
                      'Choose when packing slides appear in your Moment Feed',
                    )}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ['morning', tr(lang, 'Rano', 'Morning')],
                      ['evening', tr(lang, 'Wieczorem', 'Night Before')],
                      ['both', tr(lang, 'Oba', 'Both')],
                    ] as Array<[PackingScheduleMode, string]>
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdateSettings({ packingSchedule: mode })}
                      className={`min-h-[42px] px-2 text-xs font-bold rounded-lg border transition-colors whitespace-nowrap ${
                        settings.packingSchedule === mode
                          ? 'bg-blue-500 text-black border-blue-500'
                          : 'bg-black border-blue-950 text-blue-300 hover:border-blue-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="pt-3 border-t border-blue-950 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-blue-200">
                      {tr(lang, 'Rozpakowywanie zbędnych rzeczy', 'Unpack unnecessary items')}
                    </div>
                    <p className="text-[11px] text-blue-400 mt-0.5 leading-relaxed">
                      {tr(
                        lang,
                        'Automatycznie pokazuje, co wyjąć z plecaka z poprzedniego dnia, żeby nie nosić ciężaru',
                        'Automatically lists leftover items from the previous school day to remove from your bag',
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.showUnpacking !== false}
                    onClick={() =>
                      onUpdateSettings({ showUnpacking: settings.showUnpacking === false })
                    }
                    className={`min-h-[34px] px-3 text-xs font-bold rounded-lg border transition-colors shrink-0 ${
                      settings.showUnpacking !== false
                        ? 'bg-amber-400 text-black border-amber-400'
                        : 'bg-black text-blue-400 border-blue-900 hover:border-blue-600'
                    }`}
                  >
                    {settings.showUnpacking !== false
                      ? tr(lang, 'Wł.', 'On')
                      : tr(lang, 'Wył.', 'Off')}
                  </button>
                </div>
              </section>

              <section className="bg-[#070B14] border border-blue-950 rounded-2xl p-5 space-y-4">
                <div className="pb-3 border-b border-blue-950">
                  <h2 className="text-sm font-semibold text-blue-200">
                    {tr(lang, 'Dodaj własny krok pakowania', 'Add Custom Packing Step')}
                  </h2>
                  <p className="text-xs text-blue-400 mt-0.5">
                    {tr(
                      lang,
                      'Osobiste rzeczy: ładowarka, klucze, bilet miesięczny albo leki',
                      'Personal routine checks like charger, keys, transit card, or meds',
                    )}
                  </p>
                </div>

                <form onSubmit={handleAddCustomStep} className="space-y-2.5">
                  <input
                    type="text"
                    required
                    value={newStepLabel}
                    onChange={(e) => setNewStepLabel(e.target.value)}
                    placeholder={tr(
                      lang,
                      'Krok (np. Sprawdź klucze, ładowarkę i słuchawki)',
                      'Step (e.g. Check keys, phone charger & earbuds)',
                    )}
                    className="w-full px-3 py-2 text-xs bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                  <input
                    type="text"
                    value={newStepNote}
                    onChange={(e) => setNewStepNote(e.target.value)}
                    placeholder={tr(
                      lang,
                      'Krótka notatka (opcjonalnie)',
                      'Short reminder note (optional)',
                    )}
                    className="w-full px-3 py-2 text-xs bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
                  />
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {tr(lang, 'Dodaj krok pakowania', 'Add Packing Step')}
                  </button>
                </form>
              </section>
            </div>
          </div>
        )}

        {tab === 'rules' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="bg-[#070B14] border border-blue-950 rounded-2xl p-5 space-y-4">
              <div className="pb-3 border-b border-blue-950">
                <h2 className="text-sm font-semibold text-blue-200">
                  {tr(lang, 'Miejsca, które mijasz po drodze', 'Commute Places You Walk Past')}
                </h2>
                <p className="text-xs text-blue-400 mt-0.5">
                  {tr(
                    lang,
                    'Służą do planowania zakupów i sprawunków dokładnie po lekcjach',
                    'Used to time supply errands right as you leave school',
                  )}
                </p>
              </div>

              {commutePlaces.map((place) => (
                <div
                  key={place.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-blue-950"
                >
                  <span className="text-sm font-medium text-blue-200">{place.name}</span>
                  <div className="flex items-center gap-1">
                    {WEEKDAY_NUMS.map((dow) => {
                      const active = place.daysOfWeek.includes(dow);
                      return (
                        <button
                          key={dow}
                          type="button"
                          onClick={() => {
                            const next = active
                              ? place.daysOfWeek.filter((d) => d !== dow)
                              : [...place.daysOfWeek, dow].sort();
                            onUpdatePlaceDays(place.id, next);
                          }}
                          className={`px-2 py-1 text-[11px] font-semibold rounded border ${
                            active
                              ? 'bg-blue-500 text-black border-blue-500'
                              : 'bg-black border-blue-950 text-blue-400'
                          }`}
                        >
                          {weekdayLabelFromNumber(dow, lang)}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => onDeleteCommutePlace(place.id)}
                      aria-label={tr(lang, `Usuń ${place.name}`, `Remove ${place.name}`)}
                      className="p-1 text-blue-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newPlaceName.trim()) return;
                  onAddCommutePlace(newPlaceName.trim(), [1, 3, 4]);
                  setNewPlaceName('');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={newPlaceName}
                  onChange={(e) => setNewPlaceName(e.target.value)}
                  placeholder={tr(
                    lang,
                    'Dodaj miejsce (np. Sklep papierniczy)...',
                    'Add place (e.g. Stationery Shop)...',
                  )}
                  className="flex-1 px-3 py-2 text-xs bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-lg whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {tr(lang, 'Dodaj', 'Add')}
                </button>
              </form>
            </section>

            <section className="bg-[#070B14] border border-blue-950 rounded-2xl p-5 space-y-4">
              <div className="pb-3 border-b border-blue-950">
                <h2 className="text-sm font-semibold text-blue-200">
                  {tr(lang, 'Reguły i aktywne zwolnienia', 'Smart Rules & Active Exemptions')}
                </h2>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-xs font-semibold text-blue-400">
                    {tr(
                      lang,
                      `Reguły automatyczne (${smartRules.length})`,
                      `Automation Rules (${smartRules.length})`,
                    )}
                  </div>
                  <p className="text-[11px] text-blue-500 mt-0.5">
                    {tr(
                      lang,
                      'Wybierz dni działania i dostosuj efekt (zadanie, dodanie/pominięcie rzeczy w plecaku lub alert).',
                      'Pick active days and adjust each rule’s live effect (task, pack/skip item, or alert).',
                    )}
                  </p>
                </div>
                {smartRules.length === 0 ? (
                  <p className="text-xs text-blue-500">
                    {tr(lang, 'Brak utworzonych reguł.', 'No smart rules created yet.')}
                  </p>
                ) : (
                  smartRules.map((rule) => {
                    const effectiveDays: RuleDayOfWeek[] =
                      Array.isArray(rule.activeDays) && rule.activeDays.length > 0
                        ? rule.activeDays
                        : SCHOOL_RULE_DAYS;
                    const effectKind: RuleEffectKind = rule.effectKind ?? 'add-task';
                    const triggerKind: RuleTriggerKind =
                      rule.triggerKind ?? (rule.requireHomework ? 'on-homework' : 'always');
                    const isEditing = editingRuleId === rule.id;

                    const timingLabel =
                      rule.timing === 'custom'
                        ? rule.customTime || '16:00'
                        : rule.timing === 'before-school'
                          ? tr(lang, 'Przed szkołą', 'Before school')
                          : rule.timing === 'evening'
                            ? tr(lang, 'Wieczorem', 'Evening')
                            : tr(lang, 'Po lekcjach', 'After school');

                    const effectBadge =
                      effectKind === 'pack-item'
                        ? tr(lang, `Spakuj: ${rule.effectItem || '—'}`, `Pack: ${rule.effectItem || '—'}`)
                        : effectKind === 'skip-pack-item'
                          ? tr(lang, `Nie pakuj: ${rule.effectItem || '—'}`, `Skip: ${rule.effectItem || '—'}`)
                          : effectKind === 'notify-only'
                            ? tr(lang, `Alert · ${timingLabel}`, `Alert · ${timingLabel}`)
                            : tr(lang, `Zadanie · ${timingLabel}`, `Task · ${timingLabel}`);

                    const triggerBadge =
                      triggerKind === 'always'
                        ? tr(lang, 'Każdy wybrany dzień', 'Every chosen day')
                        : triggerKind === 'on-subject-day'
                          ? tr(
                              lang,
                              `Lekcja: ${rule.subjectMatch === '*' ? 'dowolna' : rule.subjectMatch}`,
                              `Class: ${rule.subjectMatch === '*' ? 'any' : rule.subjectMatch}`,
                            )
                          : tr(
                              lang,
                              `Praca domowa (${rule.subjectMatch === '*' ? 'wszystkie' : rule.subjectMatch})`,
                              `Homework (${rule.subjectMatch === '*' ? 'all' : rule.subjectMatch})`,
                            );

                    return (
                      <div
                        key={rule.id}
                        className="py-3 space-y-2.5 border-b border-blue-950"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-blue-200">{rule.name}</div>
                            <div className="text-xs text-cyan-300 mt-0.5">{effectBadge}</div>
                            <div className="text-[11px] text-blue-400 mt-0.5">
                              {triggerBadge}
                              {rule.placeName ? ` · ${rule.placeName}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditingRuleId(isEditing ? null : rule.id)}
                              className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${
                                isEditing
                                  ? 'bg-blue-500 text-black border-blue-500'
                                  : 'border-blue-900 text-blue-300 hover:border-blue-500'
                              }`}
                            >
                              {isEditing
                                ? tr(lang, 'Gotowe', 'Done')
                                : tr(lang, 'Dostosuj', 'Adjust')}
                            </button>
                            <button
                              type="button"
                              onClick={() => onToggleRule(rule.id)}
                              className={`px-2 py-1 text-[11px] font-semibold rounded border ${
                                rule.enabled
                                  ? 'border-cyan-400/60 text-cyan-300'
                                  : 'border-blue-900 text-blue-500'
                              }`}
                            >
                              {rule.enabled ? tr(lang, 'Wł.', 'On') : tr(lang, 'Wył.', 'Off')}
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteRule(rule.id)}
                              aria-label={tr(lang, 'Usuń regułę', 'Delete rule')}
                              className="p-1 text-blue-500 hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1">
                          {ALL_RULE_DAYS.map((dow) => {
                            const active = effectiveDays.includes(dow);
                            return (
                              <button
                                key={dow}
                                type="button"
                                onClick={() => {
                                  const next = active
                                    ? effectiveDays.filter((d) => d !== dow)
                                    : ([...effectiveDays, dow].sort((a, b) => a - b) as RuleDayOfWeek[]);
                                  if (next.length === 0) return;
                                  onUpdateRule(rule.id, { activeDays: next });
                                }}
                                className={`px-2 py-1 text-[11px] font-semibold rounded border transition-colors ${
                                  active
                                    ? 'bg-blue-500 text-black border-blue-500'
                                    : 'bg-black border-blue-950 text-blue-400 hover:border-blue-700'
                                }`}
                              >
                                {ruleWeekdayLabel(dow, lang)}
                              </button>
                            );
                          })}
                        </div>

                        {isEditing && (
                          <div className="p-3 bg-black border border-blue-900 rounded-xl space-y-3">
                            {/* Adjust trigger */}
                            <div className="space-y-1.5">
                              <div className="text-[11px] font-semibold text-blue-400">
                                {tr(lang, 'Kiedy działa', 'Trigger')}
                              </div>
                              <div className="grid grid-cols-3 gap-1.5">
                                {(
                                  [
                                    ['always', tr(lang, 'Każdy dzień', 'Every day')],
                                    ['on-subject-day', tr(lang, 'Gdy lekcja', 'On class')],
                                    ['on-homework', tr(lang, 'Praca dom.', 'Homework')],
                                  ] as Array<[RuleTriggerKind, string]>
                                ).map(([tk, label]) => (
                                  <button
                                    key={tk}
                                    type="button"
                                    onClick={() =>
                                      onUpdateRule(rule.id, {
                                        triggerKind: tk,
                                        requireHomework: tk === 'on-homework',
                                      })
                                    }
                                    className={`px-2 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                                      triggerKind === tk
                                        ? 'bg-blue-500 text-black border-blue-500'
                                        : 'bg-[#070B14] border-blue-950 text-blue-300 hover:border-blue-600'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                              {triggerKind !== 'always' && (
                                <input
                                  type="text"
                                  value={rule.subjectMatch}
                                  onChange={(e) =>
                                    onUpdateRule(rule.id, { subjectMatch: e.target.value || '*' })
                                  }
                                  placeholder={tr(lang, 'Przedmiot lub *', 'Subject or *')}
                                  className="w-full px-3 py-1.5 text-xs bg-[#070B14] text-blue-200 border border-blue-900 rounded-lg"
                                />
                              )}
                            </div>

                            {/* Adjust effect */}
                            <div className="space-y-1.5">
                              <div className="text-[11px] font-semibold text-blue-400">
                                {tr(lang, 'Efekt reguły', 'Rule effect')}
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                {(
                                  [
                                    ['add-task', tr(lang, 'Dodaj zadanie', 'Add task')],
                                    ['pack-item', tr(lang, 'Spakuj rzecz', 'Pack item')],
                                    ['skip-pack-item', tr(lang, 'Nie pakuj', 'Skip item')],
                                    ['notify-only', tr(lang, 'Tylko alert', 'Alert only')],
                                  ] as Array<[RuleEffectKind, string]>
                                ).map(([ek, label]) => (
                                  <button
                                    key={ek}
                                    type="button"
                                    onClick={() =>
                                      onUpdateRule(rule.id, {
                                        effectKind: ek,
                                        effectItem:
                                          (ek === 'pack-item' || ek === 'skip-pack-item') &&
                                          !rule.effectItem
                                            ? rule.name
                                            : rule.effectItem,
                                        effectText:
                                          (ek === 'add-task' || ek === 'notify-only') &&
                                          !rule.effectText
                                            ? rule.name
                                            : rule.effectText,
                                      })
                                    }
                                    className={`px-2 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                                      effectKind === ek
                                        ? 'bg-blue-500 text-black border-blue-500'
                                        : 'bg-[#070B14] border-blue-950 text-blue-300 hover:border-blue-600'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Effect value input */}
                            {effectKind === 'pack-item' || effectKind === 'skip-pack-item' ? (
                              <div className="space-y-1">
                                <div className="text-[11px] font-semibold text-blue-400">
                                  {effectKind === 'pack-item'
                                    ? tr(lang, 'Rzecz do spakowania', 'Item to pack')
                                    : tr(lang, 'Rzecz do pominięcia', 'Item to skip')}
                                </div>
                                <input
                                  type="text"
                                  value={rule.effectItem || ''}
                                  onChange={(e) =>
                                    onUpdateRule(rule.id, { effectItem: e.target.value })
                                  }
                                  placeholder={tr(lang, 'np. Strój na basen, Podręcznik', 'e.g. Swim gear, Textbook')}
                                  className="w-full px-3 py-1.5 text-xs bg-[#070B14] text-blue-200 border border-blue-900 rounded-lg"
                                />
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="space-y-1">
                                  <div className="text-[11px] font-semibold text-blue-400">
                                    {tr(lang, 'Treść zadania / alertu', 'Task / alert text')}
                                  </div>
                                  <input
                                    type="text"
                                    value={rule.effectText ?? rule.taskTemplate ?? ''}
                                    onChange={(e) =>
                                      onUpdateRule(rule.id, {
                                        effectText: e.target.value,
                                        taskTemplate: e.target.value || rule.taskTemplate,
                                      })
                                    }
                                    className="w-full px-3 py-1.5 text-xs bg-[#070B14] text-blue-200 border border-blue-900 rounded-lg"
                                  />
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                  {(
                                    [
                                      ['before-school', tr(lang, 'Rano', 'Morning')],
                                      ['at-dismissal', tr(lang, 'Po lekcjach', 'Dismissal')],
                                      ['evening', tr(lang, 'Wieczorem', 'Evening')],
                                      ['custom', tr(lang, 'Godzina', 'Custom')],
                                    ] as const
                                  ).map(([t, label]) => (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() =>
                                        onUpdateRule(rule.id, {
                                          timing: t,
                                          customTime: t === 'custom' ? rule.customTime || '16:00' : rule.customTime,
                                        })
                                      }
                                      className={`px-2 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                                        rule.timing === t
                                          ? 'bg-blue-500 text-black border-blue-500'
                                          : 'bg-[#070B14] border-blue-950 text-blue-300 hover:border-blue-600'
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                                {rule.timing === 'custom' && (
                                  <input
                                    type="time"
                                    value={rule.customTime || '16:00'}
                                    onChange={(e) =>
                                      onUpdateRule(rule.id, { customTime: e.target.value })
                                    }
                                    className="w-36 px-2.5 py-1.5 text-xs font-mono bg-[#070B14] text-blue-200 border border-blue-900 rounded-lg"
                                  />
                                )}
                                <label className="flex items-center gap-2 text-[11px] text-blue-300 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={rule.notifyBrowser}
                                    onChange={(e) =>
                                      onUpdateRule(rule.id, { notifyBrowser: e.target.checked })
                                    }
                                    className="accent-blue-500 h-3.5 w-3.5"
                                  />
                                  <span>{tr(lang, 'Wysyłaj powiadomienie (Alert)', 'Send notification alert')}</span>
                                </label>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="space-y-2 pt-2">
                <div className="text-xs font-semibold text-cyan-300">
                  {tr(
                    lang,
                    `Jednodniowe zwolnienia (${exemptions.length})`,
                    `One-Day Exemptions (${exemptions.length})`,
                  )}
                </div>
                {exemptions.length === 0 ? (
                  <p className="text-xs text-blue-500">
                    {tr(lang, 'Brak aktywnych zwolnień.', 'No exemptions active.')}
                  </p>
                ) : (
                  exemptions.map((ex) => (
                    <div
                      key={ex.id}
                      className="py-1.5 flex items-center justify-between gap-2 text-xs border-b border-blue-950"
                    >
                      <span className="text-blue-200">
                        <span className="font-mono tabular-nums text-blue-400">
                          {formatShortDate(ex.date, lang)}
                        </span>{' '}
                        · {ex.reason}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteExemption(ex.id)}
                        aria-label={tr(lang, 'Usuń zwolnienie', 'Delete exemption')}
                        className="p-1 text-blue-500 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        {tab === 'kits' && (
          <SubjectKitsView
            subjectKits={subjectKits}
            onUpdateKits={onUpdateKits}
            dailyEssentials={
              Array.isArray(settings.dailyEssentials)
                ? settings.dailyEssentials
                : getEssentialDailyItems(lang)
            }
            onUpdateDailyEssentials={(dailyEssentials) => onUpdateSettings({ dailyEssentials })}
            timetable={timetable}
            weekStartYmd={weekStartYmd}
            onUpdateTimetable={onUpdateTimetable}
            lang={lang}
          />
        )}

        {tab === 'sync' && (
          <GoogleDriveSyncPanel
            lang={lang}
            googleUser={googleUser}
            hasToken={hasGoogleToken}
            signingIn={googleSigningIn}
            onSignIn={onGoogleSignIn}
            onSignOut={onGoogleSignOut}
            personalLastSyncedAt={personalLastSyncedAt}
            personalStats={personalStats}
            onSavePersonalSync={onSavePersonalSync}
            onLoadPersonalSync={onLoadPersonalSync}
            classLink={classLink}
            onCreateSharedClass={onCreateSharedClass}
            onJoinSharedClass={onJoinSharedClass}
            onPullSharedClass={onPullSharedClass}
            onPushSharedClass={onPushSharedClass}
            onLeaveSharedClass={onLeaveSharedClass}
          />
        )}
      </div>
    </div>
  );
}
