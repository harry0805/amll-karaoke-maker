import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  let settings = { ...defaults, outlineColor: '#ff4488', outlineWidth: 10, height: 20 };
  const ttml =
    '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="12s" end="14s"><span begin="12s" end="14s">First line</span></p><p begin="30s" end="32s"><span begin="30s" end="32s">Next line</span></p></div></body></tt>';
  await page.route('**/test-config/interlude-test/config', (route) =>
    route.fulfill({ json: { ttml, settings } }),
  );
  async function load() {
    await page.goto(`${process.argv[2] || 'http://127.0.0.1:3210'}/render?job=interlude-test`);
    await page.waitForFunction(() => window.rendererReady || window.rendererError);
    assert.equal(await page.evaluate(() => window.rendererError), undefined);
  }
  async function dotsAt(time: number) {
    await page.evaluate((time) => window.renderFrame(time, 0), time);
    return page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[class*="_interludeDots"]')!;
      const box = document.getElementById('lyrics')!.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return {
        opacity: getComputedStyle(el).opacity,
        dots: Array.from(el.children).map((el) => Number(getComputedStyle(el).opacity)),
        top: rect.top - box.top,
        bottom: rect.bottom - box.top,
        height: box.height,
        filter: getComputedStyle(el).filter,
        transform: el.style.transform,
      };
    });
  }
  await load();
  for (const time of [8000, 20000, 27000, 18000, 6000]) {
    const dots = await dotsAt(time);
    assert.equal(dots.opacity, '1');
    assert(
      dots.dots.some((opacity) => opacity > 0.2),
      JSON.stringify(dots),
    );
    assert(dots.top >= 0 && dots.bottom < dots.height, JSON.stringify(dots));
    assert(dots.filter.includes('lyric-outline-'));
  }
  const seek = await dotsAt(20000);
  await load();
  await page.evaluate(async () => {
    for (let time = 0; time < 20000; time += 1000 / 30) await window.renderFrame(time, 1000 / 30);
  });
  const played = await dotsAt(20000);
  assert.deepEqual(
    played.dots,
    seek.dots,
    'Dots should reflect the same media time during playback and seeking',
  );
  assert.equal((await dotsAt(12500)).opacity, '0', 'Dots should hide when lyrics resume');
  settings = { ...settings, outlineWidth: 0 };
  await load();
  assert.equal((await dotsAt(20000)).filter, 'none');
  console.log(
    'PASS: outlined dots, outline off, forward/backward interlude seeks, viewport placement, and playback parity',
  );
} finally {
  await browser.close();
}
