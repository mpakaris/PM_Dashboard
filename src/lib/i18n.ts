export type Locale = 'en' | 'de';

export const LOCALES: Locale[] = ['en', 'de'];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_KEY = 'app-locale';

export function fmtEur(v: number, locale: Locale = DEFAULT_LOCALE): string {
  return (
    v.toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + ' €'
  );
}

export function fmtH(h: number, locale: Locale = DEFAULT_LOCALE): string {
  return (
    h.toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
    }) + 'h'
  );
}

export function fmtPct(v: number): string {
  return `${Math.round(v)}%`;
}
