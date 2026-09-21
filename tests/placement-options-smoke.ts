import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';
import { LYRIC_FADE_MS } from '../src/lyric-motion';
const origin = process.argv[2] || 'http://127.0.0.1:3210';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  let settings = { ...defaults, font: 'sans' as const };
  const doc = (body: string) =>
    `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><div>${body}</div></body></tt>`;
  let ttml = doc(
    '<p begin="0s" end="2s"><span begin="0s" end="2s">Primary</span><span ttm:role="x-bg" begin="1s" end="5s"><span begin="1s" end="5s">Remaining background</span></span></p><p begin="5s" end="7s"><span begin="5s" end="7s">Next</span></p>',
  );
  await page.route('**/test-config/placement/config', (route) =>
    route.fulfill({ json: { ttml, settings } }),
  );
  async function load() {
    await page.goto(`${origin}/render?job=placement`);
    await page.waitForFunction(() => window.rendererReady || window.rendererError);
    assert.equal(await page.evaluate(() => window.rendererError), undefined);
  }
  const frame = (t: number, delta = 0) =>
    page.evaluate(([t, d]) => window.renderFrame(t!, d!), [t, delta]);
  const row = (text: string) =>
    page.evaluate((text) => {
      const inner = [...document.querySelectorAll<HTMLElement>('[class*="_lyricMainLine"]')].find(
        (el) => el.textContent?.trim() === text,
      )!;
      const group = inner.closest<HTMLElement>('[class*="_lyricLineWrapper"]')!;
      return {
        top: inner.getBoundingClientRect().top,
        height: group.offsetHeight,
        groupTop: group.getBoundingClientRect().top,
        area: document.getElementById('lyrics')!.getBoundingClientRect().height,
      };
    }, text);
  await load();
  await frame(1500);
  const full = await row('Remaining background');
  await frame(2000 + LYRIC_FADE_MS - 0.01);
  const before = await row('Remaining background');
  await frame(2000 + LYRIC_FADE_MS + 0.01);
  const collapsed = await row('Remaining background');
  assert(collapsed.height < full.height - 20, 'Finished primary releases its row');
  assert(
    Math.abs(collapsed.top - before.top) < 1,
    'Background stays in place on the collapse frame',
  );
  await frame(3500);
  assert(
    (await row('Remaining background')).height < full.height - 20,
    'Seeking preserves the compact background-only row',
  );
  await frame(1500);
  assert.equal(
    (await row('Remaining background')).height,
    full.height,
    'Backward seeks restore the primary row',
  );

  settings = { ...settings, height: 1 };
  await load();
  for (let t = 0; t < 7300; t += 100) {
    await frame(t, 100);
    assert(
      (await row('Remaining background')).area <= 5.41,
      'Height cap applies during activation, fades, and resizing',
    );
  }
  ttml = doc(
    Array.from(
      { length: 8 },
      (_, i) =>
        `<p begin="${i * 2}s" end="${i * 2 + 2}s"><span begin="${i * 2}s" end="${i * 2 + 2}s">Line ${i + 1}</span></p>`,
    ).join(''),
  );
  settings = { ...settings, height: 100, visibleLines: 5, keepScrollNearEnd: false };
  await load();
  await frame(14500);
  const bottom = await row('Line 8');
  settings = { ...settings, keepScrollNearEnd: true };
  await load();
  await frame(6500);
  const windowTop = await row('Line 4');
  await frame(14500);
  const kept = await row('Line 8');
  assert(kept.top < bottom.top - 100, 'Final active line stays higher when enabled');
  assert(Math.abs(kept.top - windowTop.top) < 1, JSON.stringify({ kept, windowTop }));
  await frame(13500);
  for (let t = 13517; t <= 15100; t += 17) await frame(t, 17);
  assert(
    Math.abs((await row('Line 8')).top - kept.top) < 1,
    'Playback settles at the same position as a seek',
  );
  await frame(16050);
  const finalFade = await row('Line 8');
  assert(Math.abs(finalFade.groupTop - kept.groupTop) < 1, JSON.stringify({ finalFade, kept }));
  settings = { ...settings, height: 10 };
  await load();
  await frame(14500);
  assert((await row('Line 8')).area <= 54.01, 'End scrolling respects the strict cap');
  settings = { ...settings, height: 100, visibleLines: 0 };
  await load();
  await frame(14500);
  assert(
    (await row('Line 8')).top < 40,
    'Unlimited lines keep the final active line near the top of the full area',
  );
  console.log(
    'PASS: background-only spacing, strict 1% height, end scrolling, seek/fade consistency, and cap precedence',
  );
} finally {
  await browser.close();
}
