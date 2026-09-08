# Karaoke Maker

Turn a music video and timed lyrics into a karaoke video, right in your browser. Add animated lyrics, make them your own, and download the finished MP4. Your video and lyrics stay on your device.

[Watch the showcase video](docs/showcase.mp4)

**[Open Karaoke Maker](https://karakoe.hproject.xyz)** · [Getting started](#make-your-first-video) · [Contribution guide](docs/CONTRIBUTING.md)

## Make it look the way you want

- Animated lyrics with smooth scrolling, word-by-word highlighting, powered by [AMLL](https://github.com/amll-dev/applemusic-like-lyrics). Word highlighting follows the timing in your lyrics file.
- Customize fonts and styling in the preview, set text colors and outlines, and adjust size, spacing, and placement.
- A shaded background with adjustable color, opacity, height to keep lyrics readable over your video.
- Reusable settings presets. Save a style for your next video, and ability to export and import presets to share it.

Everything runs on your device. There is no video upload or video editor to install.

## Make your first video

1. [Open the app](https://karakoe.hproject.xyz) and choose your video.
2. Choose a TTML lyrics file. TTML is a lyrics file that tells when each line or word is being sung.
3. Play it and adjust the style in the settings panel.
4. Click **Render MP4** and let the magic happen.
5. Download your video from **Saved exports**.

Need a lyrics file? Use [AMLL TTML Tool](https://tool.amll.dev/) to create or edit one, then bring it here. Karaoke Maker uses the timing you provide; it does not transcribe songs or automatically time the words.

## Help improve Karaoke Maker

Found a problem or have an idea? [Open an issue](https://github.com/harry0805/amll-karaoke-maker/issues). For rendering problems, include your browser info, the original video and lyrics files, and any error message the app shows.

## Credits

Lyrics are rendered with [Apple Music-like Lyrics](https://github.com/amll-dev/applemusic-like-lyrics). Bundled fonts include their [licenses](public/fonts/README.md). Dependency licensing notes are in the [contribution guide](docs/CONTRIBUTING.md#dependency-licenses).
