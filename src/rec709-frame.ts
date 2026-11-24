import { VideoSample } from 'mediabunny';

const limitedRec709 = {
  primaries: 'bt709',
  transfer: 'bt709',
  matrix: 'bt709',
  fullRange: false,
} satisfies VideoColorSpaceInit;

export function isLimitedRec709(color: VideoColorSpaceInit): boolean {
  return (
    color.primaries === limitedRec709.primaries &&
    color.transfer === limitedRec709.transfer &&
    color.matrix === limitedRec709.matrix &&
    color.fullRange === limitedRec709.fullRange
  );
}

export function makeRec709Sample(
  planes: Uint8Array<ArrayBuffer>,
  init: {
    format: 'I420' | 'NV12';
    codedWidth: number;
    codedHeight: number;
    timestamp: number;
    duration: number;
    layout?: PlaneLayout[];
  },
): VideoSample {
  // Transfer ownership of the packed bytes so WebCodecs can avoid copying them.
  const frameInit: VideoFrameBufferInit & { transfer: ArrayBuffer[] } = {
    ...init,
    timestamp: Math.round(init.timestamp * 1e6),
    duration: Math.round(init.duration * 1e6) || undefined,
    colorSpace: limitedRec709,
    transfer: [planes.buffer],
  };
  const frame = new VideoFrame(planes, frameInit);
  return new VideoSample(frame, { timestamp: init.timestamp, duration: init.duration });
}

/** Pack the composited RGB signal into limited-range Rec.709 I420 for the encoder. */
export function packRec709Frame(
  context: CanvasRenderingContext2D,
  timestamp: number,
  duration: number,
): VideoSample {
  const { width, height } = context.canvas;
  const { data: rgba } = context.getImageData(0, 0, width, height);
  const lumaSize = width * height;
  const chromaSize = lumaSize / 4;
  const planes = new Uint8Array(lumaSize + 2 * chromaSize);
  const luma = planes.subarray(0, lumaSize);
  const cb = planes.subarray(lumaSize, lumaSize + chromaSize);
  const cr = planes.subarray(lumaSize + chromaSize);
  const redWeight = 0.2126;
  const greenWeight = 0.7152;
  const blueWeight = 0.0722;
  const lumaScale = 219 / 255;
  const cbScale = 112 / (255 * (1 - blueWeight));
  const crScale = 112 / (255 * (1 - redWeight));

  for (let i = 0, pixel = 0; pixel < lumaSize; i += 4, pixel++) {
    const y = redWeight * rgba[i]! + greenWeight * rgba[i + 1]! + blueWeight * rgba[i + 2]!;
    luma[pixel] = Math.round(16 + lumaScale * y);
  }

  // I420 stores one chroma pair per 2×2 block. Average before quantizing.
  const rowBytes = width * 4;
  for (let row = 0, chroma = 0; row < height; row += 2) {
    for (let i = row * rowBytes; i < (row + 1) * rowBytes; i += 8, chroma++) {
      const below = i + rowBytes;
      const r = (rgba[i]! + rgba[i + 4]! + rgba[below]! + rgba[below + 4]!) / 4;
      const g = (rgba[i + 1]! + rgba[i + 5]! + rgba[below + 1]! + rgba[below + 5]!) / 4;
      const b = (rgba[i + 2]! + rgba[i + 6]! + rgba[below + 2]! + rgba[below + 6]!) / 4;
      const y = redWeight * r + greenWeight * g + blueWeight * b;
      cb[chroma] = Math.round(128 + cbScale * (b - y));
      cr[chroma] = Math.round(128 + crScale * (r - y));
    }
  }

  return makeRec709Sample(planes, {
    format: 'I420',
    codedWidth: width,
    codedHeight: height,
    timestamp,
    duration,
  });
}
