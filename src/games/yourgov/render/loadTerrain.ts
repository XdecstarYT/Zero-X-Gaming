import type { Country } from "../map";
import { buildTerrain, cloudMap, QUALITY, type Terrain } from "./terrain";

export interface TerrainBundle {
  terrain: Terrain;
  clouds: Uint8Array;
}

const cache = new Map<string, Promise<TerrainBundle>>();

/** The terrain for a country: built in a web worker where there is one, cached for the session. */
export function loadTerrain(country: Country, quality: "high" | "low"): Promise<TerrainBundle> {
  const key = `${country.key}|${quality}`;
  let p = cache.get(key);
  if (p) return p;
  p = new Promise<TerrainBundle>((resolve) => {
    const local = () => setTimeout(() => resolve({ terrain: buildTerrain(country, QUALITY[quality]), clouds: cloudMap(country.seed, quality === "high" ? 512 : 256) }), 0);
    let w: Worker | null = null;
    try {
      w = new Worker(new URL("./terrain.worker.ts", import.meta.url), { type: "module" });
    } catch {
      w = null;
    }
    if (!w) return local();
    w.onmessage = (e: MessageEvent<TerrainBundle>) => {
      resolve({ terrain: e.data.terrain, clouds: e.data.clouds });
      w?.terminate();
    };
    w.onerror = () => {
      w?.terminate();
      local();
    };
    w.postMessage({ country, quality });
  });
  // A few countries' terrain is plenty to keep (each is several megabytes).
  if (cache.size > 3) cache.delete(cache.keys().next().value!);
  cache.set(key, p);
  return p;
}
