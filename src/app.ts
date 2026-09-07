import { exportVideo } from './browser-export';
import { listStoredExports, deleteStoredExport } from './export-storage';
import { Lyrics } from './lyrics';
import { defaults, validateSettings, type Settings } from './settings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const stage = $('stage');

async function main() {
  let settings: Settings = { ...defaults };
  const lyrics = new Lyrics(stage, $('lyrics'), settings);
  const video = $<HTMLVideoElement>('video');
  let videoFile: File | undefined;
  let ttmlFile: File | undefined;
  let objectURL = '';
  let loaded = false;
  let exporting = false;
  let exportController: AbortController | undefined;
  const downloadURLs: string[] = [];
  const exportPreview = $<HTMLCanvasElement>("export-preview");
  let lyricGeneration = 0;
  const showError = (message = '') => { $('error').textContent = message; $('error').hidden = !message; };
  async function refreshSavedExports() {
    const exports = await listStoredExports();
    for (const url of downloadURLs) URL.revokeObjectURL(url);
    downloadURLs.length = 0;
    const list = $('saved-exports'); list.replaceChildren();
    for (const item of exports) {
      const row = document.createElement('div'); row.className = 'saved-export';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(item.file); downloadURLs.push(link.href);
      link.download = item.name; link.textContent = `${item.name} · ${(item.file.size / 1024 ** 2).toFixed(1)} MB`;
      const remove = document.createElement('button');
      remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete saved export ${item.name}`);
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try { await deleteStoredExport(item.id); await refreshSavedExports(); }
        catch (error) { showError(String(error)); remove.disabled = false; }
      });
      row.append(link, remove); list.append(row);
    }
    $('saved-area').hidden = !exports.length;
  }
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
      $('lineSpacing-value').textContent = `${settings.lineSpacing.toFixed(2)}×`;
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
    if (!exporting) await lyrics.frame(video.currentTime * 1000, video.paused ? 0 : now - previous);
    previous = now;
    if (loaded && !exporting) { input('seek').value = String(video.currentTime); $('time').textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  const setBusy = (busy: boolean) => {
    exporting = busy;
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('aside input, aside select').forEach(el => { el.disabled = busy; });
    $('cancel').hidden = !busy;
    input('seek').disabled = busy || !loaded;
    $<HTMLButtonElement>('play').disabled = busy || !loaded;
    updateExport();
  };
  $('export').addEventListener('click', async () => {
    if (!videoFile || !ttmlFile || exporting) return;
    showError();
    exportController = new AbortController();
    try {
      settings = readSettings(); setBusy(true); video.pause();
      $('progress-area').hidden = false; $('status').textContent = 'Preparing browser export…';
      $<HTMLProgressElement>('progress').value = 0;
      await exportVideo({
        video: videoFile, ttml: await ttmlFile.text(), settings,
        name: videoFile.name.replace(/\.[^.]+$/, '') + '-karaoke.mp4',
        preview: exportPreview, signal: exportController.signal,
        onProgress: ({ frames, time, duration, finishing }) => {
          exportPreview.hidden = false;
          $<HTMLProgressElement>('progress').value = Math.min(.99, time / duration);
          $('status').textContent = finishing ? 'Finishing MP4…' : 'Rendering ' + Math.round(time / duration * 100) + '% · ' + frames + ' frames';
          input('seek').value = String(time);
          $('time').textContent = formatTime(time) + ' / ' + formatTime(duration);
        },
      });
      await refreshSavedExports();
      $<HTMLProgressElement>('progress').value = 1;
      $('status').textContent = 'Export saved on this device';
    } catch (error) {
      if (exportController.signal.aborted) $('status').textContent = 'Export cancelled';
      else { showError(String(error)); $('status').textContent = 'Export failed'; }
    } finally {
      exportController = undefined; exportPreview.hidden = true;
      exportPreview.width = exportPreview.height = 0;
      setBusy(false); await lyrics.frame(video.currentTime * 1000, 0, true);
    }
  });
  $('cancel').addEventListener('click', () => {
    exportController?.abort(); $('status').textContent = 'Cancelling…';
  });
  window.addEventListener('beforeunload', event => {
    if (exporting) { event.preventDefault(); event.returnValue = ''; }
  });
  // OPFS failures are reported here and on export, never replaced with RAM storage.
  void refreshSavedExports().catch(error => showError(String(error)));
}
void main().catch(error => { console.error(error); const el = document.getElementById('error'); if (el) { el.textContent = String(error); el.hidden = false; } });
