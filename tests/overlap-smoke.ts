import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const ttml = `<tt xmlns="http://www.w3.org/ns/ttml"><body><div>
    <p begin="0s" end="2s"><span begin="0s" end="2s">Short first line</span></p>
    <p begin="0s" end="5s"><span begin="0s" end="5s">Long second line</span></p>
    <p begin="5s" end="7s"><span begin="5s" end="7s">Upcoming third line</span></p>
  </div></body></tt>`;
  await page.route('**/api/jobs/overlap-test/config', route => route.fulfill({ json: { ttml, settings: { ...defaults, height: 20 } } }));
  await page.goto(`${process.argv[2] || 'http://127.0.0.1:3210'}/render?job=overlap-test`);
  await page.waitForFunction(() => window.rendererReady || window.rendererError);
  assert.equal(await page.evaluate(() => window.rendererError), undefined);
  async function position(text: string) {
    return page.evaluate(text => {
      const main = Array.from(document.querySelectorAll('[class*="_lyricMainLine"]')).find(el => el.textContent?.trim() === text)!;
      const box = document.getElementById('lyrics')!.getBoundingClientRect();
      const line = main.parentElement!.getBoundingClientRect();
      return { y: line.top - box.top, height: line.height, boxHeight: box.height, visible: getComputedStyle(main).visibility };
    }, text);
  }
  await page.evaluate(async () => { for (let t = 0; t < 1800; t += 1000 / 30) await window.renderFrame(t, 1000 / 30); });
  const first = await position('Short first line');
  const secondBefore = await position('Long second line');
  await page.evaluate(async () => { for (let t = 1800; t <= 3100; t += 1000 / 30) await window.renderFrame(t, 1000 / 30); });
  const secondAfter = await position('Long second line');
  assert.equal((await position('Short first line')).visible, 'hidden');
  assert(secondAfter.y < secondBefore.y - 10, JSON.stringify({ first, secondBefore, secondAfter }));
  assert(Math.abs(secondAfter.y - first.y) < 5, 'Remaining active line should take the first line position');
  assert(secondAfter.y < secondAfter.boxHeight * 0.25, 'Active line should be near the top');
  await page.evaluate(async () => { for (let t = 3100; t <= 6100; t += 1000 / 30) await window.renderFrame(t, 1000 / 30); });
  const third = await position('Upcoming third line');
  assert(Math.abs(third.y - first.y) < 5, JSON.stringify({ first, third }));
  await page.evaluate(() => window.renderFrame(1000, 0));
  assert.equal((await position('Short first line')).visible, 'visible');
  console.log('PASS: overlapping lines advance individually, top alignment, next line, and backward seek');
} finally { await browser.close(); }
