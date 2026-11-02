import { chromium } from 'playwright';
import { createServer } from 'vite';
import { strict as assert } from 'node:assert';

const server = await createServer({ server: { port: 0, open: false } });
await server.listen();
const address = server.httpServer!.address();
if (!address || typeof address === 'string') throw new Error('Expected an HTTP address');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch();
const ttml =
  '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:lrc="http://lrc.red/lyric-ttml-internal"><body><div><p begin="1.0" end="3.0" lrc:key="L1"><span begin="1.0" end="2.0">Test </span><span begin="2.0" end="3.0">lyrics</span></p></div></body></tt>';
const hits = [
  {
    isrc: 'GBAYE9200070',
    title: 'Valid song',
    artist: 'Test Artist',
    album: 'Test Album',
    year: 2026,
  },
  { isrc: 'USLF29400135', title: 'Untimed song', artist: 'Other Artist' },
];
try {
  const context = await browser.newContext({
    locale: 'en',
    userAgent: `Mozilla/5.0 Chrome/${browser.version()}`,
  });
  // HTTP LAN origins have getRandomValues but do not expose randomUUID.
  // A startup failure here used to leave the visible search button unwired.
  await context.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const requests: string[] = [];
  await page.route('https://lrc.red/**', async (route) => {
    const request = route.request();
    requests.push(request.url());
    assert.equal(
      request.headers()['x-client-id'],
      'Karaoke Maker (https://karaoke.hproject.xyz; contact@hproject.xyz)',
    );
    const url = new URL(request.url());
    if (url.pathname === '/search.json') {
      if (url.searchParams.get('q') === 'slow')
        await new Promise((resolve) => setTimeout(resolve, 200));
      if (url.searchParams.get('q') === 'none')
        return route.fulfill({ json: { hits: [], next: null } });
      return route.fulfill({
        json: {
          hits: url.searchParams.has('after') ? [hits[0]] : hits,
          next: url.searchParams.has('after') ? null : 'p24',
        },
      });
    }
    await route.fulfill({
      contentType: 'application/ttml+xml',
      body: url.pathname.includes('USLF')
        ? '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p>No timing</p></div></body></tt>'
        : ttml,
    });
  });
  await page.goto(origin);
  await page.waitForFunction(() => document.getElementById('font-status')?.textContent === '');
  assert.equal(requests.length, 0, 'Opening the app must not request featured songs');
  await page.locator('#ttml-file').setInputFiles({
    name: 'local.ttml',
    mimeType: 'application/ttml+xml',
    buffer: Buffer.from(ttml),
  });
  await page.waitForFunction(
    () => document.getElementById('ttml-name')?.textContent?.trim() === 'local.ttml',
  );
  assert.equal(await page.locator('#selected-lyrics').isVisible(), true);
  assert.equal(await page.locator('#search-lyrics').isVisible(), false);
  assert.equal(await page.locator('#ttml-file').count(), 0);
  await page.locator('#remove-lyrics').click();
  assert.equal(await page.locator('#selected-lyrics').count(), 0);
  assert.equal(await page.locator('#ttml-file').isVisible(), true);
  assert.equal(
    await page.locator('#search-lyrics').evaluate((button) => button === document.activeElement),
    true,
  );
  await page.waitForFunction(
    () => !document.querySelector('.amll-lyric-player')?.textContent?.includes('Test'),
  );
  await page.locator('#search-lyrics').click();
  const dialog = page.getByRole('dialog', { name: 'Search lyrics', exact: true });
  await dialog.waitFor({ state: 'visible' });
  assert.equal(await dialog.locator('a[href="https://lrc.red"]').count(), 1);
  await page.locator('#lyric-search-query').fill('Test');
  assert.equal(requests.length, 0, 'Typing must not send automatic requests');
  await dialog.getByRole('button', { name: 'Search', exact: true }).click();
  await dialog
    .getByRole('heading', { name: 'Valid song', exact: true })
    .waitFor({ timeout: 5000 })
    .catch(async (error) => {
      console.error(await dialog.innerText(), requests);
      throw error;
    });
  assert.equal(
    await dialog
      .getByRole('link', { name: 'Open in lrc.red', exact: true })
      .first()
      .getAttribute('href'),
    'https://lrc.red/s/GBAYE9200070',
  );
  await dialog.getByRole('button', { name: 'More results', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'More results', exact: true })
    .waitFor({ state: 'hidden' });
  assert.equal(await dialog.locator('li').count(), 2, 'Pagination must deduplicate results');
  const untimed = dialog.locator('li').filter({ hasText: 'Untimed song' });
  await untimed.getByRole('button', { name: 'Use TTML' }).click();
  await untimed.getByRole('button', { name: 'No valid timed TTML' }).waitFor();
  assert.equal(
    (await page.locator('#ttml-name').textContent())?.trim(),
    'Choose TTML',
    'Invalid remote lyrics must not select a file',
  );
  assert.equal(await untimed.getByRole('button').isEnabled(), false);
  await dialog
    .locator('li')
    .filter({ hasText: 'Valid song' })
    .getByRole('button', { name: 'Use TTML' })
    .click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(
    (await page.locator('#ttml-name').textContent())?.trim(),
    'Test Artist - Valid song.ttml',
  );
  assert.equal(await page.locator('#selected-lyrics').isVisible(), true);
  assert.equal(await page.locator('#search-lyrics').isVisible(), false);
  assert.equal(await page.locator('#ttml-file').count(), 0);
  assert.equal(
    await page.locator('#lyric-source a').getAttribute('href'),
    'https://lrc.red/s/GBAYE9200070',
  );
  await page.getByRole('tab', { name: 'Settings', exact: true }).click();
  assert.equal(
    await page.locator('footer a[href="https://lrc.red/s/GBAYE9200070"]').isVisible(),
    true,
  );
  await page.getByRole('tab', { name: 'Source', exact: true }).click();
  await page.locator('#remove-lyrics').click();
  assert.equal(await page.locator('#lyric-source').count(), 0);
  assert.equal(await page.locator('footer a[href^="https://lrc.red"]').count(), 0);
  assert.equal(await page.locator('#export').isEnabled(), false);
  await page.locator('#ttml-file').setInputFiles({
    name: 'replacement.ttml',
    mimeType: 'application/ttml+xml',
    buffer: Buffer.from(ttml),
  });
  await page.waitForFunction(
    () => document.getElementById('ttml-name')?.textContent?.trim() === 'replacement.ttml',
  );
  assert.equal(await page.locator('#lyric-source').count(), 0);
  assert.equal(await page.locator('footer a[href^="https://lrc.red"]').count(), 0);
  await page.locator('#remove-lyrics').click();
  await page.locator('#search-lyrics').click();
  await page.locator('#lyric-search-query').fill('none');
  await dialog.getByRole('button', { name: 'Search', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: 'No songs found' }).waitFor();
  await page.locator('#lyric-search-query').fill('slow');
  await dialog.getByRole('button', { name: 'Search', exact: true }).click();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await page.waitForTimeout(300);
  assert.equal((await page.locator('#ttml-name').textContent())?.trim(), 'Choose TTML');

  // lrc.red's real TTML must pass the same parser without changing the user's file.
  if (process.env.LRC_RED_TTML_FIXTURE) {
    const real = await Bun.file(process.env.LRC_RED_TTML_FIXTURE).text();
    const result = await page.evaluate(async (text) => {
      const path = '/src/lyrics.ts';
      const { parseLyrics } = await import(path);
      const lines = parseLyrics(text);
      return { count: lines.length, start: lines[0].startTime, end: lines[0].endTime };
    }, real);
    assert(result.count > 0 && result.end > result.start);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await page.locator('#search-lyrics').click();
  await page.getByRole('dialog', { name: '搜索歌词', exact: true }).waitFor();
  const bounds = await page.locator('#lyric-search').boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: lyric search identity, validation, direct import, source credits, pagination, cancellation, local replacement, and Chinese phone layout',
  );
} finally {
  await browser.close();
  await server.close();
}
