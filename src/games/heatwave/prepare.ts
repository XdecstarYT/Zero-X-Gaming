/**
 * Building Melbourne without freezing the page: the city and its tram tracks a slice at a time,
 * handing the browser a frame between slices so a loading bar (or the rest of the page) keeps going.
 */
import { cityFor, prepareCity } from "./state";
import { trackSteps } from "./trams";

/** The next frame (or a moment, if frames are paused in a hidden tab). */
export const nextFrame = () =>
  new Promise<void>((r) => {
    const t = setTimeout(r, 60);
    requestAnimationFrame(() => {
      clearTimeout(t);
      setTimeout(r, 0);
    });
  });

/** Run a generator, yielding to the browser about every 50 ms; `onStep` sees each value it yields. */
export async function sliced<T>(steps: Iterable<T>, onStep?: (v: T) => void) {
  let last = performance.now();
  for (const v of steps) {
    onStep?.(v);
    if (performance.now() - last > 50) {
      await nextFrame();
      last = performance.now();
    }
  }
}

/** Build the city for `seed` and its tram tracks; `onStep` gets the share done (0..1) and what's next. */
export function prepareMelbourne(seed: number, onStep?: (done: number, what: string) => void) {
  const steps = function* () {
    for (const k of prepareCity(seed)) yield { done: k.done * 0.86, what: k.what };
    for (const k of trackSteps(cityFor(seed))) yield { done: 0.86 + k * 0.14, what: "Running the tram lines" };
  };
  return sliced(steps(), (k) => onStep?.(k.done, k.what));
}
