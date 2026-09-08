<script lang="ts">
  import { onMount } from 'svelte';
  import type { StudioState } from '../studio.svelte';
  import Icon from './Icon.svelte';

  let { studio }: { studio: StudioState } = $props();
  let stage: HTMLDivElement;
  let container: HTMLDivElement;
  let video: HTMLVideoElement;
  let canvas: HTMLCanvasElement;
  let paused = $state(true);
  let position = $state(0);
  let duration = $state(0);
  let width = $state(0);
  let height = $state(0);
  const formatTime = (n: number) =>
    `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  const displayedTime = $derived(
    studio.session.previewVisible ? studio.session.renderTime : position,
  );
  const displayedDuration = $derived(
    studio.session.previewVisible ? studio.session.renderDuration : duration,
  );
  const disabled = $derived(!studio.session.loaded || studio.session.exporting);

  onMount(() => {
    studio.attach(stage, container, video, canvas);
    let stopped = false;
    let frame = 0;
    let previous = performance.now();
    async function tick(now: number) {
      try {
        await studio.frame(video.paused ? 0 : now - previous);
      } catch (error) {
        studio.session.errors.source = String(error);
      }
      previous = now;
      if (stopped) return;
      if (studio.session.loaded && !studio.session.exporting) position = video.currentTime;
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      studio.dispose();
    };
  });

  function metadata() {
    if (!Number.isFinite(video.duration) || !video.videoWidth) {
      studio.session.videoError = true;
      studio.session.errors.source = 'Cannot determine the video duration. Try an MP4 video.';
      return;
    }
    duration = video.duration;
    width = video.videoWidth;
    height = video.videoHeight;
    position = video.currentTime;
    studio.session.loaded = true;
    void studio.resizeLyrics();
  }
  async function togglePlayback() {
    if (disabled) return;
    try {
      if (video.paused) await video.play();
      else video.pause();
    } catch (error) {
      studio.session.errors.source = String(error);
    }
  }
  function seek(time: number) {
    if (disabled || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, time));
    position = video.currentTime;
  }
  function keyboard(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      disabled
    )
      return;
    if (
      event.target instanceof HTMLElement &&
      event.target.closest(
        'input, select, textarea, button, a, [contenteditable]:not([contenteditable="false"]), [role="tab"], [role="dialog"], dialog',
      )
    )
      return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) void togglePlayback();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      seek(video.currentTime + (event.key === 'ArrowLeft' ? -5 : 5));
    }
  }
</script>

<svelte:document onkeydown={keyboard} />
<section
  class="static flex h-full min-h-0 min-w-0 flex-col self-stretch overflow-clip [grid-area:viewer] max-studio:h-auto"
>
  <div
    class="[container-type:size] grid aspect-[var(--video-aspect,1.777777778)] min-h-0 w-full flex-[0_1_auto] [place-items:start_center] has-[#empty:not([hidden])]:[container-type:inline-size] has-[#empty:not([hidden])]:aspect-auto max-studio:flex-none"
    style:--video-aspect={width && height ? width / height : 16 / 9}
  >
    <div
      class="stage-shell relative grid max-h-full w-[min(100%,calc((100cqh-2px)*var(--video-aspect,1.777777778)+2px))] place-items-center overflow-hidden rounded-[10px] border border-solid border-[#35353c] bg-[#050506] has-[#empty:not([hidden])]:aspect-video has-[#empty:not([hidden])]:min-h-0 has-[#empty:not([hidden])]:w-full max-studio:has-[#empty:not([hidden])]:aspect-auto max-studio:has-[#empty:not([hidden])]:max-h-none"
    >
      <div
        class="in-[.stage-shell:has(#empty:not([hidden]))]:hidden"
        id="stage"
        bind:this={stage}
        style:aspect-ratio={width && height ? `${width} / ${height}` : '16 / 9'}
      >
        <!-- The source video is previewed with its timed lyrics in the sibling container. -->
        <video
          class="block size-full object-contain"
          id="video"
          bind:this={video}
          playsinline
          onloadedmetadata={metadata}
          onplay={() => (paused = false)}
          onpause={() => (paused = true)}
          onended={() => (paused = true)}
          onseeked={() => void studio.frame(0, true)}
          onerror={() => {
            studio.session.loaded = false;
            studio.session.videoError = true;
            studio.session.errors.source =
              'This browser cannot preview that video codec. Convert the source to an H.264 MP4 and try again.';
          }}
        ></video>
        <canvas
          class="absolute inset-0 z-5 size-full"
          id="export-preview"
          bind:this={canvas}
          hidden={!studio.session.previewVisible}
          aria-label="Frame being rendered"
        ></canvas>
        <div id="shade"></div>
        <div id="lyrics" bind:this={container}></div>
      </div>
      <div
        class="relative inset-0 flex w-full flex-col items-center justify-center self-stretch bg-[radial-gradient(ellipse_at_50%_80%,#23242a,#111114_75%)] p-6 text-center max-studio:min-h-[calc((100cqw-2px)*9/16)]"
        id="empty"
        hidden={studio.session.loaded}
      >
        <span
          class="text-[36px] text-accent-text max-phone:hidden [&>svg]:size-10 [&>svg]:stroke-[1.4]"
          ><Icon name="music-2" /></span
        >
        <h1 class="mt-[18px] mb-2 text-[23px] font-[550] tracking-[-0.7px] max-phone:text-[18px]">
          Your video. In time with every word.
        </h1>
        <p class="m-0 max-w-[340px] text-[14px] leading-[1.6] text-[#93939f]">
          Choose a music video and timed TTML lyrics to begin.
        </p>
      </div>
    </div>
  </div>
  <div
    class="mt-[18px] grid flex-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2.5 max-phone:gap-x-1"
  >
    <input
      class="col-span-full m-0 w-full min-w-0 cursor-pointer accent-accent outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid"
      id="seek"
      aria-label="Playback position"
      type="range"
      min="0"
      max={duration || 1}
      step="0.01"
      value={displayedTime}
      {disabled}
      oninput={(event) => seek(Number(event.currentTarget.value))}
    />
    <span
      class="min-w-0 text-[12px] whitespace-normal text-[#b0b0b8] max-phone:text-[10px]"
      id="media-info">{studio.session.loaded ? `${width} × ${height}` : 'No video selected'}</span
    >
    <div class="flex items-center gap-2.5 max-phone:gap-0">
      <button
        id="rewind"
        class="relative grid size-9 flex-none cursor-pointer place-items-center rounded-[7px] border border-solid border-transparent bg-transparent p-[7px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:bg-control disabled:cursor-default disabled:opacity-35 [&_svg]:size-[22px] [&_svg]:stroke-[1.7]"
        {disabled}
        aria-label="Rewind 10 seconds"
        title="Rewind 10 seconds"
        onclick={() => seek(video.currentTime - 10)}
        ><Icon name="rotate-ccw" /><span
          class="pointer-events-none absolute inset-0 m-0 grid place-items-center pt-0.5 font-[Arial,sans-serif] text-[8px] text-inherit"
          aria-hidden="true">10</span
        ></button
      >
      <button
        id="play"
        class="relative grid size-9 flex-none cursor-pointer place-items-center rounded-full border border-solid border-transparent bg-foreground p-[7px] text-black outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:bg-white disabled:cursor-default disabled:bg-[#77777d] disabled:opacity-100 [&_svg]:size-[22px] [&_svg]:stroke-[1.7]"
        {disabled}
        aria-label={paused ? 'Play' : 'Pause'}
        title={`${paused ? 'Play' : 'Pause'} (Space)`}
        aria-keyshortcuts="Space"
        onclick={togglePlayback}
      >
        <span
          class="grid place-items-center text-inherit [&>svg]:fill-current [&>svg]:stroke-none"
          hidden={!paused}><Icon name="play" /></span
        ><span class="grid place-items-center text-inherit [&>svg]:fill-current" hidden={paused}
          ><Icon name="pause" /></span
        >
      </button>
      <button
        id="forward"
        class="relative grid size-9 flex-none cursor-pointer place-items-center rounded-[7px] border border-solid border-transparent bg-transparent p-[7px] text-[#eee] outline-offset-[5px] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-solid enabled:hover:bg-control disabled:cursor-default disabled:opacity-35 [&_svg]:size-[22px] [&_svg]:stroke-[1.7]"
        {disabled}
        aria-label="Forward 10 seconds"
        title="Forward 10 seconds"
        onclick={() => seek(video.currentTime + 10)}
        ><Icon name="rotate-cw" /><span
          class="pointer-events-none absolute inset-0 m-0 grid place-items-center pt-0.5 font-[Arial,sans-serif] text-[8px] text-inherit"
          aria-hidden="true">10</span
        ></button
      >
    </div>
    <span
      class="text-right text-[13px] whitespace-nowrap text-[#b0b0b8] tabular-nums max-phone:text-[10px]"
      id="time">{formatTime(displayedTime)} / {formatTime(displayedDuration)}</span
    >
  </div>
</section>
