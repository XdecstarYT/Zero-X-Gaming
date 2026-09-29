/**
 * Fixed-timestep game loop on requestAnimationFrame.
 * `update` runs at a steady `stepMs`; `render` runs once per frame.
 * Tracks active (unpaused) play time for score plausibility.
 */
export class GameLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  activeMs = 0;

  constructor(
    private update: (dtSeconds: number) => void,
    private render: () => void,
    private stepMs = 1000 / 120,
  ) {}

  start() {
    this.activeMs = 0;
    this.resume();
  }

  resume() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  get isRunning() {
    return this.running;
  }

  private frame = (now: number) => {
    if (!this.running) return;
    // Clamp long frames (tab switch, breakpoint) so physics never tunnels.
    const elapsed = Math.min(now - this.last, 100);
    this.last = now;
    this.activeMs += elapsed;
    this.acc += elapsed;
    while (this.acc >= this.stepMs && this.running) {
      this.update(this.stepMs / 1000);
      this.acc -= this.stepMs;
    }
    this.render();
    if (this.running) this.raf = requestAnimationFrame(this.frame);
  };
}
