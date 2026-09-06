export interface Settings { fontSize: number; bottom: number; height: number; offset: number; shade: number; resolution: number; fps: number }
export const defaults: Settings = { fontSize: 4.4, bottom: 4, height: 32, offset: 0, shade: 40, resolution: 1080, fps: 30 };
export function validateSettings(input: unknown): Settings {
  if (!input || typeof input !== 'object') throw new Error('Invalid export settings.');
  const s = input as Settings;
  for (const [key, min, max] of [['fontSize', 2, 8], ['bottom', 0, 20], ['height', 20, 50], ['offset', -600000, 600000], ['shade', 0, 80]] as const) {
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key]) || s[key] < min || s[key] > max) throw new Error(`Invalid ${key}.`);
  }
  if (![720, 1080, 2160].includes(s.resolution) || ![24, 30, 60].includes(s.fps)) throw new Error('Invalid resolution or frame rate.');
  return { fontSize: s.fontSize, bottom: s.bottom, height: s.height, offset: s.offset, shade: s.shade, resolution: s.resolution, fps: s.fps };
}
export function outputSize(width: number, height: number, resolution: number) {
  const scale = Math.min(1, resolution / Math.min(width, height));
  return { width: Math.max(2, Math.round(width * scale / 2) * 2), height: Math.max(2, Math.round(height * scale / 2) * 2) };
}
