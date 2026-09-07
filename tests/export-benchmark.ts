import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
import { defaults } from '../src/settings';
import { benchmarkLyrics } from './snapshot-fixture';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
const origin=process.argv[2]||'http://127.0.0.1:3210';
const dir=await mkdtemp(`${tmpdir()}/export-benchmark-`);
const p=Bun.spawn(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=s=1920x1080:r=30:d=3','-f','lavfi','-i','sine=duration=3','-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',`${dir}/source.mp4`],{stderr:'pipe'});
const error=await new Response(p.stderr).text();assert.equal(await p.exited,0,error);
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1920,height:1080}});
 const ttml=await benchmarkLyrics(),settings={...defaults,offset:-40000};
 await page.route('**/test-config/benchmark/config',r=>r.fulfill({json:{ttml,settings}}));
 await page.goto(`${origin}/render?job=benchmark`);await page.waitForFunction(()=>window.rendererReady||window.rendererError);
 const bytes=Array.from(new Uint8Array(await Bun.file(`${dir}/source.mp4`).arrayBuffer()));
 const result=await page.evaluate(async({bytes,ttml,settings})=>{
  const start=performance.now();let frames=0;
  const result=await (window as any).exportVideo({video:new Blob([new Uint8Array(bytes)]),ttml,settings,preview:document.createElement('canvas'),signal:new AbortController().signal,onProgress:(p:any)=>frames=p.frames});
  const seconds=(performance.now()-start)/1000;
  const size=result.file.size;await (window as any).deleteStoredExport(result.id);
  return {frames,seconds,fps:frames/seconds,size};
 },{bytes,ttml,settings});
 assert.equal(result.frames,90);console.log(JSON.stringify(result));
}finally{await browser.close();}
