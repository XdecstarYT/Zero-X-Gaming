/// <reference lib="webworker" />
/** Builds a country's terrain off the main thread (it takes a second or two). */
import { makeCountry } from "../map";
import { buildTerrain, cloudMap, QUALITY } from "./terrain";

self.onmessage = (e: MessageEvent<{ seed: number; quality: "high" | "low" }>) => {
  const { seed, quality } = e.data;
  const terrain = buildTerrain(makeCountry(seed), QUALITY[quality]);
  const clouds = cloudMap(seed, quality === "high" ? 512 : 256);
  (self as unknown as Worker).postMessage({ seed, quality, terrain, clouds }, [terrain.heights.buffer, terrain.urban.buffer, terrain.albedo.buffer, terrain.labels.buffer, terrain.borders.pts.buffer, clouds.buffer]);
};
