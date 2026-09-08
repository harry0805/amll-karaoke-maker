<script lang="ts">
  import type { StudioState } from '../studio.svelte';
  import Icon from './Icon.svelte';
  let { studio }: { studio: StudioState } = $props();
</script>

<section
  class="mb-6 border-0 border-b border-solid border-divider pb-6 last:mb-0 last:border-0 last:pb-0"
>
  <h2
    class="mt-0 mb-[17px] flex items-center gap-[9px] text-[16px] font-semibold [&>svg]:text-accent-text"
  >
    <Icon name="files" />Source files
  </h2>
  <label
    class="relative mb-2.5 block cursor-pointer rounded-lg border border-solid border-[#36363d] bg-panel p-3.5 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-accent focus-within:outline-solid hover:border-accent-border"
    ><span class="flex items-center gap-2.5 text-[12px] text-muted [&>svg]:text-accent-text"
      ><Icon name="video" /><strong class="text-[14px] font-medium text-foreground">Video</strong
      ></span
    ><input
      class="absolute inset-0 h-full w-full cursor-pointer opacity-0 outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
      id="video-file"
      type="file"
      accept="video/*,.mkv,.mov,.mp4,.webm"
      disabled={studio.session.exporting}
      onchange={(event) => studio.loadVideo(event.currentTarget.files?.[0])}
    /><span class="mt-[9px] block truncate text-[14px] text-[#ababba]" id="video-name"
      >{studio.session.videoFile?.name || 'Choose video'}</span
    ></label
  >
  <label
    class="relative mb-2.5 block cursor-pointer rounded-lg border border-solid border-[#36363d] bg-panel p-3.5 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-accent focus-within:outline-solid hover:border-accent-border"
    ><span class="flex items-center gap-2.5 text-[12px] text-muted [&>svg]:text-accent-text"
      ><Icon name="file-music" /><strong class="text-[14px] font-medium text-foreground"
        >Lyrics</strong
      ></span
    ><input
      class="absolute inset-0 h-full w-full cursor-pointer opacity-0 outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
      id="ttml-file"
      type="file"
      accept=".ttml,.xml"
      disabled={studio.session.exporting}
      onchange={(event) => studio.loadTTML(event.currentTarget.files?.[0])}
    /><span class="mt-[9px] block truncate text-[14px] text-[#ababba]" id="ttml-name"
      >{studio.session.ttmlName}</span
    ></label
  >
  <p
    id="lyrics-info"
    class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
  >
    {studio.session.lyricsInfo}
  </p>
  <p
    class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
  >
    Create or edit lyrics for your song in <a
      class="cursor-pointer outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
      href="https://tool.amll.dev/"
      target="_blank"
      rel="noopener noreferrer">AMLL TTML Tool <Icon name="arrow-up-right" /></a
    >, then import the TTML here.
  </p>
</section>
<section
  class="mb-6 border-0 border-b border-solid border-divider pb-6 last:mb-0 last:border-0 last:pb-0"
>
  <h2 class="mt-0 mb-[17px] text-[16px] font-semibold">Timing</h2>
  <label class="mt-5 flex items-center justify-between text-[14px]" for="offset"
    >Timing offset <div class="flex items-center gap-2 text-muted">
      <input
        class="w-[88px] rounded-[5px] border border-solid border-[#39393f] bg-field p-[7px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
        id="offset"
        type="number"
        min="-600000"
        max="600000"
        step="50"
        value={studio.preferences.offset}
        disabled={studio.session.exporting}
        oninput={(event) => studio.updatePreference('offset', event.currentTarget.valueAsNumber)}
      /><span>ms</span>
    </div></label
  >
  <p
    class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
  >
    Positive values make lyrics appear later.
  </p>
  <label class="mt-4 flex cursor-pointer items-center gap-2 text-[14px]"
    ><input
      class="m-0 accent-accent outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
      id="showLyricsBeforeStart"
      type="checkbox"
      checked={studio.preferences.showLyricsBeforeStart}
      disabled={studio.session.exporting}
      onchange={(event) =>
        studio.updatePreference('showLyricsBeforeStart', event.currentTarget.checked)}
    /> Show lyrics before start</label
  >
  <p
    class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
  >
    When off, a positive offset delays the display, then fades it in. Normal prelude dots still
    appear once the TTML timeline starts.
  </p>
</section>
<p
  id="compatibility-status"
  class="mt-3 mb-0 text-[12px] leading-[1.5] text-muted empty:hidden [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px]"
  role="status"
  aria-live="polite"
>
  {studio.session.compatibilityChecking ? 'Checking render compatibility…' : ''}
</p>
<ul
  id="source-compatibility-issues"
  class="mt-3 mb-0 pl-[18px] text-[12px] leading-[1.5] text-[#dec994] [&_a]:text-accent-text [&_a]:underline-offset-[3px] [&_a_svg]:size-[13px] [&_a_svg]:align-[-2px] [&>li+li]:mt-2"
  aria-live="polite"
  hidden={!studio.session.compatibilityWarnings.length}
>
  {#each studio.session.compatibilityWarnings as warning}<li>{warning}</li>{/each}
</ul>
<p
  id="source-error"
  class="my-3.5 text-[13px] leading-[1.6] [overflow-wrap:anywhere] text-error"
  role="alert"
  hidden={!studio.session.errors.source}
>
  {studio.session.errors.source}
</p>
