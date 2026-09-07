import { test, expect } from 'bun:test';
import { sourceFrameRate } from '../src/exporter';
test('preserves fractional rates and falls back when average rate is unavailable', () => {
  expect(sourceFrameRate({ avg_frame_rate: '30000/1001', r_frame_rate: '30/1' }).frameRate).toBe('30000/1001');
  expect(sourceFrameRate({ avg_frame_rate: '0/0', r_frame_rate: '25/1' }).fps).toBe(25);
  expect(() => sourceFrameRate({ avg_frame_rate: '0/0', r_frame_rate: '0/0' })).toThrow();
});
