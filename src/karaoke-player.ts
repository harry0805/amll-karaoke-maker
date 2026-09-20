import { DomLyricPlayer } from '@applemusic-like-lyrics/core';
import type { SettingsSnapshot } from './settings';
import { selectLyricWindow, type LyricWindowEntry } from './lyric-window';
import { LyricMotion, LYRIC_FADE_MS } from './lyric-motion';

type Group = DomLyricPlayer['currentLyricGroups'][number];

/** AMLL animates words; karaoke positions use a stable, bottom-anchored canvas. */
export class KaraokePlayer extends DomLyricPlayer {
  intervals: LyricWindowEntry[] = [];
  private viewport?: { stage: HTMLElement; container: HTMLElement; settings: SettingsSnapshot };
  private motions = new WeakMap<Group, LyricMotion>();
  private admitted = new Set<Group>();
  private area = new LyricMotion(0);
  private dots = new LyricMotion(0);
  private dotsX = 0;
  private dotsVisible = false;
  private forceWindow = false;

  configureViewport(stage: HTMLElement, container: HTMLElement, settings: SettingsSnapshot) {
    this.viewport = { stage, container, settings };
  }

  override calcLayout(sync = false, force = false): Promise<void> {
    const result = super.calcLayout(sync, force);
    this.forceWindow ||= force;
    return result;
  }

  override update(delta = 0) {
    super.update(delta);
    if (this.viewport && this.intervals.length === this.currentLyricGroups.length) {
      this.layoutWindow(this.forceWindow, delta);
      this.forceWindow = false;
    }
  }

  private groupHeight(group: Group): number {
    if (!group.element.isConnected)
      return this.lyricGroupSize.get(group)?.[1] ?? this.baseFontSize * 2;
    // Background wrappers keep their layout space while they appear or fade.
    // Measuring a collapsing wrapper used to move every later line each frame.
    return group.element.offsetHeight;
  }

  private layoutWindow(force: boolean, delta: number) {
    const { stage, container, settings } = this.viewport!;
    const time = this.getCurrentTime();
    const groups = this.currentLyricGroups;
    const { active, visible } = selectLyricWindow(this.intervals, time, settings.visibleLines);
    const selected = [...visible].sort((a, b) => a - b);
    const available = stage.clientHeight * (1 - settings.bottom / 100);
    const player = this.getElement();
    // Resizing the clipping window must never move the spring coordinate origin.
    player.style.position = 'absolute';
    player.style.bottom = '0';
    player.style.width = '100%';
    player.style.height = `${available}px`;
    this.size[0] = container.clientWidth;
    this.size[1] = available;

    const heights = new Map<number, number>();
    for (const i of selected) {
      if (settings.visibleLines > 0 || active.has(i) || groups[i]!.isInSight) groups[i]!.show();
      heights.set(i, this.groupHeight(groups[i]!));
    }
    const inset = this.baseFontSize * 0.5;
    const hasInterlude = !active.size && selected.length && this.layoutState.lastInterludeState;
    const dotsHeight = hasInterlude
      ? this.interludeDots.getElement().clientHeight + this.baseFontSize * 0.8
      : 0;
    const naturalHeight = inset * 2 + dotsHeight + [...heights.values()].reduce((a, b) => a + b, 0);
    const firstHeight = inset * 2 + dotsHeight + (heights.get(selected[0]!) ?? 0);
    const cap = settings.height
      ? Math.max(firstHeight, (stage.clientHeight * settings.height) / 100)
      : available;
    const height = Math.min(available, naturalHeight, cap);
    if (force) this.area.snap(height);
    else this.area.advance(height, delta);

    let y = available - height + inset;
    const dots = this.interludeDots.getElement();
    if (hasInterlude) {
      if (force || !this.dotsVisible) this.dots.snap(y);
      else this.dots.advance(y, delta);
      this.dotsX = groups[selected[0]!]!.mainLine.getLine().isDuet
        ? this.size[0] - dots.clientWidth
        : 0;
      y += dotsHeight;
    }
    // Keep disappearing dots in place too; AMLL's next layout can already be
    // targeting the following verse while their opacity animation is finishing.
    this.interludeDots.setTransform(this.dotsX, this.dots.position + this.baseFontSize * 0.4);
    this.dotsVisible = !!hasInterlude;

    const targets = new Map<number, number>();
    for (const i of selected) {
      targets.set(i, y);
      y += heights.get(i)!;
    }
    let parkedY = available + inset;
    let clipHeight = this.area.position;
    const nextAdmitted = new Set<Group>();
    groups.forEach((group, i) => {
      const entry = this.intervals[i]!;
      const end = Math.max(entry.main.end, entry.background?.end ?? 0);
      const fading = time >= end && time < end + LYRIC_FADE_MS;
      const target = targets.get(i);
      let motion = this.motions.get(group);
      if (!motion) {
        motion = new LyricMotion(target ?? parkedY);
        this.motions.set(group, motion);
      }
      if (target !== undefined) {
        if (force) motion.snap(target);
        else {
          if (!this.admitted.has(group)) motion.snap(target + heights.get(i)! + inset);
          motion.advance(target, delta);
        }
        nextAdmitted.add(group);
        if (i === selected[0])
          clipHeight = Math.max(clipHeight, available - motion.position + inset);
      } else if (fading && force) {
        // A direct seek into a fade has no previous screen position. Reconstruct
        // the layout just before this group ended instead of parking it offscreen.
        const previous = [
          ...selectLyricWindow(this.intervals, end - 0.001, settings.visibleLines).visible,
        ].sort((a, b) => a - b);
        const sizes = previous.map((index) => {
          groups[index]!.show();
          return this.groupHeight(groups[index]!);
        });
        const previousCap = settings.height
          ? Math.max(inset * 2 + (sizes[0] ?? 0), (stage.clientHeight * settings.height) / 100)
          : available;
        const previousHeight = Math.min(
          available,
          previousCap,
          inset * 2 + sizes.reduce((a, b) => a + b, 0),
        );
        motion.snap(
          available -
            previousHeight +
            inset +
            sizes.slice(0, previous.indexOf(i)).reduce((a, b) => a + b, 0),
        );
      } else if (!fading) {
        motion.snap(parkedY);
        parkedY += this.lyricGroupSize.get(group)?.[1] ?? this.baseFontSize * 2;
      }
      // Finished groups retain their last screen position while their individual
      // vocals fade. They no longer take a slot or delay incoming rows.
      if (fading) clipHeight = Math.max(clipHeight, available - motion.position + inset);
      group.setTransform(motion.position, false, 0, active.has(i) || fading, 1, 0);
      group.posY.setPosition(motion.position);
      group.update(0);
    });
    if (Number(getComputedStyle(dots).opacity) > 0.001)
      clipHeight = Math.max(clipHeight, available - this.dots.position + inset);
    container.style.height = `${Math.min(available, Math.max(0, clipHeight))}px`;
    container.style.maskImage = `linear-gradient(transparent, black ${inset}px, black calc(100% - ${inset}px), transparent)`;
    this.admitted = nextAdmitted;
  }
}
