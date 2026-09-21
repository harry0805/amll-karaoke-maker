// Rendering contract tests run against the shared preview/export lyric engine.
import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults, type SettingsSnapshot } from '../src/settings';

const origin = process.argv[2] || 'http://127.0.0.1:3210';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  let settings: SettingsSnapshot = { ...defaults, font: 'sans', height: 0 };
  const ttmlDocument = (body: string) =>
    `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent xml:id="v1" type="person"/><ttm:agent xml:id="v2" type="person"/></metadata></head><body><div>${body}</div></body></tt>`;
  let ttml = ttmlDocument(
    Array.from(
      { length: 8 },
      (_, i) =>
        `<p begin="${i * 2}s" end="${i * 2 + 2}s"><span begin="${i * 2}s" end="${i * 2 + 2}s">Line ${i + 1}</span></p>`,
    ).join(''),
  );
  await page.route('**/test-config/window/config', (route) =>
    route.fulfill({ json: { ttml, settings } }),
  );
  async function load() {
    await page.goto(`${origin}/render?job=window`);
    await page
      .waitForFunction(() => window.rendererReady || window.rendererError, undefined, {
        timeout: 15000,
      })
      .catch((error) => {
        throw new Error(`${error}\n${errors.join('\n')}`);
      });
    assert.equal(await page.evaluate(() => window.rendererError), undefined);
  }
  async function frame(time: number, delta = 0) {
    await page.evaluate(([time, delta]) => window.renderFrame(time!, delta!), [time, delta]);
  }
  async function advance(start: number, end: number) {
    await page.evaluate(
      async ([start, end]) => {
        for (let t = start!; t <= end!; t += 1000 / 60) await window.renderFrame(t, 1000 / 60);
      },
      [start, end],
    );
  }
  async function state() {
    return page.evaluate(() => {
      const area = document.getElementById('lyrics')!.getBoundingClientRect();
      const lines = Array.from(
        document.querySelectorAll<HTMLElement>('[class*="_lyricMainLine"]'),
      ).map((main) => {
        const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        let top = Infinity,
          bottom = -Infinity;
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent?.trim()) continue;
          range.selectNodeContents(walker.currentNode);
          const rect = range.getBoundingClientRect();
          top = Math.min(top, rect.top);
          bottom = Math.max(bottom, rect.bottom);
        }
        const line = main.parentElement!;
        return {
          text: main.textContent!.trim(),
          top,
          bottom,
          visible:
            getComputedStyle(line).visibility === 'visible' &&
            bottom > area.top &&
            top < area.bottom,
        };
      });
      return { top: area.top, bottom: area.bottom, height: area.height, lines };
    });
  }
  const visibleTexts = (s: Awaited<ReturnType<typeof state>>) =>
    s.lines.filter((line) => line.visible).map((line) => line.text);

  await load();
  await frame(1000);
  assert.deepEqual(visibleTexts(await state()), ['Line 1', 'Line 2']);
  const waiting = (await state()).lines.find((line) => line.text === 'Line 3')!;
  assert(waiting.top >= (await state()).bottom, 'Next admission starts outside the viewport');
  await advance(1000, 1983);
  await frame(2000, 1000 / 60);
  assert(
    (await state()).lines.find((line) => line.text === 'Line 3')!.top >= (await state()).bottom,
    'New line must not pop into its destination on admission',
  );
  const entering = (await state()).lines.find((line) => line.text === 'Line 3')!;
  assert(
    entering.top - (await state()).bottom < 100,
    'Entrance starts nearby, not at its distant source position',
  );
  await advance(2017, 3100);
  assert.deepEqual(visibleTexts(await state()), ['Line 2', 'Line 3']);
  await frame(500);
  assert.deepEqual(
    visibleTexts(await state()),
    ['Line 1', 'Line 2'],
    'Backward seek restores the window',
  );

  settings = { ...settings, visibleLines: 0 };
  await load();
  await frame(1000);
  assert(visibleTexts(await state()).length > 2, 'Unlimited fills the available area');

  ttml = ttmlDocument(`
    <p ttm:agent="v1" begin="0s" end="4s"><span begin="0s" end="4s">Primary</span></p>
    <p ttm:agent="v2" begin="2s" end="6s"><span begin="2s" end="6s">Duet</span></p>
    <p ttm:agent="v1" begin="3s" end="7s"><span begin="3s" end="7s">Third singer</span></p>
    <p begin="8s" end="10s"><span begin="8s" end="10s">Next verse</span></p>
    <p begin="10s" end="12s"><span begin="10s" end="12s">Later verse</span></p>`);
  settings = { ...settings, visibleLines: 2, height: 0, bottom: 10 };
  await load();
  await frame(1000);
  const normal = await state();
  assert(normal.height < 250, JSON.stringify(normal));
  await frame(3500);
  const expanded = await state();
  assert.deepEqual(
    visibleTexts(expanded),
    ['Primary', 'Duet', 'Third singer'],
    JSON.stringify(expanded),
  );
  assert(expanded.height > normal.height && expanded.top < normal.top);
  assert(Math.abs(expanded.bottom - normal.bottom) < 1, 'Expansion preserves the bottom margin');
  for (const line of expanded.lines.filter((line) => line.visible))
    assert(
      line.top >= expanded.top && line.bottom <= expanded.bottom,
      JSON.stringify({ line, expanded }),
    );
  await frame(6500);
  assert(Math.abs((await state()).height - normal.height) < 1, 'Area contracts after overlap');

  await frame(1000);
  await advance(1000, 3700);
  assert.deepEqual(
    visibleTexts(await state()),
    ['Primary', 'Duet', 'Third singer'],
    'Continuous playback admits every overlapping singer',
  );

  // The optimized export clone must match the full DOM clone during expansion.
  const pixels: string[] = [];
  for (const full of [true, false]) {
    // html-to-image caches its style property list for the document lifetime.
    await load();
    await frame(3500);
    pixels.push(
      await page.evaluate(async (full) => {
        const snapshot = (
          window as unknown as {
            snapshotLyrics(stage: HTMLElement, full: boolean): Promise<HTMLImageElement>;
          }
        ).snapshotLyrics;
        const image = await snapshot(document.getElementById('stage')!, full);
        const canvas = document.createElement('canvas');
        canvas.width = 960;
        canvas.height = 540;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const digest = await crypto.subtle.digest('SHA-256', ctx.getImageData(0, 0, 960, 540).data);
        return Array.from(new Uint8Array(digest)).join(',');
      }, full),
    );
  }
  assert.equal(pixels[0], pixels[1], 'Expanded export snapshots match');

  settings = { ...settings, height: 20 };
  await load();
  await frame(3500);
  const capped = await state();
  assert(capped.height < expanded.height, 'A height cap clips lower rows');
  assert(
    capped.lines[0]!.top >= capped.top && capped.lines[0]!.bottom <= capped.bottom,
    'First line remains visible',
  );

  ttml = ttmlDocument(`
    <p begin="0s" end="2s"><span begin="0s" end="2s">Lead</span><span ttm:role="x-bg" begin="1s" end="5s"><span begin="1s" end="5s">Echo</span></span></p>
    <p begin="5s" end="7s"><span begin="5s" end="7s">Next</span></p>
    <p begin="7s" end="9s"><span begin="7s" end="9s">Later</span></p>`);
  settings = { ...settings, height: 0 };
  await load();
  await frame(1500);
  assert.deepEqual(visibleTexts(await state()), ['Lead', 'Echo', 'Next']);
  await frame(3500);
  assert.deepEqual(
    visibleTexts(await state()),
    ['Echo', 'Next'],
    'Continuing background keeps the primary group slot',
  );

  // A background vocal the viewer cannot see must not hold an empty row open.
  ttml = ttmlDocument(`
    <p begin="1s" end="9s"><span begin="1s" end="9s">Carrier</span><span ttm:role="x-bg" begin="1s" end="3s"><span begin="1s" end="3s">Brief echo</span></span></p>
    <p begin="10s" end="12s"><span begin="10s" end="12s">Follower</span></p>`);
  await load();
  const rowHeight = (text: string) =>
    page.evaluate((text) => {
      const main = Array.from(
        document.querySelectorAll<HTMLElement>('[class*="_lyricMainLine"]'),
      ).find((el) => el.textContent?.trim() === text)!;
      return main.closest<HTMLElement>('[class*="_lyricLineWrapper"]')!.offsetHeight;
    }, text);
  await frame(500);
  const dormant = await rowHeight('Carrier');
  await frame(2000);
  const singing = await rowHeight('Carrier');
  assert(singing > dormant, `An audible background takes a row: ${singing} vs ${dormant}`);
  await frame(3600);
  assert.equal(
    await rowHeight('Carrier'),
    dormant,
    'A finished background releases its row while its primary keeps singing',
  );
  await advance(3600, 5000);
  assert.equal(await rowHeight('Carrier'), dormant, 'Playback releases the row too');

  ttml = ttmlDocument(`
    <p ttm:agent="v1" begin="0s" end="10s"><span begin="0s" end="10s">A longer lyric sentence that wraps onto several rows inside a narrow video</span></p>
    <p ttm:agent="v2" begin="0s" end="10s"><span begin="0s" end="10s">Another singer has a longer sentence that must also fit above the bottom margin</span></p>
    <p begin="10s" end="12s"><span begin="10s" end="12s">Upcoming</span></p>`);
  settings = { ...settings, height: 0, horizontalMargin: 30, visibleLines: 1 };
  await load();
  await frame(2000);
  const wrapped = await state();
  assert.equal(
    visibleTexts(wrapped).length,
    2,
    'Wrapped entries count once and both active singers bypass a limit of one',
  );
  assert(wrapped.height > 540 * 0.12 && wrapped.top >= 0);
  for (const line of wrapped.lines.filter((line) => line.visible))
    assert(
      line.top >= wrapped.top && line.bottom <= wrapped.bottom,
      JSON.stringify({ line, wrapped }),
    );

  settings = { ...settings, height: 1 };
  await load();
  await frame(2000);
  const tiny = await state();
  assert(Math.abs(tiny.height - 5.4) < 0.1, 'A 1% cap is enforced even when a line cannot fit');

  settings = { ...settings, height: 0, fontSize: 15 };
  await load();
  await frame(2000);
  assert(
    Math.abs((await state()).top) < 1,
    'Extreme overflow stops expansion at the top of the video',
  );
  // A background can start before both its primary and the previous entry.
  ttml = ttmlDocument(`
    <p begin="2s" end="4s"><span begin="2s" end="4s">Previous</span></p>
    <p begin="5s" end="7s"><span begin="5s" end="7s">Main</span><span ttm:role="x-bg" begin="1s" end="5s"><span begin="1s" end="3s">Early </span><span begin="3s" end="5s">echo</span></span></p>
    <p begin="7s" end="9s"><span begin="7s" end="9s">Next</span></p>`);
  settings = { ...defaults, font: 'sans' };
  await load();
  await advance(0, 1200);
  async function backgroundFill() {
    return page.evaluate(() => {
      const line = document.querySelector<HTMLElement>('[class*="_lyricBgLine"]')!;
      const style = getComputedStyle(line);
      const word = line.querySelector<HTMLElement>('span[style*="mask-image"]')!;
      return {
        bright: Number(style.getPropertyValue('--bright-mask-alpha')),
        dark: Number(style.getPropertyValue('--dark-mask-alpha')),
        position: parseFloat(getComputedStyle(word).maskPosition),
      };
    });
  }
  const early = await backgroundFill();
  assert(
    early.bright - early.dark > 0.5,
    'Early background highlight has contrast during its entrance',
  );
  await advance(1217, 1700);
  assert(
    (await backgroundFill()).position > early.position,
    'Early background word fill progresses before its primary starts',
  );
  await frame(500);
  await advance(500, 1200);
  assert((await backgroundFill()).bright > 0.9, 'Backward seeks restore early vocal highlighting');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: count limit, bottom entry, unlimited, duet overlap, height cap, background vocals, seeking, and export snapshot parity',
  );
} finally {
  await browser.close();
}
