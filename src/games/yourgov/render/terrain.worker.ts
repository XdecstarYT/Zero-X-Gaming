/// <reference lib="webworker" />
/** Builds a country's terrain off the main thread (it takes a second or two). */
import type { Country } from "../map";
import { buildTerrain, cloudMap, QUALITY } from "./terrain";

self.onmessage = (e: MessageEvent<{ country: Country; quality: "high" | "low" }>) => {
  const { country, quality } = e.data;
  const terrain = buildTerrain(country, QUALITY[quality]);
  const clouds = cloudMap(country.seed, quality === "high" ? 512 : 256);
  (self as unknown as Worker).postMessage({ key: country.key, quality, terrain, clouds }, [terrain.heights.buffer, terrain.urban.buffer, terrain.albedo.buffer, terrain.labels.buffer, terrain.borders.pts.buffer, clouds.buffer]);
};
