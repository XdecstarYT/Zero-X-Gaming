/**
 * Creates a canvas that fills `root`, rendered at a fixed logical resolution
 * and scaled (letterboxed) to fit, with devicePixelRatio sharpness.
 */
export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Convert a client (pointer) position to logical coordinates. */
  toLogical(clientX: number, clientY: number): { x: number; y: number };
  destroy(): void;
}

export function createSurface(root: HTMLElement, width: number, height: number, label: string): Surface {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", label);
  canvas.tabIndex = -1;
  canvas.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
  root.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  let scale = 1;
  let offX = 0;
  let offY = 0;

  const resize = () => {
    const rect = root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    scale = Math.min(canvas.width / width, canvas.height / height);
    offX = (canvas.width - width * scale) / 2;
    offY = (canvas.height - height * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, offX, offY);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(root);

  return {
    canvas,
    ctx,
    width,
    height,
    toLogical(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const dpr = canvas.width / rect.width;
      return {
        x: ((clientX - rect.left) * dpr - offX) / scale,
        y: ((clientY - rect.top) * dpr - offY) / scale,
      };
    },
    destroy() {
      ro.disconnect();
      canvas.remove();
    },
  };
}

/** Clear the full backing store (including letterbox bars). */
export function clearSurface(s: Surface, color: string) {
  const { ctx, canvas } = s;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}
