// Run against a dev server: bun tests/i18n-smoke.ts http://127.0.0.1:3000
import { chromium, type BrowserContext } from 'playwright';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const origin = process.argv[2] || 'http://127.0.0.1:3000';
const browser = await chromium.launch();
const errors: string[] = [];
const storageKey = 'karaoke-maker-language';
const contexts: BrowserContext[] = [];

async function open(locale: string, saved?: string, blockedStorage = false, languages?: string[]) {
  const context = await browser.newContext({
    locale,
    userAgent: `Mozilla/5.0 Chrome/${browser.version()}`,
    viewport: { width: 1400, height: 900 },
  });
  contexts.push(context);
  await context.addInitScript(
    ({ saved, storageKey, blockedStorage, languages }) => {
      if (languages) Object.defineProperty(navigator, 'languages', { get: () => languages });
      if (blockedStorage) {
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('Storage disabled', 'SecurityError');
          },
        });
      } else if (saved) localStorage.setItem(storageKey, saved);
    },
    { saved, storageKey, blockedStorage, languages },
  );
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const diagnostics: string[] = [];
  page.on('console', (entry) => {
    if (entry.type() === 'error') diagnostics.push(entry.text());
  });
  page.on('requestfailed', (request) =>
    diagnostics.push(`${request.url()} ${request.failure()?.errorText}`),
  );
  page.on('response', (response) => {
    if (response.status() >= 400) diagnostics.push(`${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  try {
    await page.locator('#tab-source').waitFor();
  } catch (error) {
    throw new Error(
      `App did not mount for ${locale}, blocked storage ${blockedStorage}. ${errors.join('; ')} ${diagnostics.join('; ')} ${await page.locator('body').innerText()}`,
      { cause: error },
    );
  }
  return page;
}

try {
  for (const [locale, expected] of [
    ['zh-CN', 'zh'],
    ['zh-TW', 'zh'],
    ['zh-Hans-CN', 'zh'],
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['ja-JP', 'en'],
  ]) {
    const page = await open(locale!);
    assert.equal(await page.locator('html').getAttribute('lang'), expected);
    assert.equal(
      await page.locator('#tab-source').textContent(),
      expected === 'zh' ? '素材' : 'Source',
    );
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), null);
    await page.context().close();
  }

  const preferred = await open('de-DE', undefined, false, ['de-DE', 'zh-TW', 'en-US']);
  assert.equal(await preferred.locator('html').getAttribute('lang'), 'zh');
  await preferred.context().close();

  const override = await open('zh-CN', 'en');
  assert.equal(await override.locator('html').getAttribute('lang'), 'en');
  await override.context().close();

  const page = await open('en-US');
  await page.locator('#offset').fill('250');
  await page.locator('#ttml-file').setInputFiles({
    name: 'review-歌词.ttml',
    mimeType: 'application/xml',
    buffer: await readFile(new URL('../examples/demo.ttml', import.meta.url)),
  });
  await page.waitForFunction(() =>
    document.querySelector('#lyrics-info')?.textContent?.includes('lines loaded'),
  );
  const englishInfo = await page.locator('#lyrics-info').textContent();
  await page.getByRole('button', { name: '中文', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh');
  assert.match((await page.locator('#lyrics-info').textContent())!, /已载入 \d+ 行歌词/);
  assert.equal(await page.locator('#ttml-name').textContent(), 'review-歌词.ttml');
  assert.equal(await page.locator('#offset').inputValue(), '250');
  await page.locator('#tab-settings').click();
  assert(await page.getByRole('heading', { name: '歌词样式', exact: true }).isVisible());
  await page.getByRole('button', { name: 'English', exact: true }).click();
  assert.equal(await page.locator('#lyrics-info').textContent(), englishInfo);
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), 'en');
  assert(englishInfo?.includes('lines loaded'));

  const blocked = await open('zh-CN', undefined, true);
  assert.equal(await blocked.locator('html').getAttribute('lang'), 'zh');
  await blocked.getByRole('button', { name: 'English', exact: true }).click();
  assert.equal(await blocked.locator('html').getAttribute('lang'), 'en');

  for (const locale of ['en-US', 'zh-CN']) {
    const phone = await open(locale);
    await phone.setViewportSize({ width: 320, height: 812 });
    assert(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert(await phone.getByRole('button', { name: '中文', exact: true }).isVisible());
    await phone.context().close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'Language detection, persistence, live switching, blocked storage, TTML content, and phone layout passed.',
  );
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
}
