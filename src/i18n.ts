import { createInstance } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { derived, readable } from 'svelte/store';
import en from './locales/en.json';
import zh from './locales/zh.json';
import type { DisplayMessage, MessageKey, MessageValues } from './messages';

export const supportedLanguages = ['en', 'zh'] as const;
export type Language = (typeof supportedLanguages)[number];
export const LANGUAGE_STORAGE_KEY = 'karaoke-maker-language';

const i18n = createInstance();
// Both catalogs are bundled. Finish detection before mounting to avoid an
// English flash on Chinese systems. Storage failures are handled by the detector.
void i18n.use(LanguageDetector).init({
  resources: { en: { translation: en }, zh: { translation: zh } },
  supportedLngs: [...supportedLanguages],
  fallbackLng: 'en',
  load: 'languageOnly',
  initAsync: false,
  keySeparator: false,
  interpolation: { escapeValue: false },
  detection: {
    order: ['localStorage', 'navigator'],
    lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    // Only explicit choices are saved. First visits keep following the system.
    caches: [],
  },
});

function resolvedLanguage(): Language {
  return i18n.resolvedLanguage === 'zh' ? 'zh' : 'en';
}

function updateDocumentLanguage() {
  if (typeof document !== 'undefined') document.documentElement.lang = resolvedLanguage();
}
updateDocumentLanguage();
i18n.on('languageChanged', updateDocumentLanguage);

export const language = readable<Language>(resolvedLanguage(), (set) => {
  const changed = () => set(resolvedLanguage());
  i18n.on('languageChanged', changed);
  changed();
  return () => i18n.off('languageChanged', changed);
});

export const t = derived(
  language,
  (lng) =>
    (key: MessageKey, values?: MessageValues): string =>
      i18n.t(key, { ...values, lng }),
);

export const translateMessage = derived(
  t,
  (translate) =>
    (value: DisplayMessage): string =>
      typeof value === 'string' ? value : translate(value.key, value.values),
);

export function setLanguage(next: Language) {
  void i18n.changeLanguage(next);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
  } catch {
    // Switching still works when browser storage is disabled or full.
  }
}
