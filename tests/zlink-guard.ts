import { createHash } from "node:crypto";

/**
 * Words the ZLink+ teaser must never use, stored only as hashes so that
 * reading this file tells you nothing. Checks single words and pairs.
 */
const HIDDEN = new Set<string>(["d74ff0ee8da3b980","d476e433a945e195","a8fa7fd60893411a","b718f1354f724731","652f55016243bf1b","d2504e52b8b07484","2044fbdb55f92386","ce01f0a987d0aece","bf5cf59e35665225","86dfa664107368a7","d0ab301b509106e3"]);

const h = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export function givesItAway(text: string) {
  const words = text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    if (HIDDEN.has(h(words[i]))) return words[i];
    if (i + 1 < words.length && HIDDEN.has(h(`${words[i]} ${words[i + 1]}`))) return `${words[i]} ${words[i + 1]}`;
  }
  return null;
}
