// Exercise the rendering/encoding contract in an isolated browser with no server API.
import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const origin = process.argv[2] || 'http://127.0.0.1:3211';
const dir = await mkdtemp(join(tmpdir(), 'browser-export-'));
async function command(args: string[]) {
  const p = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  assert.equal(code, 0, err); return out;
}
const source = join(dir, 'source.mp4');
await command(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x285078:s=640x360:r=24:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source]);
const ttml = `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0s" end="1.4s"><span begin="0s" end="0.7s">Golden </span><span begin="0.7s" end="1.4s">gyp words</span></p><p begin="8s" end="9s"><span begin="8s" end="9s">Next</span></p></div></body></tt>`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/test-config/browser-test/config', route => route.fulfill({ json: { ttml, settings: defaults } }));
  await page.goto(`${origin}/render?job=browser-test`);
  await page.waitForFunction(() => window.rendererReady || window.rendererError);
  assert.equal(await page.evaluate(() => window.rendererError), undefined);
  const apiRequests: string[] = [];
  await page.route('**/*', route => { apiRequests.push(route.request().url()); return route.abort(); });
  const sourceBytes = Array.from(new Uint8Array(await Bun.file(source).arrayBuffer()));
  const result = await page.evaluate(async ({ sourceBytes, ttml, settings }) => {
    const canvas = document.createElement('canvas');
    const progress: number[] = [];
    const start = performance.now();
    const blob = await (window as any).exportVideo({ video: new Blob([new Uint8Array(sourceBytes)]), ttml, settings, preview: canvas, signal: new AbortController().signal,
      onProgress: (p: {frames: number}) => progress.push(p.frames) });
    return { bytes: Array.from(new Uint8Array(await blob.file.arrayBuffer())), frames: Math.max(...progress), seconds: (performance.now()-start)/1000, leaked: document.querySelectorAll('.export-stage').length };
  }, { sourceBytes, ttml, settings: { ...defaults, textColor: '#ffd45a', outlineColor:'#ff0088' } });
  assert.equal(result.frames, 48); assert.equal(result.leaked, 0); assert.deepEqual(apiRequests, []); assert.deepEqual(errors, []);
  const target = join(dir, 'result.mp4'); await Bun.write(target, new Uint8Array(result.bytes));
  const info = JSON.parse(await command(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', target]));
  const v = info.streams.find((s: any) => s.codec_type === 'video'); const a = info.streams.find((s: any) => s.codec_type === 'audio');
  assert.equal(v.width,640); assert.equal(v.height,360); assert.equal(v.nb_frames,'48'); assert.equal(v.avg_frame_rate,'24/1'); assert.equal(v.codec_name,'h264'); assert.equal(a.codec_name,'aac');
  assert(Math.abs(Number(info.format.duration) - 2) < .06);
  const audioPackets = async (path: string) => JSON.parse(await command(['ffprobe','-v','error','-select_streams','a:0','-show_packets','-show_data_hash','sha256','-of','json',path])).packets
    .filter((p:any)=>Number(p.pts_time) + Number(p.duration_time) > 0)
    .map((p:any)=>({hash:p.data_hash,time:Number(p.pts_time)}));
  assert.deepEqual(await audioPackets(source), await audioPackets(target), 'Presented AAC packets and timestamps should be copied unchanged');
  const raw = Bun.spawn(['ffmpeg', '-v', 'error', '-ss', '0.5', '-i', target, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {stdout:'pipe',stderr:'inherit'});
  const pixels = new Uint8Array(await new Response(raw.stdout).arrayBuffer()); await raw.exited;
  let gold=0,pink=0; for(let i=0;i<pixels.length;i+=3) {const [r,g,b]=[pixels[i]!,pixels[i+1]!,pixels[i+2]!]; if(r>150&&g>100&&b<130)gold++; if(r>120&&g<90&&b>50)pink++;}
  assert(gold>50, `Expected lyric fill, got ${gold} pixels`); assert(pink>20, `Expected outline, got ${pink} pixels`);
  await command(['ffmpeg','-v','error','-ss','0.5','-i',target,'-frames:v','1',join(dir,'frame.png')]);
  console.log(`PASS: local H.264/AAC export, 48 frames, timing, colored lyrics/outline, cleanup, zero network requests. ${result.seconds.toFixed(1)}s. ${dir}`);
  const cancelled = await page.evaluate(async ({sourceBytes, ttml, settings}) => {
    const controller = new AbortController();
    try {
      await (window as any).exportVideo({video:new Blob([new Uint8Array(sourceBytes)]),ttml,settings,preview:document.createElement('canvas'),signal:controller.signal,onProgress:()=>controller.abort()});
      return false;
    } catch { return controller.signal.aborted && !document.querySelector('.export-stage'); }
  }, {sourceBytes,ttml,settings:defaults});
  assert(cancelled, 'Cancellation should reject and clean up');
  // Re-export after cancellation, using silent variable-frame-rate source.
  const silent = join(dir,'silent-vfr.mp4');
  await command(['ffmpeg','-v','error','-i',source,'-an','-vf',"select='if(lt(t,1),1,not(mod(n,2)))'",'-fps_mode','vfr','-c:v','libx264',silent]);
  const silentBytes = Array.from(new Uint8Array(await Bun.file(silent).arrayBuffer()));
  const silentResult = await page.evaluate(async ({sourceBytes,ttml,settings}) => {
    const blob = await (window as any).exportVideo({video:new Blob([new Uint8Array(sourceBytes)]),ttml,settings,preview:document.createElement('canvas'),signal:new AbortController().signal,onProgress:()=>{}});
    return Array.from(new Uint8Array(await blob.file.arrayBuffer()));
  }, {sourceBytes:silentBytes,ttml,settings:defaults});
  const silentTarget=join(dir,'silent-result.mp4'); await Bun.write(silentTarget,new Uint8Array(silentResult));
  const timestamps = async (path: string) => JSON.parse(await command(['ffprobe','-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=pts_time','-of','json',path])).frames.map((f:any)=>Number(f.pts_time));
  const before = await timestamps(silent), after = await timestamps(silentTarget);
  assert.equal(before.length,after.length);
  before.forEach((t:number,i:number)=>assert(Math.abs(t-after[i])<.00001,'Preserve variable frame timestamps'));
  const silentInfo=JSON.parse(await command(['ffprobe','-v','error','-show_streams','-of','json',silentTarget]));
  assert.equal(silentInfo.streams.length,1);
  assert.deepEqual(apiRequests,[]);
  console.log('PASS: cancellation, subsequent export, silent input, original VFR frame timestamps, unchanged AAC packets');
  const opus = join(dir,'opus.webm');
  await command(['ffmpeg','-v','error','-i',source,'-c:v','libvpx-vp9','-c:a','libopus',opus]);
  const unsupported = await page.evaluate(async ({bytes,ttml,settings}) => {
    try {
      await (window as any).exportVideo({video:new Blob([new Uint8Array(bytes)]),ttml,settings,preview:document.createElement('canvas'),signal:new AbortController().signal,onProgress:()=>{}});
      return '';
    } catch(error) {return String(error);}
  }, {bytes:Array.from(new Uint8Array(await Bun.file(opus).arrayBuffer())),ttml,settings:defaults});
  assert(unsupported.includes('supports AAC audio'),unsupported);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.export-stage').length),0);
  const stored = await page.evaluate(async () => {
    const list = await (window as any).listStoredExports();
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('karaoke-exports-v1');
    const names: string[] = []; for await (const name of dir.keys()) names.push(name);
    return { count: list.length, fileBacked: list.every((item:any) => item.file instanceof File), files: names.length };
  });
  assert.deepEqual(stored,{ count: 2, fileBacked: true, files: 4 },'Only the two successful MP4s and their records should remain');
  console.log('PASS: unsupported audio explains AAC requirement and leaves no renderer behind');
} finally { await browser.close(); }
