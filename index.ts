import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import home from './src/index.html';
import { probe, render, type Job } from './src/exporter';
import { validateSettings } from './src/settings';

const root = join(import.meta.dir, '.renders');
await mkdir(root, { recursive: true });
const jobs = new Map<string, Job>();
let busy = false;
const server = Bun.serve({
  hostname: '127.0.0.1', port: Number(process.env.PORT || 3000),
  idleTimeout: 255, maxRequestBodySize: 20 * 1024 ** 3,
  routes: { '/': home, '/render': home },
  async fetch(req) {
    const url = new URL(req.url);
    if (req.headers.get('host') !== new URL(server.url).host) return new Response('Invalid host', { status: 403 });
    if (req.method !== 'GET' && req.headers.get('origin') !== server.url.origin) return new Response('Invalid origin', { status: 403 });
    try {
      if (url.pathname === '/api/health') return Response.json({ ffmpeg: !!Bun.which('ffmpeg'), ffprobe: !!Bun.which('ffprobe') });
      if (url.pathname === '/api/jobs' && req.method === 'POST') {
        if (busy) return Response.json({ error: 'Another export is running. Wait for it to finish.' }, { status: 409 });
        busy = true;
        const id = crypto.randomUUID();
        const dir = join(root, id);
        try {
          if (!Bun.which('ffmpeg') || !Bun.which('ffprobe')) throw new Error('Install FFmpeg and ffprobe before exporting. See README.');
          const form = await req.formData();
          const video = form.get('video');
          const ttml = form.get('ttml');
          if (!(video instanceof File) || !video.size || !(ttml instanceof File) || !ttml.size) throw new Error('Choose a video and a TTML file.');
          if (ttml.size > 10 * 1024 ** 2) throw new Error('TTML file must be smaller than 10 MB.');
          const settings = validateSettings(JSON.parse(String(form.get('settings'))));
          await mkdir(dir, { recursive: true });
          await Bun.write(join(dir, 'source'), video);
          const metadata = await probe(join(dir, 'source'));
          const job: Job = { id, dir, settings, metadata, ttml: await ttml.text(), status: 'queued', progress: 0, cancelled: false };
          jobs.set(id, job);
          void render(job, server.url.origin).finally(() => { busy = false; });
          return Response.json({ id });
        } catch (error) { busy = false; await rm(dir, { recursive: true, force: true }); throw error; }
      }
      const match = url.pathname.match(/^\/api\/jobs\/([a-f0-9-]+)(?:\/(config|download))?$/);
      if (match) {
        const job = jobs.get(match[1]!);
        if (!job) return new Response('Export not found', { status: 404 });
        if (req.method === 'DELETE') { if (!['done', 'error', 'cancelled'].includes(job.status)) { job.cancelled = true; job.stop?.(); } return Response.json({ ok: true }); }
        if (match[2] === 'config') return Response.json({ ttml: job.ttml, settings: job.settings });
        if (match[2] === 'download') {
          if (job.status !== 'done') return new Response('Export is not ready', { status: 409 });
          return new Response(Bun.file(join(job.dir, 'karaoke.mp4')), { headers: { 'Content-Disposition': 'attachment; filename="karaoke.mp4"' } });
        }
        return Response.json({ id: job.id, status: job.status, progress: job.progress, error: job.error, frames: job.frames, totalFrames: job.totalFrames });
      }
      return new Response('Not found', { status: 404 });
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
  },
  development: { hmr: true, console: true },
});
console.log(`Karaoke renderer: ${server.url}`);
