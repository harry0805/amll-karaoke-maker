<script lang="ts">
  import type { Studio } from '../studio.svelte';
  import Icon from './Icon.svelte';
  import SavedExports from './SavedExports.svelte';
  let { studio }: { studio: Studio } = $props();
</script>

<section class="panel">
  <h2><Icon name="film" />Render</h2>
  <p class="hint">
    Resolution and frame timing match your source. Supports AAC audio or silent video. Keep this tab
    open while rendering.
  </p>
  <p
    id="export-requirements"
    class="hint"
    role="status"
    aria-live="polite"
    hidden={!studio.requirements}
  >
    {studio.requirements}
  </p>
  <button
    class="primary"
    id="export"
    aria-describedby="export-requirements"
    disabled={!!studio.requirements}
    onclick={() => studio.render()}><span>Render MP4</span><Icon name="film" /></button
  >
  <p id="error" class="step-error" role="alert" hidden={!studio.errors.export}>
    {studio.errors.export}
  </p>
  <div id="progress-area" hidden={!studio.status}>
    <progress id="progress" max="1" value={studio.progress}></progress>
    <div class="progress-row">
      <span id="status" role="status" aria-live="polite">{studio.status}</span><button
        id="cancel"
        hidden={!studio.exporting}
        onclick={() => studio.cancel()}><Icon name="x" /><span>Cancel</span></button
      >
    </div>
  </div>
  <SavedExports
    revision={studio.savedRevision}
    onerror={(message) => (studio.errors.export = message)}
  />
</section>
