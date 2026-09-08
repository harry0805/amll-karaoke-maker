import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const origin = process.argv[2] || 'http://127.0.0.1:3210';
  let settings = { ...defaults, offset: 60000, shade: 0 };
  const ttml = '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="12s" end="14s"><span begin="12s" end="14s">First line</span></p></div></body></tt>';
  await page.route('**/test-config/intro/config', route => route.fulfill({ json: { ttml, settings } }));
  async function load() {
    await page.goto(`${origin}/render?job=intro`);
    await page.waitForFunction(() => window.rendererReady || window.rendererError);
    assert.equal(await page.evaluate(() => window.rendererError), undefined);
  }
  async function opacity(time: number) {
    await page.evaluate(time => window.renderFrame(time, 0), time);
    return page.locator('#lyrics').evaluate(el => Number(getComputedStyle(el).opacity));
  }
  await load();
  assert.equal(await opacity(0), 0);
  assert.equal(await opacity(59999), 0);
  assert.equal(await opacity(60000), 0);
  assert.equal(await opacity(60125), 0.5);
  assert.equal(await opacity(60250), 1);
  assert.equal(await opacity(66000), 1);
  assert.equal(await page.locator('[class*="_interludeDots"]').evaluate(el => getComputedStyle(el).opacity), '1', 'Prelude dots remain visible before the first sung line');
  assert.equal(await opacity(30000), 0, 'Seeking back hides the display again');
  assert.equal(await opacity(60125), 0.5, 'Seeking into the fade restores its exact progress');
  settings = { ...settings, showLyricsBeforeStart: true };
  await load();
  assert.equal(await opacity(0), 1);
  settings = { ...settings, showLyricsBeforeStart: false, offset: 0 };
  await load();
  assert.equal(await opacity(0), 1, 'No offset preserves normal prelude behavior');
  settings = { ...settings, offset: -6000 };
  await load();
  assert.equal(await opacity(0), 1);
  assert.equal(await page.locator('[class*="_interludeDots"]').evaluate(el => getComputedStyle(el).opacity), '1');
  await page.goto(origin);
  await page.getByRole("tab", { name: "Source", exact: true }).click();
  const toggle = page.getByLabel('Show lyrics before start', { exact: true });
  assert.equal(await toggle.isChecked(), false);
  await toggle.check();
  assert.equal(await toggle.isChecked(), true);
  assert.equal(await page.locator('#error').textContent(), '');
  console.log('PASS: offset lead-in, deterministic fade, seeking, toggle, and normal prelude dots');
} finally { await browser.close(); }
