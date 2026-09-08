import { getStageFontCSS } from './font-runtime';
import { toSvg } from 'html-to-image';
import { snapshotStyles } from './snapshot-styles';

/** Snapshot computed AMLL styles, including the current Web Animation values. */
export async function snapshotLyrics(
  stage: HTMLElement,
  fullTree = false,
): Promise<HTMLImageElement> {
  const excluded = new Set<Element>();
  const outlineBounds = new Map<string, { x: number; y: number; width: number; height: number }>();
  const marked: HTMLElement[] = [];
  if (!fullTree) {
    const viewport = stage.querySelector<HTMLElement>('#lyrics')!.getBoundingClientRect();
    // Measure once before cloning. Include a generous paint margin for word
    // lift, scale, shadows and outlines near the viewport's clipped edges.
    const margin = stage.clientHeight * 0.16;
    for (const group of stage.querySelectorAll<HTMLElement>('[class*="_lyricLineWrapper"]')) {
      const box = group.getBoundingClientRect();
      let top = box.top,
        bottom = box.bottom;
      // Background vocals can extend outside their absolutely positioned group.
      for (const line of group.querySelectorAll(
        '[class*="_lyricLine"]:not([class*="_lyricLineWrapper"])',
      )) {
        const child = line.getBoundingClientRect();
        top = Math.min(top, child.top);
        bottom = Math.max(bottom, child.bottom);
      }
      if (bottom < viewport.top - margin || top > viewport.bottom + margin) excluded.add(group);
    }
    // SVG morphology is expensive over a full-width line with mostly empty
    // pixels. Restrict its paint region to the glyphs plus generous glow room.
    for (const line of stage.querySelectorAll<HTMLElement>(
      '[class*="_lyricMainLine"], [class*="_lyricSubLine"]',
    )) {
      if (excluded.has(line.closest('[class*="_lyricLineWrapper"]')!)) continue;
      const box = line.getBoundingClientRect();
      if (!box.width || !line.textContent?.trim()) continue;
      const range = document.createRange();
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let leftPx = Infinity,
        rightPx = -Infinity,
        topPx = Infinity,
        bottomPx = -Infinity;
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent?.trim()) continue;
        range.selectNodeContents(walker.currentNode);
        const text = range.getBoundingClientRect();
        leftPx = Math.min(leftPx, text.left);
        rightPx = Math.max(rightPx, text.right);
        topPx = Math.min(topPx, text.top);
        bottomPx = Math.max(bottomPx, text.bottom);
      }
      const padding = parseFloat(getComputedStyle(line).fontSize) * 1.2;
      const left = Math.max(-0.2, (leftPx - box.left - padding) / box.width);
      const right = Math.min(1.2, (rightPx - box.left + padding) / box.width);
      const top = Math.max(-0.5, (topPx - box.top - padding) / box.height);
      const bottom = Math.min(1.5, (bottomPx - box.top + padding) / box.height);
      if (right <= left || bottom <= top) continue;
      const key = String(outlineBounds.size);
      outlineBounds.set(key, {
        x: left * 100,
        y: top * 100,
        width: (right - left) * 100,
        height: (bottom - top) * 100,
      });
      line.dataset.snapshotOutline = key;
      marked.push(line);
    }
  }
  let uri: string;
  try {
    uri = await toSvg(stage, {
      skipFonts: true,
      fontEmbedCSS: getStageFontCSS(stage),
      pixelRatio: 1,
      filter: (node) => !excluded.has(node),
      includeStyleProperties: fullTree ? undefined : snapshotStyles,
    });
  } finally {
    for (const line of marked) delete line.dataset.snapshotOutline;
  }
  // Computed SVG filter URLs are absolute in Chromium. The filter definitions
  // travel inside the snapshot, so resolve them inside that SVG image too.
  let xml = decodeURIComponent(uri.slice(uri.indexOf(',') + 1))
    .replace(/url\(&quot;[^#]*#([^&]+)&quot;\)/g, 'url(#$1)')
    .replace(/url\("[^#"]*#([^"\)]+)"\)/g, 'url(#$1)');
  if (outlineBounds.size) {
    const document = new DOMParser().parseFromString(xml, 'image/svg+xml');
    for (const line of document.querySelectorAll<HTMLElement>('[data-snapshot-outline]')) {
      const key = line.dataset.snapshotOutline!;
      const bounds = outlineBounds.get(key)!;
      const id = line.style.filter.match(/url\(["']?#([^"')]+)["']?\)/)?.[1];
      const template = id ? document.getElementById(id) : null;
      if (!template) continue;
      const filter = template.cloneNode(true) as Element;
      filter.id = `${id}-snapshot-${key}`;
      filter.setAttribute('x', `${bounds.x}%`);
      filter.setAttribute('width', `${bounds.width}%`);
      filter.setAttribute('y', `${bounds.y}%`);
      filter.setAttribute('height', `${bounds.height}%`);
      template.parentNode!.appendChild(filter);
      line.style.filter = `url(#${filter.id})`;
    }
    xml = new XMLSerializer().serializeToString(document);
  }
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await image.decode();
  return image;
}
