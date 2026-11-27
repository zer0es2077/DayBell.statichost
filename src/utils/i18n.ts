import type { AppLanguage, PackingStepConfig } from '../types';

export function tr(lang: AppLanguage, pl: string, en: string): string {
  return lang === 'pl' ? pl : en;
}

export function getLocale(lang: AppLanguage): string {
  return lang === 'pl' ? 'pl-PL' : 'en-US';
}

export function getLocalizedPackingStep(
  step: PackingStepConfig,
  lang: AppLanguage,
): { label: string; note?: string } {
  if (step.kind === 'custom') {
    return { label: step.label, note: step.note };
  }
  switch (step.kind) {
    case 'subjects':
      return {
        label: tr(lang, 'Podręczniki i zeszyty do lekcji', 'Subject books & notebooks'),
        note: tr(
          lang,
          'Uzupełniane automatycznie z planu lekcji i zestawów przedmiotów',
          'Auto-filled from your classes & subject kits',
        ),
      };
    case 'homework-supplies':
      return {
        label: tr(lang, 'Materiały na zadania domowe i projekty', 'Homework & project supplies'),
        note: tr(
          lang,
          'Dodatkowe rzeczy potrzebne do prac domowych na ten dzień',
          'Extra materials needed for homework due that day',
        ),
      };
    case 'message-extras':
      return {
        label: tr(lang, 'Dodatki z wiadomości Librus', 'Extra items from Librus notices'),
        note: tr(
          lang,
          'Zgody, strój na WF lub rzeczy wpisane przez nauczycieli',
          'Slips, PE gear, or items mentioned by teachers',
        ),
      };
    case 'test-prep':
      return {
        label: tr(lang, 'Rzeczy na sprawdzian', 'Test-day materials'),
        note: tr(
          lang,
          'Notatki powtórkowe i zapasowy długopis w dni sprawdzianów',
          'Revision notes & spare pen on test days',
        ),
      };
    case 'essentials':
      return {
        label: tr(lang, 'Codzienne niezbędniki', 'Daily essentials'),
        note: tr(
          lang,
          'Legitymacja, piórnik, butelka wody i drugie śniadanie',
          'Student ID, pencil case, water bottle & lunch',
        ),
      };
    default:
      return { label: step.label, note: step.note };
  }
}
