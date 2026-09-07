import { ALL_FORMATS, BlobSource, StreamTarget, Conversion, EncodedAudioPacketSource, EncodedPacketSink, Input, Mp4OutputFormat, Output } from 'mediabunny';
import { snapshotLyrics } from './lyric-snapshot';
export { snapshotLyrics };
import { Lyrics } from './lyrics';
import type { Settings } from './settings';
import { writeStoredExport, type StoredExport } from './export-storage';

export interface ExportProgress { frames: number; time: number; duration: number; finishing: boolean; fps: number }

/** Browser-only, frame-timed export. No uploads, screen capture or real-time recording. */
interface ExportOptions {
  video: Blob; ttml: string; settings: Settings; preview: HTMLCanvasElement;
  signal: AbortSignal; onProgress: (progress: ExportProgress) => void;
  name?: string;
}
export async function exportVideo(options: ExportOptions): Promise<StoredExport> {
  return writeStoredExport(options.name || 'karaoke.mp4', options.signal, stream => renderToFile(options, stream));
}

async function renderToFile(options: ExportOptions, stream: FileSystemWritableFileStream): Promise<void> {
  const { signal, preview, onProgress } = options;
  signal.throwIfAborted();
  if (!isSecureContext || typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
    throw new Error('Browser export needs WebCodecs. Open this site over HTTPS or localhost in a recent Chrome, Edge, or Safari.');
  }
  const input = new Input({ source: new BlobSource(options.video, { maxCacheSize: 8 * 1024 ** 2 }), formats: ALL_FORMATS });
  // Write regular MP4 chunks immediately, then seek back to update headers.
  // In-memory fast start would retain the entire movie despite a disk target.
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }),
    target: new StreamTarget(stream, { chunked: true, chunkSize: 1024 ** 2 }) });
  let conversion: Conversion | undefined;
  let lyrics: Lyrics | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let audioPackets: AsyncGenerator<import('mediabunny').EncodedPacket, void, unknown> | undefined;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  host.setAttribute('aria-hidden', 'true');
  const cancel = () => { void conversion?.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error('This browser cannot decode the source video for export. Try an H.264 MP4.');
    const width = Math.ceil(await track.getDisplayWidth() / 2) * 2;
    const height = Math.ceil(await track.getDisplayHeight() / 2) * 2;
    const duration = await input.computeDuration();
    const audioTrack = await input.getPrimaryAudioTrack();
    const copyAudio = audioTrack && await audioTrack.getCodec() === 'aac';
    if (audioTrack && !copyAudio) {
      throw new Error('This first browser exporter supports AAC audio or video without audio. Convert the source audio to AAC before exporting.');
    }
    const audioSource = copyAudio ? new EncodedAudioPacketSource('aac') : undefined;
    if (audioSource) output.addAudioTrack(audioSource);
    const decoderConfig = audioTrack ? await audioTrack.getDecoderConfig() : undefined;
    const audioEnd = audioTrack ? await audioTrack.computeDuration() : 0;
    audioPackets = audioTrack ? new EncodedPacketSink(audioTrack).packets() : undefined;
    let nextAudio = await audioPackets?.next();
    const copyAudioUntil = async (time: number) => {
      while (audioSource && nextAudio && !nextAudio.done && nextAudio.value.timestamp <= time) {
        signal.throwIfAborted();
        const packet = nextAudio.value;
        if (packet.timestamp >= audioEnd) break;
        // Exclude non-presented AAC priming packets before time zero.
        if (packet.timestamp + packet.duration > 0) {
          const timestamp = Math.max(0, packet.timestamp);
          const end = Math.min(audioEnd, packet.timestamp + packet.duration);
          await audioSource.add(packet.clone({ timestamp, duration: end - timestamp }), { decoderConfig: decoderConfig! });
        }
        nextAudio = await audioPackets!.next();
      }
    };
    signal.throwIfAborted();
    const stage = document.createElement('div');
    stage.className = 'export-stage';
    stage.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;container-type:size;`;
    stage.innerHTML = '<div id="shade"></div><div id="lyrics"></div>';
    host.append(stage); document.body.append(host);
    lyrics = new Lyrics(stage, stage.querySelector<HTMLElement>('#lyrics')!, options.settings);
    await lyrics.load(options.ttml);
    canvas = document.createElement('canvas');
    canvas.width = preview.width = width; canvas.height = preview.height = height;
    const context = canvas.getContext('2d', { alpha: false })!;
    const previewContext = preview.getContext('2d', { alpha: false })!;
    let previous = 0;
    let frames = 0;
    let renderStarted = 0;
    const renderFps = () => frames * 1000 / Math.max(1, performance.now() - renderStarted);
    conversion = await Conversion.init({
      input, output, composable: true, tracks: 'primary', trim: { start: 0, end: duration },
      video: {
        codec: 'avc', width, height, fit: 'fill', allowRotationMetadata: false,
        // Omit frameRate to retain each original sample's timing, including VFR.
        async process(sample) {
          signal.throwIfAborted();
          // Bound audio lead to one second instead of queuing the whole song.
          await copyAudioUntil(sample.timestamp + 1);
          await lyrics!.frame(sample.timestamp * 1000, frames ? (sample.timestamp - previous) * 1000 : 0);
          const overlay = await snapshotLyrics(stage);
          signal.throwIfAborted();
          sample.draw(context, 0, 0, width, height);
          context.drawImage(overlay, 0, 0);
          previewContext.drawImage(canvas!, 0, 0);
          previous = sample.timestamp;
          onProgress({ frames: ++frames, time: sample.timestamp, duration, finishing: false, fps: renderFps() });
          return canvas!;
        },
      },
      audio: { discard: true },
    });
    // Conversion otherwise permits silently dropping an unsupported audio track.
    if (!conversion.isValid || conversion.discardedTracks.some(({ track }) => track !== audioTrack || !audioSource)) {
      throw new Error('This browser cannot encode this video or its audio as MP4. Try a recent Chrome, Edge, or Safari with an H.264/AAC source. No tracks were exported.');
    }
    signal.throwIfAborted();
    conversion.onProgress = progress => {
      if (progress === 1) onProgress({ frames, time: duration, duration, finishing: true, fps: renderFps() });
    };
    await output.start();
    renderStarted = performance.now();
    await conversion.execute();
    await copyAudioUntil(Infinity);
    audioSource?.close();
    signal.throwIfAborted();
    await output.finalize();
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener('abort', cancel);
    if (output.state !== 'finalized' && output.state !== 'canceled') {
      await conversion?.cancel().catch(() => {});
      await output.cancel().catch(() => {});
    }
    await audioPackets?.return().catch(() => {});
    input.dispose(); lyrics?.dispose(); host.remove();
    if (canvas) canvas.width = canvas.height = 0;
  }
}
