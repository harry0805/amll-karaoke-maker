# Karaoke studio

A local Bun app that combines a music video and TTML lyrics into an MP4. AMLL renders the word fills and line movement. Chromium captures transparent lyric frames at the chosen frame rate, and FFmpeg composites them over the source video and preserves its audio as AAC.

## Run

```sh
bun install
bun run setup:browser
bun run start
```

Open http://127.0.0.1:3000 in Chrome or another Chromium browser. FFmpeg and ffprobe must be on your PATH. On macOS, install them with `brew install ffmpeg` if needed. They are already installed on the machine used to build this project.

For another port, run `PORT=3210 bun run start`. Use `bun run dev` while editing source. Restarting the server interrupts any running export.

1. Choose a video and a `.ttml` or `.xml` lyric file.
2. Play or scrub the preview. Choose text and outline colors, a font preset, and outline thickness. Adjust text size, lyric area, bottom and horizontal margins, background shade, and timing offset. A positive offset delays the lyrics.
3. Click **Export MP4**. Resolution and frame rate come from the source.
4. Wait for the export, then click **Download MP4**. You can cancel a running export.

The default style is rounded bold white text with a black 10% outline. Text size defaults to 5%, bottom margin to 0%, horizontal margin to 4% on each side, lyric area to 35%, background shade to 40%, and timing offset to 0 ms. The separate Duet color picker also defaults to white and applies to lines AMLL marks as duet. Background vocals follow their singer's color. Font presets are rounded bold, sans serif bold, condensed bold, and serif bold, using locally installed fonts with fallbacks. Set outline thickness to zero to turn it off. The outline scales with the text in both preview and export. An SVG filter expands the rendered line alpha after AMLL applies its word masks, avoiding clipped text strokes at word boundaries. Dimmed words still have a dimmer outline, and very thick outlines can soften fine letter details.

Each line fades out over 250 ms after its final timed word ends. The fade uses media time in both preview and export. Background vocals use their own final-word time. Seeking backward restores the lyrics.

The default lyric box occupies the bottom 35% with room for nearby lines. Long lines can wrap. Word or syllable fill requires word or syllable timing in the source TTML. Line-timed files cannot supply missing word timing. Translation, romanization, and duet/background data are passed through AMLL. Missing Apple line IDs are added in memory for compatibility with AMLL's parser.

## Output and limits

- H.264 MP4 with AAC audio at the source frame rate, including fractional rates such as 30000/1001. Videos without audio also work. Variable-frame-rate sources export at their average frame rate.
- Source display dimensions are retained, with rotation and pixel aspect ratio applied. Dimensions round to even numbers required by H.264.
- Files stay on this computer. The server listens on loopback only. The source is temporarily copied into `.renders/<job-id>/` and removed after export. Finished MP4 files remain there until you delete them. Downloads are available while the server stays running.
- The preview needs a browser-supported video codec. H.264 MP4 is the safest input. HDR is not explicitly tone-mapped; use an SDR source for predictable colors. Only the first video and audio tracks are exported.
- Export runs frame by frame, so a long video or 4K/60 fps can take substantially longer than playback. Frames stream directly to FFmpeg rather than collecting image files on disk. One export runs at a time. The upload limit is 20 GiB and TTML is limited to 10 MiB.
- The preview and export use the same lyric renderer. Font availability and browser differences can affect typography. A transparent-overlay-only export is not included; the current output is the finished video.

## Checks

```sh
bun run typecheck
bun test
# With the local server running:
bun run tests/export-smoke.ts http://127.0.0.1:3000
bun run tests/renderer-smoke.ts http://127.0.0.1:3000
```

The smoke test generates an original four-second test video and checks HTTP upload, TTML import, Chromium rendering, visible composited lyrics, MP4 frame count/duration, audio, invalid TTML handling, and cancellation. `examples/demo.ttml` contains original sample lyrics.

## Code

- `index.ts`: local server, upload, job status, cancellation, download.
- `src/app.ts`: file selection, preview, settings, export UI.
- `src/lyrics.ts`: TTML compatibility and AMLL media-clock rendering shared by preview/export.
- `src/exporter.ts`: video probing, Chromium capture, FFmpeg composition.

AMLL packages are licensed AGPL-3.0-only. See the installed packages' LICENSE files and [AMLL repository](https://github.com/amll-dev/applemusic-like-lyrics) before distributing this app.

AMLL 0.5.2 has a local Bun patch in `patches/` that batches its lyric resize callbacks into the next animation frame. This prevents layout writes during ResizeObserver delivery, which can otherwise produce a browser error popup during seeking or resizing. `bun install` reapplies the patch. Recheck it when upgrading AMLL. The app's outline resize callback also defers its writes.

Run `bun run tests/resize-smoke.ts` with the local server on port 3210 to stress repeated seeks and lyric size changes while checking for window errors.

The AMLL patch also releases completed overlapping lines from the scroll target individually. When two lines start together and one ends first, the remaining line scrolls to the top inset using AMLL's springs. The player aligns active lyrics near the top of the lyric area, with an 8% inset for edge fading and word movement. Run `bun run tests/overlap-smoke.ts` against the local server on port 3210 to verify continuous overlap transitions and backward seeking.

Upcoming lyrics have no fixed line-count limit. The lyric box clips them at its edges, and AMLL prepares extra lines below it so they can scroll into view. The Line spacing slider ranges from 0.75× to 2× and changes wrapped-text height and spacing between lyric groups. Its default is 1×. Use a larger lyric area, smaller text, or tighter spacing to fit more lines. Completed lyrics fade out over 250 ms after their final word ends. Run `bun run tests/line-spacing-smoke.ts` to check offscreen preparation and spacing.

Word masks have vertical padding so compact line spacing does not clip descenders or floating letters. The local AMLL patch measures vertical padding separately from horizontal padding to preserve word-fill timing. Per-line paint clipping is disabled; the outer lyric viewport still clips the scrolling content. Run `bun run tests/glyph-smoke.ts` for the compact-spacing glyph check.

Interlude dots use the same outline color and thickness as the lyrics. The AMLL patch keeps their interval anchored to the actual gap and their animation clock synchronized with playback time, including seeks. During a gap the dots align inside the lyric viewport before the upcoming line. Run `bun run tests/interlude-smoke.ts` to verify forward/backward seeks, outline off, and normal-playback parity.
