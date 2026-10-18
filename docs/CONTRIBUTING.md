# Contribution guide

[Back to the project overview](../README.md)

Bug reports, documentation fixes, and code contributions are welcome. This guide covers running the app locally, finding the relevant code, and checking a change before opening a pull request.

## Report a problem or suggest a change

[Open an issue](https://github.com/harry0805/amll-karaoke-maker/issues) with steps to reproduce the problem, what you expected, and what happened. Include your browser, operating system, and any error message. For rendering bugs, a short video and TTML file that reproduce the issue help reproduce the problem.

For a larger feature, describe the proposed behavior in an issue first so its scope can be discussed. Small fixes can go straight to a pull request.

## Run locally

Install Bun, download or clone the repository, and run these commands from the repository root:

```sh
bun install
bun run dev
```

Open [localhost:3000](http://127.0.0.1:3000). To choose another port, use `PORT=3210 bun run dev`.

Use a recent Chromium-based browser, such as Chrome or Edge, or Firefox for development and testing. Safari and other browsers that do not use Chromium or Firefox's Gecko engine are not supported. WebKit-based versions of Chrome and Firefox are also unsupported. The editor shows a browser warning, but lets users continue. Export still requires compatible browser APIs and codecs.

The app runs entirely in the browser. Svelte manages the UI, AMLL renders the lyrics, and Mediabunny handles media decoding and encoding through browser APIs. Vite serves the app during development. There is no video processing server to set up.

Use Bun for dependencies and scripts. `bun install` also applies the local AMLL patch in `patches/`.

## Find the code

| Area                         | Files                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| App layout and UI            | `src/App.svelte`, `src/components/`                                                        |
| Shared UI state              | `src/studio.svelte.ts`                                                                     |
| Settings and presets         | `src/settings.ts`, `src/settings-storage.ts`, `src/preset-storage.ts`                      |
| Lyrics and frame snapshots   | `src/lyrics.ts`, `src/lyric-snapshot.ts`, `src/snapshot-styles.ts`                         |
| Video export and saved files | `src/browser-export.ts`, `src/export-storage.ts`, `src/export-compatibility.ts`            |
| Font loading and storage     | `src/font-catalog.ts`, `src/font-runtime.ts`, `src/font-storage.ts`, `src/device-fonts.ts` |
| Styling                      | `src/style.css`, `src/renderer.css`                                                        |
| Development and build        | `vite.config.ts`, `scripts/build.ts`                                                       |

Follow the surrounding code's conventions. Keep media processing and storage in the TypeScript modules, separate from the UI components.

When changing lyric styles, check both the preview and exported video. AMLL creates its own lyric elements, and `src/renderer.css` styles them. If a new style needs to appear in exported frames, check the properties copied by `src/snapshot-styles.ts`.

When changing settings, update validation, persistence, and preset handling as needed. Presets store appearance settings; timing offset and "Show lyrics before start" are separate preferences.

When upgrading AMLL, review the local patch and check lyric playback, seeking, and exported video. The patch changes rendering behavior, so a successful dependency installation alone does not verify the upgrade.

## Interface translations

The studio and help guide use [i18next](https://www.i18next.com/) with English in `src/locales/en.json` and Simplified Chinese in `src/locales/zh.json`. Both catalogs cover interface controls, tooltips, dialogs, application errors, export progress, and page metadata. Tests require matching keys and interpolation placeholders. English fallback remains available for future additions.

The first visit follows the browser's preferred languages, which normally come from the system. Chinese regional variants use the Chinese catalog. Other unsupported languages fall back to English. The header's language toggle saves an explicit choice under `karaoke-maker-language` in local storage. Switching still works if storage is unavailable.

Add interface strings to both catalogs and render them with the reactive `$t` store from `src/i18n.ts`. Keys are flat, with a component or module prefix. Keep each sentence together and use named interpolation values such as `{{name}}`. Use i18next's plural suffixes for counts. `LinkedText.svelte` renders a real link at the catalog's `{link}` placeholder without inserting HTML. The static guide uses `data-i18n` attributes with the same catalogs and keeps English content available without JavaScript. Mark links inside translated paragraphs with `data-i18n-link`.

For status messages kept in state, store `message(key, values)` from `src/messages.ts` and render with `$translateMessage`. Throw `LocalizedError` for application errors and retain the translation data with `errorMessage` when catching them. This lets existing messages update when the language changes. Known browser errors have translated explanations. Unknown errors retain their diagnostic text inside a translated message. Filenames, preset names, lyrics, brand names, font family names, and license texts retain their original text.

Run the language checks against the development server:

```sh
bun tests/i18n-smoke.ts http://127.0.0.1:3000
bun tests/chinese-ui-smoke.ts http://127.0.0.1:3000
```

These check browser language detection, saved overrides, switching with loaded lyrics, storage failures, phone widths, Chinese editing and export flows, and the help guide. Catalog and message checks also run with `bun test`.

## Check your changes

For code changes, run:

```sh
bun run format:check
bun run lint
bun run typecheck
bun run build
```

Use `bun run format` for Prettier formatting and `bun run lint:fix` for automatic ESLint fixes. Review the resulting changes and any remaining lint errors.

Try the affected behavior in the app before opening a pull request. For documentation changes, checking formatting and links is enough.

## Open a pull request

Keep the change focused on one problem. Explain what changes for the user and why, link any related issue, and list the checks you ran. Mention anything you could not verify. Include screenshots or a short recording for visible changes.

Update documentation when behavior or setup changes. Keep generated builds, caches, and rendered media out of the pull request. If dependencies change, include the corresponding Bun lockfile changes.

## Build and host your own copy

```sh
bun run build
```

The build writes a static site to `dist/`. Serve it over HTTPS so browser media APIs are available. Local development also works on localhost.

The repository includes a Cloudflare Workers configuration in `wrangler.jsonc`. To preview the production build locally:

```sh
bun run preview
```

To publish to your own Cloudflare account, check the Worker name in `wrangler.jsonc`, then run:

```sh
bunx wrangler login
bun run deploy
```

Preview and deployment rebuild `dist/` automatically. `bun run deploy --dry-run` checks the deployment build without publishing. Hosting is optional for contributing.

## Dependency licenses

AMLL packages are licensed AGPL-3.0-only. Check the installed packages' license files and the [AMLL repository](https://github.com/amll-dev/applemusic-like-lyrics) when changing dependencies or distributing the app.

Bundled fonts include their [licenses](../public/fonts/README.md). Keep the license files with the fonts when changing bundled assets.
