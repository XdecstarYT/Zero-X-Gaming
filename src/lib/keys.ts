const ARROWS: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };

/** Human label for a KeyboardEvent.code: "KeyW" → "W", "ArrowLeft" → "←", "Digit1" → "1". */
export function formatKeyCode(code: string): string {
  if (ARROWS[code]) return ARROWS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}
