import { ALL_FORMATS, BlobSource, Input, canEncodeVideo } from 'mediabunny';

// Inspect codecs and browser capabilities without decoding the full movie or
// creating an output file. Rendering still validates the actual conversion.
export async function checkExportCompatibility(file: Blob): Promise<string[]> {
  const warnings: string[] = [];
  if (!isSecureContext || typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') {
    warnings.push('This browser does not support the WebCodecs export APIs here. Try this site over HTTPS or localhost in a browser with WebCodecs support.');
  }
  const input = new Input({ source: new BlobSource(file, { maxCacheSize: 8 * 1024 ** 2 }), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) warnings.push('No supported video track was found. Try an H.264 MP4.');
    else {
      if (!(await track.canDecode())) warnings.push('This browser cannot decode this video for export. Try an H.264 MP4.');
      const width = Math.ceil(await track.getDisplayWidth() / 2) * 2;
      const height = Math.ceil(await track.getDisplayHeight() / 2) * 2;
      if (!(await canEncodeVideo('avc', { width, height }))) warnings.push(`This browser cannot encode H.264 at the source resolution of ${width} × ${height}. Try another browser or a smaller source video.`);
    }
    const audio = await input.getPrimaryAudioTrack();
    if (audio && await audio.getCodec() !== 'aac') warnings.push('The source audio is not AAC. Export currently supports AAC audio or silent video. Convert the audio to AAC before exporting.');
  } catch {
    warnings.push('Export compatibility could not be verified. The file may use an unsupported format or contain damaged media. Try an H.264 MP4 with AAC audio.');
  } finally { input.dispose(); }
  return warnings;
}
