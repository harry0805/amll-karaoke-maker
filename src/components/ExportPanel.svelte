<script lang="ts">
  import type { StudioState } from '../studio.svelte';
  import Icon from './Icon.svelte';
  import SavedExports from './SavedExports.svelte';
  let { studio }: { studio: StudioState } = $props();
</script>

<section
  class="mb-6 border-0 border-b border-solid border-divider pb-6 last:mb-0 last:border-0 last:pb-0"
>
  <h2
    class="mt-0 mb-[17px] flex items-center gap-[9px] text-[16px] font-semibold [&>svg]:text-accent-text"
  >
    <Icon name="film" />Render
  </h2>
  <p
    class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
  >
    Resolution and frame timing match your source. Supports AAC audio or silent video. Keep this tab
    open while rendering.
  </p>
  <p
    id="export-requirements"
    class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
    role="status"
    aria-live="polite"
    hidden={!studio.requirements}
  >
    {studio.requirements}
  </p>
  <button
    class="mt-5 flex w-full cursor-pointer items-center justify-between rounded-[7px] border-0 bg-accent px-4 py-3.5 text-[15px] font-semibold text-accent-ink no-underline outline-offset-[5px] hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid disabled:cursor-default disabled:opacity-35"
    id="export"
    aria-describedby="export-requirements"
    disabled={!!studio.requirements}
    onclick={() => studio.render()}><span>Render MP4</span><Icon name="film" /></button
  >
  <p
    id="error"
    class="my-3.5 text-[13px] leading-[1.6] [overflow-wrap:anywhere] text-error"
    role="alert"
    hidden={!studio.session.errors.export}
  >
    {studio.session.errors.export}
  </p>
  <div id="progress-area" hidden={!studio.session.status}>
    <progress
      class="mt-[18px] mb-2.5 h-1.5 w-full accent-accent"
      id="progress"
      max="1"
      value={studio.session.progress}
    ></progress>
    <div class="flex items-center justify-between gap-2.5 text-[13px]">
      <span id="status" role="status" aria-live="polite">{studio.session.status}</span><button
        class="inline-flex cursor-pointer items-center justify-center gap-[7px] rounded-[7px] border border-solid border-control-border bg-control px-2 py-[5px] text-[12px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:border-accent-border disabled:cursor-default disabled:opacity-35"
        id="cancel"
        hidden={!studio.session.exporting}
        onclick={() => studio.cancel()}><Icon name="x" /><span>Cancel</span></button
      >
    </div>
  </div>
  <SavedExports
    revision={studio.session.savedRevision}
    onerror={(message) => (studio.session.errors.export = message)}
  />
</section>
