import { getFontEmbedCSS } from 'html-to-image';
export const fontLicenseURL = new URL('fonts/licenses.txt', document.baseURI).href;
import { bundledFamilies, validateFontFile, type FontKey } from './font-catalog';
import { readCustomFont, storeCustomFont } from './font-storage';

let custom: { file: File; face: FontFace; css: string } | undefined;
let initialization: Promise<void> | undefined;
const embeddedFonts = new Map<FontKey, Promise<string>>();

function dataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
async function decodeCustom(file: File) {
  if (!(file instanceof Blob) || typeof file.name !== 'string')
    throw new Error('The saved font is invalid. Upload it again.');
  if (file.size > 32 * 1024 * 1024) throw new Error('Choose a font no larger than 32 MB.');
  const bytes = await file.arrayBuffer();
  validateFontFile(file.name, bytes);
  const face = new FontFace('Karaoke Custom Font', bytes, { weight: '100 900', style: 'normal' });
  try {
    await face.load();
  } catch {
    throw new Error('This font could not be loaded. Choose a valid TTF, OTF, WOFF, or WOFF2 file.');
  }
  const uri = await dataURL(new Blob([bytes]));
  return {
    file,
    face,
    css: `@font-face{font-family:"Karaoke Custom Font";font-style:normal;font-weight:100 900;src:url("${uri}")}`,
  };
}
function activate(next: typeof custom) {
  if (custom) document.fonts.delete(custom.face);
  custom = next;
  if (custom) document.fonts.add(custom.face);
}
export function initializeCustomFont(): Promise<void> {
  return (initialization ??= (async () => {
    const file = await readCustomFont();
    if (file) activate(await decodeCustom(file));
  })());
}
export function customFontName(): string | undefined {
  return custom?.file.name;
}
export async function uploadCustomFont(file: File) {
  // A failed restore must not prevent the user replacing the saved record.
  await initializeCustomFont().catch(() => {});
  const next = await decodeCustom(file);
  await storeCustomFont(file);
  activate(next);
}
export async function removeCustomFont() {
  await initializeCustomFont().catch(() => {});
  await storeCustomFont(null);
  activate(undefined);
}
export function requireCustomFont(font: FontKey) {
  if (font === 'custom' && !custom)
    throw new Error('Upload a custom font in Settings or choose another font before rendering.');
}
const fontStyles = new Map<FontKey, Promise<void>>();
async function loadFontStyles(font: FontKey, family: string) {
  let pending = fontStyles.get(font);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL(
        `fonts/${family.replace(' Variable', '').toLowerCase().replaceAll(' ', '-')}/wght.css`,
        document.baseURI,
      ).href;
      link.onload = () => resolve();
      link.onerror = () => {
        link.remove();
        reject(new Error('Could not load font styles. Try selecting the font again.'));
      };
      document.head.append(link);
    });
    fontStyles.set(font, pending);
    pending.catch(() => fontStyles.delete(font));
  }
  await pending;
}
export async function loadLyricFont(font: FontKey, text: string) {
  if (font === 'custom') return; // The uploaded FontFace is loaded before activation.
  const family = bundledFamilies[font];
  if (!family) return;
  await loadFontStyles(font, family);
  const faces = await document.fonts.load(`750 16px "${family}"`, text || 'Lyrics');
  if (!faces.length)
    throw new Error(
      `Could not load ${family.replace(' Variable', '')}. Reload the page and try again.`,
    );
}

/** Cache the library's embedded font CSS for reuse across rendered frames. */
export async function lyricFontCSS(font: FontKey): Promise<string> {
  if (font === 'custom') {
    requireCustomFont(font);
    return custom!.css;
  }
  if (!bundledFamilies[font]) return '';
  let pending = embeddedFonts.get(font);
  if (!pending) {
    const node = document.createElement('span');
    node.style.fontFamily = bundledFamilies[font]!;
    pending = getFontEmbedCSS(node, { preferredFontFormat: 'woff2' });
    embeddedFonts.set(font, pending);
    pending.catch(() => embeddedFonts.delete(font));
  }
  return pending;
}

const stageFontCSS = new WeakMap<HTMLElement, string>();
export function setStageFontCSS(stage: HTMLElement, css: string) {
  stageFontCSS.set(stage, css);
}
export function getStageFontCSS(stage: HTMLElement): string {
  return stageFontCSS.get(stage) ?? '';
}
