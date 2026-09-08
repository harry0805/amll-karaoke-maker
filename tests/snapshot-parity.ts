import { benchmarkLyrics } from './snapshot-fixture';
import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';
const browser = await chromium.launch();
const origin = process.argv[2] || 'http://127.0.0.1:3210';
const ttml = await benchmarkLyrics();
try {
  const hashes: string[][] = [];
  // html-to-image caches its CSS property list for the document lifetime.
  // Use separate documents so the full reference never inherits the shortlist.
  for (const fullTree of [true, false]) {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    let settings = { ...defaults };
    await page.route('**/test-config/parity/config', (r) =>
      r.fulfill({ json: { ttml, settings } }),
    );
    const results: string[] = [];
    for (const config of [
      defaults,
      { ...defaults, fontSize: 8, height: 20, lineSpacing: 0.75, outlineWidth: 12, bottom: 20 },
      { ...defaults, font: 'serif', height: 50, lineSpacing: 2, horizontalMargin: 30 },
    ] as const) {
      settings = { ...config };
      await page.goto(`${origin}/render?job=parity`);
      await page.waitForFunction(() => window.rendererReady || window.rendererError);
      results.push(
        ...(await page.evaluate(async (fullTree) => {
          const stage = document.getElementById('stage')!;
          const hashes: string[] = [];
          for (const time of [
            0, 8000, 38800, 38833, 38866, 38900, 39000, 39100, 40000, 40800, 56500, 56850, 57200,
            90000, 140000,
          ]) {
            await window.renderFrame(time, 1000 / 30);
            const img = await (window as any).snapshotLyrics(stage, fullTree);
            const c = document.createElement('canvas');
            c.width = 1920;
            c.height = 1080;
            const ctx = c.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            const digest = await crypto.subtle.digest(
              'SHA-256',
              ctx.getImageData(0, 0, 1920, 1080).data,
            );
            hashes.push(
              Array.from(new Uint8Array(digest))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join(''),
            );
          }
          return hashes;
        }, fullTree)),
      );
    }
    hashes.push(results);
    await page.close();
  }
  assert.deepEqual(hashes[1], hashes[0]);
  console.log(
    'PASS: optimized snapshots exactly match full-tree snapshots across 45 timing/style cases at 1080p',
  );
} finally {
  await browser.close();
}
