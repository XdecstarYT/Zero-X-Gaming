import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { mapLoaded, parseMap, setMap } from "./mapdata";

/** Tests: load the real map from `public/` (the browser fetches it instead). */
export function loadRealMap() {
  if (mapLoaded()) return;
  const buf = gunzipSync(readFileSync(join(process.cwd(), "public/heatwave/melbourne.bin")));
  setMap(parseMap(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)));
}
