import { expect, test } from 'bun:test';
import { LyricMotion } from '../src/lyric-motion';

test('retargeting without elapsed time never moves a lyric', () => {
  const motion = new LyricMotion(400);
  motion.advance(200, 100);
  const position = motion.position;
  expect(motion.advance(500, 0)).toBe(position);
});

test('preview and export frame rates produce the same motion', () => {
  const at30 = new LyricMotion(400);
  const at60 = new LyricMotion(400);
  for (let i = 0; i < 15; i++) at30.advance(100, 1000 / 30);
  for (let i = 0; i < 30; i++) at60.advance(100, 1000 / 60);
  expect(at30.position).toBeCloseTo(at60.position, 8);
  expect(at30.position).toBeGreaterThanOrEqual(100);
  expect(at30.position).toBeLessThan(101);
});
