import { useState, type FormEvent } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import type {
  AppLanguage,
  CommutePlace,
  LessonSlot,
  ParsedCommandIntent,
  ScheduleExemption,
  UserSettings,
} from '../types';
import { tr } from '../utils/i18n';
import { StepAddWizard, type WizardKind } from './StepAddWizard';

interface QuickCaptureBarProps {
  todayYmd: string;
  timetable: LessonSlot[];
  commutePlaces: CommutePlace[];
  exemptions: ScheduleExemption[];
  settings: UserSettings;
  ownerAiToken: string | null;
  initialKind?: WizardKind | null;
  onCommitIntent: (intent: ParsedCommandIntent) => void;
}

export function QuickCaptureBar({
  todayYmd,
  timetable,
  commutePlaces,
  exemptions,
  settings,
  ownerAiToken,
  initialKind = null,
  onCommitIntent,
}: QuickCaptureBarProps) {
  const lang: AppLanguage = settings.language || 'pl';
  const [useOwnerAi, setUseOwnerAi] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ParsedCommandIntent | null>(null);

  const handleParse = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!ownerAiToken) {
      setError(
        tr(
          lang,
          'Najpierw odblokuj AI właściciela na ekranie głównym lub w Ustawieniach.',
          'Unlock Owner AI on the Home or Settings screen first.',
        ),
      );
      return;
    }
    if (text.trim().length < 4) {
      setError(
        tr(
          lang,
          'Wpisz regułę, pracę domową, pilne zadanie albo zwolnienie.',
          'Type a rule, homework note, urgent task, or exemption.',
        ),
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/ai/parse-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerAiToken}`,
        },
        body: JSON.stringify({
          text: text.trim(),
          today: todayYmd,
          timetable,
          commutePlaces,
        }),
      });
      const payload = (await res.json()) as { result?: ParsedCommandIntent; error?: string };
      if (!res.ok || !payload.result) {
        throw new Error(
          payload.error ||
            tr(lang, 'Nie udało się rozpoznać polecenia.', 'Could not parse your request.'),
        );
      }
      setDraft(payload.result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr(lang, 'Błąd przetwarzania polecenia.', 'Failed to parse command.'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
      {ownerAiToken && (
        <div className="shrink-0 flex items-center justify-end">
          <button
            type="button"
            onClick={() => {
              setUseOwnerAi((v) => !v);
              setDraft(null);
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 min-h-[38px] text-xs font-semibold text-blue-200 bg-black border border-blue-900 hover:border-blue-500 rounded-xl transition-colors whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
            {useOwnerAi
              ? tr(lang, 'Kreator krok po kroku', 'Step-by-Step Form')
              : tr(lang, 'Notatka AI właściciela', 'Owner AI Note')}
          </button>
        </div>
      )}

      {!useOwnerAi || !ownerAiToken ? (
        <StepAddWizard
          todayYmd={todayYmd}
          timetable={timetable}
          commutePlaces={commutePlaces}
          exemptions={exemptions}
          settings={settings}
          initialKind={initialKind}
          onCommitIntent={onCommitIntent}
        />
      ) : (
        <div className="space-y-4">
          <form onSubmit={handleParse} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={tr(
                lang,
                'np. „Zgubiłem worek na WF, znajdź go w szkole przed następnym WF”',
                'e.g. "I LOST MY PE BAG, find it at school before PE"',
              )}
              className="flex-1 min-h-[48px] px-4 py-3 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
            />
            <button
              type="submit"
              disabled={loading || text.trim().length < 4}
              className="inline-flex items-center justify-center gap-2 px-5 min-h-[48px] text-xs sm:text-sm font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-50 rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading
                ? tr(lang, 'Analizowanie...', 'Understanding...')
                : tr(lang, 'Rozpoznaj i zaplanuj', 'Parse & Schedule')}
            </button>
          </form>

          {error && (
            <div className="px-4 py-3 text-xs text-rose-300 bg-rose-950/40 border border-rose-900 rounded-xl">
              {error}
            </div>
          )}

          {draft && (
            <div className="p-4 bg-black border border-blue-900 rounded-2xl flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-blue-200">{draft.explanation}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="p-2 text-blue-400 hover:text-blue-200"
                  aria-label={tr(lang, 'Odrzuć', 'Discard')}
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCommitIntent(draft);
                    setDraft(null);
                    setText('');
                  }}
                  className="inline-flex items-center gap-1.5 px-4 min-h-[42px] text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-xl"
                >
                  <Check className="h-4 w-4" />
                  {tr(lang, 'Zatwierdź', 'Confirm')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
