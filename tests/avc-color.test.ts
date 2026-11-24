import { expect, test } from 'bun:test';
import {
  addMissingAvcColorInfo,
  deserializeAvcDecoderConfigurationRecord,
  parseAvcSps,
} from '../node_modules/mediabunny/dist/modules/src/codec-data.js';

const encoderColor = {
  primaries: 'bt709',
  transfer: 'iec61966-2-1',
  matrix: 'bt709',
  fullRange: true,
} satisfies VideoColorSpaceInit;

// AVC configuration from the Windows export that carried color tags only in its MP4 container.
const missingVui = Uint8Array.fromHex(
  '01640028ffe1000c67640028ac16c903c0113f2a01000468ee3cb0fdf8f800',
);
const tagged = Uint8Array.fromHex(
  '01640028ffe1001167640028ac16c903c0113f2cdc0434040801000468ee3cb0fdf8f800',
);

test('writes the encoder color tags into an SPS without VUI', () => {
  // FFmpeg's h264_metadata bitstream filter produced the reference configuration.
  expect(addMissingAvcColorInfo(missingVui, encoderColor)).toEqual(tagged);
});

test('preserves existing SPS color signaling and requires complete encoder metadata', () => {
  expect(addMissingAvcColorInfo(tagged, { ...encoderColor, fullRange: false })).toBe(tagged);
  expect(addMissingAvcColorInfo(missingVui, { fullRange: true })).toBe(missingVui);
});

test('adds video signal information without losing the existing VUI constraints', () => {
  const untagged = Uint8Array.fromHex(
    '0164001effe1001a6764001eacd940a02ff97011000003000100000300300f162d9601000668ebe3cb22c0fdf8f800',
  );
  const sps = (config: Uint8Array) =>
    parseAvcSps(deserializeAvcDecoderConfigurationRecord(config)!.sequenceParameterSets[0]!)!;
  const updated = addMissingAvcColorInfo(untagged, { ...encoderColor, fullRange: false });
  const before = sps(untagged);
  const after = sps(updated);
  expect(after).toMatchObject({
    colourPrimaries: 1,
    transferCharacteristics: 13,
    matrixCoefficients: 1,
    fullRangeFlag: 0,
    numReorderFrames: before.numReorderFrames,
    maxDecFrameBuffering: before.maxDecFrameBuffering,
  });
});
