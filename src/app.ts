import { Lyrics } from './lyrics';
import { defaults, validateSettings, type Settings } from './settings';

declare global {
  interface Window { rendererReady: boolean; rendererError?: string; renderFrame: (time: number, delta: number) => Promise<void> }
}
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const stage = $('stage');

async function main() {
  if (location.pathname === '/render') {
    document.body.className = 'render';
    document.body.replaceChildren(stage);
    try {
      const res = await fetch(`/api/jobs/${new URLSearchParams(location.search).get('job')}/config`);
      if (!res.ok) throw new Error('Cannot load export.');
      const config = await res.json();
      const lyrics = new Lyrics(stage, $('lyrics'), validateSettings(config.settings));
      await lyrics.load(config.ttml);
      window.renderFrame = (time, delta) => lyrics.frame(time, delta);
      window.rendererReady = true;
    } catch (error) { window.rendererError = String(error); }
    return;
  }
  let settings: Settings = { ...defaults };
  const lyrics = new Lyrics(stage, $('lyrics'), settings);
  const video = $<HTMLVideoElement>('video');
  let videoFile: File | undefined;
  let ttmlFile: File | undefined;
  let objectURL = '';
  let loaded = false;
  let exporting = false;
  let jobId: string | undefined;
  let lyricGeneration = 0;
  const showError = (message = '') => { $('error').textContent = message; $('error').hidden = !message; };
  const updateExport = () => { $<HTMLButtonElement>('export').disabled = !videoFile || !ttmlFile || !loaded || exporting; };
  const formatTime = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  const readSettings = () => validateSettings(Object.fromEntries(Object.keys(defaults).map(key => {
    const value = input(key === 'shade' ? 'shade-control' : key).value;
    return [key, ['textColor', 'duetColor', 'font', 'outlineColor'].includes(key) ? value : Number(value)];
  })));
  function changeSettings() {
    try {
      settings = readSettings();
      lyrics.configure(settings);
      for (const key of ['fontSize', 'bottom', 'height', 'shade'] as const) $(`${key}-value`).textContent = `${settings[key]}%`;
      $('horizontalMargin-value').textContent = `${settings.horizontalMargin}% each side`;
      $('outlineWidth-value').textContent = settings.outlineWidth ? `${settings.outlineWidth}%` : 'Off';
      void lyrics.frame(video.currentTime * 1000, 0, true);
    } catch (error) { showError(String(error)); }
  }
  for (const key of Object.keys(defaults) as (keyof Settings)[]) {
    const control = input(key === 'shade' ? 'shade-control' : key);
    control.value = String(defaults[key]);
    control.addEventListener('input', changeSettings);
  }
  changeSettings();
  input('video-file').addEventListener('change', () => {
    const file = input('video-file').files?.[0];
    if (!file) return;
    video.pause(); loaded = false; videoFile = file;
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = URL.createObjectURL(file); video.src = objectURL;
    $('video-name').textContent = file.name; showError(); updateExport();
  });
  video.addEventListener('loadedmetadata', () => {
    if (!Number.isFinite(video.duration) || !video.videoWidth) { showError('Cannot determine the video duration. Try an MP4 video.'); return; }
    loaded = true; $('empty').hidden = true;
    stage.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    input('seek').max = String(video.duration); input('seek').disabled = false;
    $<HTMLButtonElement>('play').disabled = false;
    $('media-info').textContent = `${video.videoWidth} × ${video.videoHeight} · ${formatTime(video.duration)}`;
    void lyrics.player.calcLayout(true, true); updateExport();
  });
  video.addEventListener('error', () => { loaded = false; updateExport(); showError('This browser cannot preview that video codec. Convert the source to an H.264 MP4 and try again.'); });
  input('ttml-file').addEventListener('change', async () => {
    const file = input('ttml-file').files?.[0];
    if (!file) return;
    const generation = ++lyricGeneration;
    ttmlFile = undefined; updateExport(); showError();
    try {
      if (file.size > 10 * 1024 ** 2) throw new Error('TTML file must be smaller than 10 MB.');
      const text = await file.text();
      if (generation !== lyricGeneration) return;
      const lines = await lyrics.load(text);
      if (generation !== lyricGeneration) return;
      ttmlFile = file; $('ttml-name').textContent = file.name;
      $('lyrics-info').textContent = `${lines.length} lines loaded. ${lines.some(line => line.words.length > 1) ? 'Word timing ready.' : 'Line timing only. Word fill needs word-timed TTML.'}`;
      await lyrics.frame(video.currentTime * 1000, 0, true);
    } catch (error) { if (generation === lyricGeneration) { $('ttml-name').textContent = 'Choose another TTML'; showError(String(error)); } }
    updateExport();
  });
  $('play').addEventListener('click', async () => { try { if (video.paused) await video.play(); else video.pause(); } catch (error) { showError(String(error)); } });
  video.addEventListener('play', () => { $('play').textContent = 'Pause'; });
  video.addEventListener('pause', () => { $('play').textContent = 'Play'; });
  input('seek').addEventListener('input', () => { video.currentTime = Number(input('seek').value); });
  video.addEventListener('seeked', () => { void lyrics.frame(video.currentTime * 1000, 0, true); });
  let previous = performance.now();
  async function tick(now: number) {
    await lyrics.frame(video.currentTime * 1000, video.paused ? 0 : now - previous);
    previous = now;
    if (loaded) { input('seek').value = String(video.currentTime); $('time').textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  const setBusy = (busy: boolean) => {
    exporting = busy;
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('aside input, aside select').forEach(el => { el.disabled = busy; });
    $('cancel').hidden = !busy; updateExport();
  };
  async function poll() {
    if (!jobId) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) throw new Error('Cannot read export status. Keep the Bun server running.');
      const job = await res.json();
      $<HTMLProgressElement>('progress').value = job.progress;
      $('status').textContent = job.status === 'rendering' ? `Rendering ${Math.round(job.progress * 100)}% · ${job.frames}/${job.totalFrames} frames` : ({ queued: 'Queued', preparing: 'Preparing lyrics…', encoding: 'Finishing MP4…', done: 'Export complete', cancelled: 'Export cancelled', error: 'Export failed' }[job.status as string] || job.status);
      if (['done', 'error', 'cancelled'].includes(job.status)) {
        if (job.status === 'done') { const link = $<HTMLAnchorElement>('download'); link.href = `/api/jobs/${jobId}/download`; link.hidden = false; }
        if (job.status === 'error') showError(job.error || 'Export failed.');
        setBusy(false); localStorage.removeItem('karaoke-job'); jobId = undefined;
      } else setTimeout(poll, 800);
    } catch (error) { showError(String(error)); setTimeout(poll, 3000); }
  }
  $('export').addEventListener('click', async () => {
    if (!videoFile || !ttmlFile) return;
    showError(); $('download').hidden = true;
    try {
      settings = readSettings(); setBusy(true); video.pause();
      $('progress-area').hidden = false; $('status').textContent = 'Loading source video…';
      $<HTMLProgressElement>('progress').value = 0;
      const body = new FormData(); body.set('video', videoFile); body.set('ttml', ttmlFile); body.set('settings', JSON.stringify(settings));
      const res = await fetch('/api/jobs', { method: 'POST', body });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Could not start export.');
      jobId = data.id; localStorage.setItem('karaoke-job', jobId!); void poll();
    } catch (error) { setBusy(false); showError(String(error)); $('status').textContent = 'Export failed'; }
  });
  $('cancel').addEventListener('click', async () => {
    if (!jobId) return;
    try { const response = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' }); if (!response.ok) throw new Error('Could not cancel export.'); $('status').textContent = 'Cancelling…'; } catch (error) { showError(String(error)); }
  });
  const pending = localStorage.getItem('karaoke-job');
  if (pending) { const response = await fetch(`/api/jobs/${pending}`); if (response.ok) { jobId = pending; setBusy(true); $('progress-area').hidden = false; void poll(); } else localStorage.removeItem('karaoke-job'); }
  const health = await fetch('/api/health').then(res => res.json());
  if (!health.ffmpeg || !health.ffprobe) showError('FFmpeg is missing. Install it before exporting. See README for setup.');
}
void main().catch(error => { console.error(error); const el = document.getElementById('error'); if (el) { el.textContent = String(error); el.hidden = false; } });
