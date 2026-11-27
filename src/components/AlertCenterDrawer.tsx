import { Bell, BellRing, Check, Trash2, X } from 'lucide-react';
import type { AppLanguage, AppNotification } from '../types';
import { tr } from '../utils/i18n';
import { formatShortDate, formatWeekdayShort } from '../utils/packingEngine';

interface AlertCenterDrawerProps {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  browserPermission: NotificationPermission | 'unsupported';
  onRequestBrowserPermission: () => void;
  onSendPreviewNotification: (notif?: AppNotification) => void;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  lang: AppLanguage;
}

export function AlertCenterDrawer({
  open,
  onClose,
  notifications,
  browserPermission,
  onRequestBrowserPermission,
  onSendPreviewNotification,
  onMarkRead,
  onDismiss,
  lang,
}: AlertCenterDrawerProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-center-title"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <aside className="relative z-10 w-full max-w-md bg-[#070B14] border-l border-blue-900 h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-blue-950 shrink-0">
          <div>
            <h2 id="alert-center-title" className="text-base font-semibold text-blue-200">
              {tr(lang, 'Centrum alertów', 'Alert Center')}
            </h2>
            <p className="text-xs text-blue-400">
              {tr(
                lang,
                'Przypomnienia po lekcjach, pilne sprawy i zapowiedzi sprawdzianów',
                'Dismissal-time errands, urgent school tasks & test warnings',
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr(lang, 'Zamknij centrum alertów', 'Close alert center')}
            className="p-2 text-blue-400 hover:text-blue-200 rounded-md"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Browser notification controls */}
        <div className="px-6 py-4 border-b border-blue-950 bg-black/60 space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs">
              <div className="font-semibold text-blue-200">
                {tr(lang, 'Powiadomienia przeglądarki', 'Browser Push Alerts')}
              </div>
              <div className="text-blue-400 mt-0.5">
                {browserPermission === 'granted'
                  ? tr(
                      lang,
                      'Włączone — powiadomienia uruchomią się po zakończeniu lekcji',
                      'Enabled — alerts fire automatically at dismissal times',
                    )
                  : browserPermission === 'denied'
                    ? tr(
                        lang,
                        'Zablokowane w przeglądarce — działają alerty w aplikacji',
                        'Blocked in browser settings — using in-app alerts',
                      )
                    : browserPermission === 'unsupported'
                      ? tr(
                          lang,
                          'Brak obsługi w tej ramce — działają alerty w aplikacji',
                          'Not supported in this frame — using in-app alerts',
                        )
                      : tr(
                          lang,
                          'Włącz, aby dostawać powiadomienia zaraz po wyjściu ze szkoły',
                          'Enable to receive alerts right as you leave school',
                        )}
              </div>
            </div>
            {browserPermission === 'default' && (
              <button
                type="button"
                onClick={onRequestBrowserPermission}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-lg whitespace-nowrap shrink-0"
              >
                <Bell className="h-3.5 w-3.5" />
                {tr(lang, 'Włącz', 'Enable')}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => onSendPreviewNotification(notifications[0])}
            className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-blue-200 bg-black border border-blue-900 hover:border-blue-500 rounded-lg transition-colors whitespace-nowrap"
          >
            <BellRing className="h-3.5 w-3.5 text-blue-400" />
            {tr(lang, 'Wyślij testowe powiadomienie teraz', 'Trigger Next Alert Preview Now')}
          </button>
        </div>

        {/* Notifications list */}
        <div className="flex-1 overflow-y-auto divide-y divide-blue-950">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-blue-400">
              {tr(
                lang,
                'Brak zaplanowanych alertów. Dodaj pracę domową z materiałami albo pilne zadanie, aby uruchomić przypomnienia.',
                'No scheduled alerts right now. Add homework with supplies or an urgent task to queue smart reminders.',
              )}
            </div>
          ) : (
            notifications.map((notif) => {
              const kindLabel =
                notif.kind === 'dismissal-errand'
                  ? tr(lang, 'Po lekcjach', 'Dismissal trigger')
                  : notif.kind === 'urgent-task'
                    ? tr(lang, 'Pilne zadanie', 'Urgent task')
                    : tr(lang, 'Zapowiedź sprawdzianu', 'Advance test alert');
              const tone =
                notif.kind === 'urgent-task'
                  ? 'text-rose-400 font-semibold'
                  : notif.kind === 'dismissal-errand'
                    ? 'text-amber-300 font-semibold'
                    : 'text-blue-300 font-semibold';

              return (
                <div
                  key={notif.id}
                  className={`p-5 space-y-2 ${notif.read ? 'opacity-65' : ''}`}
                >
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className={tone}>{kindLabel}</span>
                    <span className="font-mono text-blue-500 tabular-nums whitespace-nowrap">
                      {formatWeekdayShort(notif.targetDate, lang)}{' '}
                      {formatShortDate(notif.targetDate, lang)} · {notif.triggerTime}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-blue-200">{notif.title}</div>
                  <p className="text-xs leading-relaxed text-blue-400">{notif.body}</p>
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => onSendPreviewNotification(notif)}
                      className="text-xs font-semibold text-blue-300 hover:text-blue-200 underline underline-offset-2"
                    >
                      {tr(lang, 'Testuj alert', 'Test ping')}
                    </button>
                    <div className="flex items-center gap-3">
                      {!notif.read && (
                        <button
                          type="button"
                          onClick={() => onMarkRead(notif.id)}
                          className="inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {tr(lang, 'Przeczytane', 'Mark read')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDismiss(notif.id)}
                        aria-label={tr(lang, 'Usuń powiadomienie', 'Dismiss notification')}
                        className="p-1 text-blue-500 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
