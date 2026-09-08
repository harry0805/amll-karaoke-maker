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
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
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
  assert.equal(await page.locator('#offset').inputValue(), '150');
  assert.equal(await page.locator('#showLyricsBeforeStart').isChecked(), true);
  await page.locator('#preset-select').selectOption({ label: 'UI renamed' });
  await page.locator('#fontSize').fill('9');
  await page.locator('#preset-reset').click();
  await page.locator('#preset-action-confirm').click();
  await text(page, 'fontSize-value', '7%');
  await page.reload();
  await step(page, 'Settings');
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

  if (!(await page.locator('#preset-panel').isVisible()))
    await page.locator('#preset-open').click();
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
  await page
    .locator('#ttml-file')
    .setInputFiles({
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
  assert.deepEqual(errors, []);
  console.log(
    'PASS: UI settings, presets, rename/import/download, confirmations, restoration, cross-tab changes, fonts, playback, export cancellation, MP4 output and saved renders',
  );
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
