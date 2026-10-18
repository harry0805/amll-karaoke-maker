// Run against a dev server: bun tests/chinese-ui-smoke.ts http://127.0.0.1:3000
import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const origin = process.argv[2] || 'http://127.0.0.1:3000';
const browser = await chromium.launch();
const dir = await mkdtemp(join(tmpdir(), 'karaoke-chinese-'));
const errors: string[] = [];

try {
  const source = join(dir, 'source.mp4');
  const process = Bun.spawn(
    [
      'ffmpeg',
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x285078:s=320x180:r=24:d=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      source,
    ],
    { stdout: 'ignore', stderr: 'pipe' },
  );
  const [code, error] = await Promise.all([process.exited, new Response(process.stderr).text()]);
  assert.equal(code, 0, error);
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 1400, height: 900 },
    userAgent: `Mozilla/5.0 Chrome/${browser.version()}`,
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  assert.match(await page.title(), /在线卡拉 OK/);
  await page.locator('#tab-settings').click();
  await page.getByRole('button', { name: '显示行数说明', exact: true }).hover();
  const hint = page.getByRole('dialog', { name: '显示行数说明', exact: true });
  await hint.waitFor({ state: 'visible' });
  assert.match((await hint.textContent())!, /正在演唱的歌词始终显示/);
  await page.keyboard.press('Escape');
  await page.locator('#useDuetColors').check();
  assert(await page.getByRole('heading', { name: '对唱颜色与描边', exact: true }).isVisible());
  await page.locator('#fontSize').fill('6');
  assert.match(
    (await page.locator('#preset-select option:checked').textContent())!,
    /默认（已修改）/,
  );
  await page.locator('#preset-reset').click();
  assert.match((await page.locator('#preset-action-title').textContent())!, /重置已修改的设置/);
  await page.locator('#preset-action-cancel').click();

  await page.locator('#preset-open').click();
  await page.locator('#preset-name').fill('中文预设 English name');
  await page.locator('#preset-save').click();
  await page.getByRole('button', { name: '更新「中文预设 English name」', exact: true }).click();
  assert.match(
    (await page.locator('#preset-action-description').textContent())!,
    /用当前设置替换预设/,
  );
  await page.locator('#preset-action-cancel').click();
  await page.getByRole('button', { name: '删除「中文预设 English name」', exact: true }).click();
  assert.match((await page.locator('#preset-action-title').textContent())!, /删除预设/);
  await page.locator('#preset-action-cancel').click();
  await page.locator('#preset-import').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('broken'),
  });
  await page.waitForFunction(() =>
    document.querySelector('#preset-manager-status')?.textContent?.includes('不是有效的 JSON'),
  );
  await page.locator('#preset-close').click();
  await page.locator('#fontSize').fill('7');
  await page.locator('#preset-select').selectOption('default');
  assert.match((await page.locator('#preset-switch-description').textContent())!, /切换到「默认」/);
  await page.locator('#preset-switch-cancel').click();

  await page.locator('#font').selectOption('custom');
  await page
    .locator('#custom-font-file')
    .setInputFiles({ name: 'broken.ttf', mimeType: 'font/ttf', buffer: Buffer.from('bad-font') });
  await page.waitForFunction(() =>
    document.querySelector('#font-status')?.textContent?.includes('不支持此字体文件'),
  );
  await page.getByRole('button', { name: 'English', exact: true }).click();
  assert.match((await page.locator('#font-status').textContent())!, /not a supported font/);
  await page.getByRole('button', { name: '中文', exact: true }).click();
  await page.locator('#font').selectOption('nunito');

  await page.locator('#tab-source').click();
  await page.locator('#ttml-file').setInputFiles({
    name: 'broken.ttml',
    mimeType: 'application/xml',
    buffer: Buffer.from('broken'),
  });
  await page.waitForFunction(() =>
    document.querySelector('#source-error')?.textContent?.includes('不是有效的 TTML'),
  );
  await page.locator('#ttml-file').setInputFiles('examples/demo.ttml');
  await page.locator('#video-file').setInputFiles(source);
  await page.waitForFunction(
    () => !(document.querySelector('#play') as HTMLButtonElement).disabled,
  );
  await page.locator('#offset').fill('');
  await page.locator('#tab-export').click();
  assert.match((await page.locator('#export-requirements').textContent())!, /歌词偏移.*无效/);
  await page.locator('#tab-source').click();
  await page.locator('#offset').fill('0');
  await page.locator('#tab-export').click();
  await page.waitForFunction(
    () => !(document.querySelector('#export') as HTMLButtonElement).disabled,
  );
  await page.locator('#export').click();
  await page.locator('#cancel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#cancel').textContent(), '取消');
  await page.locator('#cancel').click();
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === '已取消导出');
  await page.locator('#export').click();
  await page.waitForFunction(
    () => document.querySelector('#status')?.textContent === '导出视频已保存在此设备的浏览器中',
  );
  const download = page.getByRole('link', { name: '下载「source-karaoke.mp4」', exact: true });
  await download.waitFor();
  const downloaded = page.waitForEvent('download');
  await download.click();
  assert.equal((await downloaded).suggestedFilename(), 'source-karaoke.mp4');
  await page
    .getByRole('button', { name: '删除已导出的视频「source-karaoke.mp4」', exact: true })
    .click();
  await page.locator('.saved-export').waitFor({ state: 'detached' });
  assert.match((await page.locator('#saved-empty').textContent())!, /导出完成的视频/);

  await page.locator('#tab-source').click();
  await page
    .locator('#video-file')
    .setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('bad-video') });
  await page.locator('#tab-settings').click();
  await page.locator('#compatibility-warning').waitFor({ state: 'visible' });
  assert.match((await page.locator('#compatibility-title').textContent())!, /此视频可能无法导出/);
  assert.match((await page.locator('#compatibility-reasons').textContent())!, /无法|未找到/);
  await page.locator('#stay-source').click();

  await page.goto(`${origin}/guide/`);
  assert.match(await page.title(), /将 TTML 歌词制作成卡拉 OK 视频/);
  assert(await page.getByRole('heading', { name: '支持的浏览器', exact: true }).isVisible());
  for (const language of ['English', '中文', 'English', '中文']) {
    await page.getByRole('button', { name: language, exact: true }).click();
    assert.equal(await page.locator('a[href="https://tool.amll.dev/"]').count(), 1);
    assert.equal(
      await page
        .locator('a[href="https://github.com/harry0805/amll-karaoke-maker/issues"]')
        .count(),
      1,
    );
    assert(!(await page.locator('main').innerText()).includes('{link}'));
  }
  await page.setViewportSize({ width: 320, height: 812 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('link', { name: '开始制作卡拉 OK 视频', exact: true }).click();
  await page.locator('#tab-source').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh');
  for (const id of ['source', 'settings', 'export']) {
    await page.locator(`#tab-${id}`).click();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await context.close();

  const safari = await browser.newContext({
    locale: 'zh-CN',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const warning = await safari.newPage();
  await warning.goto(origin);
  await warning.locator('#browser-support-warning').waitFor({ state: 'visible' });
  assert.match(
    (await warning.locator('#browser-support-title').textContent())!,
    /暂不支持|暂不受支持/,
  );
  assert.match(
    (await warning.locator('#browser-support-description').textContent())!,
    /预览和视频导出/,
  );
  await safari.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: Chinese tooltips, presets, validation, fonts, cancellation, MP4 download, saved renders, compatibility dialogs, guide, metadata, and phone layouts',
  );
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
