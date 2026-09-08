import { expect, test } from 'bun:test';
import { backgroundGradient } from '../src/background-gradient';
import { defaults } from '../src/settings';

function stops(fade: number, opacity = 80) {
  const gradient = backgroundGradient({
    ...defaults,
    backgroundColor: '#123abc',
    shade: opacity,
    shadeFadeStart: fade,
  });
  return [...gradient.matchAll(/rgb\(18 58 188 \/ ([\d.]+)\) ([\d.]+)%/g)].map((match) => ({
    alpha: Number(match[1]),
    position: Number(match[2]),
  }));
}

test('fade eases out of solid opacity and into transparency', () => {
  const samples = stops(50);
  expect(samples[0]).toEqual({ alpha: 0.8, position: 50 });
  expect(samples[8]).toEqual({ alpha: 0.675, position: 62.5 });
  expect(samples[16]).toEqual({ alpha: 0.4, position: 75 });
  expect(samples[24]).toEqual({ alpha: 0.125, position: 87.5 });
  expect(samples.at(-1)).toEqual({ alpha: 0, position: 100 });
  expect(samples[0]!.alpha - samples[1]!.alpha).toBeLessThan(0.003);
  for (let i = 1; i < samples.length; i++) {
    expect(samples[i]!.alpha).toBeLessThanOrEqual(samples[i - 1]!.alpha);
    expect(samples[i]!.position).toBeGreaterThan(samples[i - 1]!.position);
  }
});

test('fade limits keep their meaning and zero opacity stays transparent', () => {
  expect(stops(0)[0]!.position).toBe(0);
  expect(stops(90)[0]!.position).toBe(90);
  expect(stops(90).at(-1)!.position).toBe(100);
  expect(stops(50, 0).every((stop) => stop.alpha === 0)).toBe(true);
  expect(backgroundGradient({ ...defaults, shade: 100, shadeFadeStart: 100 })).toBe(
    'linear-gradient(rgb(0 0 0 / 1), rgb(0 0 0 / 1))',
  );
});
