import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('recordWindowError', (message: string) => errors.push(message));
  await page.addInitScript(() => {
    window.addEventListener('error', event => {
      (window as unknown as { recordWindowError(message: string): void }).recordWindowError(event.message);
    });
  });
  const ttml = `<tt xmlns="http://www.w3.org/ns/ttml"><body><div>${Array.from({ length: 40 }, (_, i) => `<p begin="${i * 2}s" end="${i * 2 + 2}s"><span begin="${i * 2}s" end="${i * 2 + 1}s">A longer line with words that wrap </span><span begin="${i * 2 + 1}s" end="${i * 2 + 2}s">when the lyric area changes size</span></p>`).join('')}</div></body></tt>`;
  await page.route('**/test-config/resize-test/config', route => route.fulfill({ json: { ttml, settings: defaults } }));
  await page.goto(`${process.argv[2] || 'http://127.0.0.1:3210'}/render?job=resize-test`);
  await page.waitForFunction(() => window.rendererReady || window.rendererError);
  assert.equal(await page.evaluate(() => window.rendererError), undefined);
  await page.evaluate(async () => {
    for (let i = 0; i < 70; i++) {
      const box = document.getElementById('lyrics')!;
      box.style.width = `${40 + i % 6 * 10}%`;
      box.style.height = `${20 + i % 4 * 10}%`;
      const player = box.firstElementChild as HTMLElement;
      player.style.setProperty('--amll-lp-font-size', `${3 + i % 5}cqh`);
      await window.renderFrame((i * 7193) % 78000, 16);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }
  });
  assert.deepEqual(errors, [], `Renderer errors during resize/seek: ${errors.join(', ')}`);
  console.log('PASS: repeated seeking and lyric size changes without browser errors');
} finally { await browser.close(); }
