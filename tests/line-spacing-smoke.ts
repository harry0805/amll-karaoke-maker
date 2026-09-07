import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const ttml = `<tt xmlns="http://www.w3.org/ns/ttml"><body><div>${Array.from({ length: 16 }, (_, i) => `<p begin="${i * 2}s" end="${i * 2 + 2}s"><span begin="${i * 2}s" end="${i * 2 + 2}s">Line ${i + 1}</span></p>`).join('')}</div></body></tt>`;
  let settings = { ...defaults, fontSize: 3, height: 50, lineSpacing: 0.75 };
  await page.route('**/api/jobs/spacing-test/config', route => route.fulfill({ json: { ttml, settings } }));
  async function load() {
    await page.goto(`${process.argv[2] || 'http://127.0.0.1:3210'}/render?job=spacing-test`);
    await page.waitForFunction(() => window.rendererReady || window.rendererError);
    assert.equal(await page.evaluate(() => window.rendererError), undefined);
    await page.evaluate(async () => {
      await window.renderFrame(100, 0);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      await window.renderFrame(100, 0);
    });
  }
  async function rows() {
    return page.evaluate(() => {
      const box = document.getElementById('lyrics')!.getBoundingClientRect();
      return Array.from(document.querySelectorAll('[class*="_lyricMainLine"]')).map(el => {
        const rect = el.parentElement!.getBoundingClientRect();
        return { text: el.textContent?.trim(), y: rect.top - box.top, height: rect.height, boxHeight: box.height, visible: getComputedStyle(el).visibility };
      });
    });
  }
  await load();
  const compact = await rows();
  assert(compact.filter(row => row.visible === 'visible' && row.y >= 0 && row.y + row.height < row.boxHeight).length > 3, 'More than three lines should fill the available space');
  const upcoming = compact.find(row => row.y > row.boxHeight && row.visible === 'visible');
  assert(upcoming, JSON.stringify(compact));
  await page.evaluate(async () => {
    for (let t = 100; t < 7000; t += 1000 / 30) await window.renderFrame(t, 1000 / 30);
  });
  const entered = (await rows()).find(row => row.text === upcoming.text);
  assert(entered && entered.y < upcoming.y && entered.y < entered.boxHeight, 'An offscreen line should slide into the area');
  settings = { ...settings, lineSpacing: 2 };
  await load();
  const spacious = await rows();
  assert(spacious[1]!.y - spacious[0]!.y > (compact[1]!.y - compact[0]!.y) * 1.5, 'Line spacing must affect measured row positions');
  console.log('PASS: more than three visible lines, offscreen upcoming lines, scrolling entry, and line spacing');
} finally { await browser.close(); }
