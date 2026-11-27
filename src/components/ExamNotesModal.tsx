import { useState, type FormEvent } from 'react';
import { CloudUpload, FileText, Plus, Trash2, Users, X } from 'lucide-react';
import type { AppLanguage, SchoolTest, SharedClassLink } from '../types';
import { tr } from '../utils/i18n';
import { formatShortDate } from '../utils/packingEngine';

interface ExamNotesModalProps {
  test: SchoolTest;
  lang: AppLanguage;
  classLink: SharedClassLink | null;
  onAddNote: (testId: string, text: string) => void;
  onDeleteNote: (testId: string, noteId: string) => void;
  onOpenSyncPanel: () => void;
  onClose: () => void;
}

function formatNoteTime(iso: string, lang: AppLanguage): string {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleString(lang === 'pl' ? 'pl-PL' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function ExamNotesModal({
  test,
  lang,
  classLink,
  onAddNote,
  onDeleteNote,
  onOpenSyncPanel,
  onClose,
}: ExamNotesModalProps) {
  const [draft, setDraft] = useState('');
  const notes = test.sharedNotes ?? [];
  const hasDistinctScope =
    Boolean(test.description?.trim()) &&
    test.description.trim().toLowerCase() !== test.title.trim().toLowerCase();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = draft.trim();
    if (!cleaned) return;
    onAddNote(test.id, cleaned);
    setDraft('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6 bg-black sm:bg-black/85 sm:backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={tr(lang, 'Wspólne notatki do sprawdzianu', 'Shared Exam Notes')}
    >
      <div className="w-full h-dvh sm:h-auto sm:max-h-[86dvh] sm:max-w-xl bg-[#070B14] sm:border sm:border-blue-800 sm:rounded-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-black border-b border-blue-950 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-rose-400">{test.category}</span>
              <span className="font-mono text-blue-400 tabular-nums">
                {formatShortDate(test.date, lang)}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300">
                <Users className="h-3 w-3" />
                {tr(lang, 'Wspólne z klasą', 'Shared with class')}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-blue-200 leading-snug">
              {test.subject}: {test.title}
            </h2>
            {hasDistinctScope && (
              <p className="text-xs text-blue-400 leading-relaxed whitespace-pre-wrap">
                {test.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr(lang, 'Zamknij notatki', 'Close notes')}
            className="p-2 text-blue-400 hover:text-blue-200 bg-[#070B14] border border-blue-900 rounded-xl shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Notes List */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
          {notes.length === 0 ? (
            <div className="p-5 bg-black border border-dashed border-blue-950 rounded-xl text-center space-y-1.5">
              <FileText className="h-5 w-5 text-blue-500 mx-auto" />
              <div className="text-xs font-semibold text-blue-300">
                {tr(lang, 'Brak notatek do tego sprawdzianu', 'No shared notes for this exam yet')}
              </div>
              <p className="text-xs text-blue-500 leading-relaxed">
                {tr(
                  lang,
                  'Dodaj strony z podręcznika, zagadnienia, wzory albo wskazówki od nauczyciela — cała klasa zobaczy je po synchronizacji.',
                  'Add textbook pages, key topics, formulas, or teacher tips — everyone in class will see them after syncing.',
                )}
              </p>
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                className="p-3.5 bg-black border border-blue-950 rounded-xl space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-cyan-300 truncate">{note.author}</span>
                    <span className="font-mono text-blue-500 tabular-nums shrink-0">
                      {formatNoteTime(note.updatedAt, lang)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteNote(test.id, note.id)}
                    aria-label={tr(lang, 'Usuń notatkę', 'Delete note')}
                    title={tr(lang, 'Usuń notatkę', 'Delete note')}
                    className="p-1 text-blue-500 hover:text-rose-400 shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-xs sm:text-sm text-blue-200 leading-relaxed whitespace-pre-wrap break-words">
                  {note.text}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Add Note Form + Class Sync Hint */}
        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-5 bg-black border-t border-blue-950 space-y-3 shrink-0"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder={tr(
              lang,
              'Dodaj notatkę dla klasy (np. strony 42–58, wzory do zapamiętania, zadanie 4 z ćwiczeń)...',
              'Add a class note (e.g. pages 42–58, formulas to memorize, exercise 4 will be on the test)...',
            )}
            className="w-full resize-none px-3.5 py-2.5 text-xs sm:text-sm bg-[#070B14] text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-xl focus:outline-none focus:border-blue-400"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            {classLink ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSyncPanel();
                }}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-cyan-300 hover:text-blue-200 underline underline-offset-2"
              >
                <CloudUpload className="h-3.5 w-3.5 shrink-0" />
                {tr(
                  lang,
                  `Wyślij notatki do klasy ${classLink.className}`,
                  `Push notes to Class ${classLink.className}`,
                )}
              </button>
            ) : (
              <span className="text-[11px] text-blue-500">
                {tr(
                  lang,
                  'Notatki są udostępniane razem ze sprawdzianem w Sync i Klasa.',
                  'Notes are shared together with the exam in Sync & Class.',
                )}
              </span>
            )}

            <button
              type="submit"
              disabled={!draft.trim()}
              className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-40 rounded-xl whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              {tr(lang, 'Dodaj notatkę', 'Add Note')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
