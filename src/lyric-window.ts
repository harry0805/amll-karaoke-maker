export interface SingingInterval {
  start: number;
  end: number;
}

export interface LyricWindowEntry {
  main: SingingInterval;
  background?: SingingInterval;
  backgroundOnly?: boolean;
}

export function isSinging(interval: SingingInterval | undefined, time: number): boolean {
  return !!interval && time >= interval.start && time < interval.end;
}

/** A zero limit means unlimited. Background-only groups occupy space, not a slot. */
export function selectLyricWindow(entries: LyricWindowEntry[], time: number, limit: number) {
  const active = new Set<number>();
  let count = 0;
  entries.forEach((entry, index) => {
    // Once a group reveals its background, keep the row through any gap
    // between vocals. Highlighting and exit fades still use each vocal's timing.
    const start = Math.min(entry.main.start, entry.background?.start ?? entry.main.start);
    const end = Math.max(entry.main.end, entry.background?.end ?? entry.main.end);
    if (time >= start && time < end) {
      active.add(index);
      if (!entry.backgroundOnly) count++;
    }
  });
  const visible = new Set(active);
  entries.forEach((entry, index) => {
    if (
      active.has(index) ||
      entry.backgroundOnly ||
      entry.main.start <= time ||
      (limit > 0 && count >= limit)
    )
      return;
    visible.add(index);
    count++;
  });
  return { active, visible };
}
