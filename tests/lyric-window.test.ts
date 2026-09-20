import { expect, test } from 'bun:test';
import { selectLyricWindow, type LyricWindowEntry } from '../src/lyric-window';

const entries: LyricWindowEntry[] = [
  { main: { start: 0, end: 4000 } },
  { main: { start: 2000, end: 6000 } },
  { main: { start: 3000, end: 7000 } },
  { main: { start: 8000, end: 10000 } },
];
const visible = (time: number, limit = 2) =>
  [...selectLyricWindow(entries, time, limit).visible].sort();

test('upcoming lines fill slots and all active singers bypass the limit', () => {
  expect(visible(1000)).toEqual([0, 1]);
  expect(visible(2500)).toEqual([0, 1]);
  expect(visible(3500)).toEqual([0, 1, 2]);
  expect(visible(6000)).toEqual([2, 3]);
  expect(visible(1000, 1)).toEqual([0]);
  expect(visible(3500, 1)).toEqual([0, 1, 2]);
  expect(visible(1000, 0)).toEqual([0, 1, 2, 3]);
});

test('gaps, the end of the song, and backwards seeks have no history dependency', () => {
  expect(visible(-1)).toEqual([0, 1]);
  expect(visible(7500)).toEqual([3]);
  expect(visible(10000)).toEqual([]);
  expect(visible(1000)).toEqual([0, 1]);
});

test('background vocals continuing alone stay visible and keep their combined slot', () => {
  const withBackground = [
    { main: { start: 0, end: 1000 }, background: { start: 500, end: 5000 } },
    ...entries.slice(1),
  ];
  const result = selectLyricWindow(withBackground, 1500, 2);
  expect([...result.active]).toEqual([0]);
  expect([...result.visible]).toEqual([0, 1]);
});

test('an inactive entry between overlapping singers does not bypass the limit', () => {
  const result = selectLyricWindow(
    [
      { main: { start: 0, end: 8000 } },
      { main: { start: 1000, end: 2000 } },
      { main: { start: 2000, end: 8000 } },
      { main: { start: 8000, end: 10000 } },
    ],
    4000,
    2,
  );
  expect([...result.visible]).toEqual([0, 2]);
});

test('standalone background entries never consume a primary or duet slot', () => {
  const result = selectLyricWindow(
    [
      { main: { start: 0, end: 5000 }, backgroundOnly: true },
      { main: { start: 1000, end: 5000 } },
      { main: { start: 5000, end: 7000 } },
    ],
    2000,
    2,
  );
  expect([...result.visible]).toEqual([0, 1, 2]);
});

test('early background activates its primary group without spending two slots', () => {
  const entries = [
    { main: { start: 4000, end: 6000 }, background: { start: 0, end: 5000 } },
    { main: { start: 6000, end: 8000 } },
    { main: { start: 8000, end: 10000 } },
  ];
  for (const time of [1000, 4500]) {
    expect([...selectLyricWindow(entries, time, 2).visible]).toEqual([0, 1]);
    expect([...selectLyricWindow(entries, time, 1).visible]).toEqual([0]);
  }
});
