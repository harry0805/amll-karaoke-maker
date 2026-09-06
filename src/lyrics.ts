import { DomLyricPlayer, type LyricLine } from '@applemusic-like-lyrics/core';
import { parseTTML } from '@applemusic-like-lyrics/ttml';
import { fonts, type Settings } from './settings';

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
  private lineEnds = new WeakMap<object, number>();
  private outlineId = `lyric-outline-${crypto.randomUUID()}`;
  private outlineDilate: SVGFEMorphologyElement;
  private outlineFlood: SVGFEFloodElement;
  constructor(private stage: HTMLElement, container: HTMLElement, settings: Settings) {
    this.settings = settings;
    // Apply the outline after the words have been masked and animated. A text
    // stroke on the spans themselves is clipped by their individual masks.
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<defs><filter id="${this.outlineId}" x="-20%" y="-50%" width="140%" height="200%" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="0" result="expanded"/><feFlood result="color"/><feComposite in="color" in2="expanded" operator="in" result="outline"/><feMerge><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
    this.outlineDilate = svg.querySelector('feMorphology')!;
    this.outlineFlood = svg.querySelector('feFlood')!;
    stage.append(svg);
    new ResizeObserver(() => this.updateOutline()).observe(stage);
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
    const fontChanged = this.settings.font !== settings.font;
    this.settings = settings;
    const container = this.stage.querySelector<HTMLElement>('#lyrics')!;
    container.style.height = `${settings.height}%`;
    container.style.bottom = `${settings.bottom}%`;
    container.style.left = `${settings.horizontalMargin}%`;
    container.style.width = `${100 - 2 * settings.horizontalMargin}%`;
    this.player.getElement().style.setProperty('--amll-lp-font-size', `${settings.fontSize}cqh`);
    this.player.getElement().style.setProperty('--amll-lp-color', settings.textColor);
    this.player.getElement().style.setProperty('--duet-color', settings.duetColor);
    container.style.fontFamily = fonts[settings.font];
    this.updateOutline();
    if (fontChanged) this.player.rebuildLyricLines();
    this.stage.style.setProperty('--shade', String(settings.shade / 100));
    void this.player.calcLayout(true, true);
  }
  private updateOutline() {
    // CSS text stroke straddles a glyph edge. Dilation grows outward only.
    const radius = this.stage.clientHeight * this.settings.fontSize / 100 * this.settings.outlineWidth / 200;
    this.outlineDilate.setAttribute('radius', String(radius));
    this.outlineFlood.setAttribute('flood-color', this.settings.outlineColor);
    this.player.getElement().style.setProperty('--lyric-outline-filter', radius > 0 ? `url(#${this.outlineId})` : 'none');
  }
  async load(text: string) {
    const lines = parseLyrics(text);
    this.player.setLyricLines(lines, 0);
    // AMLL may extend a line to match background vocals or transitions. Hide
    // at its own final sung word, falling back to line timing for empty lines.
    this.lineEnds = new WeakMap();
    let index = 0;
    const sungEnd = (line: LyricLine) => {
      const words = line.words.filter(word => word.word.trim());
      return words.length ? Math.max(...words.map(word => word.endTime)) : line.endTime;
    };
    for (const group of this.player.currentLyricGroups) {
      this.lineEnds.set(group.mainLine, sungEnd(lines[index++]!));
      if (group.bgLine) this.lineEnds.set(group.bgLine, sungEnd(lines[index++]!));
    }
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
      const nearby = Math.abs(index - focus) <= 1;
      for (const line of [group.mainLine, group.bgLine]) {
        if (!line) continue;
        const end = this.lineEnds.get(line) ?? line.getLine().endTime;
        const element = (line as typeof line & { getElement(): HTMLElement }).getElement();
        // Explicit visibility wins over AMLL's lingering group opacity and is
        // reversible when seeking backward. Do not remove the layout space.
        element.style.visibility = nearby && time < end ? 'visible' : 'hidden';
      }
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
