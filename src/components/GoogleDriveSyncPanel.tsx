import { useState, type FormEvent } from 'react';
import {
  Check,
  Cloud,
  CloudDownload,
  CloudUpload,
  Copy,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  Share2,
  ShieldCheck,
  Unlink,
  Users,
  X,
} from 'lucide-react';
import type { AppLanguage, SharedClassLink } from '../types';
import { tr } from '../utils/i18n';

export interface GoogleAccountSummary {
  displayName: string | null;
  email: string | null;
}

export interface PersonalSyncStats {
  lessons: number;
  rules: number;
  kits: number;
  homework: number;
  tests: number;
  examNotes: number;
}

interface PendingConfirmAction {
  title: string;
  description: string;
  details: string[];
  confirmLabel: string;
  run: () => Promise<void>;
}

interface GoogleDriveSyncPanelProps {
  lang: AppLanguage;
  googleUser: GoogleAccountSummary | null;
  hasToken: boolean;
  signingIn: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
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
}

function formatSyncTimestamp(iso: string | null | undefined, lang: AppLanguage): string {
  if (!iso) return tr(lang, 'Jeszcze nie zsynchronizowano', 'Not synced yet');
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString(lang === 'pl' ? 'pl-PL' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function GoogleGIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.65z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.22 7.22 0 0 1 4.9 12c0-.79.14-1.56.37-2.28v-3.1H1.26A12 12 0 0 0 0 12c0 1.94.46 3.77 1.26 5.38l4.01-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.26 6.62l4.01 3.1C6.22 6.87 8.87 4.76 12 4.76z"
      />
    </svg>
  );
}

export function GoogleDriveSyncPanel({
  lang,
  googleUser,
  hasToken,
  signingIn,
  onSignIn,
  onSignOut,
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
}: GoogleDriveSyncPanelProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmAction | null>(null);

  const [newClassName, setNewClassName] = useState('');
  const [newClassRole, setNewClassRole] = useState<'writer' | 'reader'>('writer');
  const [joinCode, setJoinCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const runDirectAction = async (actionKey: string, fn: () => Promise<void>) => {
    setErrorMsg(null);
    setBusyAction(actionKey);
    try {
      await fn();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr(lang, 'Nie udało się wykonać operacji Google Drive.', 'Google Drive operation failed.'),
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmExecute = async () => {
    if (!pendingConfirm) return;
    setErrorMsg(null);
    setBusyAction('confirm');
    try {
      await pendingConfirm.run();
      setPendingConfirm(null);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr(lang, 'Operacja na Dysku Google nie powiodła się.', 'Google Drive write failed.'),
      );
      setPendingConfirm(null);
    } finally {
      setBusyAction(null);
    }
  };

  const openSavePersonalModal = () => {
    setErrorMsg(null);
    setPendingConfirm({
      title: tr(lang, 'Zapisać kopię na Dysku Google?', 'Save Personal Backup to Google Drive?'),
      description: tr(
        lang,
        'Spowoduje to zapisanie lub zaktualizowanie ukrytego pliku synchronizacji DayBell (daybell-personal-sync.json) w prywatnym folderze aplikacji na Twoim Dysku Google.',
        'This will save or update your hidden DayBell sync file (daybell-personal-sync.json) in your private Google Drive app data folder.',
      ),
      details: [
        tr(
          lang,
          `Plan lekcji: ${personalStats.lessons} lekcji · Prace domowe: ${personalStats.homework} · Sprawdziany: ${personalStats.tests}`,
          `Timetable: ${personalStats.lessons} classes · Homework: ${personalStats.homework} · Tests: ${personalStats.tests}`,
        ),
        tr(
          lang,
          `Osobiste reguły: ${personalStats.rules} · Zestawy do spakowania: ${personalStats.kits} przedmiotów`,
          `Personal rules: ${personalStats.rules} · Packing kits: ${personalStats.kits} subjects`,
        ),
        classLink
          ? tr(
              lang,
              `Osobiste bloki dnia, czas wolny, postęp nauki i połączenie z klasą (${classLink.className})`,
              `Personal time blocks, free time, study progress, and class link (${classLink.className})`,
            )
          : tr(
              lang,
              'Osobiste bloki dnia (dojazd, obiad, sen), czas wolny, ustawienia i odhaczenia pakowania',
              'Personal time blocks (transit, dinner, sleep), free time, settings, and packing checkmarks',
            ),
      ],
      confirmLabel: tr(lang, 'Zapisz na Dysku Google', 'Save to Google Drive'),
      run: onSavePersonalSync,
    });
  };

  const handleSubmitCreateClass = (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanName = newClassName.trim();
    if (!cleanName) {
      setErrorMsg(tr(lang, 'Wpisz nazwę klasy (np. 2B).', 'Enter a class name (e.g. 2B).'));
      return;
    }
    setPendingConfirm({
      title: tr(
        lang,
        `Utworzyć wspólny plik klasy „${cleanName}”?`,
        `Create Shared Class File "${cleanName}"?`,
      ),
      description: tr(
        lang,
        `Utworzy plik „DayBell Class - ${cleanName}.json” na Twoim Dysku Google i włączy udostępnianie przez kod klasy (${
          newClassRole === 'writer'
            ? 'każdy z kodem może edytować'
            : 'każdy z kodem może tylko odczytywać'
        }).`,
        `Creates "DayBell Class - ${cleanName}.json" in your Google Drive and enables link sharing via Class Code (${
          newClassRole === 'writer' ? 'anyone with code can edit' : 'anyone with code can view'
        }).`,
      ),
      details: [
        tr(
          lang,
          `Udostępnione klasie: ${personalStats.lessons} lekcji, ${personalStats.homework} prac domowych, ${personalStats.tests} sprawdzianów (${personalStats.examNotes} notatek)`,
          `Shared with class: ${personalStats.lessons} classes, ${personalStats.homework} homework items, ${personalStats.tests} exams (${personalStats.examNotes} shared notes)`,
        ),
        tr(
          lang,
          'Prywatne (NIE udostępniane): Twoje bloki dnia, czas wolny, reguły, Co pakować, zwolnienia i odhaczenia',
          'Kept private (NOT uploaded): Your personal time blocks, free time, rules, packing kits, exemptions, and checkmarks',
        ),
      ],
      confirmLabel: tr(lang, 'Utwórz i udostępnij plik klasy', 'Create & Share Class File'),
      run: async () => {
        await onCreateSharedClass(cleanName, newClassRole);
        setNewClassName('');
      },
    });
  };

  const handleSubmitJoinClass = (e: FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    void runDirectAction('join-class', async () => {
      await onJoinSharedClass(joinCode.trim());
      setJoinCode('');
    });
  };

  const openPushClassModal = () => {
    if (!classLink) return;
    setErrorMsg(null);
    setPendingConfirm({
      title: tr(
        lang,
        `Wysłać zmiany do klasy „${classLink.className}”?`,
        `Push Updates to Class "${classLink.className}"?`,
      ),
      description: tr(
        lang,
        'Zaktualizuje wspólny plik klasy na Dysku Google Twoim aktualnym planem lekcji, pracami domowymi i sprawdzianami. Wszyscy koledzy z klasy otrzymają te dane po odświeżeniu.',
        'Overwrites the shared Google Drive class file with your current timetable, homework, and tests. Classmates will see these updates when they pull.',
      ),
      details: [
        tr(
          lang,
          `Wysyłane dane klasy: ${personalStats.lessons} lekcji · ${personalStats.homework} prac domowych · ${personalStats.tests} sprawdzianów (${personalStats.examNotes} notatek)`,
          `Class data pushed: ${personalStats.lessons} classes · ${personalStats.homework} homework · ${personalStats.tests} exams (${personalStats.examNotes} shared notes)`,
        ),
        tr(
          lang,
          'Odhaczenia prac domowych są czyszczone w pliku klasy — każdy uczeń zachowuje własny stan wykonania',
          'Homework completion flags are stripped — every student keeps their own checkmarks',
        ),
        tr(
          lang,
          'Twoje bloki dnia (dojazd, obiad, sen), czas wolny, reguły i co pakować pozostają w 100% prywatne',
          'Your personal time blocks (transit, dinner, sleep), free time, rules, and packing kits stay 100% private',
        ),
      ],
      confirmLabel: tr(lang, 'Wyślij do klasy', 'Push to Class'),
      run: onPushSharedClass,
    });
  };

  const handleCopyClassCode = async () => {
    if (!classLink) return;
    try {
      await navigator.clipboard.writeText(classLink.fileId);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2400);
    } catch {
      setErrorMsg(
        tr(
          lang,
          'Nie udało się skopiować kodu — zaznacz kod ręcznie i skopiuj.',
          'Could not access clipboard — please copy the code manually.',
        ),
      );
    }
  };

  const handleCopyInviteLink = async () => {
    if (!classLink) return;
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const inviteUrl = `${baseUrl}?class=${encodeURIComponent(classLink.fileId)}&name=${encodeURIComponent(classLink.className)}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2600);
    } catch {
      setErrorMsg(
        tr(
          lang,
          'Nie udało się skopiować linku zaproszenia — użyj przycisku Kopiuj kod.',
          'Could not access clipboard — please use Copy Code instead.',
        ),
      );
    }
  };

  const isBusy = busyAction !== null;

  return (
    <div className="space-y-4">
      {/* Google Account Connection Banner */}
      <section className="bg-[#070B14] border border-blue-950 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Cloud className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-blue-200">
              {tr(lang, 'Konto Google Drive', 'Google Drive Account')}
            </h2>
            {hasToken && googleUser ? (
              <p className="text-xs text-cyan-300 mt-0.5 truncate">
                {googleUser.displayName ? `${googleUser.displayName} · ` : ''}
                {googleUser.email || tr(lang, 'Połączono z Dyskiem Google', 'Connected to Google Drive')}
              </p>
            ) : googleUser ? (
              <p className="text-xs text-amber-300 mt-0.5">
                {tr(
                  lang,
                  `Sesja Google Drive wygasła (${googleUser.email || 'konto Google'}) — zaloguj się ponownie, aby zsynchronizować.`,
                  `Google Drive session expired (${googleUser.email || 'Google account'}) — sign in again to sync.`,
                )}
              </p>
            ) : (
              <p className="text-xs text-blue-400 mt-0.5">
                {tr(
                  lang,
                  'Zaloguj się przez Google, aby synchronizować swój plan między urządzeniami i współdzielić plan z klasą.',
                  'Sign in with Google to sync your setup across devices and share a class plan with classmates.',
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!hasToken ? (
            <button
              type="button"
              disabled={signingIn}
              onClick={() => void runDirectAction('sign-in', onSignIn)}
              className="inline-flex items-center gap-2.5 min-h-[42px] px-4 py-2 text-xs font-semibold text-[#1F1F1F] bg-white hover:bg-slate-100 disabled:opacity-60 border border-[#747775] rounded-lg shadow-xs transition-colors whitespace-nowrap"
            >
              {signingIn || busyAction === 'sign-in' ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#4285F4]" />
              ) : (
                <GoogleGIcon />
              )}
              <span>{tr(lang, 'Zaloguj się przez Google', 'Sign in with Google')}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void runDirectAction('sign-out', onSignOut)}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 text-xs font-semibold text-blue-300 hover:text-blue-100 bg-black border border-blue-900 hover:border-blue-500 rounded-lg transition-colors whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" />
              {tr(lang, 'Wyloguj', 'Sign Out')}
            </button>
          )}
        </div>
      </section>

      {errorMsg && (
        <div className="bg-rose-950/35 border border-rose-800/80 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-xs text-rose-300 leading-relaxed">{errorMsg}</p>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            aria-label={tr(lang, 'Zamknij błąd', 'Dismiss error')}
            className="text-rose-400 hover:text-rose-200 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Personal Sync (appDataFolder) */}
        <section className="bg-[#070B14] border border-blue-950 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="pb-3 border-b border-blue-950 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-blue-200">
                  {tr(lang, 'Synchronizacja osobista (Twoje urządzenia)', 'Personal Sync (Your Devices)')}
                </h3>
                <p className="text-xs text-blue-400 mt-0.5">
                  {tr(
                    lang,
                    'Zapisuje wszystko na Twoim prywatnym Dysku Google: reguły, co pakować, ustawienia, postęp nauki i połączenie z klasą.',
                    'Saves everything to your private Google Drive app storage: rules, packing kits, settings, progress, and your class link.',
                  )}
                </p>
              </div>
              <ShieldCheck className="h-4 w-4 text-cyan-300 shrink-0 mt-0.5" />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                [tr(lang, 'Lekcje', 'Lessons'), personalStats.lessons],
                [tr(lang, 'Reguły', 'Rules'), personalStats.rules],
                [tr(lang, 'Zestawy', 'Kits'), personalStats.kits],
              ].map(([label, count]) => (
                <div key={String(label)} className="p-2.5 bg-black border border-blue-950 rounded-xl">
                  <div className="font-mono text-base font-bold tabular-nums text-blue-200">
                    {count}
                  </div>
                  <div className="text-[11px] text-blue-400">{label}</div>
                </div>
              ))}
            </div>

            <div className="text-xs text-blue-400 flex items-center justify-between gap-2 pt-1">
              <span>{tr(lang, 'Ostatnia synchronizacja:', 'Last synced:')}</span>
              <span className="font-mono text-blue-300">
                {formatSyncTimestamp(personalLastSyncedAt, lang)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-blue-950">
            <button
              type="button"
              disabled={!hasToken || isBusy}
              onClick={openSavePersonalModal}
              className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-40 rounded-xl transition-colors whitespace-nowrap"
            >
              <CloudUpload className="h-4 w-4 shrink-0" />
              {tr(lang, 'Zapisz na Dysku', 'Save to Drive')}
            </button>
            <button
              type="button"
              disabled={!hasToken || isBusy}
              onClick={() => void runDirectAction('load-personal', onLoadPersonalSync)}
              className="inline-flex items-center justify-center gap-2 min-h-[42px] px-4 py-2 text-xs font-semibold text-blue-200 bg-black border border-blue-900 hover:border-blue-500 disabled:opacity-40 rounded-xl transition-colors whitespace-nowrap"
            >
              {busyAction === 'load-personal' ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <CloudDownload className="h-4 w-4 shrink-0 text-blue-400" />
              )}
              {tr(lang, 'Wczytaj z Dysku', 'Load from Drive')}
            </button>
          </div>
        </section>

        {/* Card 2: Shared Class Plan (drive.file) */}
        <section className="bg-[#070B14] border border-blue-950 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="pb-3 border-b border-blue-950 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-blue-200">
                  {tr(lang, 'Wspólny plan klasy', 'Shared Class Plan')}
                </h3>
                <p className="text-xs text-blue-400 mt-0.5">
                  {tr(
                    lang,
                    'Cała klasa ma jeden plan lekcji, prace domowe, sprawdziany i wspólne notatki do nich, a każdy zachowuje swoje prywatne reguły i pakowanie.',
                    'Everyone in class shares one timetable, homework list, exams, and exam notes — while keeping their own rules & packing completely separate.',
                  )}
                </p>
              </div>
              <Users className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            </div>

            {/* Shared vs Private Clarity Strip */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 bg-black border border-blue-950 rounded-xl">
                <div className="font-semibold text-cyan-300">
                  {tr(lang, 'Wspólne dla klasy', 'Shared with Class')}
                </div>
                <div className="text-blue-400 mt-0.5 leading-snug">
                  {tr(
                    lang,
                    'Plan lekcji, prace domowe, sprawdziany i notatki',
                    'Timetable, homework, exams & shared notes',
                  )}
                </div>
              </div>
              <div className="p-2.5 bg-black border border-blue-950 rounded-xl">
                <div className="font-semibold text-blue-200">
                  {tr(lang, 'Tylko Twoje (prywatne)', 'Private to You')}
                </div>
                <div className="text-blue-400 mt-0.5 leading-snug">
                  {tr(
                    lang,
                    'Bloki dnia, czas wolny, reguły, Co pakować, zwolnienia',
                    'Personal blocks, free time, rules, packing kits, exemptions',
                  )}
                </div>
              </div>
            </div>

            {classLink ? (
              <div className="space-y-3 pt-1">
                <div className="p-3.5 bg-black border border-blue-900 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-blue-200 truncate">
                        {tr(lang, `Klasa: ${classLink.className}`, `Class: ${classLink.className}`)}
                      </div>
                      <div className="text-[11px] text-blue-400 truncate">
                        {classLink.lastUpdatedBy
                          ? tr(
                              lang,
                              `Ostatnia zmiana: ${classLink.lastUpdatedBy} · ${formatSyncTimestamp(classLink.lastSyncedAt, lang)}`,
                              `Updated by ${classLink.lastUpdatedBy} · ${formatSyncTimestamp(classLink.lastSyncedAt, lang)}`,
                            )
                          : formatSyncTimestamp(classLink.lastSyncedAt, lang)}
                      </div>
                    </div>
                    <span
                      className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded border shrink-0 ${
                        classLink.shareRole === 'writer'
                          ? 'border-cyan-500/60 text-cyan-300'
                          : 'border-blue-800 text-blue-400'
                      }`}
                    >
                      {classLink.shareRole === 'writer'
                        ? tr(lang, 'Edycja', 'Can Edit')
                        : tr(lang, 'Odczyt', 'View Only')}
                    </span>
                  </div>

                  {/* Copyable Class Invite Link & Code */}
                  <div className="space-y-2 pt-2 border-t border-blue-950">
                    <button
                      type="button"
                      onClick={() => void handleCopyInviteLink()}
                      className="w-full inline-flex items-center justify-center gap-2 min-h-[40px] px-3.5 py-2 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors whitespace-nowrap"
                    >
                      {copiedLink ? (
                        <Check className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Share2 className="h-3.5 w-3.5 shrink-0" />
                      )}
                      {copiedLink
                        ? tr(lang, 'Skopiowano link zaproszenia!', 'Invite Link Copied!')
                        : tr(lang, 'Kopiuj link zaproszenia dla klasy', 'Copy 1-Click Class Invite Link')}
                    </button>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-blue-500">
                          {tr(lang, 'Lub sam Kod klasy', 'Or raw Class Code')}
                        </div>
                        <div className="font-mono text-xs text-blue-200 truncate select-all">
                          {classLink.fileId}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopyClassCode()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-200 bg-[#070B14] border border-blue-800 hover:border-blue-400 rounded-lg whitespace-nowrap shrink-0"
                      >
                        {copiedCode ? (
                          <Check className="h-3.5 w-3.5 text-cyan-300" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-blue-400" />
                        )}
                        {copiedCode
                          ? tr(lang, 'Skopiowano!', 'Copied!')
                          : tr(lang, 'Kopiuj kod', 'Copy Code')}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!hasToken || isBusy}
                    onClick={() => void runDirectAction('pull-class', onPullSharedClass)}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-2 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-40 rounded-xl whitespace-nowrap"
                  >
                    {busyAction === 'pull-class' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {tr(lang, 'Pobierz plan klasy', 'Pull Class Updates')}
                  </button>
                  <button
                    type="button"
                    disabled={!hasToken || isBusy || classLink.shareRole !== 'writer'}
                    onClick={openPushClassModal}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-2 text-xs font-semibold text-blue-200 bg-black border border-blue-900 hover:border-blue-500 disabled:opacity-40 rounded-xl whitespace-nowrap"
                  >
                    <CloudUpload className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                    {tr(lang, 'Wyślij zmiany klasie', 'Push My Updates')}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-blue-500">
                    {classLink.shareRole === 'reader'
                      ? tr(
                          lang,
                          'Tryb tylko do odczytu — tylko autor klasy może wysyłać zmiany.',
                          'View-only class — only editors can push updates.',
                        )
                      : tr(
                          lang,
                          'Po dodaniu zadania domowego kliknij „Wyślij zmiany klasie”.',
                          'After adding homework, tap Push My Updates so classmates get it.',
                        )}
                  </span>
                  <button
                    type="button"
                    onClick={onLeaveSharedClass}
                    className="inline-flex items-center gap-1 text-xs font-medium text-rose-400 hover:text-rose-300 whitespace-nowrap shrink-0"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    {tr(lang, 'Odłącz klasę', 'Leave Class')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-1">
                {/* Create Shared Class Form */}
                <form
                  onSubmit={handleSubmitCreateClass}
                  className="p-3.5 bg-black border border-blue-950 rounded-xl space-y-2.5"
                >
                  <div className="text-xs font-semibold text-blue-200">
                    {tr(lang, '1. Utwórz nową klasę (jako pierwsza osoba)', '1. Create a New Shared Class')}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                      placeholder={tr(lang, 'Nazwa klasy (np. 2B, 3A LO)...', 'Class name (e.g. 2B, Grade 10)...')}
                      className="flex-1 min-w-[150px] px-3 py-2 text-xs bg-[#070B14] text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
                    />
                    <div className="flex items-center p-0.5 bg-[#070B14] border border-blue-900 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setNewClassRole('writer')}
                        className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                          newClassRole === 'writer'
                            ? 'bg-blue-500 text-black'
                            : 'text-blue-400 hover:text-blue-200'
                        }`}
                      >
                        {tr(lang, 'Wszyscy edytują', 'All Edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewClassRole('reader')}
                        className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors whitespace-nowrap ${
                          newClassRole === 'reader'
                            ? 'bg-blue-500 text-black'
                            : 'text-blue-400 hover:text-blue-200'
                        }`}
                      >
                        {tr(lang, 'Tylko odczyt', 'View Only')}
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={!hasToken || isBusy || !newClassName.trim()}
                    className="w-full inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <Users className="h-3.5 w-3.5" />
                    {tr(lang, 'Utwórz wspólny plik klasy na Dysku', 'Create Shared Class on Drive')}
                  </button>
                </form>

                {/* Join Existing Class Form */}
                <form
                  onSubmit={handleSubmitJoinClass}
                  className="p-3.5 bg-black border border-blue-950 rounded-xl space-y-2.5"
                >
                  <div className="text-xs font-semibold text-blue-200">
                    {tr(lang, '2. Dołącz do istniejącej klasy', '2. Join an Existing Class')}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value)}
                      placeholder={tr(
                        lang,
                        'Wklej Kod klasy lub link z Dysku Google...',
                        'Paste Class Code or Google Drive link...',
                      )}
                      className="flex-1 min-w-0 px-3 py-2 text-xs font-mono bg-[#070B14] text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
                    />
                    <button
                      type="submit"
                      disabled={!hasToken || isBusy || !joinCode.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-blue-200 bg-[#0B1120] border border-blue-700 hover:border-blue-400 disabled:opacity-40 rounded-lg whitespace-nowrap shrink-0"
                    >
                      {busyAction === 'join-class' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2 className="h-3.5 w-3.5 text-blue-400" />
                      )}
                      {tr(lang, 'Dołącz', 'Join')}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Explicit Custom Confirmation Modal for All Google Drive Write Actions */}
      {pendingConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={pendingConfirm.title}
        >
          <div className="w-full max-w-md bg-[#070B14] border border-blue-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-blue-200">{pendingConfirm.title}</h3>
                <p className="text-xs text-blue-400 mt-1 leading-relaxed">
                  {pendingConfirm.description}
                </p>
              </div>
              <button
                type="button"
                disabled={busyAction === 'confirm'}
                onClick={() => setPendingConfirm(null)}
                aria-label={tr(lang, 'Zamknij potwierdzenie', 'Close confirmation')}
                className="p-1 text-blue-400 hover:text-blue-200 shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="space-y-2 p-3.5 bg-black border border-blue-950 rounded-xl text-xs text-blue-300">
              {pendingConfirm.details.map((line, i) => (
                <li key={i} className="flex items-start gap-2 leading-snug">
                  <span className="text-blue-500 font-bold shrink-0">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={busyAction === 'confirm'}
                onClick={() => setPendingConfirm(null)}
                className="px-4 py-2 text-xs font-semibold text-blue-400 hover:text-blue-200"
              >
                {tr(lang, 'Anuluj', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={busyAction === 'confirm'}
                onClick={() => void handleConfirmExecute()}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-50 rounded-xl whitespace-nowrap"
              >
                {busyAction === 'confirm' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {pendingConfirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
