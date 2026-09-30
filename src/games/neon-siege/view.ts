import type { WeaponKind } from "./items";
import type { Marker } from "./mode";
import type { Circle } from "./storm";
import type { Entity, World } from "./world";

/** A bullet trail, drawn briefly after a shot. */
export interface Tracer {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  at: number;
  weapon: WeaponKind;
  shooter: string;
  /** The shot hit a fighter (sparks) rather than a wall (dust). */
  hit: boolean;
}

/** Per-frame presentation state shared by both renderers. */
export interface ViewFx {
  tracers: Tracer[];
  /** Walk-cycle phase for the viewmodel bob. */
  bob: number;
  reduceMotion: boolean;
  showNames: boolean;
  storm: Circle | null;
  /** 0..1 ADS blend (smoothed). */
  ads: number;
  /** World markers (Conquest flags) to draw. */
  markers?: Marker[];
  /** Name-tag colour per entity (team games). */
  tagColor?: (id: string) => string;
}

/** The first-person view. The HUD is DOM (see hud.ts) and shared by both. */
export interface ViewRenderer {
  readonly kind: "3d" | "2d";
  readonly canvas: HTMLCanvasElement;
  render(world: World, me: Entity, fx: ViewFx): void;
  destroy(): void;
}

export const FOV_DEG = 75;

/** Camera zoom for the active weapon when aiming, eased by `ads`. */
export function zoomFor(zoom: number, ads: number) {
  return 1 + (zoom - 1) * ads;
}
