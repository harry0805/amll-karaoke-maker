// Line-synced lyrics must retain contrast in both playback and exported snapshots.
import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';
import { LYRIC_FADE_MS, lyricFadeOpacity } from '../src/lyric-motion';

const origin = process.argv[2] || 'http://127.0.0.1:3210';
const ttmlDocument = (body: string) =>
  `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent xml:id="v1" type="person"/><ttm:agent xml:id="v2" type="person"/></metadata></head><body><div>${body}</div></body></tt>`;
let ttml = ttmlDocument(`
  <p ttm:agent="v1" begin="1s" end="3s">Singing in the evening</p>
  <p ttm:agent="v2" begin="3s" end="5s">Waiting for the next line</p>
  <p ttm:agent="v1" begin="5s" end="7s">Let the music carry on</p>`);
const settings = {
  ...defaults,
  font: 'sans',
  offset: 500,
  height: 0,
  fontSize: 7,
  bottom: 8,
  textColor: '#ffd45a',
  useDuetColors: true,
  duetColor: '#7dd3fc',
  outlineWidth: 0,
  duetOutlineWidth: 0,
  shade: 0,
};
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/test-config/line-synced/config', (route) =>
    route.fulfill({ json: { ttml, settings } }),
  );
  async function load() {
    await page.goto(`${origin}/render?job=line-synced`);
    await page.waitForFunction(() => window.rendererReady || window.rendererError);
    assert.equal(await page.evaluate(() => window.rendererError), undefined);
  }
  async function state(time: number) {
    await page.evaluate((time) => window.renderFrame(time, 0), time);
    return page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[class*="_lyricMainLine"]')).map(
        (main) => ({
          opacity: Number(getComputedStyle(main).opacity),
          color: getComputedStyle(main).color,
          filter: main.parentElement!.style.filter,
          visibility: main.parentElement!.style.visibility,
          maskedWords: main.querySelectorAll('[style*="mask-image"]').length,
        }),
      ),
    );
  }
  const opacities = (lines: Awaited<ReturnType<typeof state>>) => lines.map((l) => l.opacity);
  await load();
  assert.deepEqual(opacities(await state(1499)), [0.2, 0.2, 0.2]);
  assert.deepEqual(opacities(await state(1500)), [1, 0.2, 0.2]);
  const singing = await state(2500);
  assert.deepEqual(opacities(singing), [1, 0.2, 0.2]);
  assert.equal(singing[0]!.maskedWords, 0, 'Exercise plain line-synced text');
  assert.equal(singing[0]!.color, 'rgb(255, 212, 90)');
  assert.equal(singing[1]!.color, 'rgb(125, 211, 252)');

  // Export the real stage and measure glyph alpha inside each vocal's bounds.
  const exportedAlpha = await page.evaluate(async () => {
    const stage = document.getElementById('stage')!;
    const img = await (window as any).snapshotLyrics(stage);
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return Array.from(document.querySelectorAll('[class*="_lyricMainLine"]'))
      .slice(0, 2)
      .map((main) => {
        const range = document.createRange();
        range.selectNodeContents(main);
        const rect = range.getBoundingClientRect();
        const pixels = ctx.getImageData(
          Math.floor(rect.left),
          Math.floor(rect.top),
          Math.ceil(rect.width),
          Math.ceil(rect.height),
        ).data;
        let alpha = 0;
        for (let i = 3; i < pixels.length; i += 4) alpha = Math.max(alpha, pixels[i]!);
        return alpha;
      });
  });
  assert(exportedAlpha[0]! > 240, JSON.stringify(exportedAlpha));
  assert(exportedAlpha[1]! > 0 && exportedAlpha[1]! < 80, JSON.stringify(exportedAlpha));

  assert.deepEqual(opacities(await state(3500)), [1, 1, 0.2]);
  const fading = await state(3500 + LYRIC_FADE_MS / 2);
  assert(fading[0]!.filter.includes(`opacity(${lyricFadeOpacity(0.5)})`));
  assert.equal((await state(3500 + LYRIC_FADE_MS))[0]!.visibility, 'hidden');
  assert.deepEqual(opacities(await state(2500)), [1, 0.2, 0.2], 'Backward seek restores dimming');

  ttml = ttmlDocument(`
    <p begin="1s" end="4s"><span begin="1s" end="4s">Lead vocal</span><span ttm:role="x-bg" begin="2s" end="5s"><span begin="2s" end="5s">Echo vocal</span></span></p>
    <p begin="6s" end="8s"><span begin="6s" end="8s">Next vocal</span></p>`);
  await load();
  assert.deepEqual(opacities(await state(2000)), [1, 0.2, 0.2]);
  assert.deepEqual(opacities(await state(2500)), [1, 1, 0.2]);

  ttml = ttmlDocument(`
    <p begin="1s" end="3s"><span begin="1s" end="2s">Timed </span><span begin="2s" end="3s">words</span></p>
    <p begin="4s" end="6s"><span begin="4s" end="6s">Following line</span></p>`);
  await load();
  const words = await state(2500);
  assert(words[0]!.maskedWords > 0, 'Word-synced lyrics retain their word masks');
  assert.deepEqual(opacities(words), [1, 1], 'Word masks supply their own contrast');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: line-synced contrast, timing offset, seeks, fades, backgrounds, colors, export alpha and word-sync regression',
  );
} finally {
  await browser.close();
}
