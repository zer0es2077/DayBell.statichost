import { useMemo } from 'react';
import { BookOpen, Link2 } from 'lucide-react';
import type {
  AppLanguage,
  LessonSlot,
  ScheduleExemption,
  StudyStartAnchor,
  UserSettings,
} from '../types';
import { tr } from '../utils/i18n';
import { formatWeekdayShort, getMondayYmd } from '../utils/packingEngine';
import {
  describePersonalBlockAnchor,
  describeStudyStartAnchor,
  isBlockStudyAnchored,
  resolveStudyStartTimeForDate,
} from '../utils/shortsBuilder';
import { getWeekDatesFromMonday } from '../utils/smartEngine';

const STUDY_OFFSET_PRESETS = [0, 10, 15, 20, 30, 45, 60];

interface StudyStartAnchorControlProps {
  settings: UserSettings;
  timetable: LessonSlot[];
  exemptions: ScheduleExemption[];
  referenceDateYmd: string;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  compact?: boolean;
}

export function StudyStartAnchorControl({
  settings,
  timetable,
  exemptions,
  referenceDateYmd,
  onUpdateSettings,
  compact = false,
}: StudyStartAnchorControlProps) {
  const lang: AppLanguage = settings.language || 'pl';
  const allBlocks = settings.personalTimeBlocks ?? [];

  // Only allow anchoring study start after blocks that do NOT themselves depend on study start/end
  const eligibleBlocks = useMemo(
    () => allBlocks.filter((b) => !isBlockStudyAnchored(b, allBlocks)),
    [allBlocks],
  );

  const currentAnchor: StudyStartAnchor = settings.studyStartAnchor ?? 'fixed';
  const offsetMinutes = Math.max(0, Math.round(settings.studyStartOffsetMinutes ?? 0));
  const selectedBlockId =
    settings.studyStartBlockId && eligibleBlocks.some((b) => b.id === settings.studyStartBlockId)
      ? settings.studyStartBlockId
      : (eligibleBlocks[0]?.id ?? '');

  const weekDates = useMemo(
    () => getWeekDatesFromMonday(getMondayYmd(referenceDateYmd)),
    [referenceDateYmd],
  );

  const weeklyPreview = useMemo(() => {
    return weekDates.map((date) => {
      const resolved = resolveStudyStartTimeForDate({
        date,
        settings,
        timetable,
        exemptions,
        lang,
      });
      return { date, ...resolved };
    });
  }, [weekDates, settings, timetable, exemptions, lang]);

  const handleSelectAnchor = (nextAnchor: StudyStartAnchor) => {
    if (nextAnchor === 'after-block') {
      if (eligibleBlocks.length === 0) return;
      onUpdateSettings({
        studyStartAnchor: 'after-block',
        studyStartBlockId: selectedBlockId || eligibleBlocks[0].id,
      });
      return;
    }
    onUpdateSettings({
      studyStartAnchor: nextAnchor,
    });
  };

  const summaryBadge = describeStudyStartAnchor(settings, lang);

  return (
    <div
      className={
        compact
          ? 'p-3.5 bg-black border border-blue-950 rounded-xl space-y-3'
          : 'bg-[#070B14] border border-blue-950 rounded-2xl p-5 space-y-4'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2 pb-2.5 border-b border-blue-950">
        <div className="flex items-start gap-2.5 min-w-0">
          <BookOpen className="h-4 w-4 text-cyan-300 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-blue-200">
              {tr(
                lang,
                'Po czym ma się zaczynać nauka i praca domowa?',
                'When Should Studying & Homework Begin?',
              )}
            </h2>
            {!compact && (
              <p className="text-xs text-blue-400 mt-0.5">
                {tr(
                  lang,
                  'Wybierz konkretny blok (np. po obiedzie lub powrocie do domu), koniec lekcji albo stałą godzinę.',
                  'Start studying right after a chosen block (like dinner or transit home), after school ends, or at a fixed time.',
                )}
              </p>
            )}
          </div>
        </div>
        <div className="font-mono text-[11px] font-semibold text-cyan-300 px-2.5 py-1 bg-black border border-cyan-900/70 rounded-lg shrink-0">
          {summaryBadge}
        </div>
      </div>

      {/* 3 Anchor Mode Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          disabled={eligibleBlocks.length === 0}
          onClick={() => handleSelectAnchor('after-block')}
          className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors text-center ${
            currentAnchor === 'after-block'
              ? 'bg-cyan-400 text-black border-cyan-400'
              : 'bg-black border-blue-950 text-blue-300 hover:border-blue-600 disabled:opacity-35 disabled:cursor-not-allowed'
          }`}
        >
          {tr(lang, 'Po wybranym bloku', 'After a block')}
        </button>
        <button
          type="button"
          onClick={() => handleSelectAnchor('after-school-end')}
          className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors text-center ${
            currentAnchor === 'after-school-end'
              ? 'bg-cyan-400 text-black border-cyan-400'
              : 'bg-black border-blue-950 text-blue-300 hover:border-blue-600'
          }`}
        >
          {tr(lang, 'Po lekcjach', 'After school ends')}
        </button>
        <button
          type="button"
          onClick={() => handleSelectAnchor('fixed')}
          className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors text-center ${
            currentAnchor === 'fixed'
              ? 'bg-cyan-400 text-black border-cyan-400'
              : 'bg-black border-blue-950 text-blue-300 hover:border-blue-600'
          }`}
        >
          {tr(lang, 'Stała godzina', 'Fixed time')}
        </button>
      </div>

      {/* Block Picker when 'after-block' is selected */}
      {currentAnchor === 'after-block' && eligibleBlocks.length > 0 && (
        <div>
          <label
            htmlFor={compact ? 'study-anchor-block-compact' : 'study-anchor-block'}
            className="block text-xs font-medium text-blue-300 mb-1"
          >
            {tr(lang, 'Zacznij naukę zaraz po bloku:', 'Start studying right after block:')}
          </label>
          <select
            id={compact ? 'study-anchor-block-compact' : 'study-anchor-block'}
            value={selectedBlockId}
            onChange={(e) =>
              onUpdateSettings({
                studyStartAnchor: 'after-block',
                studyStartBlockId: e.target.value,
              })
            }
            className="w-full min-w-0 px-3 py-2 text-xs bg-black text-blue-100 border border-blue-900 rounded-lg focus:outline-none focus:border-cyan-400"
          >
            {eligibleBlocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({describePersonalBlockAnchor(b, allBlocks, lang)})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Rest / Buffer Pills when anchored to a block or school end */}
      {currentAnchor !== 'fixed' && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-blue-300 flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5 text-cyan-300" />
            {tr(lang, 'Przerwa przed rozpoczęciem nauki:', 'Rest / buffer before studying starts:')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STUDY_OFFSET_PRESETS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => onUpdateSettings({ studyStartOffsetMinutes: mins })}
                className={`px-2.5 py-1.5 font-mono text-[11px] font-semibold rounded-lg border transition-colors ${
                  offsetMinutes === mins
                    ? 'bg-blue-500 text-black border-blue-500'
                    : 'bg-black border-blue-950 text-blue-300 hover:border-blue-600'
                }`}
              >
                {mins === 0 ? tr(lang, 'Od razu', 'Right away') : `+${mins}m`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fixed Time or Fallback Time Input */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <label
          htmlFor={compact ? 'study-fallback-time-compact' : 'study-fallback-time'}
          className="text-xs text-blue-400"
        >
          {currentAnchor === 'fixed'
            ? tr(lang, 'Godzina rozpoczęcia nauki:', 'Study start time:')
            : tr(
                lang,
                'Godzina zapasowa (gdy brak tego bloku / lekcji):',
                'Fallback time (when no classes / block that day):',
              )}
        </label>
        <input
          id={compact ? 'study-fallback-time-compact' : 'study-fallback-time'}
          type="time"
          value={settings.studyStartTime || '17:00'}
          onChange={(e) => onUpdateSettings({ studyStartTime: e.target.value })}
          className="w-32 px-3 py-1.5 text-xs font-mono bg-black text-blue-200 border border-blue-900 rounded-lg focus:outline-none focus:border-cyan-400"
        />
      </div>

      {/* Live Mon–Fri Resolved Preview */}
      {currentAnchor !== 'fixed' && (
        <div className="p-2.5 bg-black/80 border border-cyan-950/90 rounded-xl space-y-1.5">
          <div className="text-[11px] font-semibold text-cyan-300">
            {tr(lang, 'Start nauki w tym tygodniu:', 'Study starts this week:')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {weeklyPreview.map((item) => (
              <span
                key={item.date}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono bg-[#070B14] border border-blue-950 rounded text-blue-200 tabular-nums"
              >
                <span className="text-blue-400">{formatWeekdayShort(item.date, lang)}</span>
                <span className={item.usedFallback ? 'text-blue-400' : 'text-emerald-300'}>
                  {item.startTime}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
