<script lang="ts">
  import type { Studio } from '../studio.svelte';
  import Icon from './Icon.svelte';
  let { studio }: { studio: Studio } = $props();
</script>

<section class="panel">
  <h2><Icon name="files" />Source files</h2>
  <label class="file-picker"
    ><span><Icon name="video" /><strong>Video</strong></span><input
      id="video-file"
      type="file"
      accept="video/*,.mkv,.mov,.mp4,.webm"
      disabled={studio.exporting}
      onchange={(event) => studio.loadVideo(event.currentTarget.files?.[0])}
    /><span id="video-name">{studio.videoFile?.name || 'Choose video'}</span></label
  >
  <label class="file-picker"
    ><span><Icon name="file-music" /><strong>Lyrics</strong></span><input
      id="ttml-file"
      type="file"
      accept=".ttml,.xml"
      disabled={studio.exporting}
      onchange={(event) => studio.loadTTML(event.currentTarget.files?.[0])}
    /><span id="ttml-name">{studio.ttmlName}</span></label
  >
  <p id="lyrics-info" class="hint">{studio.lyricsInfo}</p>
  <p class="hint">
    Create or edit lyrics for your song in <a
      href="https://tool.amll.dev/"
      target="_blank"
      rel="noopener noreferrer">AMLL TTML Tool <Icon name="arrow-up-right" /></a
    >, then import the TTML here.
  </p>
</section>
<section class="panel">
  <h2>Timing</h2>
  <label class="number-label" for="offset"
    >Timing offset <div>
      <input
        id="offset"
        type="number"
        min="-600000"
        max="600000"
        step="50"
        value={studio.settings.offset}
        disabled={studio.exporting}
        oninput={(event) => studio.updateSetting('offset', event.currentTarget.valueAsNumber)}
      /><span>ms</span>
    </div></label
  >
  <p class="hint">Positive values make lyrics appear later.</p>
  <label class="checkbox-label"
    ><input
      id="showLyricsBeforeStart"
      type="checkbox"
      checked={studio.settings.showLyricsBeforeStart}
      disabled={studio.exporting}
      onchange={(event) =>
        studio.updateSetting('showLyricsBeforeStart', event.currentTarget.checked)}
    /> Show lyrics before start</label
  >
  <p class="hint">
    When off, a positive offset delays the display, then fades it in. Normal prelude dots still
    appear once the TTML timeline starts.
  </p>
</section>
<p id="compatibility-status" class="hint" role="status" aria-live="polite">
  {studio.compatibilityChecking ? 'Checking render compatibility…' : ''}
</p>
<ul
  id="source-compatibility-issues"
  class="hint"
  aria-live="polite"
  hidden={!studio.compatibilityWarnings.length}
>
  {#each studio.compatibilityWarnings as warning}<li>{warning}</li>{/each}
</ul>
<p id="source-error" class="step-error" role="alert" hidden={!studio.errors.source}>
  {studio.errors.source}
</p>
