// Optional TTML paths exercise the same continuity contract on real songs.
import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';
import type { LyricWindowEntry } from '../src/lyric-window';
import { LYRIC_FADE_MS } from '../src/lyric-motion';

const origin = process.argv[2] || 'http://127.0.0.1:3210';
const fixtures = [
  {
    name: 'delayed background after the primary finishes',
    ttml: `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><div>
      <p begin="1s" end="3s"><span begin="1s" end="2s">Lead </span><span begin="2s" end="3s">vocal</span><span ttm:role="x-bg" begin="5s" end="7s"><span begin="5s" end="6s">Delayed </span><span begin="6s" end="7s">echo</span></span></p>
      <p begin="7s" end="9s"><span begin="7s" end="9s">Next verse</span></p>
      </div></body></tt>`,
  },
];
for (const path of process.argv.slice(3))
  fixtures.push({ name: path, ttml: await Bun.file(path).text() });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const fixture of fixtures) {
    await page.route('**/test-config/background-continuity/config', (route) =>
      route.fulfill({ json: { ttml: fixture.ttml, settings: { ...defaults, font: 'sans' } } }),
    );
    await page.goto(`${origin}/render?job=background-continuity`);
    await page.waitForFunction(() => window.rendererReady || window.rendererError);
    assert.equal(await page.evaluate(() => window.rendererError), undefined);
    const result = await page.evaluate(async (fade) => {
      const entries = (window as unknown as { lyricTestIntervals: LyricWindowEntry[] })
        .lyricTestIntervals;
      const groups = (window as unknown as { lyricTestGroups: HTMLElement[] }).lyricTestGroups;
      const backgrounds = entries.flatMap((entry, index) =>
        entry.background ? [{ entry, index, background: entry.background }] : [],
      );
      const failures: object[] = [];
      let samples = 0;
      for (const { entry, index, background } of backgrounds) {
        const start = Math.min(entry.main.start, background.start);
        await window.renderFrame(start, 0);
        const group = groups[index]!;
        const line = group.querySelector<HTMLElement>(
          '[class*="_lyricBgLine"] [class*="_lyricMainLine"]',
        )!;
        const visible = () => {
          let alpha = 1;
          for (let el: HTMLElement | null = line; el; el = el.parentElement) {
            const css = getComputedStyle(el);
            if (css.visibility === 'hidden' || css.display === 'none') return false;
            alpha *= Number(css.opacity);
          }
          const range = document.createRange();
          range.selectNodeContents(line);
          const box = range.getBoundingClientRect();
          const viewport = document.getElementById('lyrics')!.getBoundingClientRect();
          return (
            line.isConnected &&
            alpha > 0.01 &&
            box.top >= viewport.top &&
            box.bottom <= viewport.bottom
          );
        };
        let appeared = false;
        for (let time = start; time < background.end; time += 1000 / 30) {
          await window.renderFrame(time, 1000 / 30);
          const shown = visible();
          if (shown) appeared = true;
          if ((!shown && appeared) || (!shown && time >= background.start + 400)) {
            failures.push({ index, time, main: entry.main, background });
            break;
          }
          samples++;
        }
        if (!appeared) failures.push({ index, reason: 'Background never appeared' });
        // A seek into the silent gap must reconstruct the same visible row.
        if (background.start > entry.main.end + fade) {
          await window.renderFrame((entry.main.end + background.start) / 2, 0);
          if (!visible()) failures.push({ index, reason: 'Hidden when seeking into the gap' });
        }
        await window.renderFrame(background.end + fade, 0);
        if (line.isConnected && getComputedStyle(line.parentElement!).visibility !== 'hidden')
          failures.push({ index, reason: 'Background remains after its own fade' });
      }
      return { backgrounds: backgrounds.length, samples, failures };
    }, LYRIC_FADE_MS);
    assert(result.backgrounds > 0, 'Fixture needs background vocals');
    assert.deepEqual(result.failures, [], `${fixture.name}: ${JSON.stringify(result)}`);
    console.log(
      `PASS: ${fixture.name}, ${result.backgrounds} backgrounds, ${result.samples} frames`,
    );
    await page.unroute('**/test-config/background-continuity/config');
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
