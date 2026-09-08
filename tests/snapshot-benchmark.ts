import { benchmarkLyrics } from './snapshot-fixture';
import { chromium } from 'playwright';
import { defaults } from '../src/settings';
const origin = process.argv[2] || 'http://127.0.0.1:3210';
const ttml = await benchmarkLyrics();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  await page.route('**/test-config/benchmark/config', (r) =>
    r.fulfill({
      json: {
        ttml,
        settings: {
          ...defaults,
          outlineWidth: process.env.OUTLINE === '0' ? 0 : defaults.outlineWidth,
        },
      },
    }),
  );
  await page.goto(`${origin}/render?job=benchmark`);
  await page.waitForFunction(() => window.rendererReady || window.rendererError);
  const result = await page.evaluate(async (fullTree) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;
    const stage = document.getElementById('stage')!;
    let frameMs = 0,
      snapshotMs = 0,
      drawMs = 0;
    const count = 20;
    for (let i = 0; i < count; i++) {
      let start = performance.now();
      await window.renderFrame(40000 + (i * 1000) / 30, 1000 / 30);
      frameMs += performance.now() - start;
      start = performance.now();
      const img = await (window as any).snapshotLyrics(stage, fullTree);
      snapshotMs += performance.now() - start;
      start = performance.now();
      ctx.clearRect(0, 0, 1920, 1080);
      ctx.drawImage(img, 0, 0);
      ctx.getImageData(0, 0, 1, 1);
      drawMs += performance.now() - start;
    }
    return {
      nodes: stage.querySelectorAll('*').length,
      count,
      frameMs: frameMs / count,
      snapshotMs: snapshotMs / count,
      drawMs: drawMs / count,
      fps: (count * 1000) / (frameMs + snapshotMs + drawMs),
    };
  }, process.env.FULL_TREE === '1');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
