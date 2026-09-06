// Optional real-file reproduction: TTML_PATH=/path/to/file.ttml bun run tests/outline-smoke.ts
import { chromium } from 'playwright';
import { defaults } from '../src/settings';
import { strict as assert } from 'node:assert';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1 });
  const ttml = process.env.TTML_PATH ? await Bun.file(process.env.TTML_PATH).text() : `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0s" end="4s"><span begin="0s" end="1s">Out</span><span begin="1s" end="2s">lined </span><span begin="2s" end="4s">letters</span></p></div></body></tt>`;
  const settings = { ...defaults, textColor: '#ffffff', fontSize: 4, outlineColor: '#111111', outlineWidth: 10, shade: 0 };
  await page.route('**/api/jobs/outline-test/config', route => route.fulfill({ json: { ttml, settings } }));
  await page.goto(`${process.argv[2] || 'http://127.0.0.1:3210'}/render?job=outline-test`);
  await page.waitForFunction(() => window.rendererReady || window.rendererError);
  assert.equal(await page.evaluate(() => window.rendererError), undefined);
  await page.evaluate(() => { document.body.style.setProperty('background', '#8d5265', 'important'); });
  const times = process.env.TTML_PATH ? [56850, 56950, 57200] : [950, 1050, 2200];
  for (const time of times) {
    await page.evaluate(time => window.renderFrame(time, 1000 / 30), time);
    await page.screenshot({ path: `/tmp/karaoke-outline-${process.env.CAPTURE_LABEL || 'after'}-${time}.png` });
  }
  console.log('Rendered outline samples at', times);
} finally { await browser.close(); }
