<script lang="ts">
  import { onMount } from 'svelte';
  import type { Studio } from '../studio.svelte';
  import Icon from './Icon.svelte';

  let { studio }: { studio: Studio } = $props();
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
  const displayedTime = $derived(studio.previewVisible ? studio.renderTime : position);
  const displayedDuration = $derived(studio.previewVisible ? studio.renderDuration : duration);
  const disabled = $derived(!studio.loaded || studio.exporting);

  onMount(() => {
    studio.attach(stage, container, video, canvas);
    let stopped = false;
    let frame = 0;
    let previous = performance.now();
    async function tick(now: number) {
      try {
        await studio.frame(video.paused ? 0 : now - previous);
      } catch (error) {
        studio.errors.source = String(error);
      }
      previous = now;
      if (stopped) return;
      if (studio.loaded && !studio.exporting) position = video.currentTime;
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
      studio.videoError = true;
      studio.errors.source = 'Cannot determine the video duration. Try an MP4 video.';
      return;
    }
    duration = video.duration;
    width = video.videoWidth;
    height = video.videoHeight;
    position = video.currentTime;
    studio.loaded = true;
    void studio.resizeLyrics();
  }
  async function togglePlayback() {
    if (disabled) return;
    try {
      if (video.paused) await video.play();
      else video.pause();
    } catch (error) {
      studio.errors.source = String(error);
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
<section class="viewer">
  <div class="preview-frame" style:--video-aspect={width && height ? width / height : 16 / 9}>
    <div class="stage-shell">
      <div
        id="stage"
        bind:this={stage}
        style:aspect-ratio={width && height ? `${width} / ${height}` : '16 / 9'}
      >
        <!-- The source video is previewed with its timed lyrics in the sibling container. -->
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          id="video"
          bind:this={video}
          playsinline
          onloadedmetadata={metadata}
          onplay={() => (paused = false)}
          onpause={() => (paused = true)}
          onended={() => (paused = true)}
          onseeked={() => void studio.frame(0, true)}
          onerror={() => {
            studio.loaded = false;
            studio.videoError = true;
            studio.errors.source =
              'This browser cannot preview that video codec. Convert the source to an H.264 MP4 and try again.';
          }}
        ></video>
        <canvas
          id="export-preview"
          bind:this={canvas}
          hidden={!studio.previewVisible}
          aria-label="Frame being rendered"
        ></canvas>
        <div id="shade"></div>
        <div id="lyrics" bind:this={container}></div>
      </div>
      <div id="empty" hidden={studio.loaded}>
        <span class="empty-icon"><Icon name="music-2" /></span>
        <h1>Your video. In time with every word.</h1>
        <p>Choose a music video and timed TTML lyrics to begin.</p>
      </div>
    </div>
  </div>
  <div class="transport">
    <input
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
    <span id="media-info">{studio.loaded ? `${width} × ${height}` : 'No video selected'}</span>
    <div class="playback-buttons">
      <button
        id="rewind"
        class="transport-icon"
        {disabled}
        aria-label="Rewind 10 seconds"
        title="Rewind 10 seconds"
        onclick={() => seek(video.currentTime - 10)}
        ><Icon name="rotate-ccw" /><span class="seek-seconds" aria-hidden="true">10</span></button
      >
      <button
        id="play"
        class="transport-icon"
        {disabled}
        aria-label={paused ? 'Play' : 'Pause'}
        title={`${paused ? 'Play' : 'Pause'} (Space)`}
        aria-keyshortcuts="Space"
        onclick={togglePlayback}
      >
        <span class="play-symbol" hidden={!paused}><Icon name="play" /></span><span
          class="pause-symbol"
          hidden={paused}><Icon name="pause" /></span
        >
      </button>
      <button
        id="forward"
        class="transport-icon"
        {disabled}
        aria-label="Forward 10 seconds"
        title="Forward 10 seconds"
        onclick={() => seek(video.currentTime + 10)}
        ><Icon name="rotate-cw" /><span class="seek-seconds" aria-hidden="true">10</span></button
      >
    </div>
    <span id="time">{formatTime(displayedTime)} / {formatTime(displayedDuration)}</span>
  </div>
</section>
