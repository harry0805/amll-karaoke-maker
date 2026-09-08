import { defaults, validateSettings, type Settings } from './settings';
import { Lyrics } from './lyrics';
import { checkExportCompatibility } from './export-compatibility';
import { exportVideo } from './browser-export';
import {
  initializeCustomFont,
  customFontName,
  uploadCustomFont,
  removeCustomFont,
  requireCustomFont,
} from './font-runtime';
import { detectDeviceFonts } from './device-fonts';

/** One instance per mounted studio. Rendering objects stay outside reactive state. */
export class Studio {
  settings = $state<Settings>({ ...defaults });
  videoFile = $state<File>();
  ttmlFile = $state<File>();
  ttmlName = $state('Choose TTML');
  lyricsInfo = $state('Word timing comes from your TTML file.');
  loaded = $state(false);
  videoError = $state(false);
  exporting = $state(false);
  fontLoading = $state(true);
  fontUploadBusy = $state(false);
  fontError = $state('');
  offsetError = $state('');
  customName = $state('');
  deviceFonts = $state<Awaited<ReturnType<typeof detectDeviceFonts>>>([]);
  errors = $state({ source: '', settings: '', export: '' });
  compatibilityWarnings = $state<string[]>([]);
  compatibilityChecking = $state(false);
  compatibilityAccepted = $state(false);
  progress = $state(0);
  status = $state('');
  previewVisible = $state(false);
  renderTime = $state(0);
  renderDuration = $state(0);
  savedRevision = $state(0);

  requirements = $derived.by(() => {
    const reasons: string[] = [];
    if (this.exporting) reasons.push('A render is already running.');
    else {
      if (!this.videoFile) reasons.push('Load a video in Source to render.');
      else if (!this.loaded)
        reasons.push(
          this.videoError
            ? 'The video could not be loaded. Choose a supported video in Source.'
            : 'Waiting for the video to load.',
        );
      if (!this.ttmlFile) reasons.push('Load a valid TTML lyrics file in Source to render.');
    }
    if (this.fontLoading || this.fontUploadBusy)
      reasons.push('Wait for the font to finish loading.');
    if (this.fontError) reasons.push(this.fontError);
    if (this.settings.font === 'custom' && !this.customName)
      reasons.push('Upload a custom font in Settings or choose another font before rendering.');
    if (this.errors.settings) reasons.push(this.errors.settings);
    if (this.offsetError) reasons.push(this.offsetError);
    return reasons.join(' ');
  });

  private lyrics?: Lyrics;
  private video?: HTMLVideoElement;
  private canvas?: HTMLCanvasElement;
  private objectURL = '';
  private fontRequest = 0;
  private lyricGeneration = 0;
  private compatibility: Promise<void> = Promise.resolve();
  private controller?: AbortController;
  private disposed = false;

  attach(
    stage: HTMLElement,
    container: HTMLElement,
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
  ) {
    this.video = video;
    this.canvas = canvas;
    this.lyrics = new Lyrics(stage, container, this.settings);
    void detectDeviceFonts().then((fonts) => {
      if (!this.disposed) this.deviceFonts = fonts;
    });
    void this.initializeFonts();
  }

  private async initializeFonts() {
    let restoreError = '';
    try {
      await initializeCustomFont();
    } catch (error) {
      restoreError = String(error);
    }
    if (this.disposed) return;
    this.customName = customFontName() || '';
    // A broken saved custom font must not prevent bundled fonts from loading.
    await this.refreshFont();
    if (!this.disposed && this.settings.font === 'custom' && !this.customName && restoreError)
      this.fontError = restoreError;
  }

  dispose() {
    this.disposed = true;
    this.fontRequest++;
    this.lyricGeneration++;
    this.controller?.abort();
    this.video?.pause();
    this.lyrics?.dispose();
    if (this.objectURL) URL.revokeObjectURL(this.objectURL);
  }

  configure(next: Settings, source: 'source' | 'settings' = 'settings') {
    try {
      const settings = validateSettings(next);
      const fontChanged = settings.font !== this.settings.font;
      this.settings = settings;
      this.lyrics?.configure(settings);
      if (fontChanged) void this.refreshFont();
      this.errors[source] = '';
      void this.frame(0, true);
    } catch (error) {
      this.errors[source] = String(error);
    }
  }

  updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (this.exporting) return;
    if (key === 'offset') {
      this.offsetError =
        typeof value === 'number' && Number.isFinite(value) && value >= -600000 && value <= 600000
          ? ''
          : 'Invalid offset.';
    }
    this.configure(
      { ...this.settings, [key]: value },
      key === 'offset' || key === 'showLyricsBeforeStart' ? 'source' : 'settings',
    );
  }

  async refreshFont() {
    if (!this.lyrics) return;
    const request = ++this.fontRequest;
    this.fontLoading = true;
    this.fontError = '';
    try {
      await this.lyrics.refreshFont();
    } catch (error) {
      if (request === this.fontRequest) this.fontError = String(error);
    } finally {
      if (request === this.fontRequest) this.fontLoading = false;
    }
  }

  async changeCustomFont(file?: File) {
    if (this.exporting || this.fontUploadBusy) return;
    this.fontUploadBusy = true;
    this.fontError = '';
    try {
      if (file) await uploadCustomFont(file);
      else await removeCustomFont();
      if (this.disposed) return;
      this.customName = customFontName() || '';
      await this.refreshFont();
    } catch (error) {
      if (!this.disposed) this.fontError = String(error);
    } finally {
      this.fontUploadBusy = false;
    }
  }

  loadVideo(file?: File) {
    if (!file || !this.video || this.exporting) return;
    this.video.pause();
    this.loaded = false;
    this.videoError = false;
    this.videoFile = file;
    this.compatibilityAccepted = false;
    this.compatibilityWarnings = [];
    this.compatibilityChecking = true;
    this.compatibility = checkExportCompatibility(file)
      .catch(() => ['Render compatibility could not be checked. This file may not be rendered.'])
      .then((warnings) => {
        if (this.videoFile !== file || this.disposed) return;
        this.compatibilityWarnings = warnings;
        this.compatibilityChecking = false;
      });
    if (this.objectURL) URL.revokeObjectURL(this.objectURL);
    this.objectURL = URL.createObjectURL(file);
    this.video.src = this.objectURL;
    this.errors.source = '';
  }

  async canLeaveSource() {
    const file = this.videoFile;
    await this.compatibility;
    if (file !== this.videoFile || this.disposed) return 'stale';
    return this.compatibilityWarnings.length && !this.compatibilityAccepted ? 'warn' : 'ready';
  }

  async loadTTML(file?: File) {
    if (!file || !this.lyrics || this.exporting) return;
    const generation = ++this.lyricGeneration;
    this.ttmlFile = undefined;
    this.errors.source = '';
    try {
      if (file.size > 10 * 1024 ** 2) throw new Error('TTML file must be smaller than 10 MB.');
      const text = await file.text();
      if (generation !== this.lyricGeneration) return;
      const lines = await this.lyrics.load(text);
      if (generation !== this.lyricGeneration) return;
      this.ttmlFile = file;
      this.ttmlName = file.name;
      this.lyricsInfo = `${lines.length} lines loaded. ${lines.some((line) => line.words.length > 1) ? 'Word timing ready.' : 'Line timing only. Word fill needs word-timed TTML.'}`;
      await this.frame(0, true);
    } catch (error) {
      if (generation === this.lyricGeneration) {
        this.ttmlName = 'Choose another TTML';
        this.errors.source = String(error);
      }
    }
  }

  async frame(delta: number, seek = false) {
    if (!this.disposed && !this.exporting && this.video)
      await this.lyrics?.frame(this.video.currentTime * 1000, delta, seek);
  }

  async resizeLyrics() {
    await this.lyrics?.player.calcLayout(true, true);
  }

  async render() {
    if (this.requirements || !this.videoFile || !this.ttmlFile || !this.canvas || !this.video)
      return;
    this.errors.export = '';
    const controller = (this.controller = new AbortController());
    try {
      const settings = validateSettings(this.settings);
      requireCustomFont(settings.font);
      this.exporting = true;
      this.video.pause();
      this.status = 'Preparing render…';
      this.progress = 0;
      await exportVideo({
        video: this.videoFile,
        ttml: await this.ttmlFile.text(),
        settings,
        name: this.videoFile.name.replace(/\.[^.]+$/, '') + '-karaoke.mp4',
        preview: this.canvas,
        signal: controller.signal,
        onProgress: ({ frames, time, duration, finishing, fps }) => {
          if (this.disposed) return;
          this.previewVisible = true;
          this.progress = Math.min(0.99, time / duration);
          this.status = finishing
            ? 'Finishing MP4…'
            : `Rendering ${Math.round((time / duration) * 100)}% · ${frames} frames · ${fps.toFixed(1)} fps`;
          this.renderTime = time;
          this.renderDuration = duration;
        },
      });
      this.savedRevision++;
      this.progress = 1;
      this.status = 'Render saved on this device';
    } catch (error) {
      if (controller.signal.aborted) this.status = 'Render cancelled';
      else {
        this.errors.export = String(error);
        this.status = 'Render failed';
      }
    } finally {
      this.controller = undefined;
      this.previewVisible = false;
      this.canvas.width = this.canvas.height = 0;
      this.exporting = false;
      await this.frame(0, true);
    }
  }

  cancel() {
    this.controller?.abort();
    this.status = 'Cancelling…';
  }
}
