import { Coffee, Lock } from 'lucide-react';
import type {
  AppLanguage,
  LessonSlot,
  PersonalTimeBlock,
  ScheduleExemption,
  UserSettings,
} from '../types';
import { tr } from '../utils/i18n';
import { formatDurationMinutes } from '../utils/shortsBuilder';
import { PersonalBlocksManager } from './PersonalBlocksManager';
import { StudyStartAnchorControl } from './StudyStartAnchorControl';

interface PersonalRoutineSectionProps {
  settings: UserSettings;
  timetable: LessonSlot[];
  exemptions: ScheduleExemption[];
  weekStartYmd: string;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
}

const FREE_TIME_PRESETS = [0, 15, 30, 45, 60, 90];

export function PersonalRoutineSection({
  settings,
  timetable,
  exemptions,
  weekStartYmd,
  onUpdateSettings,
}: PersonalRoutineSectionProps) {
  const lang: AppLanguage = settings.language || 'pl';
  const blocks = settings.personalTimeBlocks ?? [];
  const freeTimeMinutes = Math.max(0, Math.round(settings.freeTimeMinutes ?? 30));

  const handleSaveBlocks = (next: PersonalTimeBlock[]) => {
    const patch: Partial<UserSettings> = { personalTimeBlocks: next };
    if (
      settings.studyStartAnchor === 'after-block' &&
      settings.studyStartBlockId &&
      !next.some((b) => b.id === settings.studyStartBlockId)
    ) {
      patch.studyStartAnchor = 'fixed';
      patch.studyStartBlockId = undefined;
    }
    onUpdateSettings(patch);
  };

  return (
    <div className="space-y-4">
      {/* Privacy Guarantee Strip */}
      <div className="bg-[#070B14] border border-cyan-900/70 rounded-2xl p-4 flex items-start gap-3">
        <Lock className="h-4 w-4 text-cyan-300 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed text-blue-300">
          <span className="font-semibold text-cyan-300">
            {tr(lang, '100% prywatne — tylko Twój osobisty plan:', '100% private — your personal plan only:')}
          </span>{' '}
          {tr(
            lang,
            'Bloki takie jak dojazd, obiad, sen i czas wolny NIGDY nie są udostępniane klasie. Bloki względne automatycznie przesuwają się każdego dnia według Twojego planu lekcji.',
            'Blocks like transit, dinner, sleep, and free time are NEVER shared with your class. Relative blocks shift automatically each weekday to match your real school timetable.',
          )}
        </div>
      </div>

      {/* When Should Studying & Homework Begin? */}
      <StudyStartAnchorControl
        settings={settings}
        timetable={timetable}
        exemptions={exemptions}
        referenceDateYmd={weekStartYmd}
        onUpdateSettings={onUpdateSettings}
      />

      {/* Free Time Between Homework & Test Prep */}
      <section className="bg-[#070B14] border border-blue-950 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-blue-950">
          <div className="flex items-start gap-2.5">
            <Coffee className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-blue-200">
                {tr(
                  lang,
                  'Czas wolny między pracą domową a nauką do sprawdzianów',
                  'Free Time Between Homework & Test Prep',
                )}
              </h2>
              <p className="text-xs text-blue-400 mt-0.5">
                {tr(
                  lang,
                  'Aplikacja automatycznie wstawi wybraną przerwę w Twoim planie dnia między zadaniami domowymi a przygotowaniem do sprawdzianów.',
                  'DayBell automatically schedules this break into your personal plan right between homework and exam preparation.',
                )}
              </p>
            </div>
          </div>

          <div className="font-mono text-xs font-bold text-emerald-300 px-2.5 py-1 bg-black border border-emerald-900/70 rounded-lg shrink-0">
            {freeTimeMinutes === 0
              ? tr(lang, 'Wyłączone', 'Off')
              : formatDurationMinutes(freeTimeMinutes, lang)}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FREE_TIME_PRESETS.map((mins) => (
            <button
              key={mins}
              type="button"
              onClick={() => onUpdateSettings({ freeTimeMinutes: mins })}
              className={`min-h-[38px] px-3 font-mono text-xs font-bold rounded-lg border transition-colors whitespace-nowrap ${
                freeTimeMinutes === mins
                  ? 'bg-emerald-400 text-black border-emerald-400'
                  : 'bg-black border-blue-950 text-blue-300 hover:border-blue-600'
              }`}
            >
              {mins === 0 ? tr(lang, '0m (Wył.)', '0m (Off)') : `${mins} min`}
            </button>
          ))}

          <div className="flex items-center gap-1.5 sm:ml-auto">
            <label htmlFor="custom-free-time" className="text-xs text-blue-400 whitespace-nowrap">
              {tr(lang, 'Własny czas (min):', 'Custom (min):')}
            </label>
            <input
              id="custom-free-time"
              type="number"
              min={0}
              max={240}
              step={5}
              value={freeTimeMinutes}
              onChange={(e) => {
                const parsed = Math.max(0, Math.min(240, Number(e.target.value) || 0));
                onUpdateSettings({ freeTimeMinutes: parsed });
              }}
              className="w-20 px-2.5 py-1.5 text-xs font-mono bg-black text-blue-200 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {freeTimeMinutes > 0 && (
          <div className="p-3 bg-black border border-blue-950 rounded-xl flex flex-wrap items-center gap-2 text-xs">
            <span className="text-blue-300 font-medium">
              {tr(lang, 'Praca domowa', 'Homework')}
            </span>
            <span className="text-blue-600">→</span>
            <span className="text-emerald-300 font-semibold">
              {tr(
                lang,
                `Czas wolny (${formatDurationMinutes(freeTimeMinutes, lang)})`,
                `Free Time (${formatDurationMinutes(freeTimeMinutes, lang)})`,
              )}
            </span>
            <span className="text-blue-600">→</span>
            <span className="text-amber-300 font-medium">
              {tr(lang, 'Nauka do sprawdzianów', 'Test Preparation')}
            </span>
          </div>
        )}
      </section>

      {/* Day-by-Day & Whole Week Personal Time Blocks Manager */}
      <section className="bg-[#070B14] border border-blue-950 rounded-2xl p-5">
        <PersonalBlocksManager
          blocks={blocks}
          timetable={timetable}
          exemptions={exemptions}
          referenceDateYmd={weekStartYmd}
          lang={lang}
          settings={settings}
          initialScope="all"
          onSaveBlocks={handleSaveBlocks}
        />
      </section>
    </div>
  );
}
