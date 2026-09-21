// Optional arguments after the origin are read-only TTML fixture paths.
import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';
import type { LyricWindowEntry } from '../src/lyric-window';
import { LYRIC_FADE_MS } from '../src/lyric-motion';

const browser = await chromium.launch();
const origin = process.argv[2] || 'http://127.0.0.1:3210';
const ttmlDocument = (body: string) =>
  `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><div>${body}</div></body></tt>`;
const fixtures = [
  {
    name: 'backgrounds, gaps, overlap and final fade',
    ttml: ttmlDocument(`
<p begin="3s" end="8s"><span begin="3s" end="8s">Long first singer</span><span ttm:role="x-bg" begin="2s" end="9s"><span begin="2s" end="9s">Early background</span></span></p>
<p begin="4s" end="5s"><span begin="4s" end="5s">Short second singer</span></p>
<p begin="6s" end="7s"><span begin="6s" end="7s">Following singer</span></p>
<p begin="15s" end="17s"><span begin="15s" end="17s">Final primary</span><span ttm:role="x-bg" begin="16s" end="19s"><span begin="16s" end="19s">Final background</span></span></p>`),
  },
];
for (const path of process.argv.slice(3))
  fixtures.push({ name: path.split('/').pop()!, ttml: await Bun.file(path).text() });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const fixture of fixtures) {
    for (const height of [0, 20]) {
      await page.route('**/test-config/motion/config', (route) =>
        route.fulfill({
          json: { ttml: fixture.ttml, settings: { ...defaults, font: 'sans', height } },
        }),
      );
      await page.goto(`${origin}/render?job=motion`);
      await page.waitForFunction(() => window.rendererReady || window.rendererError);
      assert.equal(await page.evaluate(() => window.rendererError), undefined);
      const result = await page.evaluate(async (fade) => {
        const entries = (window as unknown as { lyricTestIntervals: LyricWindowEntry[] })
          .lyricTestIntervals;
        const boundaries = [
          ...new Set(
            entries
              .flatMap((entry) => [
                entry.main.start,
                entry.main.end,
                entry.background?.start,
                entry.background?.end,
                // A vocal releases its row here, background wrappers included.
                entry.main.end + fade,
                entry.background === undefined ? undefined : entry.background.end + fade,
              ])
              .filter((t): t is number => t !== undefined),
          ),
        ].sort((a, b) => a - b);
        const snapshot = () =>
          Array.from(
            document.querySelectorAll<HTMLElement>(
              '[class*="_lyricMainLine"], [class*="_interludeDots"]',
            ),
          ).map((group) => ({
            element: group,
            top: group.getBoundingClientRect().top,
            visible:
              getComputedStyle(group).visibility !== 'hidden' &&
              Number(getComputedStyle(group).opacity) > 0 &&
              group.getBoundingClientRect().bottom > 0 &&
              group.getBoundingClientRect().top < 540,
          }));
        const jumps: object[] = [];
        let maximum = 0;
        for (const boundary of boundaries) {
          await window.renderFrame(Math.max(0, boundary - 400), 0);
          for (let t = Math.max(0, boundary - 383); t < boundary; t += 17)
            await window.renderFrame(t, 17);
          await window.renderFrame(Math.max(0, boundary - 0.01), 0);
          const before = snapshot();
          await window.renderFrame(boundary + 0.01, 0);
          const after = snapshot();
          for (const old of before) {
            const current = after.find((row) => row.element === old.element);
            if (!current || !old.visible || !current.visible) continue;
            const distance = Math.abs(current.top - old.top);
            maximum = Math.max(maximum, distance);
            if (distance > 1)
              jumps.push({ boundary, distance, text: old.element.textContent?.slice(0, 45) });
          }
          // Give ResizeObserver its usual opportunity to disturb AMLL's layout.
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          await window.renderFrame(boundary + 17, 17);
        }
        return { boundaries: boundaries.length, maximum, jumps: jumps.slice(0, 10) };
      }, LYRIC_FADE_MS);
      assert.deepEqual(
        result.jumps,
        [],
        `${fixture.name}, height ${height}: ${JSON.stringify(result)}`,
      );
      console.log(
        `PASS: ${fixture.name}, height ${height}, ${result.boundaries} boundaries, max zero-delta movement ${result.maximum.toFixed(2)}px`,
      );
      if (fixture === fixtures[0]) {
        const fade = await page.evaluate(async () => {
          await window.renderFrame(4500, 0);
          for (let t = 4517; t <= 4993; t += 17) await window.renderFrame(t, 17);
          const find = (text: string) =>
            Array.from(document.querySelectorAll<HTMLElement>('[class*="_lyricMainLine"]')).find(
              (el) => el.textContent?.trim() === text,
            )!;
          const outgoing = find('Short second singer').parentElement!;
          const incoming = find('Following singer');
          const before = outgoing.getBoundingClientRect().top;
          const incomingBefore = incoming.getBoundingClientRect().top;
          for (let t = 5010; t <= 5130; t += 17) await window.renderFrame(t, 17);
          return {
            before,
            after: outgoing.getBoundingClientRect().top,
            scale: Number(outgoing.style.scale),
            filter: outgoing.style.filter,
            incomingBefore,
            incomingAfter: incoming.getBoundingClientRect().top,
          };
        });
        assert(Math.abs(fade.before - fade.after) < 1, JSON.stringify(fade));
        assert(fade.scale < 1 && fade.scale > 0.95, JSON.stringify(fade));
        if (height === 0)
          assert(
            fade.incomingAfter < fade.incomingBefore - 1,
            'Incoming line moves while the outgoing line fades',
          );
        if (process.env.LYRIC_SCREENSHOT && height === 0)
          await page.screenshot({ path: process.env.LYRIC_SCREENSHOT });
        const finalFade = await page.evaluate(async () => {
          await window.renderFrame(19100, 0);
          const main = Array.from(
            document.querySelectorAll<HTMLElement>('[class*="_lyricMainLine"]'),
          ).find((el) => el.textContent?.trim() === 'Final background')!.parentElement!;
          const before = main.getBoundingClientRect().top;
          await window.renderFrame(19117, 17);
          const after = main.getBoundingClientRect().top;
          const visible = getComputedStyle(main).visibility;
          await window.renderFrame(19300, 0);
          return { before, after, visible, ended: getComputedStyle(main).visibility };
        });
        assert(finalFade.before >= 0 && finalFade.before < 540, JSON.stringify(finalFade));
        assert(Math.abs(finalFade.before - finalFade.after) < 1, JSON.stringify(finalFade));
        assert.equal(finalFade.visible, 'visible');
        assert.equal(finalFade.ended, 'hidden');
      }
      await page.unroute('**/test-config/motion/config');
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
