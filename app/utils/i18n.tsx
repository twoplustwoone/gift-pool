import { parseAcceptLanguage } from 'intl-parse-accept-language';
import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';
import { en, type EnDictionary } from '#app/i18n/dictionaries/en.ts';

const dictionaries = {
  en,
} as const;

type Dictionaries = typeof dictionaries;
export type Locale = keyof Dictionaries;

type DotPrefix<T extends string> = T extends '' ? '' : `.${T}`;
type DotNestedKeys<T> = T extends Record<string, unknown>
  ? {
      [K in Extract<keyof T, string>]: `${K}${DotPrefix<DotNestedKeys<T[K]>>}`;
    }[Extract<keyof T, string>]
  : '';

type TranslationKey = Exclude<DotNestedKeys<EnDictionary>, ''>;

const SUPPORTED_LOCALES: Locale[] = ['en'];

const I18nContext = createContext<Locale>('en');

export function I18nProvider({
  locale,
  children,
}: PropsWithChildren<{ locale: Locale }>) {
  const value = SUPPORTED_LOCALES.includes(locale) ? locale : 'en';
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function getDictionary(locale: Locale) {
  return dictionaries[locale] ?? dictionaries.en;
}

function getValueByKey(
  dictionary: Record<string, unknown>,
  key: string,
): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dictionary);
}

function interpolate(
  template: string,
  params?: Record<string, string | number>,
) {
  if (!params) return template;
  return template.replace(/{{(.*?)}}/g, (_, rawKey) => {
    const key = rawKey.trim();
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
) {
  const dictionary = getDictionary(locale);
  const fallback = dictionaries.en;
  const raw =
    getValueByKey(dictionary, key) ?? getValueByKey(fallback, key) ?? key;
  if (typeof raw !== 'string') {
    return String(raw ?? key);
  }
  return interpolate(raw, params);
}

export function useTranslation(namespace?: string) {
  const locale = useContext(I18nContext);
  const prefix = namespace ? `${namespace}.` : '';

  return useMemo(
    () => ({
      locale,
      t: (
        key: string,
        params?: Record<string, string | number>,
      ) => translate(locale, `${prefix}${key}` as TranslationKey, params),
    }),
    [locale, prefix],
  );
}

export function getLocaleFromRequest(request: Request): Locale {
  const header = request.headers.get('accept-language');
  if (header) {
    try {
      const parsed = parseAcceptLanguage(header, { loose: true });
      for (const item of parsed) {
        const candidate = item.code.split('-')[0];
        if (SUPPORTED_LOCALES.includes(candidate as Locale)) {
          return candidate as Locale;
        }
      }
    } catch {
      // ignore parse errors
    }
  }
  return 'en';
}

const RELATIVE_TIME_DIVISIONS: Array<{
  amount: number;
  unit: Intl.RelativeTimeFormatUnit;
}> = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

export function formatRelativeTime(
  value: Date | string | number,
  locale: Locale,
  now: Date = new Date(),
) {
  const date =
    value instanceof Date ? value : new Date(typeof value === 'number' ? value : Date.parse(value));
  const diffInSeconds = (date.getTime() - now.getTime()) / 1000;
  if (Math.abs(diffInSeconds) < 5) {
    return translate(locale, 'time.justNow');
  }
  let duration = diffInSeconds;
  for (const division of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return translate(locale, 'time.justNow');
}

export type TranslationFunction = ReturnType<typeof useTranslation>['t'];
