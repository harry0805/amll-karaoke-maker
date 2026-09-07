// Checks the offline rendering contract, without interacting with the editor UI.
import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults, fonts } from '../src/settings';
const origin = process.argv[2] || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const ttml = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent xml:id="v1" type="person"/><ttm:agent xml:id="v2" type="person"/></metadata></head><body><div>
    <p ttm:agent="v1" begin="0s" end="1.8s"><span begin="0s" end="0.8s">Golden </span><span begin="0.8s" end="1.8s">words</span><span ttm:role="x-bg" begin="0.5s" end="3s"><span begin="0.5s" end="3s">Echo</span></span></p>
    <p ttm:agent="v2" begin="3.2s" end="4s"><span begin="3.2s" end="4s">Next line</span></p>
  </div></body></tt>`;
  let settings = { ...defaults, fontSize: 4.4, bottom: 4, height: 32, textColor: '#ffd45a', duetColor: '#7dd3fc', outlineColor: '#14141c', outlineWidth: 8, offset: 500 };
  await page.route('**/test-config/style-test/config', route => route.fulfill({ json: { ttml, settings } }));
  async function load() {
    await page.goto(`${origin}/render?job=style-test`);
    await page.waitForFunction(() => window.rendererReady || window.rendererError);
    assert.equal(await page.evaluate(() => window.rendererError), undefined);
  }
  async function visibleAt(time: number) {
    await page.evaluate(time => window.renderFrame(time, 1000 / 30), time);
    return page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[class*="_lyricMainLine"]')).filter(el => getComputedStyle(el).visibility === 'visible').map(el => el.textContent?.trim()));
  }
  await load();
  const colors = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="_lyricMainLine"]')).map(el => getComputedStyle(el).color));
  assert.deepEqual(colors, ['rgb(255, 212, 90)', 'rgb(255, 212, 90)', 'rgb(125, 211, 252)'], 'Only duet lines should use the duet color');
  assert((await visibleAt(2299)).includes('Golden words'));
  const atEnd = await visibleAt(2300);
  assert(atEnd.includes('Golden words'), 'Fade should begin without an instant cut');
  assert(atEnd.includes('Echo'), 'Background vocal must retain its own timing');
  await visibleAt(2425);
  const halfway = await page.evaluate(() => document.querySelector('[class*="_lyricMainLine"]')!.parentElement!.style.filter);
  assert(halfway.includes('opacity(0.5)'), 'Line should be halfway faded after 125 ms');
  assert(!(await visibleAt(2550)).includes('Golden words'), 'Main fade should finish independently of background vocals');
  assert(!(await visibleAt(3750)).includes('Echo'), 'Background vocal should finish its own fade');
  assert((await visibleAt(1000)).includes('Golden words'), 'Seeking backward must restore the line');
  assert.deepEqual(await visibleAt(4750), [], 'Nothing should linger after the last fade');
  await visibleAt(1600);
  await page.screenshot({ path: '/tmp/karaoke-style-check.png', omitBackground: true });
  for (const font of Object.keys(fonts) as (keyof typeof fonts)[]) {
    settings = { ...settings, font };
    await load();
    await visibleAt(1600);
    const style = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[class*="_lyricMainLine"]')!;
      const css = getComputedStyle(el);
      return { color: css.color, stroke: css.webkitTextStrokeWidth, font: css.fontFamily, filter: css.filter,
        radius: document.querySelector('feMorphology')!.getAttribute('radius'),
        outlineColor: document.querySelector('feFlood')!.getAttribute('flood-color') };
    });
    assert.equal(style.color, 'rgb(255, 212, 90)');
    assert.equal(style.stroke, '0px', 'Word masks must not clip an inherited text stroke');
    assert.equal(style.outlineColor, '#14141c');
    assert(Math.abs(Number(style.radius) - 0.9504) < 0.01, JSON.stringify(style));
    assert(style.filter.includes('lyric-outline-'));
    assert(style.font.includes(fonts[font].split(',')[0]!.replaceAll('"', '')), JSON.stringify(style));
  }
  settings = { ...settings, textColor: '#12abef', duetColor: '#ff44aa', outlineWidth: 0 };
  await load();
  await visibleAt(1600);
  const off = await page.evaluate(() => {
    const css = getComputedStyle(document.querySelector('[class*="_lyricMainLine"]')!);
    return { color: css.color, stroke: css.webkitTextStrokeWidth, filter: css.filter };
  });
  assert.equal(off.color, 'rgb(18, 171, 239)');
  assert.equal(off.stroke, '0px');
  assert.equal(off.filter, 'none');
  for (const horizontalMargin of [0, 15, 30]) {
    settings = { ...settings, horizontalMargin };
    await load();
    const box = await page.evaluate(() => {
      const stage = document.getElementById('stage')!.getBoundingClientRect();
      const lyrics = document.getElementById('lyrics')!.getBoundingClientRect();
      return { left: (lyrics.left - stage.left) / stage.width, right: (stage.right - lyrics.right) / stage.width };
    });
    assert(Math.abs(box.left - horizontalMargin / 100) < 0.001);
    assert(Math.abs(box.right - horizontalMargin / 100) < 0.001);
  }
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[class*="_lyricDuetLine"]')!).color), 'rgb(255, 68, 170)');
  console.log('PASS: exact end cutoffs, independent background vocals, offset, backward seeking, fonts, colors, and outline off');
} finally { await browser.close(); }
