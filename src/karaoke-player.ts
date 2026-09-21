import { DomLyricPlayer } from '@applemusic-like-lyrics/core';
import type { SettingsSnapshot } from './settings';
import { selectLyricWindow, type LyricWindowEntry } from './lyric-window';
import { LyricMotion, LYRIC_FADE_MS } from './lyric-motion';

type Group = DomLyricPlayer['currentLyricGroups'][number];

/** Marks the groups whose background vocal currently occupies a row. */
const BACKGROUND_SPACE = 'karaoke-bg-space';

/** AMLL animates words; karaoke positions use a stable, bottom-anchored canvas. */
export class KaraokePlayer extends DomLyricPlayer {
  intervals: LyricWindowEntry[] = [];
  private viewport?: { stage: HTMLElement; container: HTMLElement; settings: SettingsSnapshot };
  private motions = new WeakMap<Group, LyricMotion>();
  private rowOffsets = new WeakMap<Group, { main: number; background: number }>();
  private admitted = new Set<Group>();
  private area = new LyricMotion(0);
  private dots = new LyricMotion(0);
  private dotsX = 0;
  private dotsVisible = false;
  private forceWindow = false;
  private endWindowCache?: { groups: Group[]; key: string; height: number };

  configureViewport(stage: HTMLElement, container: HTMLElement, settings: SettingsSnapshot) {
    this.viewport = { stage, container, settings };
  }

  override calcLayout(sync = false, force = false): Promise<void> {
    const result = super.calcLayout(sync, force);
    if (force) this.endWindowCache = undefined;
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
    // Pinned wrappers make this one of two settled values, never a value the
    // browser is animating, so the springs below get a stable target.
    return group.element.offsetHeight;
  }

  /** An invisible background vocal should not hold an empty row open. */
  private showsBackground(index: number, time: number, live: boolean): boolean {
    const background = this.intervals[index]?.background;
    return !!background && live && time < background.end + LYRIC_FADE_MS;
  }

  /**
   * Report the surviving vocal's offset change when a row enters or leaves the
   * flow, so its screen position stays continuous while the group resizes.
   */
  private reserveBackground(group: Group, reserve: boolean, primaryEnded = false): number {
    group.element.classList.toggle(BACKGROUND_SPACE, reserve);
    group.mainLine.getElement().classList.toggle('karaoke-primary-ended', primaryEnded);
    if (!group.element.isConnected) return 0;
    const offsets = {
      main: group.mainLine.getElement().offsetTop,
      background: (group.bgWrapper?.offsetTop ?? 0) + (group.bgLine?.getElement().offsetTop ?? 0),
    };
    const anchor = primaryEnded ? 'background' : 'main';
    const shift = offsets[anchor] - (this.rowOffsets.get(group)?.[anchor] ?? offsets[anchor]);
    this.rowOffsets.set(group, offsets);
    return shift;
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

    const fading = new Set<number>();
    this.intervals.forEach((entry, i) => {
      const end = Math.max(entry.main.end, entry.background?.end ?? 0);
      if (time >= end && time < end + LYRIC_FADE_MS) fading.add(i);
    });

    const heights = new Map<number, number>();
    const shifts = new Map<number, number>();
    for (const i of selected) {
      const group = groups[i]!;
      if (settings.visibleLines > 0 || active.has(i) || group.isInSight) group.show();
      const live = active.has(i) || fading.has(i);
      const background = this.showsBackground(i, time, live);
      shifts.set(
        i,
        this.reserveBackground(
          group,
          background,
          background && time >= this.intervals[i]!.main.end + LYRIC_FADE_MS,
        ),
      );
      heights.set(i, this.groupHeight(group));
    }
    const inset = this.baseFontSize * 0.5;
    const hasInterlude = !active.size && selected.length && this.layoutState.lastInterludeState;
    const dotsHeight = hasInterlude
      ? this.interludeDots.getElement().clientHeight + this.baseFontSize * 0.8
      : 0;
    let naturalHeight = inset * 2 + dotsHeight + [...heights.values()].reduce((a, b) => a + b, 0);
    let endWindowHeight = 0;
    if (
      settings.keepScrollNearEnd &&
      (!settings.visibleLines || selected.length < settings.visibleLines)
    ) {
      if (!settings.visibleLines) endWindowHeight = available;
      else {
        const key = `${this.size[0]}:${this.baseFontSize}:${settings.font}:${settings.lineSpacing}:${settings.visibleLines}`;
        if (this.endWindowCache?.groups === groups && this.endWindowCache.key === key) {
          endWindowHeight = this.endWindowCache.height;
        } else {
          // Keep room for a full final window. Derive it from the song, not a
          // playback high-water mark, so direct seeks and exports agree.
          const tail = groups
            .filter((_, index) => !this.intervals[index]!.backgroundOnly)
            .slice(-settings.visibleLines);
          let tailHeight = inset * 2;
          for (const group of tail) {
            group.show();
            const css = getComputedStyle(group.element);
            const mainCss = getComputedStyle(group.mainLine.getElement());
            tailHeight += Math.round(
              group.mainLine.getElement().offsetHeight +
                parseFloat(mainCss.marginTop) +
                parseFloat(mainCss.marginBottom) +
                parseFloat(css.paddingTop) +
                parseFloat(css.paddingBottom),
            );
          }
          endWindowHeight = tailHeight;
          this.endWindowCache = { groups, key, height: tailHeight };
        }
      }
    }
    if (
      settings.keepScrollNearEnd &&
      (!settings.visibleLines || selected.length < settings.visibleLines)
    )
      naturalHeight = Math.max(naturalHeight, endWindowHeight);
    const cap = Math.min(available, (stage.clientHeight * (settings.height || 100)) / 100);
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
      const target = targets.get(i);
      let motion = this.motions.get(group);
      if (!motion) {
        motion = new LyricMotion(target ?? parkedY);
        this.motions.set(group, motion);
      }
      motion.position -= shifts.get(i) ?? 0;
      if (target !== undefined) {
        if (force) motion.snap(target);
        else {
          if (!this.admitted.has(group)) motion.snap(target + heights.get(i)! + inset);
          motion.advance(target, delta);
        }
        nextAdmitted.add(group);
        if (i === selected[0])
          clipHeight = Math.max(clipHeight, available - motion.position + inset);
      } else if (fading.has(i) && force) {
        // A direct seek into a fade has no previous screen position. Reconstruct
        // the layout just before this group ended instead of parking it offscreen.
        this.reserveBackground(
          group,
          this.showsBackground(i, time, true),
          !!entry.background && time >= entry.main.end + LYRIC_FADE_MS,
        );
        const previous = [
          ...selectLyricWindow(this.intervals, end - 0.001, settings.visibleLines).visible,
        ].sort((a, b) => a - b);
        const sizes = previous.map((index) => {
          groups[index]!.show();
          return this.groupHeight(groups[index]!);
        });
        const previousCap = cap;
        const previousHeight = Math.min(
          available,
          previousCap,
          Math.max(
            inset * 2 + sizes.reduce((a, b) => a + b, 0),
            settings.keepScrollNearEnd &&
              (!settings.visibleLines || previous.length < settings.visibleLines)
              ? endWindowHeight
              : 0,
          ),
        );
        motion.snap(
          available -
            previousHeight +
            inset +
            sizes.slice(0, previous.indexOf(i)).reduce((a, b) => a + b, 0),
        );
      } else if (!fading.has(i)) {
        motion.snap(parkedY);
        parkedY += this.lyricGroupSize.get(group)?.[1] ?? this.baseFontSize * 2;
      }
      // Finished groups retain their last screen position while their individual
      // vocals fade. They no longer take a slot or delay incoming rows.
      if (fading.has(i)) clipHeight = Math.max(clipHeight, available - motion.position + inset);
      group.setTransform(motion.position, false, 0, active.has(i) || fading.has(i), 1, 0);
      group.posY.setPosition(motion.position);
      group.update(0);
    });
    if (Number(getComputedStyle(dots).opacity) > 0.001)
      clipHeight = Math.max(clipHeight, available - this.dots.position + inset);
    container.style.height = `${Math.min(cap, Math.max(0, clipHeight))}px`;
    container.style.maskImage = `linear-gradient(transparent, black ${inset}px, black calc(100% - ${inset}px), transparent)`;
    this.admitted = nextAdmitted;
  }
}
