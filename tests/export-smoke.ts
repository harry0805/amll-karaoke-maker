// Exercises the actual HTTP upload, Chromium frame renderer, and FFmpeg encoder.
// Run with a local server: bun run tests/export-smoke.ts http://127.0.0.1:3210
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaults } from '../src/settings';
import { strict as assert } from 'node:assert';
const sourceRate = process.env.TEST_FRAME_RATE || '24';
const [rateN, rateD = 1] = sourceRate.split('/').map(Number);

const origin = process.argv[2] || 'http://127.0.0.1:3000';
const dir = await mkdtemp(join(tmpdir(), 'karaoke-test-'));
async function command(args: string[]) {
  const p = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  assert.equal(code, 0, err); return out;
}
async function start(ttml: string, source: string) {
  const body = new FormData(); body.set('video', Bun.file(source), 'test.mp4'); body.set('ttml', new File([ttml], 'lyrics.ttml')); body.set('settings', JSON.stringify({ ...defaults, textColor: '#ffd45a', duetColor: '#7dd3fc', outlineColor: '#14141c', outlineWidth: 5, bottom: 4, height: 32, shade: 0, fontSize: 7 }));
  const response = await fetch(`${origin}/api/jobs`, { method: 'POST', headers: { origin }, body });
  const result = await response.json() as any; assert.equal(response.status, 200, JSON.stringify(result)); return result.id as string;
}
async function wait(id: string) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const job = await fetch(`${origin}/api/jobs/${id}`).then(r => r.json()) as any;
    if (['done', 'error', 'cancelled'].includes(job.status)) return job;
    await Bun.sleep(300);
  }
  throw new Error('Export timed out');
}
try {
  const source = join(dir, 'input.mp4');
  await command(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', `color=c=0x24384a:s=640x360:r=${sourceRate}:d=4`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source]);
  const sourceInfo = JSON.parse(await command(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames', '-of', 'json', source]));
  const expectedFrames = Number(sourceInfo.streams[0].nb_frames);
  const text = (await Bun.file(new URL('../examples/demo.ttml', import.meta.url)).text())
    .replaceAll('00:00:03.800', '00:00:03.500')
    .replace('<p begin="00:00:01.900"', '<p ttm:agent="v2" begin="00:00:01.900"');
  const id = await start(text, source);
  const job = await wait(id);
  assert.equal(job.status, 'done', job.error);
  const output = join(dir, 'output.mp4');
  await Bun.write(output, await fetch(`${origin}/api/jobs/${id}/download`));
  const info = JSON.parse(await command(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]));
  assert(info.streams.some((s: any) => s.codec_name === 'h264'));
  assert(info.streams.some((s: any) => s.codec_name === 'aac'));
  assert(Math.abs(Number(info.format.duration) - 4) < 0.1);
  const v = info.streams.find((s: any) => s.codec_type === 'video');
  assert.equal(v.width, 640); assert.equal(v.height, 360); assert.equal(Number(v.nb_frames), expectedFrames);
  const [outN, outD = 1] = v.avg_frame_rate.split('/').map(Number);
  assert(Math.abs(outN / outD - rateN! / rateD) < 0.00001, 'Output rate must match source');
  // The configured gold fill and dark stroke must survive MP4 composition.
  const raw = Bun.spawn(['ffmpeg', '-v', 'error', '-ss', '1', '-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { stdout: 'pipe', stderr: 'pipe' });
  const pixels = new Uint8Array(await new Response(raw.stdout).arrayBuffer());
  await raw.exited;
  let bright = 0;
  for (let i = 640 * 200 * 3; i < pixels.length; i += 3) if (pixels[i]! > 180 && pixels[i + 1]! > 140 && pixels[i + 2]! < 140) bright++;
  assert(bright > 100, `Expected visible lyrics, found ${bright} bright pixels`);
  async function frameAt(time: string) {
    const p = Bun.spawn(['ffmpeg', '-v', 'error', '-ss', time, '-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { stdout: 'pipe', stderr: 'pipe' });
    const data = new Uint8Array(await new Response(p.stdout).arrayBuffer());
    assert.equal(await p.exited, 0); return data;
  }
  const early = await frameAt('0.4');
  const late = await frameAt('1.5');
  const duet = await frameAt('3');
  let blue = 0;
  for (let i = 640 * 200 * 3; i < duet.length; i += 3) {
    if (duet[i]! > 70 && duet[i]! < 170 && duet[i + 1]! > 150 && duet[i + 2]! > 190) blue++;
  }
  assert(blue > 50, 'Duet color must appear in the exported video');
  let changed = 0;
  for (let i = 640 * 200 * 3; i < early.length; i++) if (Math.abs(early[i]! - late[i]!) > 30) changed++;
  assert(changed > 100, 'Word highlighting should change over time');
  assert(pixels[0]! < 60 && pixels[1]! < 80 && pixels[2]! < 100, 'The unshaded source video should remain visible');
  const ended = await frameAt('3.834');
  let remaining = 0;
  for (let i = 640 * 200 * 3; i < ended.length; i += 3) if (ended[i]! > 150 && ended[i + 1]! > 120 && ended[i + 2]! < 140) remaining++;
  assert.equal(remaining, 0, 'Completed lyrics must not linger in exported frames');
  console.log(`PASS: MP4 export, audio, duration, ${expectedFrames} source-rate frames, visible lyrics. Job ${id}`);
  const bad = await start('<not-ttml/>', source);
  assert.equal((await wait(bad)).status, 'error');
  console.log('PASS: invalid TTML rejected');
  const cancel = await start(text, source);
  await fetch(`${origin}/api/jobs/${cancel}`, { method: 'DELETE', headers: { origin } });
  assert.equal((await wait(cancel)).status, 'cancelled');
  console.log('PASS: cancellation');
  await Bun.sleep(200);
  const silent = join(dir, 'silent.mp4');
  await command(['ffmpeg', '-v', 'error', '-i', source, '-t', '1', '-an', '-c:v', 'copy', silent]);
  const silentId = await start(text, silent);
  assert.equal((await wait(silentId)).status, 'done');
  console.log('PASS: video without audio');
} finally { await rm(dir, { recursive: true, force: true }); }
