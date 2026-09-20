/** Critically damped motion driven by media-frame deltas, including offline export. */
export class LyricMotion {
  position: number;
  private velocity = 0;

  constructor(position: number) {
    this.position = position;
  }

  snap(position: number) {
    this.position = position;
    this.velocity = 0;
  }

  advance(target: number, milliseconds: number) {
    const seconds = Math.max(0, milliseconds) / 1000;
    const frequency = 18;
    const offset = this.position - target;
    const decay = Math.exp(-frequency * seconds);
    const slope = this.velocity + frequency * offset;
    this.position = target + (offset + slope * seconds) * decay;
    this.velocity = (this.velocity - frequency * slope * seconds) * decay;
    return this.position;
  }
}

export const LYRIC_FADE_MS = 250;
