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
2. Play or scrub the preview. Choose text and outline colors, a font preset, and outline thickness. Adjust text size, lyric area, bottom margin, background shade, and timing offset. A positive offset delays the lyrics.
3. Choose resolution and frame rate, then click **Export MP4**.
4. Wait for the export, then click **Download MP4**. You can cancel a running export.

The default style is gold text with a dark outline. The separate Duet color picker defaults to light blue and applies to lines AMLL marks as duet. Background vocals follow their singer's color. Font presets are rounded bold, sans serif bold, condensed bold, and serif bold, using locally installed fonts with fallbacks. Set outline thickness to zero to turn it off. The outline scales with the text in both preview and export. An SVG filter expands the rendered line alpha after AMLL applies its word masks, avoiding clipped text strokes at word boundaries. Dimmed words still have a dimmer outline, and very thick outlines can soften fine letter details.

Each line disappears immediately when its final timed word ends. Background vocals use their own final-word time. Seeking backward restores the lyrics.

The default lyric box occupies the bottom 32% with room for nearby lines. Long lines can wrap. Word or syllable fill requires word or syllable timing in the source TTML. Line-timed files cannot supply missing word timing. Translation, romanization, and duet/background data are passed through AMLL. Missing Apple line IDs are added in memory for compatibility with AMLL's parser.

## Output and limits

- H.264 MP4 with AAC audio, 24/30/60 fps. Videos without audio also work.
- 720p, 1080p, or 4K sets the shorter edge. Aspect ratio is preserved and smaller sources are not upscaled, except rounding to even dimensions required by H.264.
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
