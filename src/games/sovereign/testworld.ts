import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWorld, type World } from "./world";

let cached: World | null = null;
/** The real map, read from public/sovereign (for tests). */
export function realWorld(): World {
  if (cached) return cached;
  const dir = join(__dirname, "../../../public/sovereign");
  const buf = (f: string) => {
    const b = readFileSync(join(dir, f));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  cached = parseWorld(JSON.parse(readFileSync(join(dir, "world.json"), "utf8")), buf("grid.bin"), buf("edges.bin"));
  return cached;
}
