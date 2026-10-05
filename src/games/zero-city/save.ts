import { SAVE_VERSION } from "./config";
import type { CitySave, SaveSummary } from "./platform/zeroxAdapter";
import type { CityJSON } from "./world/city";

/**
 * Saves are versioned JSON, gzip-compressed where the browser can. Each
 * version bump adds a migration here that upgrades the previous shape.
 */
const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {
  // 2: (v1) => ({ ...v1, newField: defaultValue }),
};

async function gzip(text: string): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export async function encodeSave(city: CityJSON, summary: SaveSummary): Promise<CitySave> {
  const text = JSON.stringify(city);
  const z = await gzip(text);
  return z ? { summary, version: SAVE_VERSION, data: z, compressed: true } : { summary, version: SAVE_VERSION, data: text, compressed: false };
}

export async function decodeSave(save: CitySave): Promise<CityJSON> {
  const text = save.compressed && typeof save.data !== "string" ? await gunzip(save.data) : (save.data as string);
  let json = JSON.parse(text) as Record<string, unknown>;
  for (let v = save.version + 1; v <= SAVE_VERSION; v++) if (MIGRATIONS[v]) json = MIGRATIONS[v](json);
  return json as unknown as CityJSON;
}
