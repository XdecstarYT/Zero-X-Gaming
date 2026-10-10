/** YourGov's liquid glass comes from the NextX Engine (its lens filters keep YourGov's ids). */
import { GlassDefs as EngineGlassDefs, canRefract, trackSheen as engineSheen } from "@/nextx/glass";

export { canRefract };

/** The lens filters (`#yg-lg` for sheets and cards, `#yg-lg-bar` for capsules). */
export const GlassDefs = () => <EngineGlassDefs prefix="yg" />;

/** Moves each glass surface's highlight toward the pointer. */
export const trackSheen = (root: HTMLElement) => engineSheen(root, ".yg-glass, .yg-btn");
