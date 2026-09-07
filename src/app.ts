import { initializeIcons, createIcon } from './icons';
import { setupPresets } from './preset-controls';
import { checkExportCompatibility } from './export-compatibility';
import { exportVideo } from './browser-export';
import { listStoredExports, deleteStoredExport } from './export-storage';
import { Lyrics } from './lyrics';
import { defaults, validateSettings, type Settings } from './settings';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => $<HTMLInputElement>(id);
const stage = $('stage');

async function main() {
  initializeIcons();
  let settings: Settings = { ...defaults };
  let presetControls: ReturnType<typeof setupPresets> | undefined;
  const lyrics = new Lyrics(stage, $('lyrics'), settings);
  const video = $<HTMLVideoElement>('video');
  let videoFile: File | undefined;
  let compatibility: Promise<void> = Promise.resolve();
  let compatibilityWarnings: string[] = [];
  let compatibilityAccepted = false;
  let pendingStep = 1;
  let ttmlFile: File | undefined;
  let objectURL = '';
  let loaded = false;
  let exporting = false;
  let exportController: AbortController | undefined;
  const downloadURLs: string[] = [];
  const exportPreview = $<HTMLCanvasElement>("export-preview");
  let lyricGeneration = 0;
  const showError = (message = '', step: 'source' | 'settings' | 'export' = 'source') => {
    const element = $(step === 'export' ? 'error' : step + '-error');
    element.textContent = message; element.hidden = !message;
  };
  async function refreshSavedExports() {
    const exports = await listStoredExports();
    for (const url of downloadURLs) URL.revokeObjectURL(url);
    downloadURLs.length = 0;
    const list = $('saved-exports'); list.replaceChildren();
    for (const item of exports) {
      const row = document.createElement('div'); row.className = 'saved-export';
      const details = document.createElement('div'); details.className = 'saved-details';
      const name = document.createElement('div'); name.className = 'saved-name'; name.textContent = item.name; name.title = item.name;
      const metadata = document.createElement('div'); metadata.className = 'saved-metadata';
      const size = item.file.size < 1024 ** 2 ? Math.max(1, Math.round(item.file.size / 1024)) + ' KB' : (item.file.size / 1024 ** 2).toFixed(1) + ' MB';
      metadata.textContent = size + ' · ' + new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      details.append(name, metadata);
      const actions = document.createElement('div'); actions.className = 'saved-file-actions';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(item.file); downloadURLs.push(link.href);
      link.download = item.name; link.append(createIcon('download'), 'Download'); link.setAttribute('aria-label', `Download ${item.name}`);
      const remove = document.createElement('button');
      remove.append(createIcon('trash-2'), 'Delete'); remove.setAttribute('aria-label', `Delete saved export ${item.name}`);
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try { await deleteStoredExport(item.id); await refreshSavedExports(); }
        catch (error) { showError(String(error), 'export'); remove.disabled = false; }
      });
      actions.append(link, remove); row.append(details, actions); list.append(row);
    }
    $('saved-empty').hidden = exports.length > 0;
    $('saved-count').textContent = String(exports.length);
    $('saved-count').hidden = !exports.length;
  }
  const steps = ['source', 'settings', 'export'] as const;
  let currentStep = 0;
  function selectStep(index: number, focus = false) {
    if (index !== 1) $('preset-panel').hidePopover();
    currentStep = index;
    steps.forEach((step, i) => {
      const selected = i === index;
      const tab = $('tab-' + step);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      $('step-' + step).hidden = !selected;
      if (selected && focus) tab.focus();
    });
    $('next-step').hidden = index === 2;
    document.querySelector<HTMLElement>('.step-actions')!.hidden = index === 2;
    $('next-step-label').textContent = index === 0 ? 'Next: Settings' : 'Next: Export';
    document.querySelector('.step-scroll')!.scrollTop = 0;
  }
  async function requestStep(index: number, focus = false) {
    if (index === 0) { selectStep(index, focus); return; }
    const file = videoFile;
    await compatibility;
    if (file !== videoFile) return;
    if (compatibilityWarnings.length && !compatibilityAccepted) {
      pendingStep = index;
      selectStep(0);
      $<HTMLDialogElement>('compatibility-warning').showModal();
      return;
    }
    selectStep(index, focus);
  }
  $('proceed-anyway').addEventListener('click', () => {
    compatibilityAccepted = true;
    $<HTMLDialogElement>('compatibility-warning').close();
    selectStep(pendingStep, true);
  });
  $('compatibility-warning').addEventListener('close', () => {
    if (!compatibilityAccepted) $('tab-source').focus();
  });
  $('stay-source').addEventListener('click', () => {
    $<HTMLDialogElement>('compatibility-warning').close();
    $('tab-source').focus();
  });
  steps.forEach((step, index) => {
    $('tab-' + step).addEventListener('click', () => void requestStep(index));
    $('tab-' + step).addEventListener('keydown', event => {
      let target: number;
      if (event.key === 'ArrowRight') target = (index + 1) % steps.length;
      else if (event.key === 'ArrowLeft') target = (index + steps.length - 1) % steps.length;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = steps.length - 1;
      else return;
      event.preventDefault(); void requestStep(target, true);
    });
  });
  $('next-step').addEventListener('click', () => void requestStep(Math.min(2, currentStep + 1), true));
  const updateExport = () => {
    const reasons: string[] = [];
    if (exporting) reasons.push('Export is already running.');
    else {
      if (!videoFile) reasons.push('Load a video in Source to export.');
      else if (!loaded) reasons.push(video.error || video.readyState >= 1
        ? 'The video could not be loaded. Choose a supported video in Source.'
        : 'Waiting for the video to load.');
      if (!ttmlFile) reasons.push('Load a valid TTML lyrics file in Source to export.');
    }
    const message = reasons.join(' ');
    $('export-requirements').textContent = message;
    $('export-requirements').hidden = !message;
    $<HTMLButtonElement>('export').disabled = reasons.length > 0;
  };
  updateExport();
  const formatTime = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  const readSettings = () => validateSettings(Object.fromEntries(Object.keys(defaults).map(key => {
    const control = input(key === 'shade' ? 'shade-control' : key);
    if (control.type === 'checkbox') return [key, control.checked];
    const value = control.value;
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
      showError('', 'settings');
      presetControls?.changed();
    } catch (error) { showError(String(error), 'settings'); }
  }
  for (const key of Object.keys(defaults) as (keyof Settings)[]) {
    const control = input(key === 'shade' ? 'shade-control' : key);
    if (control.type === 'checkbox') control.checked = Boolean(defaults[key]);
    else control.value = String(defaults[key]);
    control.addEventListener('input', changeSettings);
  }
  changeSettings();
  presetControls = setupPresets(() => settings, next => {
    for (const key of Object.keys(defaults) as (keyof Settings)[]) {
      const control = input(key === 'shade' ? 'shade-control' : key);
      if (control.type === 'checkbox') control.checked = Boolean(next[key]);
      else control.value = String(next[key]);
    }
    changeSettings();
  });
  input('video-file').addEventListener('change', () => {
    const file = input('video-file').files?.[0];
    if (!file) return;
    video.pause(); loaded = false; videoFile = file;
    compatibilityAccepted = false; compatibilityWarnings = [];
    $("source-compatibility-issues").replaceChildren();
    $("source-compatibility-issues").hidden = true;
    $<HTMLDialogElement>('compatibility-warning').close();
    $('compatibility-status').textContent = 'Checking export compatibility…';
    compatibility = checkExportCompatibility(file).catch(() => ['Export compatibility could not be checked. This file may not be exportable.']).then(warnings => {
      if (videoFile !== file) return;
      compatibilityWarnings = warnings;
      $('compatibility-status').textContent = '';
      const sourceIssues = $('source-compatibility-issues');
      sourceIssues.replaceChildren(); sourceIssues.hidden = !warnings.length;
      const list = $('compatibility-reasons'); list.replaceChildren();
      for (const warning of warnings) {
        const item = document.createElement('li'); item.textContent = warning; list.append(item);
        sourceIssues.append(item.cloneNode(true));
      }
    });
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = URL.createObjectURL(file); video.src = objectURL;
    $('video-name').textContent = file.name; showError(); updateExport();
  });
  video.addEventListener('loadedmetadata', () => {
    if (!Number.isFinite(video.duration) || !video.videoWidth) { updateExport(); showError('Cannot determine the video duration. Try an MP4 video.'); return; }
    loaded = true; $('empty').hidden = true;
    stage.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    stage.closest<HTMLElement>('.preview-frame')!.style.setProperty('--video-aspect', String(video.videoWidth / video.videoHeight));
    input('seek').max = String(video.duration); input('seek').disabled = false;
    for (const id of ['play', 'rewind', 'forward']) $<HTMLButtonElement>(id).disabled = exporting;
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
  async function togglePlayback() {
    if (!loaded || exporting) return;
    try { if (video.paused) await video.play(); else video.pause(); }
    catch (error) { showError(String(error)); }
  }
  function updatePlaybackButton() {
    const playing = !video.paused;
    const label = playing ? 'Pause' : 'Play';
    $('play').setAttribute('aria-label', label);
    $('play').title = label + ' (Space)';
    $('play').querySelector('.play-symbol')!.toggleAttribute('hidden', playing);
    $('play').querySelector('.pause-symbol')!.toggleAttribute('hidden', !playing);
  }
  function seekBy(seconds: number) {
    if (!loaded || exporting || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  }
  $('play').addEventListener('click', () => void togglePlayback());
  $('rewind').addEventListener('click', () => seekBy(-10));
  $('forward').addEventListener('click', () => seekBy(10));
  video.addEventListener('play', updatePlaybackButton);
  video.addEventListener('pause', updatePlaybackButton);
  video.addEventListener('ended', updatePlaybackButton);
  document.addEventListener('keydown', event => {
    const target = event.target;
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !loaded || exporting) return;
    if (target instanceof HTMLElement && target.closest('input, select, textarea, button, a, [contenteditable]:not([contenteditable="false"]), [role="tab"], [role="dialog"], dialog')) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) void togglePlayback();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); seekBy(event.key === 'ArrowLeft' ? -5 : 5);
    }
  });
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
    presetControls?.setBusy(busy);
    $('cancel').hidden = !busy;
    input('seek').disabled = busy || !loaded;
    for (const id of ['play', 'rewind', 'forward']) $<HTMLButtonElement>(id).disabled = busy || !loaded;
    updateExport();
  };
  $('export').addEventListener('click', async () => {
    if (!videoFile || !ttmlFile || exporting) return;
    showError('', 'export');
    exportController = new AbortController();
    try {
      settings = readSettings(); setBusy(true); video.pause();
      $('progress-area').hidden = false; $('status').textContent = 'Preparing browser export…';
      $<HTMLProgressElement>('progress').value = 0;
      await exportVideo({
        video: videoFile, ttml: await ttmlFile.text(), settings,
        name: videoFile.name.replace(/\.[^.]+$/, '') + '-karaoke.mp4',
        preview: exportPreview, signal: exportController.signal,
        onProgress: ({ frames, time, duration, finishing, fps }) => {
          exportPreview.hidden = false;
          $<HTMLProgressElement>('progress').value = Math.min(.99, time / duration);
          $('status').textContent = finishing ? 'Finishing MP4…' : 'Rendering ' + Math.round(time / duration * 100) + '% · ' + frames + ' frames · ' + fps.toFixed(1) + ' fps';
          input('seek').value = String(time);
          $('time').textContent = formatTime(time) + ' / ' + formatTime(duration);
        },
      });
      await refreshSavedExports();
      $<HTMLProgressElement>('progress').value = 1;
      $('status').textContent = 'Export saved on this device';
    } catch (error) {
      if (exportController.signal.aborted) $('status').textContent = 'Export cancelled';
      else { showError(String(error), 'export'); $('status').textContent = 'Export failed'; }
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
  void refreshSavedExports().catch(error => showError(String(error), 'export'));
}
void main().catch(error => { console.error(error); const el = document.getElementById('source-error'); if (el) { el.textContent = String(error); el.hidden = false; } });
