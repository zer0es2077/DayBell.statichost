import { useMemo, useState, type FormEvent } from 'react';
import { Backpack, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { AppLanguage, DayOfWeek, LessonSlot, SubjectKit } from '../types';
import { tr } from '../utils/i18n';
import { addDaysYmd, getEssentialDailyItems } from '../utils/packingEngine';

interface SubjectKitsViewProps {
  subjectKits: SubjectKit[];
  onUpdateKits: (kits: SubjectKit[]) => void;
  dailyEssentials: string[];
  onUpdateDailyEssentials: (items: string[]) => void;
  timetable: LessonSlot[];
  weekStartYmd: string;
  onUpdateTimetable: (lessons: LessonSlot[]) => void;
  lang: AppLanguage;
}

const WEEKDAYS: Array<{ dow: DayOfWeek; pl: string; en: string }> = [
  { dow: 1, pl: 'Poniedziałek', en: 'Monday' },
  { dow: 2, pl: 'Wtorek', en: 'Tuesday' },
  { dow: 3, pl: 'Środa', en: 'Wednesday' },
  { dow: 4, pl: 'Czwartek', en: 'Thursday' },
  { dow: 5, pl: 'Piątek', en: 'Friday' },
];

export function SubjectKitsView({
  subjectKits,
  onUpdateKits,
  dailyEssentials,
  onUpdateDailyEssentials,
  timetable,
  weekStartYmd,
  onUpdateTimetable,
  lang,
}: SubjectKitsViewProps) {
  const [activeTab, setActiveTab] = useState<'kits' | 'timetable'>('kits');
  const [newDailyItem, setNewDailyItem] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newItemDrafts, setNewItemDrafts] = useState<Record<string, string>>({});

  const [lessonDay, setLessonDay] = useState<DayOfWeek>(1);
  const [lessonNum, setLessonNum] = useState(1);
  const [lessonStartTime, setLessonStartTime] = useState('08:00');
  const [lessonEndTime, setLessonEndTime] = useState('08:45');
  const [lessonSubject, setLessonSubject] = useState('Matematyka');
  const [lessonRoom, setLessonRoom] = useState('204');
  const [lessonTeacher, setLessonTeacher] = useState('');

  const addMinutesHhmm = (hhmm: string, mins: number): string => {
    const [h, m] = (hhmm || '08:00').split(':').map((n) => Number(n) || 0);
    const total = Math.min(23 * 60 + 55, Math.max(0, h * 60 + m + mins));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  // Collect every unique subject present in the student's actual timetable so they always appear first
  const timetableSubjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of timetable) {
      const clean = l.subject.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (!map.has(key)) map.set(key, clean);
    }
    return map;
  }, [timetable]);

  const orderedKits = useMemo(() => {
    const existingKeys = new Set(subjectKits.map((k) => k.subject.trim().toLowerCase()));
    const missingFromKits: SubjectKit[] = [];

    for (const [key, originalName] of timetableSubjects.entries()) {
      if (!existingKeys.has(key)) {
        missingFromKits.push({
          subject: originalName,
          items: [
            tr(lang, `Podręcznik: ${originalName}`, `${originalName} textbook`),
            tr(lang, `Zeszyt: ${originalName}`, `${originalName} notebook`),
          ],
        });
      }
    }

    const all = [...missingFromKits, ...subjectKits];
    return all.sort((a, b) => {
      const aIn = timetableSubjects.has(a.subject.trim().toLowerCase()) ? 0 : 1;
      const bIn = timetableSubjects.has(b.subject.trim().toLowerCase()) ? 0 : 1;
      return aIn - bIn;
    });
  }, [subjectKits, timetableSubjects, lang]);

  const handleAddDailyEssential = (e: FormEvent) => {
    e.preventDefault();
    const label = newDailyItem.trim();
    if (!label) return;
    onUpdateDailyEssentials([...dailyEssentials, label]);
    setNewDailyItem('');
  };

  const handleRemoveDailyEssential = (idx: number) => {
    onUpdateDailyEssentials(dailyEssentials.filter((_, i) => i !== idx));
  };

  const handleResetDailyEssentials = () => {
    onUpdateDailyEssentials(getEssentialDailyItems(lang));
  };

  const handleAddKit = (e: FormEvent) => {
    e.preventDefault();
    const name = newSubject.trim();
    if (!name) return;
    if (subjectKits.some((k) => k.subject.toLowerCase() === name.toLowerCase())) return;
    onUpdateKits([
      {
        subject: name,
        items: [
          tr(lang, `Podręcznik: ${name}`, `${name} textbook`),
          tr(lang, `Zeszyt: ${name}`, `${name} notebook`),
        ],
      },
      ...subjectKits,
    ]);
    setNewSubject('');
  };

  const handleAddItemToKit = (subject: string, currentItems: string[]) => {
    const draft = (newItemDrafts[subject] ?? '').trim();
    if (!draft) return;
    const exists = subjectKits.some((k) => k.subject.toLowerCase() === subject.toLowerCase());
    if (exists) {
      onUpdateKits(
        subjectKits.map((k) =>
          k.subject.toLowerCase() === subject.toLowerCase()
            ? { ...k, items: [...k.items, draft] }
            : k,
        ),
      );
    } else {
      onUpdateKits([{ subject, items: [...currentItems, draft] }, ...subjectKits]);
    }
    setNewItemDrafts((prev) => ({ ...prev, [subject]: '' }));
  };

  const handleRemoveItemFromKit = (subject: string, currentItems: string[], idx: number) => {
    const exists = subjectKits.some((k) => k.subject.toLowerCase() === subject.toLowerCase());
    if (exists) {
      onUpdateKits(
        subjectKits.map((k) =>
          k.subject.toLowerCase() === subject.toLowerCase()
            ? { ...k, items: k.items.filter((_, i) => i !== idx) }
            : k,
        ),
      );
    } else {
      onUpdateKits([
        { subject, items: currentItems.filter((_, i) => i !== idx) },
        ...subjectKits,
      ]);
    }
  };

  const handleDeleteKit = (subject: string) => {
    const isInTimetable = timetableSubjects.has(subject.trim().toLowerCase());
    if (isInTimetable) {
      // Keep an empty kit entry so nothing is packed for this class instead of auto-respawning defaults
      const exists = subjectKits.some((k) => k.subject.toLowerCase() === subject.toLowerCase());
      if (exists) {
        onUpdateKits(
          subjectKits.map((k) =>
            k.subject.toLowerCase() === subject.toLowerCase() ? { ...k, items: [] } : k,
          ),
        );
      } else {
        onUpdateKits([{ subject, items: [] }, ...subjectKits]);
      }
      return;
    }
    onUpdateKits(subjectKits.filter((k) => k.subject !== subject));
  };

  const handleAddLesson = (e: FormEvent) => {
    e.preventDefault();
    if (!lessonSubject.trim()) return;
    const date = addDaysYmd(weekStartYmd, lessonDay - 1);
    const startTime = /^\d{2}:\d{2}$/.test(lessonStartTime) ? lessonStartTime : '08:00';
    const endTime = /^\d{2}:\d{2}$/.test(lessonEndTime)
      ? lessonEndTime
      : addMinutesHhmm(startTime, 45);

    const newLesson: LessonSlot = {
      id: `man-${Date.now()}`,
      date,
      dayOfWeek: lessonDay,
      lessonNumber: lessonNum,
      startTime,
      endTime,
      subject: lessonSubject.trim(),
      teacher: lessonTeacher.trim() || tr(lang, 'Nauczyciel', 'Teacher'),
      room: lessonRoom.trim() || '—',
    };
    onUpdateTimetable([...timetable, newLesson]);
    setLessonNum((n) => Math.min(10, n + 1));
    const nextStart = addMinutesHhmm(endTime, 10);
    setLessonStartTime(nextStart);
    setLessonEndTime(addMinutesHhmm(nextStart, 45));
  };

  const handleToggleCancelLesson = (id: string) => {
    onUpdateTimetable(
      timetable.map((l) =>
        l.id === id
          ? {
              ...l,
              isCancelled: !l.isCancelled,
              note: !l.isCancelled ? tr(lang, 'Odwołana', 'Marked cancelled') : undefined,
            }
          : l,
      ),
    );
  };

  const handleDeleteLesson = (id: string) => {
    onUpdateTimetable(timetable.filter((l) => l.id !== id));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#070B14] border border-blue-950 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('kits')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'kits' ? 'bg-blue-500 text-black' : 'text-blue-400 hover:text-blue-200'
            }`}
          >
            {tr(
              lang,
              `Co pakować (${orderedKits.length})`,
              `What to Pack (${orderedKits.length})`,
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('timetable')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'timetable'
                ? 'bg-blue-500 text-black'
                : 'text-blue-400 hover:text-blue-200'
            }`}
          >
            {tr(
              lang,
              `Plan lekcji (${timetable.length})`,
              `Weekly Timetable (${timetable.length})`,
            )}
          </button>
        </div>
      </div>

      {activeTab === 'kits' ? (
        <div className="space-y-5">
          {/* Section 1: Everyday Essentials (Pack Every Day) */}
          <section className="bg-[#070B14] border border-blue-800/80 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-blue-950">
              <div className="flex items-center gap-2.5">
                <Backpack className="h-4 w-4 text-cyan-300 shrink-0" />
                <div>
                  <h2 className="text-sm font-bold text-blue-200">
                    {tr(lang, 'Pakuję codziennie (niezależnie od lekcji)', 'Pack Every Day (Regardless of Lessons)')}
                  </h2>
                  <p className="text-xs text-blue-400 mt-0.5">
                    {tr(
                      lang,
                      'Te rzeczy pojawią się na liście pakowania każdego dnia szkolnego',
                      'These items appear in your packing list on every school day',
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetDailyEssentials}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-200 border border-blue-950 hover:border-blue-700 rounded-lg whitespace-nowrap"
              >
                <RotateCcw className="h-3 w-3" />
                {tr(lang, 'Domyślne', 'Reset')}
              </button>
            </div>

            {dailyEssentials.length === 0 ? (
              <p className="text-xs text-blue-500">
                {tr(
                  lang,
                  'Brak stałych rzeczy codziennych — dodaj np. piórnik, legitymację, wodę, klucze.',
                  'No daily items yet — add things like pencil case, ID, water, or keys.',
                )}
              </p>
            ) : (
              <ul className="divide-y divide-blue-950/70">
                {dailyEssentials.map((item, idx) => (
                  <li
                    key={`${item}-${idx}`}
                    className="py-2 flex items-center justify-between gap-2 text-sm text-blue-200"
                  >
                    <span>{item}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDailyEssential(idx)}
                      aria-label={tr(lang, `Usuń ${item}`, `Remove ${item}`)}
                      className="p-1 text-blue-500 hover:text-rose-400 rounded"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAddDailyEssential} className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <input
                type="text"
                value={newDailyItem}
                onChange={(e) => setNewDailyItem(e.target.value)}
                placeholder={tr(
                  lang,
                  'Dodaj rzecz codzienną (np. Klucze, Słuchawki, Powerbank, Bilet)...',
                  'Add everyday item (e.g. Keys, Earbuds, Power bank, Transit pass)...',
                )}
                className="flex-1 min-h-[42px] px-3.5 py-2 text-xs sm:text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[42px] text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-xl transition-colors whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                {tr(lang, 'Dodaj codzienną rzecz', 'Add Daily Item')}
              </button>
            </form>
          </section>

          {/* Section 2: Per-Subject Packing Kits */}
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-blue-200">
                {tr(lang, 'Co pakować na każdą lekcję', 'What to Pack for Each Lesson')}
              </h2>
              <p className="text-xs text-blue-400 mt-0.5">
                {tr(
                  lang,
                  'Przedmioty z Twojego planu lekcji są na górze — wpisz dokładnie, co bierzesz na każdy przedmiot',
                  'Subjects from your timetable appear first — set exactly what to pack for each class',
                )}
              </p>
            </div>

            <form
              onSubmit={handleAddKit}
              className="bg-[#070B14] border border-blue-950 rounded-2xl p-4 flex flex-col sm:flex-row gap-3"
            >
              <input
                type="text"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder={tr(
                  lang,
                  'Dodaj nowy przedmiot (np. Technika, EDB, Język hiszpański)...',
                  'Add new subject kit (e.g. Filozofia, Język hiszpański)...',
                )}
                className="flex-1 min-h-[42px] px-3.5 py-2 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[42px] text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-xl transition-colors whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                {tr(lang, 'Dodaj przedmiot', 'Add Subject')}
              </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {orderedKits.map((kit) => {
                const inTimetable = timetableSubjects.has(kit.subject.trim().toLowerCase());
                return (
                  <section
                    key={kit.subject}
                    className={`bg-[#070B14] border rounded-2xl p-5 flex flex-col justify-between space-y-4 ${
                      inTimetable ? 'border-blue-800/80' : 'border-blue-950'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 pb-3 border-b border-blue-950">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-sm font-semibold text-blue-200 truncate">
                            {kit.subject}
                          </h3>
                          {inTimetable && (
                            <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded border border-cyan-500/50 text-cyan-300 shrink-0">
                              {tr(lang, 'W planie', 'In plan')}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteKit(kit.subject)}
                          aria-label={tr(
                            lang,
                            `Usuń zestaw ${kit.subject}`,
                            `Delete ${kit.subject} kit`,
                          )}
                          className="p-1 text-blue-500 hover:text-rose-400 rounded shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {kit.items.length === 0 ? (
                        <p className="py-3 text-xs text-blue-500">
                          {tr(
                            lang,
                            'Brak rzeczy — nic nie będzie wymagane na tę lekcję.',
                            'No items — nothing will be packed for this class.',
                          )}
                        </p>
                      ) : (
                        <ul className="divide-y divide-blue-950/70 mt-2">
                          {kit.items.map((item, idx) => (
                            <li
                              key={`${kit.subject}-${idx}`}
                              className="py-2 flex items-center justify-between gap-2 text-sm text-blue-300"
                            >
                              <span>{item}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveItemFromKit(kit.subject, kit.items, idx)}
                                aria-label={tr(lang, `Usuń ${item}`, `Remove ${item}`)}
                                className="p-1 text-blue-500 hover:text-blue-200 rounded"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <input
                        type="text"
                        value={newItemDrafts[kit.subject] ?? ''}
                        onChange={(e) =>
                          setNewItemDrafts((prev) => ({ ...prev, [kit.subject]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddItemToKit(kit.subject, kit.items);
                          }
                        }}
                        placeholder={tr(lang, 'Dodaj rzecz do spakowania...', 'Add item to pack...')}
                        className="flex-1 min-h-[38px] px-3 py-1.5 text-xs bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddItemToKit(kit.subject, kit.items)}
                        className="px-3 min-h-[38px] text-xs font-semibold text-blue-200 bg-black border border-blue-900 hover:border-blue-500 rounded-lg whitespace-nowrap"
                      >
                        {tr(lang, 'Dodaj', 'Add')}
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <form
            onSubmit={handleAddLesson}
            className="bg-[#070B14] border border-blue-950 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <select
              value={lessonDay}
              onChange={(e) => setLessonDay(Number(e.target.value) as DayOfWeek)}
              className="px-3 py-2 text-sm bg-black text-blue-200 border border-blue-900 rounded-lg"
            >
              {WEEKDAYS.map((d) => (
                <option key={d.dow} value={d.dow}>
                  {tr(lang, d.pl, d.en)}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={12}
              value={lessonNum}
              onChange={(e) => setLessonNum(Number(e.target.value))}
              placeholder={tr(lang, 'Nr lekcji', 'Period')}
              className="px-3 py-2 text-sm font-mono bg-black text-blue-200 border border-blue-900 rounded-lg"
            />
            <div className="flex items-center gap-1.5">
              <input
                type="time"
                aria-label={tr(lang, 'Początek lekcji', 'Start time')}
                value={lessonStartTime}
                onChange={(e) => {
                  const nextStart = e.target.value;
                  setLessonStartTime(nextStart);
                  setLessonEndTime(addMinutesHhmm(nextStart, 45));
                }}
                className="flex-1 min-w-0 px-2.5 py-2 text-xs font-mono bg-black text-blue-200 border border-blue-900 rounded-lg"
              />
              <span className="text-blue-500 text-xs">–</span>
              <input
                type="time"
                aria-label={tr(lang, 'Koniec lekcji', 'End time')}
                value={lessonEndTime}
                onChange={(e) => setLessonEndTime(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-2 text-xs font-mono bg-black text-blue-200 border border-blue-900 rounded-lg"
              />
            </div>
            <input
              type="text"
              required
              value={lessonSubject}
              onChange={(e) => setLessonSubject(e.target.value)}
              placeholder={tr(lang, 'Przedmiot', 'Subject')}
              className="px-3 py-2 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg"
            />
            <input
              type="text"
              value={lessonRoom}
              onChange={(e) => setLessonRoom(e.target.value)}
              placeholder={tr(lang, 'Sala', 'Room')}
              className="px-3 py-2 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg"
            />
            <input
              type="text"
              value={lessonTeacher}
              onChange={(e) => setLessonTeacher(e.target.value)}
              placeholder={tr(lang, 'Nauczyciel (opcjonalnie)', 'Teacher (optional)')}
              className="px-3 py-2 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg sm:col-span-2"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-lg whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              {tr(lang, 'Dodaj lekcję', 'Add Class')}
            </button>
          </form>

          <div className="bg-[#070B14] border border-blue-950 rounded-2xl divide-y divide-blue-950">
            {WEEKDAYS.map((day) => {
              const lessons = timetable
                .filter((l) => l.dayOfWeek === day.dow)
                .sort((a, b) => a.lessonNumber - b.lessonNumber);
              return (
                <div key={day.dow} className="p-5">
                  <h3 className="text-sm font-semibold text-blue-200 mb-3">
                    {tr(lang, day.pl, day.en)}
                  </h3>
                  {lessons.length === 0 ? (
                    <p className="text-xs text-blue-500">
                      {tr(lang, 'Brak dodanych lekcji.', 'No lessons added.')}
                    </p>
                  ) : (
                    <div className="divide-y divide-blue-950/70">
                      {lessons.map((l) => (
                        <div
                          key={l.id}
                          className="py-2 flex flex-wrap items-center justify-between gap-3 text-sm"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-xs text-blue-400 tabular-nums shrink-0">
                              L{l.lessonNumber} · {l.startTime}–{l.endTime}
                            </span>
                            <span
                              className={
                                l.isCancelled
                                  ? 'line-through text-blue-600'
                                  : 'font-medium text-blue-200'
                              }
                            >
                              {l.subject}
                            </span>
                            {l.room && l.room !== 'TBA' && l.room !== '—' && (
                              <span className="text-xs text-blue-400">
                                {tr(lang, `Sala ${l.room}`, `Room ${l.room}`)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleToggleCancelLesson(l.id)}
                              className="text-xs font-medium text-blue-400 hover:text-blue-200 whitespace-nowrap"
                            >
                              {l.isCancelled
                                ? tr(lang, 'Przywróć lekcję', 'Restore lesson')
                                : tr(lang, 'Oznacz jako odwołaną', 'Mark cancelled')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLesson(l.id)}
                              aria-label={tr(lang, `Usuń ${l.subject}`, `Delete ${l.subject}`)}
                              className="p-1 text-blue-500 hover:text-rose-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
