/*
 * The pure decisions behind the number field, split out for the same reason
 * listOps.ts is: the input handling around them needs a real focused control
 * that happy-dom does not provide, so the part worth testing is kept free of
 * the part that cannot be.
 */

export function clampTo(n: number, min?: number, max?: number): number {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
}

const parse = (text: string): number | null => {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

/*
 * What to publish on a keystroke; null means HOLD — keep the text on screen and
 * tell Puck nothing.
 *
 * Holding is the entire fix. Puck's built-in field rejects an out-of-range
 * keystroke by not calling onChange, which on a controlled input erases it, so
 * "3" on the way to "320" never survives long enough to become "32". Here the
 * same "3" is neither published nor thrown away: it stays in the draft until it
 * grows into a legal value.
 */
export function liveValue(text: string, min?: number, max?: number): number | null {
  const n = parse(text);
  if (n === null) return null;
  return n === clampTo(n, min, max) ? n : null;
}

/*
 * What to settle on when the field is left or Enter is pressed; null means
 * REVERT to the current value. An empty or unparseable box must not silently
 * become 0 — or, once clamped, the minimum.
 */
export function settledValue(text: string, min?: number, max?: number): number | null {
  const n = parse(text);
  return n === null ? null : clampTo(n, min, max);
}
