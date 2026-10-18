import { message, type DisplayMessage } from './messages';
import { ALL_FORMATS, BlobSource, Input, canEncodeVideo } from 'mediabunny';

// Inspect codecs and browser capabilities without decoding the full movie or
// creating an output file. Rendering still validates the actual conversion.
export async function checkExportCompatibility(file: Blob): Promise<DisplayMessage[]> {
  const warnings: DisplayMessage[] = [];
  if (
    !isSecureContext ||
    typeof VideoEncoder === 'undefined' ||
    typeof VideoDecoder === 'undefined'
  ) {
    warnings.push(message('compatibility.webCodecs'));
  }
  const input = new Input({
    source: new BlobSource(file, { maxCacheSize: 8 * 1024 ** 2 }),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) warnings.push(message('compatibility.noVideoTrack'));
    else {
      if (!(await track.canDecode())) warnings.push(message('compatibility.cannotDecode'));
      const width = Math.ceil((await track.getDisplayWidth()) / 2) * 2;
      const height = Math.ceil((await track.getDisplayHeight()) / 2) * 2;
      if (!(await canEncodeVideo('avc', { width, height })))
        warnings.push(message('compatibility.cannotEncode', { width, height }));
    }
    const audio = await input.getPrimaryAudioTrack();
    if (audio && (await audio.getCodec()) !== 'aac')
      warnings.push(message('compatibility.audioUnsupported'));
  } catch {
    warnings.push(message('compatibility.unverified'));
  } finally {
    input.dispose();
  }
  return warnings;
}
