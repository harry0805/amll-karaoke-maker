import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const ttml = '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0s" end="3s"><span begin="0s" end="0.6s">gypqj </span><span begin="0.6s" end="1.2s">Resting </span><span begin="1.2s" end="1.8s">by </span><span begin="1.8s" end="3s">the waves</span></p><p begin="3s" end="6s"><span begin="3s" end="6s">Upcoming glyphs</span></p></div></body></tt>';
  await page.route('**/test-config/glyph-test/config', route => route.fulfill({ json: { ttml, settings: { ...defaults, fontSize: 7, lineSpacing: 0.75, height: 50 } } }));
  await page.goto(`${process.argv[2] || 'http://127.0.0.1:3210'}/render?job=glyph-test`);
  await page.waitForFunction(() => window.rendererReady || window.rendererError);
  assert.equal(await page.evaluate(() => window.rendererError), undefined);
  await page.evaluate(async () => {
    document.body.style.setProperty('background', '#697491', 'important');
    await window.renderFrame(1500, 0);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const actual = await page.screenshot({ path: '/tmp/karaoke-glyph-actual.png' });
  await page.addStyleTag({ content: '.amll-lyric-player [class*="_lyricLine"]:not([class*="_lyricLineWrapper"]) { contain: layout style !important; content-visibility: visible !important; overflow: visible !important; }' });
  const unclipped = await page.screenshot({ path: '/tmp/karaoke-glyph-unclipped.png' });
  assert(actual.equals(unclipped), 'The rendered line should match the reference with glyph clipping disabled');
  console.log('PASS: compact line spacing renders descenders without line-box clipping');
} finally { await browser.close(); }
