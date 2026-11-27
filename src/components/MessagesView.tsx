import { useState, type FormEvent } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import type { AppLanguage, DigestAnalysis, SchoolMessage } from '../types';
import { tr } from '../utils/i18n';
import { formatShortDate } from '../utils/packingEngine';

interface MessagesViewProps {
  messages: SchoolMessage[];
  digest: DigestAnalysis | null;
  analyzing: boolean;
  aiError: string | null;
  onRunAnalysis: () => void;
  onAddManualMessage: (msg: Omit<SchoolMessage, 'id' | 'source'>) => void;
  todayYmd: string;
  ownerAiUnlocked: boolean;
  lang: AppLanguage;
}

type MessageFilter = 'all' | 'message' | 'announcement' | 'action';

export function MessagesView({
  messages,
  digest,
  analyzing,
  aiError,
  onRunAnalysis,
  onAddManualMessage,
  todayYmd,
  ownerAiUnlocked,
  lang,
}: MessagesViewProps) {
  const [filter, setFilter] = useState<MessageFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [showAddForm, setShowAddForm] = useState(false);

  const [kind, setKind] = useState<'message' | 'announcement'>('message');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [body, setBody] = useState('');

  const filteredMessages = messages.filter((m) => {
    const summary = digest?.messageSummaries[m.id];
    if (filter === 'message' && m.kind !== 'message') return false;
    if (filter === 'announcement' && m.kind !== 'announcement') return false;
    if (filter === 'action') {
      const isAction =
        summary?.urgency === 'urgent' || summary?.urgency === 'action' || m.unread;
      if (!isAction) return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.title.toLowerCase().includes(q) ||
      m.author.toLowerCase().includes(q) ||
      m.body.toLowerCase().includes(q) ||
      (summary?.summary.toLowerCase().includes(q) ?? false)
    );
  });

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    onAddManualMessage({
      kind,
      title: title.trim(),
      author: author.trim() || tr(lang, 'Nauczyciel', 'Teacher'),
      date: todayYmd,
      body: body.trim(),
      unread: true,
    });
    setTitle('');
    setAuthor('');
    setBody('');
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">
      <section className="bg-[#070B14] border border-blue-950 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-blue-950">
          <div>
            <h2 className="text-base font-semibold text-blue-200">
              {tr(lang, 'Skrót wiadomości (AI)', 'AI Executive Brief')}
            </h2>
            <p className="text-xs text-blue-400 mt-0.5">
              {tr(
                lang,
                'Streszcza wiadomości i ogłoszenia z Librusa oraz przekazuje rzeczy do spakowania',
                'Summarizes Librus messages & announcements and forwards required gear to your Feed',
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-200 bg-black border border-blue-900 hover:border-blue-500 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              {tr(lang, 'Dodaj wiadomość', 'Add Notice')}
            </button>
            {ownerAiUnlocked ? (
              <button
                type="button"
                onClick={onRunAnalysis}
                disabled={analyzing || messages.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                {analyzing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : digest ? (
                  <RefreshCw className="h-3.5 w-3.5" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {analyzing
                  ? tr(lang, 'Streszczanie...', 'Summarizing...')
                  : digest
                    ? tr(lang, 'Streść ponownie', 'Re-summarize All')
                    : tr(lang, 'Streść wszystkie', 'Summarize All')}
              </button>
            ) : (
              <span className="text-[11px] font-medium text-blue-500 px-2.5 py-1.5 border border-blue-950 rounded-lg whitespace-nowrap">
                {tr(lang, 'Wymaga PIN-u właściciela', 'Owner PIN required for AI brief')}
              </span>
            )}
          </div>
        </div>

        {aiError && (
          <div className="mt-4 px-3.5 py-2.5 text-xs text-rose-300 bg-rose-950/40 border border-rose-900 rounded-lg">
            {aiError}
          </div>
        )}

        {analyzing ? (
          <div className="mt-4 space-y-2.5" aria-busy="true">
            <div className="h-4 w-5/6 bg-blue-950 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-blue-950 rounded animate-pulse" />
            <div className="h-4 w-4/5 bg-blue-950 rounded animate-pulse" />
          </div>
        ) : digest && digest.executiveBrief.length > 0 ? (
          <ul className="mt-4 space-y-2.5">
            {digest.executiveBrief.map((bullet, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 text-sm leading-relaxed text-blue-300"
              >
                <span className="font-mono text-xs text-blue-500 mt-1 tabular-nums">
                  0{idx + 1}
                </span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-blue-400">
            {messages.length === 0
              ? tr(
                  lang,
                  'Brak wiadomości ani ogłoszeń. Zaimportuj je na ekranie głównym lub dodaj powyżej.',
                  'No messages or announcements yet. Import from Home or add a notice above.',
                )
              : ownerAiUnlocked
                ? tr(
                    lang,
                    'Kliknij „Streść wszystkie”, aby wygenerować krótkie podsumowanie i wyciągnąć rzeczy do spakowania.',
                    'Click "Summarize All" to generate concise summaries and automatically extract packing items and hidden quizzes.',
                  )
                : tr(
                    lang,
                    'Wbudowane streszczenia AI są zablokowane dla właściciela. Czytaj wiadomości poniżej lub użyj Własne AI / Wklej tekst na ekranie głównym.',
                    'Built-in AI summaries are locked to the app owner. Read notices below, or use Own AI / Local Paste on Home.',
                  )}
          </p>
        )}
      </section>

      {showAddForm && (
        <form
          onSubmit={handleAdd}
          className="bg-[#070B14] border border-blue-950 rounded-xl p-5 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'message' | 'announcement')}
              className="px-3 py-2 text-sm bg-black text-blue-200 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
            >
              <option value="message">{tr(lang, 'Wiadomość od nauczyciela', 'Teacher Message')}</option>
              <option value="announcement">{tr(lang, 'Ogłoszenie szkolne', 'School Announcement')}</option>
            </select>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr(lang, 'Temat / Tytuł', 'Subject / Title')}
              className="px-3 py-2 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
            />
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder={tr(lang, 'Nadawca (np. mgr Kowalska)', 'Sender (e.g. mgr Kowalska)')}
              className="px-3 py-2 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
          <textarea
            rows={4}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={tr(
              lang,
              'Wklej pełną treść wiadomości lub ogłoszenia...',
              'Paste the full message or announcement text (Polish or English)...',
            )}
            className="w-full px-3 py-2 text-sm bg-black text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-200"
            >
              {tr(lang, 'Anuluj', 'Cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-lg"
            >
              {tr(lang, 'Dodaj do skrzynki', 'Add to Inbox')}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#070B14] border border-blue-950 rounded-lg">
          {(
            [
              ['all', tr(lang, 'Wszystkie', 'All')],
              ['message', tr(lang, 'Wiadomości', 'Messages')],
              ['announcement', tr(lang, 'Ogłoszenia', 'Announcements')],
              ['action', tr(lang, 'Wymaga akcji', 'Action Needed')],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                filter === id ? 'bg-blue-500 text-black' : 'text-blue-400 hover:text-blue-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="h-3.5 w-3.5 text-blue-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr(lang, 'Szukaj wiadomości...', 'Search notices...')}
            className="pl-8 pr-3 py-1.5 text-xs bg-[#070B14] text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg focus:outline-none focus:border-blue-400 w-60"
          />
        </div>
      </div>

      <section className="bg-[#070B14] border border-blue-950 rounded-xl divide-y divide-blue-950">
        {filteredMessages.length === 0 ? (
          <div className="p-10 text-center text-sm text-blue-400">
            {tr(
              lang,
              'Brak wiadomości pasujących do tego filtra.',
              'No messages or announcements match this filter.',
            )}
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const summary = digest?.messageSummaries[msg.id];
            const linkedPacking =
              digest?.extractedPackingItems.filter((p) => p.sourceMessageId === msg.id) ?? [];
            const isExpanded = Boolean(expandedIds[msg.id]);

            const urgencyLabel =
              summary?.urgency === 'urgent'
                ? tr(lang, 'Pilne', 'Urgent')
                : summary?.urgency === 'action'
                  ? tr(lang, 'Wymaga akcji', 'Action needed')
                  : summary
                    ? tr(lang, 'Informacyjne', 'Informational')
                    : msg.unread
                      ? tr(lang, 'Nieprzeczytane', 'Unread')
                      : tr(lang, 'Przeczytane', 'Read');

            const urgencyTone =
              summary?.urgency === 'urgent'
                ? 'text-rose-400 font-semibold'
                : summary?.urgency === 'action'
                  ? 'text-amber-300 font-semibold'
                  : 'text-blue-400';

            return (
              <article key={msg.id} className="p-6 space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-blue-200">{msg.title}</h3>
                  <div className="text-xs text-blue-400 whitespace-nowrap">
                    <span>
                      {msg.kind === 'announcement'
                        ? tr(lang, 'Ogłoszenie', 'Announcement')
                        : tr(lang, 'Wiadomość', 'Message')}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span>{msg.author}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="font-mono tabular-nums">{msg.date}</span>
                    <span aria-hidden="true"> · </span>
                    <span className={urgencyTone}>{urgencyLabel}</span>
                  </div>
                </div>

                {summary ? (
                  <div className="space-y-2.5">
                    <p className="text-sm leading-relaxed text-blue-200">{summary.summary}</p>
                    {summary.keyPoints.length > 0 && (
                      <ul className="space-y-1 text-xs text-blue-400">
                        {summary.keyPoints.map((pt, i) => (
                          <li key={i}>— {pt}</li>
                        ))}
                      </ul>
                    )}
                    {summary.actionRequired && (
                      <div className="text-xs text-amber-300 font-medium">
                        {tr(lang, 'Do zrobienia:', 'Action:')} {summary.actionRequired}
                        {summary.deadlineDate
                          ? ` (${tr(lang, 'do', 'by')} ${formatShortDate(summary.deadlineDate, lang)})`
                          : ''}
                      </div>
                    )}
                    {linkedPacking.length > 0 && (
                      <div className="text-xs text-cyan-300">
                        {tr(lang, 'Dodano do pakowania:', 'Added to packing checklist:')}{' '}
                        {linkedPacking
                          .map((p) => `${p.item} (${formatShortDate(p.targetDate, lang)})`)
                          .join(', ')}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed text-blue-400 line-clamp-2">{msg.body}</p>
                )}

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedIds((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-200"
                  >
                    {isExpanded ? (
                      <>
                        {tr(lang, 'Ukryj oryginalną treść', 'Hide original text')}
                        <ChevronUp className="h-3.5 w-3.5" />
                      </>
                    ) : (
                      <>
                        {tr(lang, 'Pokaż pełną treść z Librusa', 'View original Librus text')}
                        <ChevronDown className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-2 pt-3 border-t border-blue-950 text-xs leading-relaxed text-blue-400 whitespace-pre-wrap">
                    {msg.body}
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
