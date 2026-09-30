import type { GameFactory } from "../types";
import { NeonSiege } from "../neon-siege/index";
import { buildTrenchesMenu } from "./menu";

/** Trenches runs on the shared FPS shell (3D view, HUD, input, audio) with its own menu and modes. */
const factory: GameFactory = () => new NeonSiege(undefined, undefined, undefined, { slug: "trenches", menu: buildTrenchesMenu });
export default factory;
