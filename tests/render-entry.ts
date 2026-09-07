declare global {
  interface Window { rendererReady: boolean; rendererError?: string; renderFrame: (time: number, delta: number) => Promise<void> }
}
import { Lyrics } from '../src/lyrics';
import { validateSettings } from '../src/settings';
import { exportVideo, snapshotLyrics } from '../src/browser-export';
const stage = document.getElementById('stage')!;
const $ = (id: string) => document.getElementById(id)!;
Object.assign(window, { exportVideo, snapshotLyrics });
async function main() {
  if (location.pathname === '/render') {
    document.body.className = 'render';
    document.body.replaceChildren(stage);
    try {
      const res = await fetch(`/test-config/${new URLSearchParams(location.search).get('job')}/config`);
      if (!res.ok) throw new Error('Cannot load export.');
      const config = await res.json();
      const lyrics = new Lyrics(stage, $('lyrics'), validateSettings(config.settings));
      await lyrics.load(config.ttml);
      window.renderFrame = (time, delta) => lyrics.frame(time, delta);
      window.rendererReady = true;
    } catch (error) { window.rendererError = String(error); }
    return;
  }

}
void main();
import { writeStoredExport, listStoredExports, deleteStoredExport } from '../src/export-storage';
Object.assign(window, { writeStoredExport, listStoredExports, deleteStoredExport });
