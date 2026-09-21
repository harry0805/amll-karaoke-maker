import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';

const origin = process.argv[2] || 'http://127.0.0.1:3210';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const ttml = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><body><div>
    <p begin="00:00.878" end="00:03.399" ttm:agent="v2"><span begin="00:00.878" end="00:01.239">Light</span> <span begin="00:01.239" end="00:01.577">light</span> <span begin="00:01.577" end="00:01.925">light</span> <span begin="00:01.925" end="00:02.284">light</span> <span begin="00:02.284" end="00:02.670">light</span> <span begin="00:02.670" end="00:03.051">light</span> <span begin="00:03.051" end="00:03.399">light</span></p>
    <p begin="00:03.399" end="00:06.225" ttm:agent="v2"><span begin="00:03.399" end="00:06.225">Second line</span></p>
  </div></body></tt>`;
  await page.route('**/test-config/negative-offset/config', (route) =>
    route.fulfill({ json: { ttml, settings: { ...defaults, font: 'sans', offset: -350 } } }),
  );
  await page.goto(`${origin}/render?job=negative-offset`);
  await page.waitForFunction(() => window.rendererReady || window.rendererError);
  assert.equal(await page.evaluate(() => window.rendererError), undefined);

  const samples: { time: number; scale: number }[] = [];
  for (let time = 0; time <= 800; time += 17) {
    await page.evaluate(([time, delta]) => window.renderFrame(time!, delta!), [time, 17]);
    samples.push(
      await page.evaluate((time) => {
        const line = Array.from(document.querySelectorAll<HTMLElement>('[class]')).find(
          (element) =>
            element.className.includes('_lyricLine ') &&
            element.textContent?.trim() === 'Light light light light light light light',
        );
        if (!line) throw new Error('First lyric line was not rendered');
        return { time, scale: Number(/^scale\(([^)]+)\)$/.exec(line.style.transform)?.[1]) };
      }, time),
    );
  }

  const beforeStart = samples.filter(({ time }) => time >= 350 && time <= 527);
  for (let index = 1; index < beforeStart.length; index++)
    assert(
      beforeStart[index]!.scale >= beforeStart[index - 1]!.scale - 0.0001,
      `First line shrank before activation: ${JSON.stringify(beforeStart)}`,
    );
  assert(
    samples.at(-1)!.scale > beforeStart.at(-1)!.scale,
    'The active line should retain AMLL\'s normal scale-up animation',
  );
  console.log('PASS: a -350 ms offset does not make the first line shrink before it activates');
} finally {
  await browser.close();
}
