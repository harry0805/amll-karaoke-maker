import { chromium } from 'playwright';
import { strict as assert } from 'node:assert';
const origin = process.argv[2] || 'http://127.0.0.1:3210';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route('**/test-config/storage/config', r => r.fulfill({json:{ttml:'<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0s" end="2s">Test</p></div></body></tt>',settings:{}}}));
  await page.goto(`${origin}/render?job=storage`);
  await page.waitForFunction(()=>typeof (window as any).writeStoredExport==='function');
  const result = await page.evaluate(async()=>{
    const api=window as any;
    let release!:()=>void;
    let started!:()=>void;
    const ready=new Promise<void>(r=>started=r);
    const pause=new Promise<void>(r=>release=r);
    const writing=api.writeStoredExport('disk-test.mp4',new AbortController().signal,async(stream:FileSystemWritableFileStream)=>{
      // Reuse one 1 MiB block for a 32 MiB file. No whole-file allocation.
      const chunk=new Uint8Array(1024**2).fill(79);
      for(let i=0;i<32;i++)await stream.write(chunk);
      started(); await pause; await stream.close();
    });
    await ready;
    const activeCount=(await api.listStoredExports()).length;
    release(); const saved=await writing;
    const fileBacked=saved.file instanceof File;
    const size=saved.file.size;
    const header=Array.from(new Uint8Array(await saved.file.slice(0,4).arrayBuffer()));
    const savedCount=(await api.listStoredExports()).length;
    const dir=await (await navigator.storage.getDirectory()).getDirectoryHandle('karaoke-exports-v1');
    const quotaName=await api.writeStoredExport('quota.mp4',new AbortController().signal,async(stream:FileSystemWritableFileStream)=>{
      await stream.write(new Uint8Array(1024));
      throw new DOMException('Test quota exhaustion','QuotaExceededError');
    }).then(()=>'',(error:Error)=>error.message);
    const afterFailure:string[]=[];for await(const name of dir.keys())afterFailure.push(name);
    const orphanId=crypto.randomUUID(); await dir.getFileHandle(orphanId+'.mp4',{create:true});
    await api.listStoredExports();
    let orphanRemoved=false;try{await dir.getFileHandle(orphanId+'.mp4');}catch{orphanRemoved=true;}
    return {id:saved.id,activeCount,fileBacked,size,header,savedCount,quotaName,afterFailure,orphanRemoved};
  });
  assert.equal(result.activeCount,0,'Cleanup must skip the live writer');
  assert(result.fileBacked);assert.equal(result.size,32*1024**2);assert.deepEqual(result.header,[79,79,79,79]);
  assert.equal(result.savedCount,1);assert(result.quotaName.includes('storage is full'));assert.equal(result.afterFailure.length,2);assert(result.orphanRemoved);
  await page.reload();await page.waitForFunction(()=>typeof (window as any).listStoredExports==='function');
  const restored=await page.evaluate(async(id)=>{
    const api=window as any;const list=await api.listStoredExports();const size=list[0].file.size;
    await api.deleteStoredExport(id);return {size,left:(await api.listStoredExports()).length};
  },result.id);
  assert.equal(restored.size,32*1024**2);assert.equal(restored.left,0);
  console.log('PASS: 32 MiB disk-backed output, active-writer protection, simulated quota cleanup, orphan cleanup, reload recovery and deletion');
} finally {await browser.close();}
