import type { PresetSettings } from './settings';

/** Approximate a smoothstep fade with CSS stops, shared by preview and render. */
export function backgroundGradient(
  settings: Pick<PresetSettings, 'backgroundColor' | 'shade' | 'shadeFadeStart'>,
): string {
  const rgb = [1, 3, 5]
    .map((start) => parseInt(settings.backgroundColor.slice(start, start + 2), 16))
    .join(' ');
  const opacity = settings.shade / 100;
  const color = (alpha: number) => `rgb(${rgb} / ${Number(alpha.toFixed(6))})`;
  // At 100% there is no fade region, so the whole background is solid.
  if (settings.shadeFadeStart === 100)
    return `linear-gradient(${color(opacity)}, ${color(opacity)})`;
  const stops = Array.from({ length: 33 }, (_, index) => {
    const t = index / 32;
    const alpha = opacity * (1 - t * t * (3 - 2 * t));
    const position = settings.shadeFadeStart + (100 - settings.shadeFadeStart) * t;
    return `${color(alpha)} ${Number(position.toFixed(4))}%`;
  });
  return `linear-gradient(to top, ${stops.join(', ')})`;
}
