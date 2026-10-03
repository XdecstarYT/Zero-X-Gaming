/**
 * The on-screen walking stick for touch screens (Life and Hometown).
 *
 * The ring jumps to wherever your thumb lands and the knob sits exactly under
 * your thumb (up to the ring's edge), so what you see is what the stick reads:
 * push right, the knob goes right, you walk right.
 */

/** How far (px) the thumb travels for a full push. */
export const STICK_RADIUS = 45;
/** Ignore tiny wobbles of a resting thumb (px). */
const DEAD = 6;

/** Thumb offset (px, y down) to stick input: mx right-positive, mz down-positive, length at most 1. */
export function stickInput(dx: number, dy: number): { mx: number; mz: number } {
  const len = Math.hypot(dx, dy);
  if (len < DEAD) return { mx: 0, mz: 0 };
  const k = Math.min(len, STICK_RADIUS) / len / STICK_RADIUS;
  return { mx: dx * k, mz: dy * k };
}

export class TouchStick {
  readonly ring: HTMLElement;
  private knob: HTMLElement;
  private id = -1;
  private x0 = 0;
  private y0 = 0;
  private dx = 0;
  private dy = 0;

  constructor(visible: boolean) {
    this.ring = document.createElement("div");
    this.ring.className = `absolute bottom-6 left-6 h-28 w-28 rounded-full border-2 border-white/30 bg-black/25 ${visible ? "" : "hidden"}`;
    this.ring.setAttribute("data-testid", "touch-stick");
    this.knob = document.createElement("div");
    // Positioned with an explicit transform only, so nothing else offsets it.
    this.knob.className = "absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/60";
    this.knob.style.transform = "translate(-50%, -50%)";
    this.ring.append(this.knob);
  }

  get active() {
    return this.id !== -1;
  }

  owns(pointerId: number) {
    return this.id === pointerId;
  }

  /** A thumb came down at (x, y) in page pixels; `stage` is the game's box. */
  start(pointerId: number, x: number, y: number, stage: DOMRect) {
    this.id = pointerId;
    this.x0 = x;
    this.y0 = y;
    this.dx = this.dy = 0;
    const r = this.ring.offsetWidth / 2 || 56;
    this.ring.style.left = `${x - stage.left - r}px`;
    this.ring.style.top = `${y - stage.top - r}px`;
    this.ring.style.bottom = "auto";
    this.draw();
  }

  move(x: number, y: number) {
    this.dx = x - this.x0;
    this.dy = y - this.y0;
    this.draw();
  }

  end() {
    this.id = -1;
    this.dx = this.dy = 0;
    this.ring.style.left = this.ring.style.top = this.ring.style.bottom = "";
    this.draw();
  }

  /** Current input: mx right-positive, mz down-positive (screen axes). */
  value() {
    return stickInput(this.dx, this.dy);
  }

  private draw() {
    const len = Math.hypot(this.dx, this.dy);
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    this.knob.style.transform = `translate(calc(-50% + ${(this.dx * k).toFixed(1)}px), calc(-50% + ${(this.dy * k).toFixed(1)}px))`;
  }
}
