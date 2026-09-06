import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { outputSize, type Settings } from './settings';

export interface Metadata { width: number; height: number; duration: number }
export interface Job { id: string; dir: string; settings: Settings; metadata: Metadata; ttml: string; status: string; progress: number; cancelled: boolean; stop?: () => void; error?: string; frames?: number; totalFrames?: number }
export async function probe(path: string): Promise<Metadata> {
  const p = Bun.spawn(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { stdout: 'pipe', stderr: 'pipe' });
  const [raw, error, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code) throw new Error(`Cannot read this video: ${error.slice(-500)}`);
  const data = JSON.parse(raw);
  const stream = data.streams.find((s: any) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  if (!stream) throw new Error('The selected file has no video track.');
  const duration = Number(stream.duration || data.format.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Cannot determine video duration.');
  const rotation = Math.abs(Number(stream.side_data_list?.find((s: any) => s.rotation !== undefined)?.rotation || stream.tags?.rotate || 0));
  const [sn, sd] = String(stream.sample_aspect_ratio || '1:1').split(':').map(Number);
  const displayWidth = stream.width * (sn && sd ? sn / sd : 1);
  return { width: rotation % 180 === 90 ? stream.height : displayWidth, height: rotation % 180 === 90 ? displayWidth : stream.height, duration };
}

export async function render(job: Job, origin: string) {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let encoder: ReturnType<typeof spawn> | undefined;
  let outcome = 'error';
  try {
    const { width, height } = outputSize(job.metadata.width, job.metadata.height, job.settings.resolution);
    job.status = 'preparing';
    browser = await chromium.launch({ headless: true });
    job.stop = () => { encoder?.kill('SIGTERM'); void browser?.close(); };
    if (job.cancelled) throw new Error('Cancelled');
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(`${origin}/render?job=${job.id}`);
    await page.waitForFunction(() => window.rendererReady || window.rendererError, null, { timeout: 60000 });
    const error = await page.evaluate(() => window.rendererError);
    if (error) throw new Error(error);
    const fps = job.settings.fps;
    const total = Math.ceil(job.metadata.duration * fps);
    job.totalFrames = total;
    encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
      '-i', join(job.dir, 'source'), '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', 'pipe:0',
      '-filter_complex', `[0:v:0]setpts=PTS-STARTPTS,scale=${width}:${height},setsar=1,fps=${fps}[base];[base][1:v]overlay=0:0:shortest=1:format=auto,format=yuv420p[out]`,
      '-map', '[out]', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k',
      '-t', String(job.metadata.duration), '-movflags', '+faststart', join(job.dir, 'karaoke.mp4')], { stdio: ['pipe', 'ignore', 'pipe'] });
    let log = '';
    encoder.stderr!.on('data', data => { log = (log + data).slice(-4000); });
    let processError: Error | undefined;
    encoder.on('error', error => { processError = error; });
    encoder.stdin!.on('error', error => { processError = error; });
    const finished = new Promise<number | null>(resolve => encoder!.once('close', resolve));
    job.status = 'rendering';
    for (let frame = 0; frame < total; frame++) {
      if (job.cancelled) throw new Error('Cancelled');
      if (processError || encoder.exitCode !== null) throw processError || new Error(log || 'FFmpeg stopped unexpectedly.');
      await page.evaluate(async ({ time, delta }) => { await window.renderFrame(time, delta); }, { time: frame * 1000 / fps, delta: 1000 / fps });
      const png = await page.screenshot({ omitBackground: true, type: 'png', timeout: 60000 });
      if (!encoder.stdin!.write(png)) await once(encoder.stdin!, 'drain');
      job.frames = frame + 1;
      job.progress = (frame + 1) / total * 0.97;
    }
    job.status = 'encoding';
    encoder.stdin!.end();
    const code = await finished;
    if (code !== 0) throw new Error(log || 'FFmpeg could not finish the export.');
    if (job.cancelled) throw new Error('Cancelled');
    outcome = 'done'; job.progress = 1;
  } catch (error) {
    outcome = job.cancelled ? 'cancelled' : 'error';
    job.error = error instanceof Error ? error.message : String(error);
    encoder?.kill('SIGTERM');
    await rm(join(job.dir, 'karaoke.mp4'), { force: true }).catch(() => {});
  } finally {
    await browser?.close().catch(() => {});
    await rm(join(job.dir, 'source'), { force: true }).catch(error => {
      console.error(`Could not remove temporary source for ${job.id}:`, error);
    });
    job.stop = undefined;
    job.status = outcome;
  }
}
