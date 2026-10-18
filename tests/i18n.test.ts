import { expect, test } from 'bun:test';
import { createInstance } from 'i18next';
import en from '../src/locales/en.json';
import zh from '../src/locales/zh.json';
import { LocalizedError, errorMessage, message } from '../src/messages';

test('Chinese catalog keys and placeholders match the English source', () => {
  expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  const placeholders = (text: string) =>
    [...text.matchAll(/\{\{?(\w+)\}?\}/g)].map((match) => match[1]).sort();
  for (const [key, text] of Object.entries(zh)) {
    expect(Object.hasOwn(en, key)).toBe(true);
    expect(placeholders(text)).toEqual(placeholders(en[key as keyof typeof en]));
    expect(text.trim()).not.toBe('');
  }
});

test('Chinese translations cover settings and counts while English fallback remains available', async () => {
  const i18n = createInstance();
  await i18n.init({
    resources: { en: { translation: en }, zh: { translation: zh } },
    lng: 'zh',
    fallbackLng: 'en',
    keySeparator: false,
  });
  expect(i18n.t('sourcePanel.sourceFiles')).toBe(zh['sourcePanel.sourceFiles']);
  expect(i18n.t('settingsPanel.lyricStyle')).toBe('歌词样式');
  i18n.addResource('en', 'translation', 'test.futureMessage', 'English fallback');
  expect(i18n.t('test.futureMessage')).toBe('English fallback');
  expect(i18n.t('studio.wordTimedLines', { count: 2 })).toBe('已载入 2 行歌词，可逐字高亮。');
  await i18n.changeLanguage('en');
  expect(i18n.t('studio.wordTimedLines', { count: 1 })).toBe('1 line loaded. Word timing ready.');
});

test('application errors retain translation data while external errors remain readable', () => {
  const cause = new Error('disk full');
  const error = new LocalizedError('settings.invalidKey', { key: 'offset' }, { cause });
  expect(error.message).toBe('Invalid offset.');
  expect(error.cause).toBe(cause);
  expect(errorMessage(error)).toEqual(message('settings.invalidKey', { key: 'offset' }));
  expect(errorMessage(new Error('external error'))).toEqual(
    message('errors.unexpected', { details: 'Error: external error' }),
  );
  expect(errorMessage(new DOMException('full', 'QuotaExceededError'))).toEqual(
    message('errors.quota'),
  );
  expect(errorMessage(new DOMException('denied', 'NotAllowedError'))).toEqual(
    message('errors.permission'),
  );
});
