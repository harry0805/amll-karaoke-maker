import '../src/renderer.css';
import { Lyrics } from '../src/lyrics';
import { defaults } from '../src/settings';
import { bundledFamilies, type FontKey } from '../src/font-catalog';
import { getStageFontCSS, setStageFontCSS } from '../src/font-runtime';
import { snapshotLyrics } from '../src/lyric-snapshot';

const stage = document.getElementById('stage')!;
const results = document.getElementById('results')!;
const button = document.getElementById('run') as HTMLButtonElement;
const ttml = `<tt xmlns="http://www.w3.org/ns/ttml"><body><div>
<p begin="0s" end="10s"><span begin="0s" end="10s">Golden words, café!</span></p>
</div></body></tt>`;

// Build reference CSS directly from the loaded stylesheet and original bytes,
// independently of html-to-image's font format filtering and resource embedding.
async function referenceCSS(family: string) {
  const rules = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules));
  return (
    await Promise.all(
      rules
        .filter(
          (rule): rule is CSSFontFaceRule =>
            rule instanceof CSSFontFaceRule &&
            rule.style.fontFamily.replace(/["']/g, '') === family,
        )
        .map(async (rule) => {
          let css = rule.cssText;
          for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
            const response = await fetch(new URL(match[1]!, rule.parentStyleSheet!.href!));
            if (!response.ok) throw new Error('Reference font fetch failed');
            const bytes = new Uint8Array(await response.arrayBuffer());
            const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
            css = css.replace(match[0], `url("data:font/woff2;base64,${base64}")`);
          }
          return css;
        }),
    )
  ).join('\n');
}
async function raster() {
  const image = await snapshotLyrics(stage);
  const canvas = document.createElement('canvas');
  canvas.width = stage.clientWidth;
  canvas.height = stage.clientHeight;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  return { canvas, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data };
}
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  return a.reduce((count, value, index) => count + Number(value !== b[index]), 0);
}
button.onclick = async () => {
  button.disabled = true;
  results.textContent = '';
  let lyrics: Lyrics | undefined;
  try {
    for (const [font, family] of Object.entries(bundledFamilies)) {
      lyrics?.dispose();
      lyrics = new Lyrics(stage, document.getElementById('lyrics')!, {
        ...defaults,
        font: font as FontKey,
        fontSize: 10,
        outlineWidth: 0,
        shade: 0,
      });
      await lyrics.load(ttml);
      await lyrics.frame(5000, 0, true);
      const css = getStageFontCSS(stage);
      const actual = await raster();
      setStageFontCSS(stage, await referenceCSS(family));
      const expected = await raster();
      setStageFontCSS(stage, '');
      const fallback = await raster();
      setStageFontCSS(stage, css);
      const cached = await raster();
      document.getElementById('output')!.replaceChildren(actual.canvas);
      const mismatch = difference(actual.pixels, expected.pixels);
      const fallbackDifference = difference(expected.pixels, fallback.pixels);
      const passed =
        css.includes('data:') &&
        mismatch === 0 &&
        fallbackDifference > 100 &&
        difference(actual.pixels, cached.pixels) === 0;
      results.textContent += `${passed ? 'PASS' : 'FAIL'} ${family}: reference differences=${mismatch}, fallback differences=${fallbackDifference}, embedded=${css.includes('data:')}\n`;
    }
  } catch (error) {
    results.textContent += `ERROR ${String(error)}`;
  } finally {
    button.disabled = false;
  }
};
