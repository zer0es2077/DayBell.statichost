import { useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react';
import {
  ArrowRight,
  Backpack,
  Camera,
  Check,
  ClipboardPaste,
  Cloud,
  Copy,
  ListChecks,
  Loader2,
  Lock,
  LockOpen,
  Mail,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  DigestAnalysis,
  ImportBatchResult,
  LibrusWorkspaceData,
  SchoolTest,
  SharedClassLink,
  UserSettings,
} from '../types';
import { tr } from '../utils/i18n';
import {
  buildOwnAiImportPrompt,
  parseLibrusTextLocally,
  parseOwnAiJsonResponse,
} from '../utils/localLibrusParser';
import {
  formatCountdownLabel,
  formatShortDate,
  getStudyPhaseSplit,
  getTestLeadDays,
  type ClassifiedTest,
} from '../utils/packingEngine';
import { getStudySessionsForDate, type MomentShortCard } from '../utils/shortsBuilder';
import type { WizardKind } from './StepAddWizard';

export interface OwnerPinState {
  available: boolean;
  configured: boolean;
  source: 'env' | 'claimed' | 'unclaimed';
  token: string | null;
}

interface HomeImportPageProps {
  workspace: LibrusWorkspaceData | null;
  todayYmd: string;
  weekStartYmd: string;
  nextCard: MomentShortCard | null;
  pendingTodayCount: number;
  classifiedTests: ClassifiedTest[];
  digest: DigestAnalysis | null;
  analyzingMessages: boolean;
  settings: UserSettings;
  ownerPin: OwnerPinState;
  onUnlockOwnerPin: (pin: string) => Promise<string | null>;
  onSetupOwnerPin: (pin: string) => Promise<string | null>;
  onLockOwnerPin: () => void;
  onConfirmImport: (batch: ImportBatchResult) => void;
  onLoadExampleWeek: () => void;
  onClearExampleSchedule: () => void;
  onGoToFeed: () => void;
  onOpenMessagesSheet: () => void;
  onOpenTestStudyInFeed: (test?: SchoolTest) => void;
  onOpenQuickAddSheet: (initialKind?: WizardKind) => void;
  onOpenPackingEditor: () => void;
  onOpenSyncPanel: () => void;
  classLink: SharedClassLink | null;
  googleConnected: boolean;
  onSummarizeMessages: () => void;
  onToggleLanguage: (lang: AppLanguage) => void;
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function HomeImportPage({
  workspace,
  todayYmd,
  weekStartYmd,
  nextCard,
  pendingTodayCount,
  classifiedTests,
  digest,
  analyzingMessages,
  settings,
  ownerPin,
  onUnlockOwnerPin,
  onSetupOwnerPin,
  onLockOwnerPin,
  onConfirmImport,
  onLoadExampleWeek,
  onClearExampleSchedule,
  onGoToFeed,
  onOpenMessagesSheet,
  onOpenTestStudyInFeed,
  onOpenQuickAddSheet,
  onOpenPackingEditor,
  onOpenSyncPanel,
  classLink,
  googleConnected,
  onSummarizeMessages,
  onToggleLanguage,
}: HomeImportPageProps) {
  const lang: AppLanguage = settings.language || 'pl';
  const [mode, setMode] = useState<'step' | 'own-ai' | 'local-paste' | 'owner-ai'>('step');

  // Method 2: Own AI JSON bridge
  const [ownAiJson, setOwnAiJson] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Method 3: Local browser regex/rule paste parser
  const [localPasteText, setLocalPasteText] = useState('');

  // Method 4: Owner-PIN locked server AI screenshot import
  const [pinInput, setPinInput] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<'image/png' | 'image/jpeg' | 'image/webp' | null>(
    null,
  );

  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [previewBatch, setPreviewBatch] = useState<ImportBatchResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isOwnerUnlocked = Boolean(ownerPin.token);

  const readImageFile = (file: File) => {
    setImportError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setImportError(
        tr(
          lang,
          'Obsługiwane są tylko zrzuty PNG, JPEG lub WebP.',
          'Only PNG, JPEG, or WebP screenshots are supported.',
        ),
      );
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImportError(
        tr(lang, 'Zrzut ekranu musi mieć mniej niż 5 MB.', 'Screenshot must be under 5 MB.'),
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      setImagePreviewUrl(dataUrl);
      setImageBase64(dataUrl.split(',')[1] || '');
      setImageMime(file.type as 'image/png' | 'image/jpeg' | 'image/webp');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && isOwnerUnlocked) {
      setMode('owner-ai');
      readImageFile(file);
    }
  };

  const handlePasteAny = (e: ClipboardEvent<HTMLDivElement>) => {
    if (!isOwnerUnlocked) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          setMode('owner-ai');
          readImageFile(file);
          return;
        }
      }
    }
  };

  const handleCopyOwnAiPrompt = async () => {
    const prompt = buildOwnAiImportPrompt(todayYmd, weekStartYmd);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2600);
    } catch {
      setImportError(
        tr(
          lang,
          'Brak dostępu do schowka — zezwól przeglądarce na kopiowanie.',
          'Could not access clipboard — please allow clipboard permission.',
        ),
      );
    }
  };

  const handleRunOwnAiImport = (e: FormEvent) => {
    e.preventDefault();
    setImportError(null);
    const res = parseOwnAiJsonResponse(ownAiJson, todayYmd, weekStartYmd);
    if (!res.ok) {
      setImportError(res.error);
      return;
    }
    setPreviewBatch(res.batch);
  };

  const handleRunLocalPaste = (e: FormEvent) => {
    e.preventDefault();
    setImportError(null);
    if (localPasteText.trim().length < 5) {
      setImportError(
        tr(
          lang,
          'Wklej co najmniej jedną lekcję, sprawdzian, zadanie albo ogłoszenie.',
          'Paste at least one timetable line, test, homework, or notice.',
        ),
      );
      return;
    }
    const batch = parseLibrusTextLocally(localPasteText, todayYmd, weekStartYmd);
    if (
      batch.lessons.length +
        batch.homework.length +
        batch.tests.length +
        batch.messages.length ===
      0
    ) {
      setImportError(
        tr(
          lang,
          'Nie rozpoznano żadnych pozycji. Spróbuj dopisać godziny (08:00-08:45) albo słowa typu Sprawdzian / Zadanie.',
          'No recognizable lines found. Try adding times (08:00-08:45) or keywords like Sprawdzian / Zadanie.',
        ),
      );
      return;
    }
    setPreviewBatch(batch);
  };

  const handlePinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (pinInput.trim().length < 4) {
      setPinError(
        tr(lang, 'PIN musi mieć co najmniej 4 znaki.', 'Enter a PIN with at least 4 characters.'),
      );
      return;
    }
    setPinBusy(true);
    const err = ownerPin.configured
      ? await onUnlockOwnerPin(pinInput.trim())
      : await onSetupOwnerPin(pinInput.trim());
    setPinBusy(false);
    if (err) {
      setPinError(err);
    } else {
      setPinInput('');
    }
  };

  const handleOwnerScreenshotImport = async (e: FormEvent) => {
    e.preventDefault();
    setImportError(null);
    if (!ownerPin.token) {
      setImportError(
        tr(lang, 'Najpierw odblokuj PIN właściciela.', 'Unlock with your Owner PIN first.'),
      );
      return;
    }
    if (!imageBase64 || !imageMime) {
      setImportError(
        tr(
          lang,
          'Upuść zrzut z Librusa, kliknij aby wybrać plik lub wklej (Ctrl+V).',
          'Drop, tap to upload, or press Ctrl+V to attach a Librus screenshot.',
        ),
      );
      return;
    }
    setImportLoading(true);
    try {
      const res = await fetch('/api/ai/import-screenshot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerPin.token}`,
        },
        body: JSON.stringify({
          imageBase64,
          mimeType: imageMime,
          today: todayYmd,
          weekStart: weekStartYmd,
        }),
      });
      const payload = (await res.json()) as { imported?: ImportBatchResult; error?: string };
      if (!res.ok || !payload.imported) {
        throw new Error(
          payload.error ||
            tr(
              lang,
              'Nie udało się odczytać danych ze zrzutu.',
              'Could not extract data from screenshot.',
            ),
        );
      }
      setPreviewBatch(payload.imported);
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : tr(lang, 'Błąd importu zrzutu ekranu.', 'Screenshot import failed.'),
      );
    } finally {
      setImportLoading(false);
    }
  };

  const nextUpcomingTest = classifiedTests.find((t) => t.bucket !== 'past') ?? null;
  const todayStudySessions = getStudySessionsForDate(todayYmd, classifiedTests, settings);
  const messageCount = workspace?.messages.length ?? 0;

  return (
    <div
      className="h-full w-full overflow-y-auto overscroll-contain"
      onPaste={handlePasteAny}
    >
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-8 flex flex-col lg:grid lg:grid-cols-12 lg:items-start gap-4 sm:gap-5">
        {/* Primary Desk: Clean 4-Mode Zero-Quota Add & Import */}
        <section className="lg:col-span-7 bg-[#070B14] border border-blue-950 rounded-2xl p-4 sm:p-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-blue-200">
                {tr(lang, 'Dodaj i importuj', 'Add & Import')}
              </h1>
              <p className="text-xs text-blue-400 mt-0.5">
                {tr(
                  lang,
                  'Kreator planu, własne AI lub lokalne wklejanie — 0 wspólnego limitu',
                  'Smart scheduling, your own AI prompt, or local paste — 0 shared quota',
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Compact 2-Language Switcher */}
              <div
                className="flex items-center p-0.5 bg-black border border-blue-900 rounded-lg"
                role="group"
                aria-label={tr(lang, 'Wybór języka', 'Language selector')}
              >
                <button
                  type="button"
                  onClick={() => onToggleLanguage('pl')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
                    lang === 'pl' ? 'bg-blue-500 text-black' : 'text-blue-400 hover:text-blue-200'
                  }`}
                >
                  PL
                </button>
                <button
                  type="button"
                  onClick={() => onToggleLanguage('en')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors ${
                    lang === 'en' ? 'bg-blue-500 text-black' : 'text-blue-400 hover:text-blue-200'
                  }`}
                >
                  EN
                </button>
              </div>

              {workspace?.accountMode === 'sample' ? (
                <button
                  type="button"
                  onClick={onClearExampleSchedule}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] text-xs font-semibold text-rose-300 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/70 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {tr(lang, 'Wyczyść przykład', 'Clear Example')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onLoadExampleWeek}
                  className="px-3 py-1.5 min-h-[34px] text-xs font-semibold text-blue-300 bg-[#0B1120] border border-blue-900 hover:border-blue-500 rounded-lg transition-colors whitespace-nowrap"
                >
                  {tr(lang, 'Przykład', 'Example')}
                </button>
              )}
            </div>
          </div>

          {/* Mode Switcher: 3 tabs on static hosts (Cloudflare/Vercel), 4 tabs when server AI backend is present */}
          <div
            data-no-swipe="true"
            className={`grid gap-1.5 p-1.5 bg-black border border-blue-950 rounded-xl ${
              ownerPin.available ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
            }`}
          >
            {(
              [
                ['step', tr(lang, 'Dodaj', 'Step Add'), ListChecks],
                ['own-ai', tr(lang, 'Własne AI', 'Own AI'), Sparkles],
                ['local-paste', tr(lang, 'Wklej tekst', 'Local Paste'), ClipboardPaste],
                ...(ownerPin.available
                  ? ([
                      [
                        'owner-ai',
                        isOwnerUnlocked
                          ? tr(lang, 'AI Właściciela', 'Owner AI')
                          : tr(lang, 'PIN Właściciela', 'Owner PIN'),
                        isOwnerUnlocked ? Camera : Lock,
                      ],
                    ] as const)
                  : []),
              ] as const
            ).map(([id, label, Icon]) => {
              const active = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMode(id);
                    setImportError(null);
                    setPinError(null);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 px-2.5 min-h-[40px] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    active ? 'bg-blue-500 text-black' : 'text-blue-400 hover:text-blue-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Mode 1: Spacious Launcher Button that opens the separate Full-Space Smart Add screen */}
          {mode === 'step' && (
            <div className="flex flex-col gap-4 pt-1">
              <button
                type="button"
                onClick={() => onOpenQuickAddSheet()}
                className="w-full min-h-[68px] px-4 sm:px-5 py-4 bg-blue-500 hover:bg-blue-400 text-black rounded-2xl flex items-center justify-between gap-3 transition-colors text-left"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <Plus className="h-5 w-5 shrink-0 stroke-[2.75] mt-0.5 sm:mt-0" />
                  <div className="min-w-0">
                    <div className="text-sm sm:text-base font-bold leading-snug">
                      {tr(lang, 'Dodaj krok po kroku (bez AI)', 'Open Smart Add Wizard (Zero AI)')}
                    </div>
                    <div className="text-xs text-black/75 leading-snug mt-0.5">
                      {tr(
                        lang,
                        'Otwiera osobny, wygodny ekran z dużymi opcjami i dopasowaniem do planu',
                        'Opens a dedicated full screen to pick deadline & best day in your timetable',
                      )}
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0" />
              </button>

              {/* Quick 1-Tap Category Launchers */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-blue-400">
                  {tr(lang, 'Lub wybierz od razu kategorię:', 'Or jump straight to a category:')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(
                    [
                      ['one-off-task', tr(lang, 'Zadanie / Sprawa', 'Task / Errand')],
                      ['homework', tr(lang, 'Praca domowa', 'Homework')],
                      ['test', tr(lang, 'Sprawdzian / Kartkówka', 'Test / Quiz')],
                      ['exemption', tr(lang, 'Zwolnienie / Zmiana', 'Exemption / Change')],
                      ['smart-rule', tr(lang, 'Reguła automatyczna', 'Automatic Rule')],
                    ] as Array<[WizardKind, string]>
                  ).map(([kindId, label]) => (
                    <button
                      key={kindId}
                      type="button"
                      onClick={() => onOpenQuickAddSheet(kindId)}
                      className="min-h-[48px] px-4 py-3 bg-black border border-blue-900/90 hover:border-blue-400 rounded-xl text-left flex items-center justify-between gap-2 text-sm font-semibold text-blue-200 transition-colors"
                    >
                      <span className="truncate">{label}</span>
                      <Plus className="h-4 w-4 text-blue-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-xs text-blue-500 pt-1">
                {tr(
                  lang,
                  'Wszystko liczone lokalnie w Twojej przeglądarce — nie zużywa żadnego limitu AI.',
                  'Calculated locally in your browser — uses zero AI quota.',
                )}
              </p>
            </div>
          )}

          {/* Mode 2: Use Your Own AI (Copy Prompt -> Paste JSON) */}
          {mode === 'own-ai' && (
            <form onSubmit={handleRunOwnAiImport} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-black border border-blue-950 rounded-xl">
                <div className="text-xs text-blue-300 min-w-0 leading-relaxed">
                  <span className="font-semibold text-blue-200">1.</span>{' '}
                  {tr(
                    lang,
                    'Skopiuj prompt i wyślij ze zrzutem Librusa do swojego Gemini / ChatGPT',
                    'Copy prompt + send with your Librus screenshot to your own Gemini / ChatGPT',
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyOwnAiPrompt()}
                  className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-lg whitespace-nowrap shrink-0"
                >
                  {copiedPrompt ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedPrompt
                    ? tr(lang, 'Skopiowano!', 'Prompt Copied!')
                    : tr(lang, 'Kopiuj prompt', 'Copy AI Prompt')}
                </button>
              </div>

              <textarea
                value={ownAiJson}
                onChange={(e) => setOwnAiJson(e.target.value)}
                rows={6}
                placeholder={tr(
                  lang,
                  '2. Wklej tutaj odpowiedź JSON z własnego Gemini / ChatGPT ({ "lessons": [...], "tests": [...] })...',
                  '2. Paste the JSON reply from your own AI app here ({ "lessons": [...], "tests": [...] })...',
                )}
                className="min-h-[150px] w-full resize-y px-3.5 py-3 text-xs font-mono bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
              />

              {importError && <p className="text-xs text-rose-400">{importError}</p>}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-blue-500">
                  {tr(lang, 'Korzysta z Twojego AI · 0 limitu serwera', 'Uses your own AI · 0 server quota')}
                </span>
                <button
                  type="submit"
                  disabled={ownAiJson.trim().length < 5}
                  className="inline-flex items-center gap-1.5 px-5 min-h-[44px] text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-40 rounded-xl whitespace-nowrap"
                >
                  <Check className="h-3.5 w-3.5" />
                  {tr(lang, 'Importuj JSON', 'Import JSON')}
                </button>
              </div>
            </form>
          )}

          {/* Mode 3: Instant Browser-Local Paste Parser (Zero AI) */}
          {mode === 'local-paste' && (
            <form onSubmit={handleRunLocalPaste} className="flex flex-col gap-3">
              <div className="text-xs text-blue-400 leading-relaxed">
                {tr(lang, 'Rozpoznaje lokalnie (bez AI):', 'Instant local rules (0 AI):')}{' '}
                <span className="font-mono text-blue-300">08:00-08:45 Matematyka</span>,{' '}
                <span className="font-mono text-blue-300">Sprawdzian Biologia 28.11</span>,{' '}
                <span className="font-mono text-blue-300">Zadanie Plastyka pt przynieść: blok A3</span>.
              </div>

              <textarea
                value={localPasteText}
                onChange={(e) => setLocalPasteText(e.target.value)}
                rows={6}
                placeholder={tr(
                  lang,
                  `Wklej tekst prosto z Librusa, np.:\nPoniedziałek\n08:00 - 08:45 Matematyka s. 204\nSprawdzian Fizyka 2026-11-30 Kinematyka\nZadanie Plastyka piątek przynieść: blok A3, pędzel`,
                  `Paste lines directly from Librus, e.g.:\nPoniedziałek\n08:00 - 08:45 Matematyka s. 204\nSprawdzian Fizyka 2026-11-30 Kinematyka\nZadanie Plastyka piątek przynieść: blok A3, pędzel`,
                )}
                className="min-h-[150px] w-full resize-y px-3.5 py-3 text-xs bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
              />

              {importError && <p className="text-xs text-rose-400">{importError}</p>}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-blue-500">
                  {tr(lang, 'Przetwarzane lokalnie · Działa offline', 'Parsed locally in your browser · Works offline')}
                </span>
                <button
                  type="submit"
                  disabled={localPasteText.trim().length < 5}
                  className="inline-flex items-center gap-1.5 px-5 min-h-[44px] text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-40 rounded-xl whitespace-nowrap"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  {tr(lang, 'Wczytaj tekst', 'Parse Locally')}
                </button>
              </div>
            </form>
          )}

          {/* Mode 4: Owner-PIN Locked Built-In Screenshot AI */}
          {mode === 'owner-ai' &&
            (!isOwnerUnlocked ? (
              <form
                onSubmit={(e) => void handlePinSubmit(e)}
                className="py-6 flex flex-col items-center justify-center text-center gap-3 px-2"
              >
                <Lock className="h-6 w-6 text-blue-400" />
                <div className="space-y-1 max-w-sm">
                  <div className="text-sm font-bold text-blue-200">
                    {ownerPin.configured
                      ? tr(lang, 'Wbudowane AI tylko dla właściciela', 'Built-in AI is Owner-Locked')
                      : tr(lang, 'Ustaw PIN właściciela AI', 'Claim Your Owner AI PIN')}
                  </div>
                  <p className="text-xs text-blue-400 leading-relaxed">
                    {ownerPin.configured
                      ? tr(
                          lang,
                          'Tylko autor aplikacji może odblokować wbudowane skanowanie AI. Znajomi mogą korzystać z kreatora, własnego AI i wklejania za darmo.',
                          'Only the app owner can unlock built-in screenshot AI. Friends can use Step Add, Own AI, or Local Paste for free.',
                        )
                      : tr(
                          lang,
                          'Ustaw tajny PIN, aby tylko Ty mógł korzystać ze swojego limitu AI (możesz też ustawić OWNER_AI_PIN w Secrets).',
                          'Set a secret PIN right now so only you can use your built-in server AI quota (you can also set OWNER_AI_PIN in Secrets).',
                        )}
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full max-w-xs">
                  <input
                    type="password"
                    autoComplete="off"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder={
                      ownerPin.configured
                        ? tr(lang, 'Wpisz PIN właściciela', 'Enter Owner PIN')
                        : tr(lang, 'Wpisz nowy PIN (min. 4 znaki)', 'Choose 4+ char PIN')
                    }
                    className="flex-1 min-h-[42px] px-3 py-2 text-xs bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
                  />
                  <button
                    type="submit"
                    disabled={pinBusy || pinInput.trim().length < 4}
                    className="px-4 min-h-[42px] text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-40 rounded-xl whitespace-nowrap"
                  >
                    {pinBusy
                      ? '...'
                      : ownerPin.configured
                        ? tr(lang, 'Odblokuj', 'Unlock')
                        : tr(lang, 'Ustaw PIN', 'Set PIN')}
                  </button>
                </div>
                {pinError && <p className="text-xs text-rose-400">{pinError}</p>}
              </form>
            ) : (
              <form
                onSubmit={(e) => void handleOwnerScreenshotImport(e)}
                className="flex flex-col gap-3"
              >
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[160px] cursor-pointer border border-dashed border-blue-800 hover:border-blue-400 rounded-xl p-5 flex flex-col items-center justify-center text-center bg-black/70 transition-colors overflow-hidden"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) readImageFile(file);
                    }}
                  />
                  {imagePreviewUrl ? (
                    <img
                      src={imagePreviewUrl}
                      alt={tr(lang, 'Wybrany zrzut ekranu z Librusa', 'Selected Librus screenshot')}
                      className="max-h-56 max-w-full rounded-lg object-contain"
                    />
                  ) : (
                    <div className="space-y-1.5 max-w-sm">
                      <Upload className="h-5 w-5 mx-auto text-blue-400" />
                      <div className="text-sm font-semibold text-blue-200">
                        {tr(
                          lang,
                          'Upuść zrzut z Librusa, kliknij aby dodać lub wklej (Ctrl+V)',
                          'Drop Librus screenshot, tap to upload, or Ctrl+V',
                        )}
                      </div>
                      <p className="text-xs text-blue-400/80">
                        {tr(lang, 'AI właściciela odblokowane na tę sesję', 'Owner AI unlocked for this session')}
                      </p>
                    </div>
                  )}
                </div>

                {importError && <p className="text-xs text-rose-400">{importError}</p>}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={onLockOwnerPin}
                    className="inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:text-blue-200 whitespace-nowrap"
                  >
                    <LockOpen className="h-3.5 w-3.5" />
                    {tr(lang, 'Zablokuj AI', 'Lock Owner AI')}
                  </button>
                  <button
                    type="submit"
                    disabled={importLoading || !imageBase64}
                    className="inline-flex items-center gap-1.5 px-5 min-h-[44px] text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-40 rounded-xl whitespace-nowrap"
                  >
                    {importLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {importLoading
                      ? tr(lang, 'Odczytywanie...', 'Reading...')
                      : tr(lang, 'Importuj zrzut', 'Import Screenshot')}
                  </button>
                </div>
              </form>
            ))}
        </section>

        {/* Right / Bottom Compact Launchpad Dock */}
        <aside className="lg:col-span-5 flex flex-col gap-3 sm:gap-4">
          <div className="lg:flex-1 bg-[#070B14] border border-blue-950 rounded-2xl p-4 sm:p-6 flex flex-col justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-blue-400">
                  {tr(lang, 'Następne w kanale dnia', 'Up Next in Feed')}
                </span>
                <span className="font-mono tabular-nums text-blue-500 shrink-0">
                  {tr(lang, `Zostało: ${pendingTodayCount}`, `${pendingTodayCount} left`)}
                </span>
              </div>

              {nextCard ? (
                <div className="space-y-1 min-w-0">
                  <div className="font-mono text-xs text-blue-400 tabular-nums truncate">
                    {nextCard.timeLabel} · {nextCard.phaseLabel}
                  </div>
                  <h2 className="text-base sm:text-xl font-bold text-blue-200 line-clamp-1 lg:line-clamp-2">
                    {nextCard.title}
                  </h2>
                  <p className="hidden lg:block text-xs text-blue-400/90 line-clamp-3 leading-relaxed">
                    {nextCard.description}
                  </p>
                </div>
              ) : (
                <div className="space-y-1 min-w-0">
                  <h2 className="text-base sm:text-xl font-bold text-blue-200 truncate">
                    {workspace
                      ? tr(lang, 'Wszystko na dziś ogarnięte', 'All caught up for today')
                      : tr(lang, 'Gotowe, kiedy tylko chcesz', 'Ready when you are')}
                  </h2>
                  <p className="hidden lg:block text-xs text-blue-400/90 leading-relaxed">
                    {workspace
                      ? tr(
                          lang,
                          'Otwórz kanał dnia, żeby sprawdzić listę pakowania na jutro albo plan lekcji.',
                          'Open your Shorts feed to review tomorrow’s packing list or check your timeline.',
                        )
                      : tr(
                          lang,
                          'Kliknij „Dodaj krok po kroku” po lewej albo wczytaj przykładowy tydzień.',
                          'Tap Open Smart Add on the left or load the Example Week.',
                        )}
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onGoToFeed}
              className="w-full inline-flex items-center justify-between px-4 min-h-[46px] text-xs sm:text-sm font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              <span>{tr(lang, 'Przejdź do kanału dnia', 'Swipe to Moment Feed')}</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </button>
          </div>

          {/* 2 Clean Glance Tiles (Study in Feed & Messages) */}
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 shrink-0">
            <button
              type="button"
              onClick={() =>
                nextUpcomingTest
                  ? onOpenTestStudyInFeed(nextUpcomingTest)
                  : onOpenQuickAddSheet('test')
              }
              className="bg-[#070B14] border border-blue-950 hover:border-blue-500 rounded-2xl p-3.5 sm:p-4 text-left transition-colors min-w-0 space-y-1"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-amber-300 truncate">
                  {tr(lang, 'Nauka w kanale', 'Study in Feed')}
                </span>
                <span className="font-mono tabular-nums text-blue-400 shrink-0">
                  {todayStudySessions.length > 0
                    ? tr(lang, `${todayStudySessions.length} dziś`, `${todayStudySessions.length} today`)
                    : nextUpcomingTest
                      ? formatCountdownLabel(nextUpcomingTest.daysUntil, lang)
                      : '0'}
                </span>
              </div>
              {todayStudySessions.length > 0 ? (
                <>
                  <div className="text-xs sm:text-sm font-semibold text-blue-200 truncate">
                    {todayStudySessions[0].phase === 'learn'
                      ? tr(lang, 'Nauka', 'Learn')
                      : tr(lang, 'Powtórka', 'Repeat')}{' '}
                    — {todayStudySessions[0].test.subject}
                  </div>
                  <div className="text-[11px] text-blue-400 truncate">
                    {tr(
                      lang,
                      `Dzień ${todayStudySessions[0].dayNumber} z ${todayStudySessions[0].totalDays} · ${settings.dailyStudyMinutes} min`,
                      `Day ${todayStudySessions[0].dayNumber} of ${todayStudySessions[0].totalDays} · ${settings.dailyStudyMinutes}m in Feed`,
                    )}
                  </div>
                </>
              ) : nextUpcomingTest ? (
                (() => {
                  const total = getTestLeadDays(
                    nextUpcomingTest,
                    settings.majorTestLeadDays,
                    settings.quizLeadDays,
                  );
                  const split = getStudyPhaseSplit(total);
                  return (
                    <>
                      <div className="text-xs sm:text-sm font-semibold text-blue-200 truncate">
                        {nextUpcomingTest.subject} · {nextUpcomingTest.category}
                      </div>
                      <div className="text-[11px] text-blue-400 truncate">
                        {formatShortDate(nextUpcomingTest.date, lang)} ·{' '}
                        {tr(
                          lang,
                          `${split.learningDays}d Nauka + ${split.repeatingDays}d Powtórka`,
                          `${split.learningDays}d Learn + ${split.repeatingDays}d Repeat`,
                        )}
                      </div>
                    </>
                  );
                })()
              ) : (
                <div className="text-xs text-blue-400 truncate">
                  {tr(lang, 'Brak sprawdzianów · Kliknij, aby dodać', 'No tests yet · Tap to add')}
                </div>
              )}
            </button>

            <div className="bg-[#070B14] border border-blue-950 rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between gap-1.5 min-w-0">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-blue-300 inline-flex items-center gap-1.5 truncate">
                  <Mail className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">{tr(lang, 'Wiadomości', 'Messages')}</span>
                </span>
                <span className="font-mono tabular-nums text-blue-400 shrink-0">
                  {messageCount}
                </span>
              </div>
              <p className="hidden sm:block text-xs text-blue-400 truncate">
                {digest && digest.executiveBrief[0]
                  ? digest.executiveBrief[0]
                  : messageCount > 0
                    ? isOwnerUnlocked
                      ? tr(lang, 'AI właściciela gotowe do streszczenia', 'Owner AI ready to summarize notices')
                      : tr(lang, 'Zapisane lokalnie na Twoim urządzeniu', 'Stored locally on your device')
                    : tr(
                        lang,
                        'Wklej ogłoszenia przez Wklej tekst lub Własne AI',
                        'Paste announcements via Local Paste or Own AI',
                      )}
              </p>
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={onOpenMessagesSheet}
                  className="text-xs font-semibold text-blue-300 hover:text-blue-200 underline underline-offset-2 whitespace-nowrap"
                >
                  {tr(lang, 'Otwórz wiadomości', 'Open Notices')}
                </button>
                {messageCount > 0 && isOwnerUnlocked && (
                  <button
                    type="button"
                    onClick={onSummarizeMessages}
                    disabled={analyzingMessages}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-200 whitespace-nowrap"
                  >
                    {analyzingMessages && <Loader2 className="h-3 w-3 animate-spin" />}
                    {analyzingMessages
                      ? tr(lang, 'Praca...', 'Working...')
                      : tr(lang, 'Skrót AI', 'AI Brief')}
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenPackingEditor}
              className="col-span-2 lg:col-span-1 bg-[#070B14] border border-blue-900 hover:border-blue-400 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Backpack className="h-4 w-4 text-cyan-300 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-semibold text-blue-200 truncate">
                    {tr(lang, 'Co pakować? (lekcje i codziennie)', 'What to Pack (Lessons & Daily)')}
                  </div>
                  <div className="text-[11px] text-blue-400 truncate">
                    {tr(
                      lang,
                      'Ustaw rzeczy na każdy przedmiot i codzienny niezbędnik',
                      'Set items for each subject and everyday essentials',
                    )}
                  </div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-blue-400 shrink-0" />
            </button>

            <button
              type="button"
              onClick={onOpenSyncPanel}
              className="col-span-2 lg:col-span-1 bg-[#070B14] border border-blue-900 hover:border-blue-400 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Cloud className="h-4 w-4 text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-semibold text-blue-200 truncate">
                    {classLink
                      ? tr(
                          lang,
                          `Google Drive · Klasa ${classLink.className}`,
                          `Google Drive · Class ${classLink.className}`,
                        )
                      : tr(lang, 'Google Drive: Sync i Klasa', 'Google Drive: Sync & Class')}
                  </div>
                  <div className="text-[11px] text-blue-400 truncate">
                    {classLink
                      ? tr(
                          lang,
                          'Wspólny plan i zadania klasy · Twoje reguły osobno',
                          'Shared class timetable & homework · Private rules kept separate',
                        )
                      : googleConnected
                        ? tr(
                            lang,
                            'Połączono z Google · Zapisz plan lub połącz z klasą',
                            'Google connected · Sync devices or join a shared class',
                          )
                        : tr(
                            lang,
                            'Synchronizuj urządzenia i współdziel plan z całą klasą',
                            'Sync across devices & share timetable + homework with class',
                          )}
                  </div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-blue-400 shrink-0" />
            </button>
          </div>
        </aside>
      </div>

      {/* Confirmation Overlay for Batch Import */}
      {previewBatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-[#070B14] border border-blue-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-blue-200">
                  {tr(lang, 'Gotowe do importu', 'Ready to Import')}
                </h3>
                <p className="text-xs text-blue-400 mt-0.5">{previewBatch.summary}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewBatch(null)}
                aria-label={tr(lang, 'Zamknij podgląd', 'Close preview')}
                className="p-1.5 text-blue-400 hover:text-blue-200 shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                [tr(lang, 'Lekcje', 'Classes'), previewBatch.lessons.length],
                [tr(lang, 'Zadania', 'Homework'), previewBatch.homework.length],
                [tr(lang, 'Sprawdziany', 'Tests'), previewBatch.tests.length],
                [tr(lang, 'Ogłoszenia', 'Notices'), previewBatch.messages.length],
              ].map(([label, count]) => (
                <div
                  key={String(label)}
                  className="p-2.5 bg-black border border-blue-950 rounded-xl"
                >
                  <div className="font-mono text-lg font-bold tabular-nums text-blue-200">
                    {count}
                  </div>
                  <div className="text-[11px] text-blue-400">{label}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPreviewBatch(null)}
                className="px-3.5 py-2 text-xs text-blue-400 hover:text-blue-200"
              >
                {tr(lang, 'Odrzuć', 'Discard')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirmImport(previewBatch);
                  setPreviewBatch(null);
                  setOwnAiJson('');
                  setLocalPasteText('');
                  setImagePreviewUrl(null);
                  setImageBase64(null);
                  setImageMime(null);
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-xl"
              >
                <Check className="h-3.5 w-3.5" />
                {tr(lang, 'Dodaj do aplikacji', 'Merge Into App')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
