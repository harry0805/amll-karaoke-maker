import { DomLyricPlayer, type LyricLine } from '@applemusic-like-lyrics/core';
import { parseTTML } from '@applemusic-like-lyrics/ttml';
import type { Settings } from './settings';

export function parseLyrics(text: string): LyricLine[] {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.querySelector('parsererror') || xml.documentElement.localName !== 'tt') throw new Error('This is not a valid TTML document.');
  // AMLL 1.0 requires Apple line keys, though ordinary TTML does not.
  // Add missing keys to the in-memory document so those files work too.
  const itunes = 'http://music.apple.com/lyric-ttml-internal';
  const paragraphs = Array.from(xml.getElementsByTagNameNS('*', 'p'));
  const keys = new Set(paragraphs.map(p => p.getAttributeNS(itunes, 'key')));
  let nextKey = 0;
  for (const paragraph of paragraphs) {
    if (paragraph.getAttributeNS(itunes, 'key')) continue;
    let key: string;
    do { key = `karaoke-${nextKey++}`; } while (keys.has(key));
    keys.add(key);
    paragraph.setAttributeNS(itunes, 'itunes:key', key);
  }
  const lines = parseTTML(new XMLSerializer().serializeToString(xml)).lines;
  if (!lines.length || !lines.some(line => line.words.some(word => word.word.trim()))) throw new Error('No timed lyrics found in this TTML.');
  for (const line of lines) {
    if (!Number.isFinite(line.startTime) || !Number.isFinite(line.endTime) || line.endTime < line.startTime || line.startTime < 0) throw new Error('TTML contains invalid line timing.');
    for (const word of line.words) if (!Number.isFinite(word.startTime) || !Number.isFinite(word.endTime) || word.endTime < word.startTime) throw new Error('TTML contains invalid word timing.');
  }
  return lines;
}

export class Lyrics {
  player = new DomLyricPlayer();
  settings: Settings;
  private previous = -1;
  constructor(private stage: HTMLElement, container: HTMLElement, settings: Settings) {
    this.settings = settings;
    container.append(this.player.getElement());
    this.player.setEnableBlur(false);
    this.player.setAlignPosition(0.5);
    this.player.setAlignAnchor('center');
    this.player.setWordFadeWidth(0.5);
    this.player.setEnableSpring(true);
    this.player.setEnableScale(true);
    this.player.resume();
    this.configure(settings);
  }
  configure(settings: Settings) {
    this.settings = settings;
    const container = this.stage.querySelector<HTMLElement>('#lyrics')!;
    container.style.height = `${settings.height}%`;
    container.style.bottom = `${settings.bottom}%`;
    this.player.getElement().style.setProperty('--amll-lp-font-size', `${settings.fontSize}cqh`);
    this.stage.style.setProperty('--shade', String(settings.shade / 100));
    void this.player.calcLayout(true, true);
  }
  async load(text: string) {
    const lines = parseLyrics(text);
    this.player.setLyricLines(lines, 0);
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await this.player.calcLayout(true, true);
    this.previous = -1;
    await this.frame(0, 0, true);
    return lines;
  }
  async frame(videoTime: number, delta: number, seek = false) {
    const time = Math.max(0, videoTime - this.settings.offset);
    const jump = seek || this.previous < 0 || time < this.previous || Math.abs(time - this.previous) > 250;
    this.player.setCurrentTime(time, jump);
    if (jump) await this.player.calcLayout(true, true);
    this.player.update(Math.min(100, delta));
    const groups = this.player.currentLyricGroups;
    let focus = groups.findIndex(group => time >= group.startTime && time < group.endTime);
    if (focus < 0) focus = groups.findIndex(group => group.startTime > time);
    if (focus < 0) focus = groups.length - 1;
    // Keep at most three lyric groups in the box. A duet/background vocal
    // belongs to its main group, and long text may still wrap within a group.
    groups.forEach((group, index) => {
      (group as typeof group & { element: HTMLElement }).element.style.visibility = Math.abs(index - focus) <= 1 ? 'visible' : 'hidden';
    });
    // AMLL uses Web Animations for word fills. Freeze them at the media time,
    // including during offline export, while its springs advance by frame delta.
    for (const group of this.player.currentLyricGroups) {
      if (time >= group.startTime && time < group.endTime) group.enable(time, false);
    }
    for (const animation of this.player.getElement().getAnimations({ subtree: true })) animation.pause();
    this.previous = time;
  }
}
