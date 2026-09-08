import {
  presetDefaults,
  preferenceDefaults,
  pickPresetSettings,
  pickPreferences,
  validateSettings,
  type PresetSettings,
  type Preferences,
  type SettingsSnapshot,
} from './settings';
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

/** Temporary in-memory values. Never written to sessionStorage. */
export class SessionState {
  // Runtime state belongs to this mounted studio and is never serialized as settings.
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
}

/** One instance per mounted studio. Rendering objects stay outside reactive state. */
export class StudioState {
  presetSettings = $state<PresetSettings>({ ...presetDefaults });
  preferences = $state<Preferences>({ ...preferenceDefaults });
  session = new SessionState();

  // Flat adapter for the lyrics engine and export payload, never the live state owner.
  get settingsSnapshot(): SettingsSnapshot {
    return { ...this.presetSettings, ...this.preferences };
  }

  requirements = $derived.by(() => {
    const reasons: string[] = [];
    if (this.session.exporting) reasons.push('A render is already running.');
    else {
      if (!this.session.videoFile) reasons.push('Load a video in Source to render.');
      else if (!this.session.loaded)
        reasons.push(
          this.session.videoError
            ? 'The video could not be loaded. Choose a supported video in Source.'
            : 'Waiting for the video to load.',
        );
      if (!this.session.ttmlFile)
        reasons.push('Load a valid TTML lyrics file in Source to render.');
    }
    if (this.session.fontLoading || this.session.fontUploadBusy)
      reasons.push('Wait for the font to finish loading.');
    if (this.session.fontError) reasons.push(this.session.fontError);
    if (this.settingsSnapshot.font === 'custom' && !this.session.customName)
      reasons.push('Upload a custom font in Settings or choose another font before rendering.');
    if (this.session.errors.settings) reasons.push(this.session.errors.settings);
    if (this.session.offsetError) reasons.push(this.session.offsetError);
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
    this.lyrics = new Lyrics(stage, container, this.settingsSnapshot);
    void detectDeviceFonts().then((fonts) => {
      if (!this.disposed) this.session.deviceFonts = fonts;
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
    this.session.customName = customFontName() || '';
    // A broken saved custom font must not prevent bundled fonts from loading.
    await this.refreshFont();
    if (
      !this.disposed &&
      this.settingsSnapshot.font === 'custom' &&
      !this.session.customName &&
      restoreError
    )
      this.session.fontError = restoreError;
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

  configure(next: SettingsSnapshot, source: 'source' | 'settings' = 'settings') {
    try {
      const settings = validateSettings(next);
      const fontChanged = settings.font !== this.settingsSnapshot.font;
      this.presetSettings = pickPresetSettings(settings);
      this.preferences = pickPreferences(settings);
      this.lyrics?.configure(settings);
      if (fontChanged) void this.refreshFont();
      this.session.errors[source] = '';
      void this.frame(0, true);
    } catch (error) {
      this.session.errors[source] = String(error);
    }
  }

  updatePresetSetting<K extends keyof PresetSettings>(key: K, value: PresetSettings[K]) {
    if (this.session.exporting) return;
    this.configure({ ...this.settingsSnapshot, [key]: value });
  }

  updatePreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    if (this.session.exporting) return;
    if (key === 'offset') {
      this.session.offsetError =
        typeof value === 'number' && Number.isFinite(value) && value >= -600000 && value <= 600000
          ? ''
          : 'Invalid offset.';
    }
    this.configure({ ...this.settingsSnapshot, [key]: value }, 'source');
  }

  async refreshFont() {
    if (!this.lyrics) return;
    const request = ++this.fontRequest;
    this.session.fontLoading = true;
    this.session.fontError = '';
    try {
      await this.lyrics.refreshFont();
    } catch (error) {
      if (request === this.fontRequest) this.session.fontError = String(error);
    } finally {
      if (request === this.fontRequest) this.session.fontLoading = false;
    }
  }

  async changeCustomFont(file?: File) {
    if (this.session.exporting || this.session.fontUploadBusy) return;
    this.session.fontUploadBusy = true;
    this.session.fontError = '';
    try {
      if (file) await uploadCustomFont(file);
      else await removeCustomFont();
      if (this.disposed) return;
      this.session.customName = customFontName() || '';
      await this.refreshFont();
    } catch (error) {
      if (!this.disposed) this.session.fontError = String(error);
    } finally {
      this.session.fontUploadBusy = false;
    }
  }

  loadVideo(file?: File) {
    if (!file || !this.video || this.session.exporting) return;
    this.video.pause();
    this.session.loaded = false;
    this.session.videoError = false;
    this.session.videoFile = file;
    this.session.compatibilityAccepted = false;
    this.session.compatibilityWarnings = [];
    this.session.compatibilityChecking = true;
    this.compatibility = checkExportCompatibility(file)
      .catch(() => ['Render compatibility could not be checked. This file may not be rendered.'])
      .then((warnings) => {
        if (this.session.videoFile !== file || this.disposed) return;
        this.session.compatibilityWarnings = warnings;
        this.session.compatibilityChecking = false;
      });
    if (this.objectURL) URL.revokeObjectURL(this.objectURL);
    this.objectURL = URL.createObjectURL(file);
    this.video.src = this.objectURL;
    this.session.errors.source = '';
  }

  async canLeaveSource() {
    const file = this.session.videoFile;
    await this.compatibility;
    if (file !== this.session.videoFile || this.disposed) return 'stale';
    return this.session.compatibilityWarnings.length && !this.session.compatibilityAccepted
      ? 'warn'
      : 'ready';
  }

  async loadTTML(file?: File) {
    if (!file || !this.lyrics || this.session.exporting) return;
    const generation = ++this.lyricGeneration;
    this.session.ttmlFile = undefined;
    this.session.errors.source = '';
    try {
      if (file.size > 10 * 1024 ** 2) throw new Error('TTML file must be smaller than 10 MB.');
      const text = await file.text();
      if (generation !== this.lyricGeneration) return;
      const lines = await this.lyrics.load(text);
      if (generation !== this.lyricGeneration) return;
      this.session.ttmlFile = file;
      this.session.ttmlName = file.name;
      this.session.lyricsInfo = `${lines.length} lines loaded. ${lines.some((line) => line.words.length > 1) ? 'Word timing ready.' : 'Line timing only. Word fill needs word-timed TTML.'}`;
      await this.frame(0, true);
    } catch (error) {
      if (generation === this.lyricGeneration) {
        this.session.ttmlName = 'Choose another TTML';
        this.session.errors.source = String(error);
      }
    }
  }

  async frame(delta: number, seek = false) {
    if (!this.disposed && !this.session.exporting && this.video)
      await this.lyrics?.frame(this.video.currentTime * 1000, delta, seek);
  }

  async resizeLyrics() {
    await this.lyrics?.player.calcLayout(true, true);
  }

  async render() {
    if (
      this.requirements ||
      !this.session.videoFile ||
      !this.session.ttmlFile ||
      !this.canvas ||
      !this.video
    )
      return;
    this.session.errors.export = '';
    const controller = (this.controller = new AbortController());
    try {
      const settings = validateSettings(this.settingsSnapshot);
      requireCustomFont(settings.font);
      this.session.exporting = true;
      this.video.pause();
      this.session.status = 'Preparing render…';
      this.session.progress = 0;
      await exportVideo({
        video: this.session.videoFile,
        ttml: await this.session.ttmlFile.text(),
        settings,
        name: this.session.videoFile.name.replace(/\.[^.]+$/, '') + '-karaoke.mp4',
        preview: this.canvas,
        signal: controller.signal,
        onProgress: ({ frames, time, duration, finishing, fps }) => {
          if (this.disposed) return;
          this.session.previewVisible = true;
          this.session.progress = Math.min(0.99, time / duration);
          this.session.status = finishing
            ? 'Finishing MP4…'
            : `Rendering ${Math.round((time / duration) * 100)}% · ${frames} frames · ${fps.toFixed(1)} fps`;
          this.session.renderTime = time;
          this.session.renderDuration = duration;
        },
      });
      this.session.savedRevision++;
      this.session.progress = 1;
      this.session.status = 'Render saved on this device';
    } catch (error) {
      if (controller.signal.aborted) this.session.status = 'Render cancelled';
      else {
        this.session.errors.export = String(error);
        this.session.status = 'Render failed';
      }
    } finally {
      this.controller = undefined;
      this.session.previewVisible = false;
      this.canvas.width = this.canvas.height = 0;
      this.session.exporting = false;
      await this.frame(0, true);
    }
  }

  cancel() {
    this.controller?.abort();
    this.session.status = 'Cancelling…';
  }
}
