// Verify the component/state boundary through the real UI in a fresh browser context.
import { chromium, type Page } from 'playwright';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.argv[2] || 'http://127.0.0.1:3210';
const dir = await mkdtemp(join(tmpdir(), 'karaoke-ui-'));
const browser = await chromium.launch();
const errors: string[] = [];
async function command(args: string[]) {
  const process = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  assert.equal(code, 0, err);
  return out;
}
async function step(page: Page, name: string) {
  await page.getByRole('tab', { name, exact: true }).click();
  await page.getByRole('tabpanel', { name, exact: true }).waitFor({ state: 'visible' });
}
async function text(page: Page, id: string, expected: string) {
  try {
    await page.waitForFunction(
      ({ id, expected }) => document.getElementById(id)?.textContent === expected,
      { id, expected },
    );
  } catch {
    throw new Error(
      `Expected #${id} to read "${expected}", got "${await page.locator(`#${id}`).textContent()}"`,
    );
  }
}
try {
  const source = join(dir, 'source.mp4');
  await command([
    'ffmpeg',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x285078:s=640x360:r=24:d=2',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    source,
  ]);
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: `Mozilla/5.0 Chrome/${browser.version()}`,
  });
  // Headless Chromium's user agent can trigger the app's browser warning.
  context.on('page', async (page) => {
    await page.addLocatorHandler(page.locator('#browser-support-warning[open]'), async () => {
      await page.locator('#browser-support-proceed').click();
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await text(page, 'font-status', '');
  assert.equal(await page.locator('#source-error').textContent(), '');
  assert.equal(await page.locator('#preset-status').textContent(), '');
  assert.equal(await page.locator('#export').isEnabled(), false);
  await page.locator('#offset').fill('150');
  await page.getByLabel('Show lyrics before start', { exact: true }).check();
  await step(page, 'Settings');
  await page.getByRole('button', { name: 'About Visible lines', exact: true }).hover();
  const lineInfo = page.getByRole('dialog', { name: 'About Visible lines', exact: true });
  await lineInfo.waitFor({ state: 'visible' });
  assert((await lineInfo.textContent())?.includes('active lines (lines currently being sung)'));
  await page.keyboard.press('Escape');
  await lineInfo.waitFor({ state: 'hidden' });
  await page.mouse.move(0, 0);
  await page.getByRole('button', { name: 'About Visible lines', exact: true }).focus();
  await page.keyboard.press('Enter');
  await lineInfo.waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await lineInfo.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#visibleLines').inputValue(), '2');
  assert.equal(await page.locator('#height').inputValue(), '100');
  await page.locator('#visibleLines').fill('11');
  await text(page, 'visibleLines-value', 'Unlimited');
  await page.locator('#visibleLines').fill('4');
  await page.locator('#height').fill('20');
  await page.locator('#keepScrollNearEnd').check();
  await page.getByRole('slider', { name: 'Text size', exact: true }).fill('7');
  await text(page, 'fontSize-value', '7%');
  assert.equal(
    await page.locator('#preset-select option:checked').textContent(),
    'Default (Modified)',
  );
  await page.getByLabel('Use different settings for duet', { exact: true }).check();
  assert.equal(await page.locator('#duet-style').isVisible(), true);
  await page.locator('#duetOutlineWidth').fill('0');
  await text(page, 'duetOutlineWidth-value', 'Off');
  await page.getByRole('button', { name: 'Manage presets', exact: true }).click();
  await page.getByPlaceholder('Preset name').fill('UI migration');
  await page.locator('#preset-save').click();
  assert.equal(await page.locator('#preset-select option:checked').textContent(), 'UI migration');
  assert.equal(await page.locator('#preset-reset').isEnabled(), false);
  await page.getByRole('button', { name: 'Rename UI migration', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'New name for UI migration', exact: true })
    .fill('UI renamed');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await page.getByRole('button', { name: 'Export UI renamed', exact: true }).waitFor();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export UI renamed', exact: true }).click();
  const presetFile = join(dir, 'preset.json');
  await (await download).saveAs(presetFile);
  const portable = await Bun.file(presetFile).json();
  assert.equal(portable.presets[0].settings.fontSize, 7);
  assert.equal(portable.presets[0].settings.visibleLines, 4);
  assert.equal(portable.presets[0].settings.height, 20);
  assert.equal(portable.presets[0].settings.keepScrollNearEnd, true);
  assert.equal(portable.presets[0].settings.offset, undefined);
  await page.locator('#preset-close').click();
  await page.locator('#fontSize').fill('8');
  await page.locator('#preset-select').selectOption('default');
  await page.locator('#preset-switch-warning').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#fontSize').inputValue(), '8');
  assert.equal(
    await page.locator('#preset-select option:checked').textContent(),
    'UI renamed (Modified)',
  );
  await page.locator('#preset-select').selectOption('default');
  await page.locator('#preset-switch-confirm').click();
  await text(page, 'fontSize-value', '5%');
  assert.equal(await page.locator('#visibleLines').inputValue(), '2');
  assert.equal(await page.locator('#height').inputValue(), '100');
  assert.equal(await page.locator('#offset').inputValue(), '150');
  assert.equal(await page.locator('#showLyricsBeforeStart').isChecked(), true);
  await page.locator('#preset-select').selectOption({ label: 'UI renamed' });
  await page.locator('#fontSize').fill('9');
  await page.locator('#preset-reset').click();
  await page.locator('#preset-action-confirm').click();
  await text(page, 'fontSize-value', '7%');
  await page.reload();
  await step(page, 'Settings');
  assert.equal(await page.locator('#visibleLines').inputValue(), '4');
  assert.equal(await page.locator('#height').inputValue(), '20');
  assert.equal(await page.locator('#keepScrollNearEnd').isChecked(), true);
  await text(page, 'fontSize-value', '7%');
  assert.equal(await page.locator('#preset-select option:checked').textContent(), 'UI renamed');
  assert.equal(await page.locator('#offset').inputValue(), '150');
  await page.locator('#font').selectOption('custom');
  await text(page, 'font-status', '');
  await step(page, 'Render');
  assert(
    (await page.locator('#export-requirements').textContent())?.includes('Upload a custom font'),
  );
  await step(page, 'Settings');
  await page
    .locator('#custom-font-file')
    .setInputFiles('public/fonts/nunito/files/nunito-latin-wght-normal.woff2');
  await text(page, 'custom-font-name', 'nunito-latin-wght-normal.woff2');
  await text(page, 'font-status', '');
  await page.locator('#custom-font-remove').click();
  await text(page, 'custom-font-name', 'Choose font');
  await page.locator('#font').selectOption('nunito');
  await text(page, 'font-status', '');

  // Another tab's preset edits update the library without changing this tab's settings.
  const other = await page.context().newPage();
  other.on('pageerror', (error) => errors.push(error.message));
  await other.goto(origin);
  await step(other, 'Settings');
  await page.locator('#preset-open').click();
  await page.getByRole('button', { name: 'Update UI renamed', exact: true }).click();
  await page.locator('#preset-action-dialog').waitFor({ state: 'visible' });
  await other.locator('#fontSize').fill('11');
  await other.locator('#preset-open').click();
  await other.locator('#preset-name').fill('Other tab');
  await other.locator('#preset-save').click();
  await page
    .locator('#preset-select option', { hasText: 'Other tab' })
    .waitFor({ state: 'attached' });
  await page.locator('#preset-action-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#fontSize').inputValue(), '7');
  await other.close();

  // The dialog's asynchronous close event reopens the manager.
  await page.bringToFront();
  await page.locator('#preset-panel').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Delete Other tab', exact: true }).click();
  await page.locator('#preset-action-confirm').click();
  await page
    .getByRole('button', { name: 'Delete Other tab', exact: true })
    .waitFor({ state: 'detached' });
  await page
    .locator('#preset-import')
    .setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await page.waitForFunction(() =>
    document.querySelector('#preset-manager-status')?.textContent?.includes('not valid JSON'),
  );
  await page.locator('#preset-import').setInputFiles(presetFile);
  await page.waitForFunction(() => document.querySelectorAll('.preset-library-item').length === 2);
  await page.locator('#preset-close').click();
  await step(page, 'Source');
  await page.locator('#video-file').setInputFiles(source);
  await page.locator('#ttml-file').setInputFiles({
    name: 'lyrics.ttml',
    mimeType: 'application/xml',
    buffer: Buffer.from(
      '<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0s" end="1.8s"><span begin="0s" end="0.9s">Hello </span><span begin="0.9s" end="1.8s">world</span></p></div></body></tt>',
    ),
  });
  await text(page, 'ttml-name', 'lyrics.ttml');
  await page.waitForFunction(
    () => !(document.querySelector('#play') as HTMLButtonElement).disabled,
  );
  await page.locator('#play').click();
  await page.waitForFunction(() => !(document.querySelector('#video') as HTMLVideoElement).paused);
  await page.locator('#play').click();
  await page.locator('#seek').fill('0.5');
  await page.waitForFunction(
    () => Math.abs((document.querySelector('#video') as HTMLVideoElement).currentTime - 0.5) < 0.01,
  );
  await step(page, 'Settings');
  const batching = await page.evaluate(async () => {
    const path = '/src/lyrics.ts';
    const { Lyrics } = await import(path);
    const original = Lyrics.prototype.configure;
    let calls = 0;
    Lyrics.prototype.configure = function (this: object, ...args: unknown[]) {
      calls++;
      return original.apply(this, args);
    };
    const slider = document.getElementById('fontSize') as HTMLInputElement;
    for (let i = 0; i < 100; i++) {
      slider.value = String(3 + (i % 10) / 10);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    for (let i = 0; i < 4; i++)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    Lyrics.prototype.configure = original;
    return {
      calls,
      value: slider.value,
      applied: document
        .querySelector<HTMLElement>('.amll-lyric-player')!
        .style.getPropertyValue('--amll-lp-font-size'),
    };
  });
  assert.equal(batching.calls, 1, JSON.stringify(batching));
  assert.equal(batching.applied, batching.value + 'cqh');
  const scrubbing = await page.evaluate(async () => {
    const video = document.getElementById('video') as HTMLVideoElement;
    const property = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!;
    let seeks = 0;
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => property.get!.call(video),
      set: (value: number) => {
        seeks++;
        property.set!.call(video, value);
      },
    });
    const slider = document.getElementById('seek') as HTMLInputElement;
    for (let i = 0; i < 100; i++) {
      slider.value = String(i / 100);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    for (let i = 0; i < 30; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!video.seeking && Math.abs(video.currentTime - 0.99) < 0.01) break;
    }
    const time = video.currentTime;
    Reflect.deleteProperty(video, 'currentTime');
    return { seeks, time };
  });
  assert.equal(scrubbing.seeks, 1, JSON.stringify(scrubbing));
  assert(Math.abs(scrubbing.time - 0.99) < 0.01, JSON.stringify(scrubbing));
  await page.locator('#seek').fill('0.5');
  await page.waitForFunction(
    () => Math.abs((document.getElementById('video') as HTMLVideoElement).currentTime - 0.5) < 0.01,
  );
  console.log(
    'PASS: 100 settings inputs produce one configure; 100 scrub inputs produce one seek, both retain the latest value',
  );
  await step(page, 'Source');
  await page.locator('#offset').fill('');
  await step(page, 'Render');
  assert.equal(await page.locator('#export').isEnabled(), false);
  assert((await page.locator('#export-requirements').textContent())?.includes('Invalid offset'));
  await step(page, 'Source');
  await page.locator('#offset').fill('150');
  await step(page, 'Render');
  await page.waitForFunction(
    () => !(document.querySelector('#export') as HTMLButtonElement).disabled,
  );
  await page.locator('#export').click();
  await page.locator('#cancel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#fontSize').isEnabled(), false);
  assert.equal(await page.locator('#play').isEnabled(), false);
  await page.locator('#cancel').click();
  await text(page, 'status', 'Render cancelled');
  await page.waitForFunction(
    () => !(document.querySelector('#export') as HTMLButtonElement).disabled,
  );
  assert.equal(await page.locator('.saved-export').count(), 0);
  await page.locator('#export').click();
  await text(page, 'status', 'Render saved on this device');
  await page.locator('.saved-export').waitFor();
  assert.equal(await page.locator('#play').isEnabled(), true);
  assert.equal(
    await page.locator('#video').evaluate((video) => (video as HTMLVideoElement).currentTime),
    0.5,
  );
  const mp4Download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download source-karaoke.mp4', exact: true }).click();
  const mp4 = join(dir, 'output.mp4');
  await (await mp4Download).saveAs(mp4);
  const info = JSON.parse(
    await command(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', mp4]),
  );
  assert.equal(info.streams.find((stream: any) => stream.codec_type === 'video').nb_frames, '48');
  await page.reload();
  await step(page, 'Render');
  await page.locator('.saved-export').waitFor();
  await page
    .getByRole('button', { name: 'Delete saved render source-karaoke.mp4', exact: true })
    .click();
  await page.locator('.saved-export').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#saved-empty').isVisible(), true);

  // The compatibility gate remains an explicit choice before leaving Source.
  const unsupported = join(dir, 'opus.webm');
  await command([
    'ffmpeg',
    '-v',
    'error',
    '-i',
    source,
    '-c:v',
    'libvpx-vp9',
    '-c:a',
    'libopus',
    unsupported,
  ]);
  await step(page, 'Source');
  await page.locator('#video-file').setInputFiles(unsupported);
  await page.locator('#tab-settings').click();
  await page.locator('#compatibility-warning').waitFor({ state: 'visible' });
  await page.locator('#stay-source').click();
  assert.equal(await page.locator('#step-source').isVisible(), true);
  await page.locator('#tab-settings').click();
  await page.locator('#proceed-anyway').click();
  await page.locator('#step-settings').waitFor({ state: 'visible' });
  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: `Mozilla/5.0 Chrome/${browser.version()}`,
  });
  const touch = await touchContext.newPage();
  await touch.goto(origin);
  await text(touch, 'font-status', '');
  await step(touch, 'Settings');
  const hint = touch.getByRole('button', { name: 'About Keep scroll near end', exact: true });
  await hint.tap();
  const popup = touch.getByRole('dialog', { name: 'About Keep scroll near end', exact: true });
  await popup.waitFor({ state: 'visible' });
  assert(
    (await popup.textContent())?.includes(
      'This keeps the top most line always aligned at the same height at the end.',
    ),
  );
  const bounds = await popup.boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
  assert.equal(await touch.locator('#keepScrollNearEnd').isChecked(), false);
  await hint.tap();
  await popup.waitFor({ state: 'hidden' });
  await touchContext.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: UI settings, presets, rename/import/download, confirmations, restoration, cross-tab changes, fonts, playback, export cancellation, MP4 output and saved renders',
  );
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
