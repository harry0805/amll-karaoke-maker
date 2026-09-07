# Karaoke studio

A browser app that combines a music video and TTML lyrics into an MP4. Files never upload. AMLL renders the lyrics, browser snapshots composite them over decoded video frames, and Mediabunny uses WebCodecs to encode the result.

## Run and publish

```sh
bun install
bun run dev
```

Open http://127.0.0.1:3000. For another port, use `PORT=3210 bun run dev`.
Bun serves the development files only. There is no export backend, FFmpeg installation, or separate Chromium process needed to use the app.

```sh
bun run build
```

Publish the contents of `dist/` to any static HTTPS host. No Bun runtime, upload endpoint, cross-origin isolation, or server configuration is required. HTTPS or localhost is needed for WebCodecs. This is browser-local processing, not a standalone file:// app or an installed offline PWA.

1. Choose a video and a TTML file.
2. Preview the lyrics and adjust their style and placement.
3. Click Export MP4. The preview displays the actual composite frames sent to the encoder.
4. Download the MP4 from Saved exports. Completed files remain on this device until you delete them there. Cancel stops the export and removes its partial file.

Keep the tab open and visible during export. Settings and playback controls are locked until export finishes or is cancelled. The original preview position returns afterward. Reloading interrupts a running export. Completed exports reappear after reload; interrupted files are cleaned up when the app next opens.

The "Show lyrics before start" toggle defaults to off. With a positive timing offset, the lyric display stays hidden until TTML time zero, then fades in over 250 ms. Normal prelude dots still appear before the first sung line. Enabling the toggle keeps the display visible during the offset lead-in. Preview and export use the same media-time fade, including after seeking.

The default style is rounded bold white text with a black 10% outline. Text size defaults to 5%, bottom margin to 0%, horizontal margin to 4% on each side, lyric area to 35%, background shade to 40%, and timing offset to 0 ms. The separate Duet color picker also defaults to white and applies to lines AMLL marks as duet. Background vocals follow their singer's color. Font presets are rounded bold, sans serif bold, condensed bold, and serif bold, using locally installed fonts with fallbacks. Set outline thickness to zero to turn it off. The outline scales with the text in both preview and export. An SVG filter expands the rendered line alpha after AMLL applies its word masks, avoiding clipped text strokes at word boundaries. Dimmed words still have a dimmer outline, and very thick outlines can soften fine letter details.

Each line fades out over 250 ms after its final timed word ends. The fade uses media time in both preview and export. Background vocals use their own final-word time. Seeking backward restores the lyrics.

The default lyric box occupies the bottom 35% with room for nearby lines. Long lines can wrap. Word or syllable fill requires word or syllable timing in the source TTML. Line-timed files cannot supply missing word timing. Translation, romanization, and duet/background data are passed through AMLL. Missing Apple line IDs are added in memory for compatibility with AMLL's parser.

## Output and limits

- H.264 MP4 with the original AAC audio packets copied at their original timestamps. Non-presented AAC priming packets before time zero are excluded. Silent video stays silent. This first browser version requires AAC audio; other audio codecs get an explicit error before export. Audio transcoding is deferred because the browser encoder added padding in testing.
- Source frame timestamps are retained, including fractional and variable frame rates. Source display dimensions account for rotation and pixel aspect ratio and round up to even pixels for H.264.
- Uses the primary video and audio tracks. H.264/AAC MP4 is the safest input. HDR is not explicitly tone-mapped; use SDR for predictable colors.
- Browser codec support varies. Recent Chrome, Edge, or Safari with WebCodecs is required, but individual source codecs and encoder configurations may still be unsupported. Chromium is covered by the automated export tests.
- Encoded media streams to OPFS using a 1 MiB write buffer and awaited disk writes. Regular MP4 metadata goes at the end; in-memory fast start is disabled. Downloads use the disk-backed File directly, without constructing a whole-file ArrayBuffer or Blob.
- The selected source File stays on its original disk and uses an 8 MiB read cache. Audio copying runs at most one second ahead of the current video frame. Decoders, encoders, current canvas frames, lyric snapshots, and MP4 sample metadata still need working memory. No raw-frame image sequence or full audio copy is collected.
- Saved files live under the site's OPFS directory `karaoke-exports-v1`. Each render has a unique file and a Web Lock so cleanup cannot remove another tab's active render. A small JSON completion record distinguishes finished files from interrupted ones. Cancelled, failed, and interrupted files are removed; completed files have explicit Delete buttons.
- OPFS uses browser storage quota. A full disk/quota produces an error and cleans up the partial file, with no RAM fallback. Site-data clearing or browser eviction can remove saved exports, so download files you want to keep. Exports are separate for each site origin, including different localhost ports.
- Export is frame-timed, not real-time screen recording, so it can run faster or slower than playback without deliberately skipping frames. Lyric snapshots and outline rasterization remain the main rendering costs. See the performance measurements below.
- Font availability affects typography. No transparent-overlay-only export is included. TTML is limited to 10 MiB.

## Checks

```sh
bun run typecheck
bun test
bun run build
# Test dependencies only, not needed by app users:
bun run setup:browser
# With FFmpeg/ffprobe available and the development app running:
bun run tests/browser-export-smoke.ts http://127.0.0.1:3000
bun run tests/opfs-smoke.ts http://127.0.0.1:3000
bun run tests/renderer-smoke.ts http://127.0.0.1:3000
```

The browser export test generates synthetic media, blocks network requests during rendering, and verifies the MP4's frame count, timing, audio, colored lyrics and outlines, cancellation, resource cleanup, and variable-frame-rate silent export. FFmpeg is only used by tests to generate and inspect fixtures. `examples/demo.ttml` contains original sample lyrics.

The OPFS test writes a 32 MiB file from a reused 1 MiB block, then checks active-writer protection, simulated quota failure cleanup, interrupted-file cleanup, recovery after reload, and deletion.

## Code

- `index.ts`: development asset server, plus a test-only render page.
- `src/app.ts`: file selection, preview, settings, browser export UI.
- `src/browser-export.ts`: local decoding, canvas composition and encoding to a disk stream.
- `src/lyric-snapshot.ts`: visible-group selection, CSS snapshots and outline paint bounds.
- `src/snapshot-styles.ts`: paint/layout properties copied into snapshots.
- `src/export-storage.ts`: OPFS writes, completion records, recovery, cleanup and saved downloads.
- `src/lyrics.ts`: TTML compatibility and AMLL media-clock rendering shared by preview and export.
- `tests/render-entry.ts`: isolated renderer entry for automated tests, excluded from the static build.

AMLL packages are licensed AGPL-3.0-only. See the installed packages' LICENSE files and [AMLL repository](https://github.com/amll-dev/applemusic-like-lyrics) before distributing this app.

AMLL 0.5.2 has a local Bun patch in `patches/` that batches its lyric resize callbacks into the next animation frame. This prevents layout writes during ResizeObserver delivery, which can otherwise produce a browser error popup during seeking or resizing. `bun install` reapplies the patch. Recheck it when upgrading AMLL. The app's outline resize callback also defers its writes.

Run `bun run tests/resize-smoke.ts` with the local server on port 3210 to stress repeated seeks and lyric size changes while checking for window errors.

The AMLL patch also releases completed overlapping lines from the scroll target individually. When two lines start together and one ends first, the remaining line scrolls to the top inset using AMLL's springs. The player aligns active lyrics near the top of the lyric area, with an 8% inset for edge fading and word movement. Run `bun run tests/overlap-smoke.ts` against the local server on port 3210 to verify continuous overlap transitions and backward seeking.

Upcoming lyrics have no fixed line-count limit. The lyric box clips them at its edges, and AMLL prepares extra lines below it so they can scroll into view. The Line spacing slider ranges from 0.75× to 2× and changes wrapped-text height and spacing between lyric groups. Its default is 1×. Use a larger lyric area, smaller text, or tighter spacing to fit more lines. Completed lyrics fade out over 250 ms after their final word ends. Run `bun run tests/line-spacing-smoke.ts` to check offscreen preparation and spacing.

Word masks have vertical padding so compact line spacing does not clip descenders or floating letters. The local AMLL patch measures vertical padding separately from horizontal padding to preserve word-fill timing. Per-line paint clipping is disabled; the outer lyric viewport still clips the scrolling content. Run `bun run tests/glyph-smoke.ts` for the compact-spacing glyph check.

Interlude dots use the same outline color and thickness as the lyrics. The AMLL patch keeps their interval anchored to the actual gap and their animation clock synchronized with playback time, including seeks. During a gap the dots align inside the lyric viewport before the upcoming line. Run `bun run tests/interlude-smoke.ts` to verify forward/backward seeks, outline off, and normal-playback parity.

## Rendering performance

Exports snapshot only lyric groups near the visible box. AMLL still keeps upcoming lines ready in the live renderer, so they can scroll into view. Snapshotting copies a list of paint/layout CSS properties instead of every computed property. The outline uses the same SVG dilation and color, but its filter region is restricted to text bounds with extra space for emphasis, glow, and glyph movement. These changes do not reduce resolution or skip frames. Export progress includes average rendering fps.

On this machine, a 1920×1080 snapshot benchmark with a supplied TTML containing 777 DOM elements improved from 1.8 to 11.0 fps. Average DOM-to-SVG snapshot time fell from 447 to 34 ms; painting fell from 104 to 56 ms. A complete 90-frame 1080p export, including encoding and OPFS writes, took 9.4 seconds, about 9.5 fps. These are short-sample measurements, not a guarantee for every song or device. Thick outlines and large text still cost rasterization time.

```sh
# Original synthetic long-song fixture by default. Set TTML_PATH to test your own file.
bun run tests/snapshot-benchmark.ts
FULL_TREE=1 bun run tests/snapshot-benchmark.ts
bun run tests/snapshot-parity.ts
bun run tests/export-benchmark.ts
```

The parity test compares decoded pixels against the original full-tree/full-style snapshot in separate browser documents. It covers 45 timing/style combinations, including continuous scroll steps and compact rows. Keep `src/snapshot-styles.ts` in sync when adding rendering styles. AMLL's `will-change` properties affect compositing and must remain in the list. The reference mode is for fresh test documents because html-to-image caches its property list for each document.
