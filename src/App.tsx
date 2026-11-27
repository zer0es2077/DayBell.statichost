import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import {
  Bell,
  CalendarDays,
  Home,
  Loader2,
  PlaySquare,
  Settings,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { AlertCenterDrawer } from './components/AlertCenterDrawer';
import { CalendarPage } from './components/CalendarPage';
import { ExamNotesModal } from './components/ExamNotesModal';
import { HomeImportPage, type OwnerPinState } from './components/HomeImportPage';
import { MessagesView } from './components/MessagesView';
import { MomentShortsPage } from './components/MomentShortsPage';
import { QuickCaptureBar } from './components/QuickCaptureBar';
import { SettingsPage, type SettingsTab } from './components/SettingsPage';
import { GoogleGIcon, type GoogleAccountSummary } from './components/GoogleDriveSyncPanel';
import type { WizardKind } from './components/StepAddWizard';
import { createExampleSchoolWeek } from './data/sampleSchedule';
import {
  clearGoogleAccessToken,
  getGoogleAccessToken,
  googleLogout,
  googleSignIn,
  initGoogleAuth,
} from './services/googleAuth';
import {
  DriveAuthError,
  DriveScopeError,
  createSharedClassFileInDrive,
  loadPersonalSyncFromDrive,
  pullSharedClassFromDrive,
  pushSharedClassToDrive,
  savePersonalSyncToDrive,
  verifyDriveAccess,
} from './services/googleDriveSync';
import type {
  AppLanguage,
  AppNotification,
  CustomPackingItem,
  DayOfWeek,
  DerivedSmartTask,
  DigestAnalysis,
  ExamSharedNote,
  HomeworkItem,
  ImportBatchResult,
  LessonSlot,
  LibrusWorkspaceData,
  ParsedCommandIntent,
  PersonalSyncPayload,
  SchoolMessage,
  SchoolTest,
  SharedClassLink,
  SharedClassPayload,
  SmartRule,
  StudyPlan,
  SubjectKit,
  UserSettings,
} from './types';
import { tr } from './utils/i18n';
import {
  DEFAULT_PACKING_STEPS,
  DEFAULT_SUBJECT_KITS,
  addDaysYmd,
  buildDailyPackingPlan,
  classifyTestsByAdvanceNotice,
  daysBetweenYmd,
  getMondayYmd,
  getNextSchoolDayYmd,
  getPrevSchoolDayYmd,
  getTestLeadDays,
  getTodayYmd,
} from './utils/packingEngine';
import { buildMomentShortCards } from './utils/shortsBuilder';
import {
  buildScheduledNotifications,
  evaluateSmartRules,
  findNextSubjectDate,
} from './utils/smartEngine';

type PageIndex = 0 | 1 | 2 | 3;

const DEFAULT_SETTINGS: UserSettings = {
  language: 'pl',
  showStudyBlocks: true,
  majorTestLeadDays: 5,
  quizLeadDays: 3,
  dailyStudyMinutes: 35,
  studyStartTime: '17:00',
  packReminderTime: '20:00',
  autoAdvanceOnCheck: true,
  showLessonsInFeed: true,
  packingSchedule: 'both',
  showUnpacking: true,
  packingSteps: DEFAULT_PACKING_STEPS,
  personalTimeBlocks: [],
  freeTimeMinutes: 30,
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getInitialBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

function createEmptyWorkspace(weekStart: string, lang: AppLanguage): LibrusWorkspaceData {
  return {
    studentName: tr(lang, 'Moje biurko szkolne', 'My School Desk'),
    schoolClass: tr(lang, 'Lokalny obszar roboczy', 'Local Workspace'),
    accountMode: 'local',
    lastUpdatedAt: new Date().toISOString(),
    weekStart,
    timetable: [],
    tests: [],
    messages: [],
    homework: [],
    commutePlaces: [
      {
        id: 'place-default-shop',
        name: tr(lang, 'Galeria / Sklep', 'Shopping Centre'),
        daysOfWeek: [1, 3, 4],
        when: 'after-school',
      },
    ],
    smartRules: [],
    oneOffTasks: [],
    exemptions: [],
  };
}

export default function App() {
  const [todayYmd, setTodayYmd] = useState<string>(() => getTodayYmd());
  const defaultWeekStart = useMemo(() => getMondayYmd(todayYmd), [todayYmd]);

  // 0: Home (Quick Import), 1: Moment Shorts Feed, 2: Calendar, 3: Settings
  const [activePage, setActivePage] = useState<PageIndex>(0);
  const [feedDate, setFeedDate] = useState<string>(() => getTodayYmd());

  // Keep todayYmd live if the student leaves DayBell open overnight
  useEffect(() => {
    const syncToday = () => {
      const current = getTodayYmd();
      setTodayYmd((prev) => {
        if (prev !== current) {
          setFeedDate((fd) => (fd === prev ? current : fd));
          return current;
        }
        return prev;
      });
    };
    const interval = setInterval(syncToday, 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncToday();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Slide-over drawers / dedicated overlays
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [messagesSheetOpen, setMessagesSheetOpen] = useState(false);
  const [quickAddSheetOpen, setQuickAddSheetOpen] = useState(false);
  const [quickAddInitialKind, setQuickAddInitialKind] = useState<WizardKind | null>(null);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);
  const [activeNotesTestId, setActiveNotesTestId] = useState<string | null>(null);

  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = readStorage<Partial<UserSettings>>('librus_pack_settings_v1', {});
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      language: saved.language === 'en' ? 'en' : 'pl',
      showStudyBlocks: saved.showStudyBlocks ?? true,
      showLessonsInFeed: saved.showLessonsInFeed ?? true,
      packingSchedule: saved.packingSchedule ?? DEFAULT_SETTINGS.packingSchedule,
      showUnpacking: saved.showUnpacking ?? true,
      packingSteps:
        Array.isArray(saved.packingSteps) && saved.packingSteps.length > 0
          ? saved.packingSteps
          : DEFAULT_PACKING_STEPS,
      dailyEssentials: Array.isArray(saved.dailyEssentials)
        ? saved.dailyEssentials
        : undefined,
      personalTimeBlocks: Array.isArray(saved.personalTimeBlocks)
        ? saved.personalTimeBlocks
        : [],
      freeTimeMinutes:
        typeof saved.freeTimeMinutes === 'number' && !Number.isNaN(saved.freeTimeMinutes)
          ? Math.max(0, Math.min(240, Math.round(saved.freeTimeMinutes)))
          : 30,
    };
  });
  const lang: AppLanguage = settings.language || 'pl';

  const [subjectKits, setSubjectKits] = useState<SubjectKit[]>(() =>
    readStorage<SubjectKit[]>('librus_pack_kits', DEFAULT_SUBJECT_KITS),
  );
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>(() =>
    readStorage<Record<string, boolean>>('librus_pack_checked', {}),
  );
  const [completedSmartIds, setCompletedSmartIds] = useState<Record<string, boolean>>(() =>
    readStorage<Record<string, boolean>>('librus_pack_smart_done', {}),
  );
  const [completedStudyIds, setCompletedStudyIds] = useState<Record<string, boolean>>(() =>
    readStorage<Record<string, boolean>>('librus_pack_study_done', {}),
  );
  const [customItems] = useState<CustomPackingItem[]>(() =>
    readStorage<CustomPackingItem[]>('librus_pack_custom_items', []),
  );
  const [workspace, setWorkspace] = useState<LibrusWorkspaceData | null>(() =>
    readStorage<LibrusWorkspaceData | null>('librus_pack_workspace_v2', null),
  );

  const [digest, setDigest] = useState<DigestAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [studyPlans, setStudyPlans] = useState<Record<string, StudyPlan>>(() =>
    readStorage<Record<string, StudyPlan>>('librus_pack_study_plans_v1', {}),
  );
  const [generatingStudyTestId, setGeneratingStudyTestId] = useState<string | null>(null);

  // Owner AI PIN state — token is kept strictly in React memory (never persisted to storage)
  const [ownerPin, setOwnerPin] = useState<OwnerPinState>({
    available: false,
    configured: false,
    source: 'unclaimed',
    token: null,
  });

  // Google Drive Auth & Shared Class state (access token is STRICTLY in-memory only)
  const [googleUser, setGoogleUser] = useState<GoogleAccountSummary | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() =>
    getGoogleAccessToken(),
  );
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [classLink, setClassLink] = useState<SharedClassLink | null>(() =>
    readStorage<SharedClassLink | null>('daybell_class_link_v1', null),
  );
  const [personalLastSyncedAt, setPersonalLastSyncedAt] = useState<string | null>(() =>
    readStorage<string | null>('daybell_personal_synced_at_v1', null),
  );
  const [pendingClassInvite, setPendingClassInvite] = useState<{
    fileId: string;
    className: string | null;
  } | null>(null);
  const [joiningInvite, setJoiningInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Notification states
  const [browserPermission, setBrowserPermission] = useState<
    NotificationPermission | 'unsupported'
  >(getInitialBrowserNotificationPermission);
  const [firedNotifIds, setFiredNotifIds] = useState<Record<string, boolean>>({});
  const [readNotifIds, setReadNotifIds] = useState<Record<string, boolean>>({});
  const [dismissedNotifIds, setDismissedNotifIds] = useState<Record<string, boolean>>({});
  const [toastAlert, setToastAlert] = useState<{ title: string; body: string } | null>(null);

  // Horizontal touch swipe tracking (strictly separated from vertical Shorts scrolling)
  const touchStartRef = useRef<{ x: number; y: number; ignore: boolean } | null>(null);
  // Forces Google's consent screen on next sign-in if the user previously skipped Drive scopes
  const needsDriveReconsentRef = useRef(false);

  const openQuickAdd = useCallback((initialKind?: WizardKind) => {
    setQuickAddInitialKind(initialKind ?? null);
    setQuickAddSheetOpen(true);
  }, []);

  const closeQuickAdd = useCallback(() => {
    setQuickAddSheetOpen(false);
    setQuickAddInitialKind(null);
  }, []);

  const openPackingEditor = useCallback(() => {
    setSettingsInitialTab('kits');
    setActivePage(3);
  }, []);

  const openRoutineEditor = useCallback(() => {
    setSettingsInitialTab('routine');
    setActivePage(3);
  }, []);

  const openSyncPanel = useCallback(() => {
    setSettingsInitialTab('sync');
    setActivePage(3);
  }, []);

  // Detect ?class=<driveFileId>&name=<className> share invite link on initial load
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const rawClassId = params.get('class')?.trim() ?? '';
      if (/^[a-zA-Z0-9_-]{10,128}$/.test(rawClassId)) {
        const rawName = params.get('name')?.trim().slice(0, 40) || null;
        setPendingClassInvite({ fileId: rawClassId, className: rawName });
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch {
      // ignore URL parsing errors
    }
  }, []);

  // Ensure dark class is always active for native controls & sync <html lang>
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Load Owner AI PIN lock status from server on mount (stays available: false on static hosts)
  useEffect(() => {
    let active = true;
    fetch('/api/owner/status')
      .then((res) => {
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.includes('application/json')) return null;
        return res.json();
      })
      .then((data: { configured?: unknown; source?: 'env' | 'claimed' | 'unclaimed' } | null) => {
        if (!active || !data || typeof data.configured !== 'boolean') return;
        setOwnerPin((prev) => ({
          ...prev,
          available: true,
          configured: data.configured as boolean,
          source: data.source ?? 'unclaimed',
        }));
      })
      .catch(() => {
        // Static host (Cloudflare Pages / Vercel / Netlify) — backend-only Owner AI stays hidden
      });
    return () => {
      active = false;
    };
  }, []);

  // Initialize Firebase Google Auth listener (token remains strictly in memory)
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleUser({ displayName: user.displayName, email: user.email });
        setGoogleAccessToken(token);
      },
      (user) => {
        setGoogleUser(user ? { displayName: user.displayName, email: user.email } : null);
        setGoogleAccessToken(null);
      },
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('librus_pack_settings_v1', JSON.stringify(settings));
      window.localStorage.setItem('librus_pack_kits', JSON.stringify(subjectKits));
      window.localStorage.setItem('librus_pack_checked', JSON.stringify(checkedIds));
      window.localStorage.setItem('librus_pack_smart_done', JSON.stringify(completedSmartIds));
      window.localStorage.setItem('librus_pack_study_done', JSON.stringify(completedStudyIds));
      window.localStorage.setItem('librus_pack_study_plans_v1', JSON.stringify(studyPlans));
      if (workspace) {
        window.localStorage.setItem('librus_pack_workspace_v2', JSON.stringify(workspace));
      } else {
        window.localStorage.removeItem('librus_pack_workspace_v2');
      }
      if (classLink) {
        window.localStorage.setItem('daybell_class_link_v1', JSON.stringify(classLink));
      } else {
        window.localStorage.removeItem('daybell_class_link_v1');
      }
      if (personalLastSyncedAt) {
        window.localStorage.setItem(
          'daybell_personal_synced_at_v1',
          JSON.stringify(personalLastSyncedAt),
        );
      } else {
        window.localStorage.removeItem('daybell_personal_synced_at_v1');
      }
    } catch {
      // ignore storage errors
    }
  }, [
    settings,
    subjectKits,
    checkedIds,
    completedSmartIds,
    completedStudyIds,
    studyPlans,
    workspace,
    classLink,
    personalLastSyncedAt,
  ]);

  const handleUpdateSettings = useCallback((patch: Partial<UserSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const showToast = useCallback((title: string, body: string) => {
    setToastAlert({ title, body });
  }, []);

  useEffect(() => {
    if (!toastAlert) return;
    const t = setTimeout(() => setToastAlert(null), 6500);
    return () => clearTimeout(t);
  }, [toastAlert]);

  const fireBrowserOrInAppAlert = useCallback(
    (title: string, body: string) => {
      showToast(title, body);
      if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(title, { body });
        } catch {
          // Embedded iframe fallback already covered by in-app toast
        }
      }
    },
    [showToast],
  );

  const handleRequestBrowserPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setBrowserPermission('unsupported');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setBrowserPermission(result);
      if (result === 'granted') {
        fireBrowserOrInAppAlert(
          tr(lang, 'Powiadomienia włączone', 'Browser alerts enabled'),
          tr(
            lang,
            'DayBell przypomni Ci o zaplanowanych regułach, sprawach po lekcjach i pilnych terminach.',
            'DayBell will notify you about your active rules, after-school tasks, and urgent deadlines.',
          ),
        );
      }
    } catch {
      setBrowserPermission('denied');
    }
  };

  const handleSetupOwnerPin = useCallback(
    async (pin: string): Promise<string | null> => {
      try {
        const res = await fetch('/api/owner/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        const data = (await res.json()) as {
          token?: string;
          source?: 'env' | 'claimed' | 'unclaimed';
          error?: string;
        };
        if (!res.ok || !data.token) {
          return data.error || tr(lang, 'Nie udało się ustawić PIN-u.', 'Could not set Owner PIN.');
        }
        setOwnerPin({
          available: true,
          configured: true,
          source: data.source ?? 'claimed',
          token: data.token,
        });
        showToast(
          tr(lang, 'PIN właściciela ustawiony i odblokowany', 'Owner AI PIN set & unlocked'),
          tr(
            lang,
            'Wbudowane AI działa tylko w tej karcie przeglądarki. Znajomi nie zużyją Twojego limitu.',
            'Built-in AI is unlocked for this browser tab only. Friends cannot use your quota.',
          ),
        );
        return null;
      } catch {
        return tr(
          lang,
          'Błąd sieci podczas ustawiania PIN-u.',
          'Network error while setting Owner PIN.',
        );
      }
    },
    [showToast, lang],
  );

  const handleUnlockOwnerPin = useCallback(
    async (pin: string): Promise<string | null> => {
      try {
        const res = await fetch('/api/owner/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        });
        const data = (await res.json()) as {
          token?: string;
          source?: 'env' | 'claimed' | 'unclaimed';
          error?: string;
        };
        if (!res.ok || !data.token) {
          return data.error || tr(lang, 'Nieprawidłowy PIN właściciela.', 'Incorrect Owner PIN.');
        }
        setOwnerPin({
          available: true,
          configured: true,
          source: data.source ?? 'env',
          token: data.token,
        });
        showToast(
          tr(lang, 'AI właściciela odblokowane', 'Owner AI unlocked'),
          tr(
            lang,
            'Wbudowane funkcje AI są aktywne tylko dla tej sesji.',
            'Built-in AI features are active for this session.',
          ),
        );
        return null;
      } catch {
        return tr(
          lang,
          'Błąd sieci podczas sprawdzania PIN-u.',
          'Network error while verifying Owner PIN.',
        );
      }
    },
    [showToast, lang],
  );

  const handleLockOwnerPin = useCallback(() => {
    const tokenToRevoke = ownerPin.token;
    setOwnerPin((prev) => ({ ...prev, token: null }));
    if (tokenToRevoke) {
      void fetch('/api/owner/lock', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenToRevoke}` },
      }).catch(() => {});
    }
    showToast(
      tr(lang, 'AI właściciela zablokowane', 'Owner AI locked'),
      tr(lang, 'Wbudowane AI na serwerze jest zablokowane.', 'Built-in server AI is now locked.'),
    );
  }, [ownerPin.token, showToast, lang]);

  const runAnalysisForWorkspace = useCallback(
    async (targetWorkspace: LibrusWorkspaceData) => {
      if (targetWorkspace.messages.length === 0) return;
      if (!ownerPin.token) {
        setAiError(
          tr(
            lang,
            'Wbudowane AI jest zablokowane. Odblokuj PIN-em właściciela, aby streścić wiadomości.',
            'Built-in AI is locked. Unlock with your Owner PIN to summarize messages.',
          ),
        );
        return;
      }
      setAnalyzing(true);
      setAiError(null);
      try {
        const res = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ownerPin.token}`,
          },
          body: JSON.stringify({
            messages: targetWorkspace.messages,
            timetable: targetWorkspace.timetable,
            existingTests: targetWorkspace.tests,
            today: todayYmd,
          }),
        });
        const payload = (await res.json()) as { analysis?: DigestAnalysis; error?: string };
        if (res.status === 403) {
          setOwnerPin((prev) => ({ ...prev, token: null }));
        }
        if (!res.ok || !payload.analysis) {
          throw new Error(
            payload.error ||
              tr(lang, 'Nie udało się streścić wiadomości.', 'Could not summarize messages.'),
          );
        }
        setDigest(payload.analysis);
      } catch (err) {
        setAiError(
          err instanceof Error
            ? err.message
            : tr(lang, 'Błąd podsumowania AI.', 'AI summarization failed.'),
        );
      } finally {
        setAnalyzing(false);
      }
    },
    [todayYmd, ownerPin.token, lang],
  );

  const mergedTests = useMemo(() => {
    const base = workspace?.tests ?? [];
    const fromAi = digest?.extractedTests ?? [];
    const combined = [...base];
    for (const candidate of fromAi) {
      const duplicate = combined.some(
        (existing) =>
          existing.date === candidate.date &&
          existing.subject.toLowerCase() === candidate.subject.toLowerCase(),
      );
      if (!duplicate) combined.push(candidate);
    }
    return combined;
  }, [workspace?.tests, digest?.extractedTests]);

  const activeNotesTest = useMemo(
    () => (activeNotesTestId ? mergedTests.find((t) => t.id === activeNotesTestId) ?? null : null),
    [activeNotesTestId, mergedTests],
  );

  const classifiedTests = useMemo(
    () =>
      classifyTestsByAdvanceNotice(
        mergedTests,
        todayYmd,
        settings.majorTestLeadDays,
        settings.quizLeadDays,
      ),
    [mergedTests, todayYmd, settings.majorTestLeadDays, settings.quizLeadDays],
  );

  const derivedTasks = useMemo(() => {
    if (!workspace) return [];
    return evaluateSmartRules({
      rules: workspace.smartRules,
      homework: workspace.homework,
      timetable: workspace.timetable,
      commutePlaces: workspace.commutePlaces,
      exemptions: workspace.exemptions,
      todayYmd,
      completedIds: completedSmartIds,
      lang,
    });
  }, [workspace, todayYmd, completedSmartIds, lang]);

  const notifications = useMemo(() => {
    if (!workspace) return [];
    return buildScheduledNotifications({
      derivedTasks,
      oneOffTasks: workspace.oneOffTasks,
      classifiedTests,
      todayYmd,
      leadDays: settings.majorTestLeadDays,
      firedIds: firedNotifIds,
      readIds: readNotifIds,
      dismissedIds: dismissedNotifIds,
      lang,
    });
  }, [
    workspace,
    derivedTasks,
    classifiedTests,
    todayYmd,
    settings.majorTestLeadDays,
    firedNotifIds,
    readNotifIds,
    dismissedNotifIds,
    lang,
  ]);

  useEffect(() => {
    if (notifications.length === 0) return;

    const checkDueAlerts = () => {
      const now = new Date();
      const nowYmd = getTodayYmd();
      const nowHhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      for (const notif of notifications) {
        if (notif.fired || notif.dismissed) continue;
        if (notif.targetDate === nowYmd && notif.triggerTime === nowHhmm) {
          setFiredNotifIds((prev) => ({ ...prev, [notif.id]: true }));
          fireBrowserOrInAppAlert(notif.title, notif.body);
        }
      }
    };

    checkDueAlerts();
    const timer = setInterval(checkDueAlerts, 30 * 1000);
    return () => clearInterval(timer);
  }, [notifications, fireBrowserOrInAppAlert]);

  const todayShortCards = useMemo(() => {
    if (!workspace) return [];
    const prevDay = getPrevSchoolDayYmd(todayYmd);
    const nextDay = getNextSchoolDayYmd(todayYmd);
    const prevPack = buildDailyPackingPlan({
      date: prevDay,
      timetable: workspace.timetable,
      subjectKits,
      extractedItems: digest?.extractedPackingItems ?? [],
      customItems,
      tests: mergedTests,
      homework: workspace.homework,
      exemptions: workspace.exemptions,
      smartRules: workspace.smartRules,
      packingSteps: settings.packingSteps,
      dailyEssentials: settings.dailyEssentials,
      lang,
    });
    const todayPack = buildDailyPackingPlan({
      date: todayYmd,
      timetable: workspace.timetable,
      subjectKits,
      extractedItems: digest?.extractedPackingItems ?? [],
      customItems,
      tests: mergedTests,
      homework: workspace.homework,
      exemptions: workspace.exemptions,
      smartRules: workspace.smartRules,
      packingSteps: settings.packingSteps,
      dailyEssentials: settings.dailyEssentials,
      lang,
    });
    const nextPack = buildDailyPackingPlan({
      date: nextDay,
      timetable: workspace.timetable,
      subjectKits,
      extractedItems: digest?.extractedPackingItems ?? [],
      customItems,
      tests: mergedTests,
      homework: workspace.homework,
      exemptions: workspace.exemptions,
      smartRules: workspace.smartRules,
      packingSteps: settings.packingSteps,
      dailyEssentials: settings.dailyEssentials,
      lang,
    });
    return buildMomentShortCards({
      date: todayYmd,
      todayYmd,
      nextSchoolDayYmd: nextDay,
      timetable: workspace.timetable,
      exemptions: workspace.exemptions,
      prevPackingPlan: prevPack,
      packingPlan: todayPack,
      nextPackingPlan: nextPack,
      derivedTasks,
      oneOffTasks: workspace.oneOffTasks,
      homework: workspace.homework,
      classifiedTests,
      commutePlaces: workspace.commutePlaces,
      checkedPackIds: checkedIds,
      completedStudyIds,
      studyPlans,
      settings,
    });
  }, [
    workspace,
    todayYmd,
    subjectKits,
    digest?.extractedPackingItems,
    customItems,
    mergedTests,
    derivedTasks,
    classifiedTests,
    checkedIds,
    completedStudyIds,
    studyPlans,
    settings,
    lang,
  ]);

  const nextUnfinishedCard = useMemo(
    () => todayShortCards.find((c) => !c.completed) ?? todayShortCards[0] ?? null,
    [todayShortCards],
  );
  const pendingTodayCount = useMemo(
    () => todayShortCards.filter((c) => !c.completed).length,
    [todayShortCards],
  );
  const unreadAlertsCount = notifications.filter((n) => !n.read).length;

  const updateWorkspace = (updater: (prev: LibrusWorkspaceData) => LibrusWorkspaceData) => {
    setWorkspace((prev) => {
      const base = prev ?? createEmptyWorkspace(defaultWeekStart, lang);
      return {
        ...updater(base),
        lastUpdatedAt: new Date().toISOString(),
      };
    });
  };

  const personalStats = useMemo(
    () => ({
      lessons: workspace?.timetable.length ?? 0,
      rules: workspace?.smartRules.length ?? 0,
      kits: subjectKits.length,
      homework: workspace?.homework.length ?? 0,
      tests: mergedTests.length,
      examNotes: mergedTests.reduce((sum, t) => sum + (t.sharedNotes?.length ?? 0), 0),
    }),
    [workspace, subjectKits.length, mergedTests],
  );

  const ensureSubjectKitsForLessons = useCallback(
    (lessons: LessonSlot[]) => {
      if (lessons.length === 0) return;
      setSubjectKits((prev) => {
        const existingLower = new Set(prev.map((k) => k.subject.trim().toLowerCase()));
        const additions: SubjectKit[] = [];
        for (const lesson of lessons) {
          const clean = lesson.subject.trim();
          const key = clean.toLowerCase();
          if (!clean || existingLower.has(key)) continue;
          existingLower.add(key);
          additions.push({
            subject: clean,
            items: [
              tr(lang, `Podręcznik: ${clean}`, `${clean} textbook`),
              tr(lang, `Zeszyt: ${clean}`, `${clean} notebook`),
            ],
          });
        }
        return additions.length > 0 ? [...prev, ...additions] : prev;
      });
    },
    [lang],
  );

  const applySharedClassPayload = useCallback(
    (
      payload: SharedClassPayload,
      link: SharedClassLink,
      extraCompletedHomeworkIds?: Record<string, boolean>,
    ) => {
      const makeHwKey = (h: Pick<HomeworkItem, 'subject' | 'dueDate' | 'title'>) =>
        `${h.subject.trim().toLowerCase()}|${h.dueDate.trim()}|${h.title.trim().toLowerCase()}`;

      setWorkspace((prev) => {
        const base = prev ?? createEmptyWorkspace(payload.weekStart || defaultWeekStart, lang);
        const completedById = new Set<string>(
          Object.entries(extraCompletedHomeworkIds ?? {})
            .filter(([, done]) => done)
            .map(([id]) => id),
        );
        const completedByKey = new Set<string>();
        for (const existing of base.homework) {
          if (existing.completed) {
            completedById.add(existing.id);
            completedByKey.add(makeHwKey(existing));
          }
        }

        const mergedHomework: HomeworkItem[] = (payload.homework ?? []).map((item) => ({
          ...item,
          completed: completedById.has(item.id) || completedByKey.has(makeHwKey(item)),
        }));

        // Strictly update ONLY shared class data; preserve 100% of personal rules, commute places, one-off tasks, exemptions & messages
        return {
          ...base,
          accountMode: 'local',
          schoolClass: payload.className || base.schoolClass,
          weekStart: payload.weekStart || base.weekStart,
          timetable: Array.isArray(payload.timetable) ? payload.timetable : base.timetable,
          homework: mergedHomework,
          tests: Array.isArray(payload.tests) ? payload.tests : base.tests,
          lastUpdatedAt: new Date().toISOString(),
        };
      });

      ensureSubjectKitsForLessons(payload.timetable ?? []);
      setClassLink({
        ...link,
        className: payload.className || link.className,
        lastSyncedAt: payload.updatedAt || new Date().toISOString(),
        lastUpdatedBy: payload.updatedBy,
      });
    },
    [defaultWeekStart, ensureSubjectKitsForLessons, lang],
  );

  const requireDriveToken = useCallback((): string => {
    const token = googleAccessToken || getGoogleAccessToken();
    if (!token) {
      throw new Error(
        tr(
          lang,
          'Zaloguj się przez Google, aby połączyć się z Dyskiem Google.',
          'Please sign in with Google to access Google Drive.',
        ),
      );
    }
    return token;
  }, [googleAccessToken, lang]);

  const handleDriveFailure = useCallback(
    (err: unknown): never => {
      if (err instanceof DriveScopeError) {
        clearGoogleAccessToken();
        setGoogleAccessToken(null);
        needsDriveReconsentRef.current = true;
        throw new Error(
          tr(
            lang,
            'Brak uprawnień do Dysku Google. Kliknij „Zaloguj się przez Google” i zaznacz dostęp do Dysku Google.',
            'Google Drive permissions were not granted. Click Sign in with Google and check the Google Drive permission boxes.',
          ),
        );
      }
      if (err instanceof DriveAuthError) {
        clearGoogleAccessToken();
        setGoogleAccessToken(null);
        throw new Error(
          tr(
            lang,
            'Sesja Google Drive wygasła. Kliknij „Zaloguj się przez Google”, aby odnowić dostęp.',
            'Your Google Drive session expired. Click Sign in with Google to reconnect.',
          ),
        );
      }
      throw err;
    },
    [lang],
  );

  const handleGoogleSignIn = useCallback(async () => {
    setGoogleSigningIn(true);
    try {
      const { user, accessToken } = await googleSignIn({
        forceConsent: needsDriveReconsentRef.current,
      });
      const check = await verifyDriveAccess(accessToken);
      needsDriveReconsentRef.current = false;
      setGoogleUser({ displayName: user.displayName, email: user.email });
      setGoogleAccessToken(accessToken);
      if (check.hasBackup && check.backupModifiedTime && !personalLastSyncedAt) {
        setPersonalLastSyncedAt(check.backupModifiedTime);
      }
      showToast(
        tr(lang, 'Połączono z Google Drive', 'Connected to Google Drive'),
        check.hasBackup
          ? tr(
              lang,
              `Zalogowano jako ${user.email || user.displayName || 'konto Google'}. Znaleziono kopię na Dysku — możesz ją wczytać.`,
              `Signed in as ${user.email || user.displayName || 'Google account'}. Existing Drive backup detected — tap Load from Drive to restore it.`,
            )
          : tr(
              lang,
              `Zalogowano jako ${user.email || user.displayName || 'konto Google'}. Dostęp do Dysku Google zweryfikowany.`,
              `Signed in as ${user.email || user.displayName || 'Google account'}. Google Drive access verified.`,
            ),
      );
    } catch (err) {
      if (err instanceof DriveScopeError) {
        clearGoogleAccessToken();
        setGoogleAccessToken(null);
        needsDriveReconsentRef.current = true;
        throw new Error(
          tr(
            lang,
            'Zaznacz uprawnienia Dysku Google na ekranie logowania i spróbuj ponownie.',
            'Please check the Google Drive permission boxes on the sign-in screen and try again.',
          ),
        );
      }
      if (err instanceof DriveAuthError) {
        clearGoogleAccessToken();
        setGoogleAccessToken(null);
      }
      throw err;
    } finally {
      setGoogleSigningIn(false);
    }
  }, [lang, personalLastSyncedAt, showToast]);

  const handleGoogleSignOut = useCallback(async () => {
    await googleLogout();
    needsDriveReconsentRef.current = false;
    setGoogleUser(null);
    setGoogleAccessToken(null);
    showToast(
      tr(lang, 'Wylogowano z Google', 'Signed out of Google'),
      tr(
        lang,
        'Twoje lokalne dane pozostały bezpiecznie w tej przeglądarce.',
        'Your local data remains safely stored in this browser.',
      ),
    );
  }, [lang, showToast]);

  const handleSavePersonalSync = useCallback(async () => {
    const token = requireDriveToken();
    const completedHomeworkIds: Record<string, boolean> = {};
    for (const hw of workspace?.homework ?? []) {
      if (hw.completed) completedHomeworkIds[hw.id] = true;
    }
    const nowIso = new Date().toISOString();
    const payload: PersonalSyncPayload = {
      schemaVersion: 1,
      kind: 'daybell-personal-sync',
      updatedAt: nowIso,
      settings,
      subjectKits,
      checkedIds,
      completedSmartIds,
      completedStudyIds,
      completedHomeworkIds,
      studyPlans,
      workspace,
      classLink,
    };
    try {
      const result = await savePersonalSyncToDrive(token, payload);
      setPersonalLastSyncedAt(result.updatedAt);
      showToast(
        tr(lang, 'Zapisano na Dysku Google', 'Saved to Google Drive'),
        tr(
          lang,
          'Twój plan, osobiste reguły i zestawy pakowania są zsynchronizowane.',
          'Your timetable, personal rules, and packing kits are synced.',
        ),
      );
    } catch (err) {
      handleDriveFailure(err);
    }
  }, [
    requireDriveToken,
    workspace,
    settings,
    subjectKits,
    checkedIds,
    completedSmartIds,
    completedStudyIds,
    studyPlans,
    classLink,
    showToast,
    lang,
    handleDriveFailure,
  ]);

  const handleLoadPersonalSync = useCallback(async () => {
    const token = requireDriveToken();
    try {
      const result = await loadPersonalSyncFromDrive(token);
      if (!result) {
        throw new Error(
          tr(
            lang,
            'Nie znaleziono jeszcze zapisanej kopii DayBell na Twoim Dysku Google.',
            'No DayBell personal backup was found in your Google Drive yet.',
          ),
        );
      }
      const { payload } = result;
      if (payload.settings) {
        setSettings({
          ...DEFAULT_SETTINGS,
          ...payload.settings,
          packingSteps:
            Array.isArray(payload.settings.packingSteps) && payload.settings.packingSteps.length > 0
              ? payload.settings.packingSteps
              : DEFAULT_PACKING_STEPS,
          personalTimeBlocks: Array.isArray(payload.settings.personalTimeBlocks)
            ? payload.settings.personalTimeBlocks
            : [],
          freeTimeMinutes:
            typeof payload.settings.freeTimeMinutes === 'number'
              ? payload.settings.freeTimeMinutes
              : DEFAULT_SETTINGS.freeTimeMinutes,
        });
      }
      if (Array.isArray(payload.subjectKits)) setSubjectKits(payload.subjectKits);
      if (payload.checkedIds) setCheckedIds(payload.checkedIds);
      if (payload.completedSmartIds) setCompletedSmartIds(payload.completedSmartIds);
      if (payload.completedStudyIds) setCompletedStudyIds(payload.completedStudyIds);
      if (payload.studyPlans) setStudyPlans(payload.studyPlans);
      if (payload.workspace) setWorkspace(payload.workspace);
      setPersonalLastSyncedAt(payload.updatedAt);

      if (payload.classLink?.fileId) {
        setClassLink(payload.classLink);
        try {
          const latestClass = await pullSharedClassFromDrive(token, payload.classLink.fileId);
          applySharedClassPayload(
            latestClass.payload,
            {
              ...payload.classLink,
              fileId: latestClass.fileId,
              shareRole: latestClass.canEdit ? 'writer' : 'reader',
              webViewLink: latestClass.webViewLink,
            },
            payload.completedHomeworkIds,
          );
        } catch {
          // Keep restored personal workspace even if shared class file is temporarily inaccessible
        }
      } else {
        setClassLink(null);
      }

      showToast(
        tr(lang, 'Wczytano z Dysku Google', 'Loaded from Google Drive'),
        tr(
          lang,
          'Zsynchronizowano Twoje ustawienia, reguły, pakowanie i plan.',
          'Restored your settings, personal rules, packing kits, and schedule.',
        ),
      );
    } catch (err) {
      handleDriveFailure(err);
    }
  }, [requireDriveToken, lang, applySharedClassPayload, showToast, handleDriveFailure]);

  const buildCurrentSharedClassPayload = useCallback(
    (className: string): SharedClassPayload => {
      const ws = workspace ?? createEmptyWorkspace(defaultWeekStart, lang);
      return {
        schemaVersion: 1,
        kind: 'daybell-shared-class',
        className: className.trim() || ws.schoolClass || 'Klasa',
        weekStart: ws.weekStart || defaultWeekStart,
        timetable: ws.timetable,
        homework: ws.homework.map(({ completed: _ignored, ...rest }) => rest),
        tests: mergedTests,
        updatedAt: new Date().toISOString(),
        updatedBy:
          googleUser?.displayName ||
          googleUser?.email ||
          tr(lang, 'Uczeń klasy', 'Classmate'),
      };
    },
    [workspace, mergedTests, defaultWeekStart, lang, googleUser],
  );

  const handleCreateSharedClass = useCallback(
    async (className: string, shareRole: 'writer' | 'reader') => {
      const token = requireDriveToken();
      const payload = buildCurrentSharedClassPayload(className);
      try {
        const created = await createSharedClassFileInDrive(token, className, shareRole, payload);
        const link: SharedClassLink = {
          fileId: created.fileId,
          className: payload.className,
          shareRole,
          webViewLink: created.webViewLink,
          lastSyncedAt: payload.updatedAt,
          lastUpdatedBy: payload.updatedBy,
        };
        setClassLink(link);
        updateWorkspace((prev) => ({ ...prev, schoolClass: payload.className }));
        showToast(
          tr(lang, `Utworzono klasę ${payload.className}`, `Created Class ${payload.className}`),
          tr(
            lang,
            'Skopiuj Kod klasy i wyślij go znajomym — dołączą jednym kliknięciem.',
            'Copy the Class Code and share it with classmates so they can join.',
          ),
        );
      } catch (err) {
        handleDriveFailure(err);
      }
    },
    [requireDriveToken, buildCurrentSharedClassPayload, showToast, lang, handleDriveFailure],
  );

  const handleJoinSharedClass = useCallback(
    async (codeOrUrl: string) => {
      const token = requireDriveToken();
      try {
        const res = await pullSharedClassFromDrive(token, codeOrUrl);
        const link: SharedClassLink = {
          fileId: res.fileId,
          className: res.payload.className,
          shareRole: res.canEdit ? 'writer' : 'reader',
          webViewLink: res.webViewLink,
          lastSyncedAt: res.payload.updatedAt,
          lastUpdatedBy: res.payload.updatedBy,
        };
        applySharedClassPayload(res.payload, link);
        showToast(
          tr(lang, `Dołączono do klasy ${res.payload.className}`, `Joined Class ${res.payload.className}`),
          tr(
            lang,
            'Pobrano wspólny plan lekcji, zadania, sprawdziany i notatki klasy. Twoje reguły pozostały prywatne.',
            'Synced shared timetable, homework, exams, and class notes. Your personal rules stayed private.',
          ),
        );
      } catch (err) {
        handleDriveFailure(err);
      }
    },
    [requireDriveToken, applySharedClassPayload, showToast, lang, handleDriveFailure],
  );

  const handlePullSharedClass = useCallback(async () => {
    if (!classLink) return;
    const token = requireDriveToken();
    try {
      const res = await pullSharedClassFromDrive(token, classLink.fileId);
      applySharedClassPayload(res.payload, {
        ...classLink,
        fileId: res.fileId,
        shareRole: res.canEdit ? 'writer' : 'reader',
        webViewLink: res.webViewLink,
      });
      showToast(
        tr(lang, `Odświeżono klasę ${res.payload.className}`, `Updated Class ${res.payload.className}`),
        tr(
          lang,
          'Pobrano najnowszy plan, zadania, sprawdziany i notatki klasy (bez zmiany Twoich reguł i odhaczeń).',
          'Pulled latest class timetable, homework, exams, and notes without touching your rules or checkmarks.',
        ),
      );
    } catch (err) {
      handleDriveFailure(err);
    }
  }, [classLink, requireDriveToken, applySharedClassPayload, showToast, lang, handleDriveFailure]);

  const handlePushSharedClass = useCallback(async () => {
    if (!classLink) return;
    const token = requireDriveToken();
    const payload = buildCurrentSharedClassPayload(classLink.className);
    try {
      await pushSharedClassToDrive(token, classLink.fileId, payload);
      setClassLink((prev) =>
        prev
          ? {
              ...prev,
              lastSyncedAt: payload.updatedAt,
              lastUpdatedBy: payload.updatedBy,
            }
          : prev,
      );
      showToast(
        tr(lang, `Wysłano zmiany do klasy ${classLink.className}`, `Pushed to Class ${classLink.className}`),
        tr(
          lang,
          'Koledzy z klasy zobaczą nowy plan, zadania, sprawdziany i notatki po kliknięciu „Pobierz plan klasy”.',
          'Classmates will get the updated timetable, homework, exams & notes next time they pull.',
        ),
      );
    } catch (err) {
      handleDriveFailure(err);
    }
  }, [classLink, requireDriveToken, buildCurrentSharedClassPayload, showToast, lang, handleDriveFailure]);

  const handleLeaveSharedClass = useCallback(() => {
    setClassLink(null);
    showToast(
      tr(lang, 'Odłączono od wspólnej klasy', 'Disconnected from Shared Class'),
      tr(
        lang,
        'Obecny plan pozostał lokalnie u Ciebie. Możesz dołączyć ponownie w dowolnym momencie.',
        'Your current local timetable stays intact. You can rejoin anytime with the Class Code.',
      ),
    );
  }, [lang, showToast]);

  const handleAcceptClassInvite = useCallback(async () => {
    if (!pendingClassInvite) return;
    setInviteError(null);
    setJoiningInvite(true);
    try {
      let token = googleAccessToken || getGoogleAccessToken();
      if (!token) {
        const signedIn = await googleSignIn({
          forceConsent: needsDriveReconsentRef.current,
        });
        needsDriveReconsentRef.current = false;
        setGoogleUser({
          displayName: signedIn.user.displayName,
          email: signedIn.user.email,
        });
        setGoogleAccessToken(signedIn.accessToken);
        token = signedIn.accessToken;
      }
      const res = await pullSharedClassFromDrive(token, pendingClassInvite.fileId);
      const link: SharedClassLink = {
        fileId: res.fileId,
        className: res.payload.className,
        shareRole: res.canEdit ? 'writer' : 'reader',
        webViewLink: res.webViewLink,
        lastSyncedAt: res.payload.updatedAt,
        lastUpdatedBy: res.payload.updatedBy,
      };
      applySharedClassPayload(res.payload, link);
      setPendingClassInvite(null);
      setActivePage(1);
      showToast(
        tr(lang, `Witaj w klasie ${res.payload.className}!`, `Joined Class ${res.payload.className}!`),
        tr(
          lang,
          'Pobrano wspólny plan lekcji, zadania i sprawdziany. Twoje reguły i pakowanie są prywatne.',
          'Loaded the shared timetable, homework, and tests. Your own rules and packing stay private.',
        ),
      );
    } catch (err) {
      if (err instanceof DriveScopeError) {
        clearGoogleAccessToken();
        setGoogleAccessToken(null);
        needsDriveReconsentRef.current = true;
      } else if (err instanceof DriveAuthError) {
        clearGoogleAccessToken();
        setGoogleAccessToken(null);
      }
      setInviteError(
        err instanceof Error
          ? err.message
          : tr(lang, 'Nie udało się dołączyć do klasy.', 'Could not join shared class.'),
      );
    } finally {
      setJoiningInvite(false);
    }
  }, [pendingClassInvite, googleAccessToken, applySharedClassPayload, lang, showToast]);

  const handleLoadExampleWeek = () => {
    const sample = createExampleSchoolWeek(todayYmd);
    setWorkspace(sample);
    setDigest(null);
    showToast(
      tr(lang, 'Wczytano przykładowy tydzień', 'Example school week loaded'),
      tr(
        lang,
        'Otwórz Kanał, aby przejść przez karty dnia, zakup przyborów na Plastykę i zadania.',
        'Open Feed to walk through your moment-by-moment cards, Plastyka supply errand, and lost PE bag task.',
      ),
    );
    if (ownerPin.token) {
      void runAnalysisForWorkspace(sample);
    }
  };

  const isExampleWorkspace = workspace?.accountMode === 'sample';

  const handleClearExampleSchedule = () => {
    setWorkspace(null);
    setDigest(null);
    setCheckedIds({});
    setCompletedSmartIds({});
    setCompletedStudyIds({});
    setStudyPlans({});
    showToast(
      tr(lang, 'Wyczyszczono przykładowy plan', 'Example schedule cleared'),
      tr(
        lang,
        'Możesz teraz dodać własny plan lekcji, zadania i sprawdziany.',
        'You can now add your own timetable, homework, and tests.',
      ),
    );
  };

  const handleConfirmImport = (batch: ImportBatchResult) => {
    const importedDays = new Set(batch.lessons.map((l) => l.dayOfWeek));
    const mergedTimetable =
      batch.lessons.length > 0
        ? [
            ...(workspace?.timetable ?? []).filter((l) => !importedDays.has(l.dayOfWeek)),
            ...batch.lessons,
          ]
        : (workspace?.timetable ?? []);

    const nextWs: LibrusWorkspaceData = workspace
      ? {
          ...workspace,
          timetable: mergedTimetable,
          homework: [...batch.homework, ...workspace.homework],
          tests: [...batch.tests, ...workspace.tests],
          messages: [...batch.messages, ...workspace.messages],
          lastUpdatedAt: new Date().toISOString(),
        }
      : {
          ...createEmptyWorkspace(defaultWeekStart, lang),
          timetable: batch.lessons,
          homework: batch.homework,
          tests: batch.tests,
          messages: batch.messages,
        };
    setWorkspace(nextWs);
    setDigest(null);

    if (batch.lessons.length > 0) {
      setSettings((prev) => (prev.showLessonsInFeed ? prev : { ...prev, showLessonsInFeed: true }));

      setSubjectKits((prev) => {
        const existingLower = new Set(prev.map((k) => k.subject.trim().toLowerCase()));
        const additions: SubjectKit[] = [];
        for (const lesson of batch.lessons) {
          const clean = lesson.subject.trim();
          const key = clean.toLowerCase();
          if (!clean || existingLower.has(key)) continue;
          existingLower.add(key);
          additions.push({
            subject: clean,
            items: [
              tr(lang, `Podręcznik: ${clean}`, `${clean} textbook`),
              tr(lang, `Zeszyt: ${clean}`, `${clean} notebook`),
            ],
          });
        }
        return additions.length > 0 ? [...prev, ...additions] : prev;
      });
    }

    showToast(tr(lang, 'Zaimportowano z Librusa', 'Imported from Librus'), batch.summary);
    if (batch.messages.length > 0 && ownerPin.token) {
      void runAnalysisForWorkspace(nextWs);
    }
  };

  const handleCommitIntent = (intent: ParsedCommandIntent) => {
    const stamp = Date.now();
    if (intent.intent === 'smart-rule') {
      updateWorkspace((prev) => ({
        ...prev,
        smartRules: [{ ...intent.rule, id: `rule-${stamp}` }, ...prev.smartRules],
      }));
      showToast(tr(lang, 'Reguła aktywowana', 'Smart rule activated'), intent.explanation);
    } else if (intent.intent === 'one-off-task') {
      updateWorkspace((prev) => {
        let deadlineDate = intent.task.deadlineDate;
        if (intent.task.beforeSubject && prev.timetable.length > 0) {
          const nextClassDay = findNextSubjectDate(
            intent.task.beforeSubject,
            prev.timetable,
            prev.exemptions,
            todayYmd,
          );
          if (nextClassDay) {
            deadlineDate = nextClassDay;
          }
        }
        return {
          ...prev,
          oneOffTasks: [
            {
              ...intent.task,
              deadlineDate,
              id: `oneoff-${stamp}`,
              completed: false,
            },
            ...prev.oneOffTasks,
          ],
        };
      });
      showToast(tr(lang, 'Zadanie dodane do planu', 'Urgent one-off scheduled'), intent.explanation);
    } else if (intent.intent === 'homework') {
      updateWorkspace((prev) => ({
        ...prev,
        homework: [
          {
            ...intent.homework,
            id: `hw-${stamp}`,
            completed: false,
            source: 'ai-command',
          },
          ...prev.homework,
        ],
      }));
      showToast(
        tr(lang, 'Praca domowa dodana', 'Homework added to Calendar'),
        intent.homework.neededSupplies.length > 0
          ? tr(
              lang,
              `Wykryto potrzebne materiały (${intent.homework.neededSupplies.join(', ')}) — sprawdzam reguły trasy po szkole.`,
              `Supplies detected (${intent.homework.neededSupplies.join(', ')}) — checking commute & dismissal rules.`,
            )
          : intent.explanation,
      );
    } else if (intent.intent === 'exemption') {
      updateWorkspace((prev) => ({
        ...prev,
        exemptions: [{ ...intent.exemption, id: `ex-${stamp}` }, ...prev.exemptions],
      }));
      showToast(tr(lang, 'Zwolnienie zapisane', 'Exemption applied'), intent.explanation);
    } else if (intent.intent === 'commute-place') {
      updateWorkspace((prev) => ({
        ...prev,
        commutePlaces: [...prev.commutePlaces, { ...intent.place, id: `place-${stamp}` }],
      }));
      showToast(tr(lang, 'Zapisano miejsce po drodze', 'Commute route saved'), intent.explanation);
    } else if (intent.intent === 'test') {
      const trimmedTitle = intent.test.title.trim();
      const trimmedDesc = intent.test.description?.trim() ?? '';
      const hasInitialNote =
        Boolean(trimmedDesc) && trimmedDesc.toLowerCase() !== trimmedTitle.toLowerCase();
      const initialNotes: ExamSharedNote[] | undefined = hasInitialNote
        ? [
            {
              id: `note-${stamp}`,
              text: trimmedDesc,
              author:
                googleUser?.displayName ||
                googleUser?.email ||
                tr(lang, 'Uczeń klasy', 'Classmate'),
              updatedAt: new Date().toISOString(),
            },
          ]
        : undefined;
      const created: SchoolTest = {
        ...intent.test,
        id: `man-test-${stamp}`,
        description: trimmedTitle,
        sharedNotes: initialNotes,
        source: 'manual',
      };
      updateWorkspace((prev) => ({
        ...prev,
        tests: [...prev.tests, created],
      }));
      showToast(tr(lang, 'Sprawdzian dodany do Kanału', 'Test scheduled in feed'), intent.explanation);
    }
    closeQuickAdd();
  };

  const handleToggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: true };
    });
  };

  const handleToggleSmartTask = (id: string) => {
    setCompletedSmartIds((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: true };
    });
  };

  const handleToggleStudyDay = (studyKey: string) => {
    setCompletedStudyIds((prev) => {
      if (prev[studyKey]) {
        const next = { ...prev };
        delete next[studyKey];
        return next;
      }
      return { ...prev, [studyKey]: true };
    });
  };

  const handleToggleOneOffTask = (id: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      oneOffTasks: prev.oneOffTasks.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t,
      ),
    }));
  };

  const handleToggleHomework = (id: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      homework: prev.homework.map((h) => (h.id === id ? { ...h, completed: !h.completed } : h)),
    }));
  };

  const handleDeleteHomework = (hwId: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      homework: prev.homework.filter((h) => h.id !== hwId),
    }));
    showToast(
      tr(lang, 'Usunięto pracę domową', 'Homework deleted'),
      tr(
        lang,
        'Jeśli korzystasz ze wspólnej klasy, kliknij „Wyślij zmiany klasie” w Sync i Klasa.',
        'If using a shared class, tap Push My Updates in Sync & Class to sync the removal.',
      ),
    );
  };

  const handleDeleteTest = (testId: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      tests: prev.tests.filter((t) => t.id !== testId),
    }));
    setDigest((prev) =>
      prev
        ? { ...prev, extractedTests: prev.extractedTests.filter((t) => t.id !== testId) }
        : prev,
    );
    setStudyPlans((prev) => {
      if (!(testId in prev)) return prev;
      const next = { ...prev };
      delete next[testId];
      return next;
    });
    if (activeNotesTestId === testId) {
      setActiveNotesTestId(null);
    }
    showToast(
      tr(lang, 'Usunięto sprawdzian', 'Exam deleted'),
      tr(
        lang,
        'Usunięto sprawdzian oraz powiązane dni nauki z kalendarza i kanału.',
        'Removed the exam and its scheduled study days from Calendar and Feed.',
      ),
    );
  };

  const handleAddExamNote = (testId: string, text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    const newNote: ExamSharedNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: cleaned,
      author:
        googleUser?.displayName ||
        googleUser?.email ||
        tr(lang, 'Uczeń klasy', 'Classmate'),
      updatedAt: new Date().toISOString(),
    };
    const fallbackCandidate = mergedTests.find((t) => t.id === testId);
    updateWorkspace((prev) => {
      const existsInWorkspace = prev.tests.some((t) => t.id === testId);
      if (existsInWorkspace) {
        return {
          ...prev,
          tests: prev.tests.map((t) =>
            t.id === testId ? { ...t, sharedNotes: [...(t.sharedNotes ?? []), newNote] } : t,
          ),
        };
      }
      if (fallbackCandidate) {
        return {
          ...prev,
          tests: [
            ...prev.tests,
            {
              ...fallbackCandidate,
              sharedNotes: [...(fallbackCandidate.sharedNotes ?? []), newNote],
            },
          ],
        };
      }
      return prev;
    });
    showToast(
      tr(lang, 'Dodano notatkę do sprawdzianu', 'Exam note added'),
      classLink
        ? tr(
            lang,
            `Kliknij „Wyślij zmiany klasie” w Sync i Klasa, aby udostępnić ją klasie ${classLink.className}.`,
            `Tap Push My Updates in Sync & Class to share it with Class ${classLink.className}.`,
          )
        : tr(
            lang,
            'Notatka została zapisana przy sprawdzianie.',
            'The note has been saved on this exam.',
          ),
    );
  };

  const handleDeleteExamNote = (testId: string, noteId: string) => {
    updateWorkspace((prev) => ({
      ...prev,
      tests: prev.tests.map((t) =>
        t.id === testId
          ? { ...t, sharedNotes: (t.sharedNotes ?? []).filter((n) => n.id !== noteId) }
          : t,
      ),
    }));
    setDigest((prev) =>
      prev
        ? {
            ...prev,
            extractedTests: prev.extractedTests.map((t) =>
              t.id === testId
                ? { ...t, sharedNotes: (t.sharedNotes ?? []).filter((n) => n.id !== noteId) }
                : t,
            ),
          }
        : prev,
    );
  };

  const handleGenerateInlineStudyPlan = async (test: SchoolTest) => {
    if (!ownerPin.token) {
      showToast(
        tr(lang, 'AI właściciela zablokowane', 'Owner AI locked'),
        tr(
          lang,
          'Odblokuj AI właściciela na Starcie lub w Ustawieniach, aby podzielić materiał.',
          'Unlock Owner AI on Home or Settings to break down topics.',
        ),
      );
      return;
    }
    setGeneratingStudyTestId(test.id);
    try {
      const leadDays = getTestLeadDays(test, settings.majorTestLeadDays, settings.quizLeadDays);
      const res = await fetch('/api/ai/study-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerPin.token}`,
        },
        body: JSON.stringify({
          test,
          today: todayYmd,
          leadDays,
          dailyStudyMinutes: settings.dailyStudyMinutes,
        }),
      });
      const payload = (await res.json()) as { studyPlan?: StudyPlan; error?: string };
      if (res.status === 403) {
        setOwnerPin((prev) => ({ ...prev, token: null }));
      }
      if (!res.ok || !payload.studyPlan) {
        throw new Error(
          payload.error ||
            tr(lang, 'Nie udało się podzielić materiału.', 'Could not generate study breakdown.'),
        );
      }
      setStudyPlans((prev) => ({ ...prev, [test.id]: payload.studyPlan! }));
    } catch (err) {
      showToast(
        tr(lang, 'Błąd podziału nauki', 'Study breakdown failed'),
        err instanceof Error
          ? err.message
          : tr(
              lang,
              'Nie udało się teraz podzielić tego sprawdzianu.',
              'Could not break down this test right now.',
            ),
      );
    } finally {
      setGeneratingStudyTestId(null);
    }
  };

  const handleSendPreviewNotification = (notif?: AppNotification) => {
    if (notif) {
      fireBrowserOrInAppAlert(notif.title, notif.body);
    } else {
      fireBrowserOrInAppAlert(
        tr(lang, 'Przypomnienie po lekcjach', 'School Dismissal Reminder'),
        tr(
          lang,
          'Właśnie skończyłeś lekcje i mijasz dziś sklep — sprawdź listę potrzebnych rzeczy.',
          'You just finished classes and walk past Shopping Centre today — check your supply errands.',
        ),
      );
    }
  };

  const handlePreviewTaskAlert = (task: DerivedSmartTask) => {
    fireBrowserOrInAppAlert(
      task.placeName
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
      `${task.title}. ${task.reason}`,
    );
  };

  const handleOpenTestStudyInFeed = (test?: SchoolTest) => {
    if (!test) {
      setFeedDate(todayYmd);
      setActivePage(1);
      return;
    }
    const leadDays = getTestLeadDays(test, settings.majorTestLeadDays, settings.quizLeadDays);
    const daysUntil = daysBetweenYmd(todayYmd, test.date);
    const targetStudyDate =
      daysUntil >= 1 && daysUntil <= leadDays
        ? todayYmd
        : addDaysYmd(test.date, -leadDays);
    setFeedDate(targetStudyDate);
    setActivePage(1);
  };

  const handleTouchStart = (e: TouchEvent<HTMLElement>) => {
    if (e.touches.length !== 1) return;
    const target = e.target as HTMLElement | null;
    const ignore = Boolean(
      target?.closest('input, textarea, select, [data-no-swipe="true"]'),
    );
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      ignore,
    };
  };

  const handleTouchEnd = (e: TouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || start.ignore || e.changedTouches.length !== 1) return;

    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;

    if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.45) {
      if (dx < 0 && activePage < 3) {
        setActivePage((p) => (p + 1) as PageIndex);
      } else if (dx > 0 && activePage > 0) {
        setActivePage((p) => (p - 1) as PageIndex);
      }
    }
  };

  const navItems: Array<{
    index: PageIndex;
    label: string;
    icon: typeof Home;
    count?: number;
  }> = [
    { index: 0, label: tr(lang, 'Start', 'Home'), icon: Home },
    { index: 1, label: tr(lang, 'Kanał', 'Feed'), icon: PlaySquare, count: pendingTodayCount },
    { index: 2, label: tr(lang, 'Kalendarz', 'Calendar'), icon: CalendarDays },
    { index: 3, label: tr(lang, 'Ustawienia', 'Settings'), icon: Settings },
  ];

  return (
    <div className="h-dvh w-full overflow-hidden flex flex-col bg-black text-blue-200">
      {/* Compact 3-Zone Top Bar (52px) */}
      <header className="h-[52px] shrink-0 bg-black border-b border-blue-950 px-4 sm:px-6 flex items-center justify-between gap-6 z-30">
        <button
          type="button"
          onClick={() => setActivePage(0)}
          className="text-sm font-bold tracking-tight text-blue-300 hover:text-blue-200 whitespace-nowrap shrink-0 transition-colors"
        >
          DayBell
        </button>

        {/* Desktop 4-Page Tabs */}
        <nav aria-label={tr(lang, 'Główne strony', 'Main pages')} className="hidden lg:flex items-center gap-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.index;
            return (
              <button
                key={item.index}
                type="button"
                onClick={() => {
                  if (item.index === 3) setSettingsInitialTab(undefined);
                  setActivePage(item.index);
                }}
                className={`inline-flex items-center gap-2 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  active
                    ? 'text-blue-300 border-blue-500'
                    : 'text-blue-500 border-transparent hover:text-blue-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
                {typeof item.count === 'number' && item.count > 0 && (
                  <span className="font-mono text-[11px] tabular-nums text-blue-400">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setAlertsOpen(true)}
            aria-label={tr(lang, 'Otwórz centrum alertów', 'Open alert center')}
            className="inline-flex items-center gap-2 px-3.5 min-h-[36px] text-xs font-semibold text-blue-200 bg-[#070B14] border border-blue-900 hover:border-blue-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Bell className="h-3.5 w-3.5 text-blue-400" />
            <span>{tr(lang, 'Alerty', 'Alerts')}</span>
            {unreadAlertsCount > 0 && (
              <span className="font-mono tabular-nums text-blue-400">{unreadAlertsCount}</span>
            )}
          </button>
        </div>
      </header>

      {/* Slim Example-Schedule Banner on Feed & Calendar so it can be cleared in 1 tap */}
      {isExampleWorkspace && (activePage === 1 || activePage === 2) && (
        <div className="shrink-0 bg-[#070B14] border-b border-blue-950 px-4 sm:px-6 py-1.5 flex items-center justify-between gap-2 z-20">
          <span className="text-xs text-blue-300 truncate">
            {tr(lang, 'Przykładowy plan jest aktywny', 'Viewing example schedule')}
          </span>
          <button
            type="button"
            onClick={handleClearExampleSchedule}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-rose-300 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/70 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {tr(lang, 'Wyczyść przykład', 'Clear Example')}
          </button>
        </div>
      )}

      {/* Active Page Viewport (renders only the active page — zero cross-page overlap) */}
      <main
        className="flex-1 min-h-0 w-full overflow-hidden relative bg-black"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div key={activePage} className="h-full w-full overflow-hidden page-enter">
          {activePage === 0 && (
            <HomeImportPage
              workspace={workspace}
              todayYmd={todayYmd}
              weekStartYmd={workspace?.weekStart ?? defaultWeekStart}
              nextCard={nextUnfinishedCard}
              pendingTodayCount={pendingTodayCount}
              classifiedTests={classifiedTests}
              digest={digest}
              analyzingMessages={analyzing}
              settings={settings}
              ownerPin={ownerPin}
              onUnlockOwnerPin={handleUnlockOwnerPin}
              onSetupOwnerPin={handleSetupOwnerPin}
              onLockOwnerPin={handleLockOwnerPin}
              onConfirmImport={handleConfirmImport}
              onLoadExampleWeek={handleLoadExampleWeek}
              onClearExampleSchedule={handleClearExampleSchedule}
              onGoToFeed={() => setActivePage(1)}
              onOpenMessagesSheet={() => setMessagesSheetOpen(true)}
              onOpenTestStudyInFeed={handleOpenTestStudyInFeed}
              onOpenQuickAddSheet={openQuickAdd}
              onOpenPackingEditor={openPackingEditor}
              onOpenSyncPanel={openSyncPanel}
              classLink={classLink}
              googleConnected={Boolean(googleAccessToken)}
              onSummarizeMessages={() => {
                if (workspace) void runAnalysisForWorkspace(workspace);
              }}
              onToggleLanguage={(language) => handleUpdateSettings({ language })}
            />
          )}

          {activePage === 1 && (
            <MomentShortsPage
              isActivePage={activePage === 1}
              todayYmd={todayYmd}
              selectedDate={feedDate}
              onSelectDate={setFeedDate}
              timetable={workspace?.timetable ?? []}
              tests={mergedTests}
              classifiedTests={classifiedTests}
              homework={workspace?.homework ?? []}
              commutePlaces={workspace?.commutePlaces ?? []}
              oneOffTasks={workspace?.oneOffTasks ?? []}
              exemptions={workspace?.exemptions ?? []}
              smartRules={workspace?.smartRules ?? []}
              derivedTasks={derivedTasks}
              subjectKits={subjectKits}
              extractedPackingItems={digest?.extractedPackingItems ?? []}
              customPackingItems={customItems}
              checkedPackIds={checkedIds}
              completedStudyIds={completedStudyIds}
              studyPlans={studyPlans}
              generatingStudyTestId={generatingStudyTestId}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onTogglePackItem={handleToggleChecked}
              onToggleSmartTask={handleToggleSmartTask}
              onToggleOneOffTask={handleToggleOneOffTask}
              onToggleHomework={handleToggleHomework}
              onToggleStudyDay={handleToggleStudyDay}
              onDeleteHomework={handleDeleteHomework}
              onDeleteTest={handleDeleteTest}
              onOpenExamNotes={(test) => setActiveNotesTestId(test.id)}
              onGenerateInlineStudyPlan={(test) => void handleGenerateInlineStudyPlan(test)}
              onPreviewTaskAlert={handlePreviewTaskAlert}
              onOpenQuickAddSheet={() => openQuickAdd()}
              onOpenPackingEditor={openPackingEditor}
              onOpenRoutineEditor={openRoutineEditor}
              onLoadExampleWeek={handleLoadExampleWeek}
              hasWorkspace={Boolean(workspace)}
              ownerAiUnlocked={Boolean(ownerPin.token)}
            />
          )}

          {activePage === 2 && (
            <CalendarPage
              todayYmd={todayYmd}
              timetable={workspace?.timetable ?? []}
              tests={mergedTests}
              homework={workspace?.homework ?? []}
              commutePlaces={workspace?.commutePlaces ?? []}
              oneOffTasks={workspace?.oneOffTasks ?? []}
              exemptions={workspace?.exemptions ?? []}
              derivedTasks={derivedTasks}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onOpenDayInShorts={(date) => {
                setFeedDate(date);
                setActivePage(1);
              }}
              onOpenQuickAddSheet={() => openQuickAdd()}
              onOpenRoutineEditor={openRoutineEditor}
              onOpenTestStudyInFeed={handleOpenTestStudyInFeed}
              onOpenExamNotes={(test) => setActiveNotesTestId(test.id)}
              onDeleteTest={handleDeleteTest}
              onDeleteHomework={handleDeleteHomework}
              onDeleteOneOff={(taskId) =>
                updateWorkspace((prev) => ({
                  ...prev,
                  oneOffTasks: prev.oneOffTasks.filter((t) => t.id !== taskId),
                }))
              }
              onDeleteExemption={(exId) =>
                updateWorkspace((prev) => ({
                  ...prev,
                  exemptions: prev.exemptions.filter((e) => e.id !== exId),
                }))
              }
            />
          )}

          {activePage === 3 && (
            <SettingsPage
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              browserPermission={browserPermission}
              onRequestBrowserPermission={() => void handleRequestBrowserPermission()}
              onSendPreviewNotification={() => handleSendPreviewNotification()}
              commutePlaces={workspace?.commutePlaces ?? []}
              smartRules={workspace?.smartRules ?? []}
              exemptions={workspace?.exemptions ?? []}
              onToggleRule={(ruleId) =>
                updateWorkspace((prev) => ({
                  ...prev,
                  smartRules: prev.smartRules.map((r) =>
                    r.id === ruleId ? { ...r, enabled: !r.enabled } : r,
                  ),
                }))
              }
              onUpdateRule={(ruleId: string, patch: Partial<SmartRule>) =>
                updateWorkspace((prev) => ({
                  ...prev,
                  smartRules: prev.smartRules.map((r) =>
                    r.id === ruleId ? { ...r, ...patch } : r,
                  ),
                }))
              }
              onDeleteRule={(ruleId) =>
                updateWorkspace((prev) => ({
                  ...prev,
                  smartRules: prev.smartRules.filter((r) => r.id !== ruleId),
                }))
              }
              onDeleteExemption={(exId) =>
                updateWorkspace((prev) => ({
                  ...prev,
                  exemptions: prev.exemptions.filter((e) => e.id !== exId),
                }))
              }
              onUpdatePlaceDays={(placeId: string, days: DayOfWeek[]) =>
                updateWorkspace((prev) => ({
                  ...prev,
                  commutePlaces: prev.commutePlaces.map((p) =>
                    p.id === placeId ? { ...p, daysOfWeek: days } : p,
                  ),
                }))
              }
              onAddCommutePlace={(name: string, days: DayOfWeek[]) =>
                updateWorkspace((prev) => ({
                  ...prev,
                  commutePlaces: [
                    ...prev.commutePlaces,
                    { id: `place-${Date.now()}`, name, daysOfWeek: days, when: 'after-school' },
                  ],
                }))
              }
              onDeleteCommutePlace={(placeId: string) =>
                updateWorkspace((prev) => ({
                  ...prev,
                  commutePlaces: prev.commutePlaces.filter((p) => p.id !== placeId),
                }))
              }
              subjectKits={subjectKits}
              onUpdateKits={setSubjectKits}
              timetable={workspace?.timetable ?? []}
              weekStartYmd={workspace?.weekStart ?? defaultWeekStart}
              onUpdateTimetable={(lessons: LessonSlot[]) =>
                updateWorkspace((prev) => ({ ...prev, timetable: lessons }))
              }
              isExampleWorkspace={isExampleWorkspace}
              onLoadExampleWeek={handleLoadExampleWeek}
              onClearExampleSchedule={handleClearExampleSchedule}
              onResetWorkspace={() => {
                setWorkspace(null);
                setDigest(null);
                setCheckedIds({});
                setCompletedSmartIds({});
                setCompletedStudyIds({});
                setStudyPlans({});
                setActivePage(0);
              }}
              ownerPin={ownerPin}
              onUnlockOwnerPin={handleUnlockOwnerPin}
              onSetupOwnerPin={handleSetupOwnerPin}
              onLockOwnerPin={handleLockOwnerPin}
              googleUser={googleUser}
              hasGoogleToken={Boolean(googleAccessToken)}
              googleSigningIn={googleSigningIn}
              onGoogleSignIn={handleGoogleSignIn}
              onGoogleSignOut={handleGoogleSignOut}
              personalLastSyncedAt={personalLastSyncedAt}
              personalStats={personalStats}
              onSavePersonalSync={handleSavePersonalSync}
              onLoadPersonalSync={handleLoadPersonalSync}
              classLink={classLink}
              onCreateSharedClass={handleCreateSharedClass}
              onJoinSharedClass={handleJoinSharedClass}
              onPullSharedClass={handlePullSharedClass}
              onPushSharedClass={handlePushSharedClass}
              onLeaveSharedClass={handleLeaveSharedClass}
              initialTab={settingsInitialTab}
            />
          )}
        </div>
      </main>

      {/* Mobile Bottom 4-Tab Bar (56px) */}
      <nav
        aria-label={tr(lang, 'Mobilna nawigacja', 'Mobile page switcher')}
        className="lg:hidden h-14 shrink-0 bg-black border-t border-blue-950 grid grid-cols-4 z-30"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.index;
          return (
            <button
              key={item.index}
              type="button"
              onClick={() => {
                if (item.index === 3) setSettingsInitialTab(undefined);
                setActivePage(item.index);
              }}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? 'text-blue-300' : 'text-blue-600 hover:text-blue-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Live in-app notification toast */}
      {toastAlert && (
        <div className="fixed bottom-16 lg:bottom-5 right-4 z-50 max-w-sm bg-[#070B14] border border-blue-800 rounded-xl p-4 shadow-xl flex items-start gap-3">
          <Bell className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-blue-200">{toastAlert.title}</div>
            <p className="text-xs text-blue-400 mt-0.5 leading-relaxed">{toastAlert.body}</p>
          </div>
          <button
            type="button"
            onClick={() => setToastAlert(null)}
            aria-label={tr(lang, 'Zamknij powiadomienie', 'Close notification')}
            className="p-0.5 text-blue-500 hover:text-blue-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Dedicated Full-Space Overlay: Step-by-Step Smart Add */}
      {quickAddSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6 bg-black sm:bg-black/85 sm:backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={tr(lang, 'Dodaj krok po kroku', 'Step-by-Step Add')}
        >
          <div className="w-full h-dvh sm:h-[min(88dvh,760px)] sm:max-w-2xl bg-[#070B14] sm:border sm:border-blue-800 sm:rounded-2xl overflow-hidden flex flex-col">
            <div className="px-4 sm:px-6 py-4 border-b border-blue-950 flex items-center justify-between gap-3 shrink-0 bg-black">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-blue-200 truncate">
                  {tr(lang, 'Dodaj krok po kroku', 'Step-by-Step Smart Add')}
                </h2>
                <p className="text-xs text-blue-400 truncate mt-0.5">
                  {tr(
                    lang,
                    '100% lokalnie bez AI — automatyczne dopasowanie do planu',
                    '100% local, zero AI — fits automatically into your timetable',
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={closeQuickAdd}
                aria-label={tr(lang, 'Zamknij okno dodawania', 'Close quick add')}
                className="p-2.5 text-blue-300 hover:text-blue-100 bg-[#070B14] border border-blue-900 hover:border-blue-500 rounded-xl shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-4 sm:p-6 flex flex-col overflow-hidden">
              <QuickCaptureBar
                key={quickAddInitialKind ?? 'all'}
                todayYmd={todayYmd}
                timetable={workspace?.timetable ?? []}
                commutePlaces={workspace?.commutePlaces ?? []}
                exemptions={workspace?.exemptions ?? []}
                settings={settings}
                ownerAiToken={ownerPin.token}
                initialKind={quickAddInitialKind}
                onCommitIntent={handleCommitIntent}
              />
            </div>
          </div>
        </div>
      )}

      {/* Sheet: Messages & AI Briefs */}
      {messagesSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={tr(lang, 'Wiadomości i skróty', 'Messages and AI Briefs')}
        >
          <div className="w-full max-w-5xl h-full bg-black border-l border-blue-900 flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-[#070B14] border-b border-blue-950 flex items-center justify-between gap-4 shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-blue-200 truncate">
                  {tr(lang, 'Wiadomości i skróty ogłoszeń', 'Messages & Announcement Briefs')}
                </h2>
                <p className="text-xs text-blue-400 truncate">
                  {tr(
                    lang,
                    'Wiadomości ze szkoły oraz opcjonalne skróty AI z wykrywaniem rzeczy do spakowania',
                    'AI-summarized notices with automatically extracted packing items & deadlines',
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMessagesSheetOpen(false)}
                aria-label={tr(lang, 'Zamknij wiadomości', 'Close messages')}
                className="p-2 text-blue-400 hover:text-blue-200 shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <MessagesView
                messages={workspace?.messages ?? []}
                digest={digest}
                analyzing={analyzing}
                aiError={aiError}
                onRunAnalysis={() => {
                  if (workspace) void runAnalysisForWorkspace(workspace);
                }}
                onAddManualMessage={(msg: Omit<SchoolMessage, 'id' | 'source'>) => {
                  const created: SchoolMessage = {
                    ...msg,
                    id: `man-msg-${Date.now()}`,
                    source: 'manual',
                  };
                  updateWorkspace((prev) => ({ ...prev, messages: [created, ...prev.messages] }));
                }}
                todayYmd={todayYmd}
                ownerAiUnlocked={Boolean(ownerPin.token)}
                lang={lang}
              />
            </div>
          </div>
        </div>
      )}

      {/* Alert Center Drawer */}
      <AlertCenterDrawer
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        notifications={notifications}
        browserPermission={browserPermission}
        onRequestBrowserPermission={() => void handleRequestBrowserPermission()}
        onSendPreviewNotification={handleSendPreviewNotification}
        onMarkRead={(id) => setReadNotifIds((prev) => ({ ...prev, [id]: true }))}
        onDismiss={(id) => setDismissedNotifIds((prev) => ({ ...prev, [id]: true }))}
        lang={lang}
      />

      {/* Shared Exam Notes Modal */}
      {activeNotesTest && (
        <ExamNotesModal
          test={activeNotesTest}
          lang={lang}
          classLink={classLink}
          onAddNote={handleAddExamNote}
          onDeleteNote={handleDeleteExamNote}
          onOpenSyncPanel={openSyncPanel}
          onClose={() => setActiveNotesTestId(null)}
        />
      )}

      {/* 1-Click Shared Class Invite Onboarding Modal */}
      {pendingClassInvite && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={tr(lang, 'Zaproszenie do klasy', 'Class Invitation')}
        >
          <div className="w-full max-w-md bg-[#070B14] border border-blue-700 rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <Users className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-blue-200">
                    {pendingClassInvite.className
                      ? tr(
                          lang,
                          `Zaproszenie do klasy ${pendingClassInvite.className}`,
                          `Invited to Class ${pendingClassInvite.className}`,
                        )
                      : tr(lang, 'Zaproszenie do wspólnej klasy', 'Invited to Shared Class')}
                  </h2>
                  <p className="text-xs text-blue-400 mt-1 leading-relaxed">
                    {tr(
                      lang,
                      'Dołącz, aby od razu wczytać wspólny plan lekcji, prace domowe i sprawdziany. Twoje osobiste reguły, zestawy Co pakować i odhaczenia są w 100% prywatne.',
                      'Join to load your class’s shared timetable, homework, and tests right away. Your personal rules, packing kits, and checkmarks stay 100% private.',
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={joiningInvite}
                onClick={() => setPendingClassInvite(null)}
                aria-label={tr(lang, 'Zamknij zaproszenie', 'Close invitation')}
                className="p-1 text-blue-400 hover:text-blue-200 shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {inviteError && (
              <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/70 rounded-xl px-3.5 py-2.5">
                {inviteError}
              </p>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={joiningInvite}
                onClick={() => setPendingClassInvite(null)}
                className="px-4 py-2.5 text-xs font-semibold text-blue-400 hover:text-blue-200"
              >
                {tr(lang, 'Później', 'Not Now')}
              </button>
              {googleAccessToken ? (
                <button
                  type="button"
                  disabled={joiningInvite}
                  onClick={() => void handleAcceptClassInvite()}
                  className="inline-flex items-center justify-center gap-2 min-h-[42px] px-5 py-2.5 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-50 rounded-xl whitespace-nowrap"
                >
                  {joiningInvite && <Loader2 className="h-4 w-4 animate-spin" />}
                  {tr(lang, 'Dołącz i pobierz plan', 'Join & Load Class Plan')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={joiningInvite}
                  onClick={() => void handleAcceptClassInvite()}
                  className="inline-flex items-center justify-center gap-2.5 min-h-[42px] px-5 py-2.5 text-xs font-semibold text-[#1F1F1F] bg-white hover:bg-slate-100 disabled:opacity-60 border border-[#747775] rounded-xl shadow-xs whitespace-nowrap"
                >
                  {joiningInvite ? (
                    <Loader2 className="h-4 w-4 animate-spin text-[#4285F4]" />
                  ) : (
                    <GoogleGIcon />
                  )}
                  <span>
                    {tr(lang, 'Zaloguj przez Google i dołącz', 'Sign in with Google & Join')}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
