// Digit-decode text schedule — pure, no DOM. Section h2s + case titles scramble through digits
// then resolve left-to-right on section enter (spec §7). The component (DecodeText.tsx) drives a
// 15fps interval and asks renderDecode() for the frame; everything time-related lives here so it
// is unit-testable without a DOM. Charset is digits only — the site's mono/technical read.

/** Scramble charset: digits only (spec §7). */
export const DECODE_CHARSET = "0123456789";

/** Repaint cadence — 15fps. The interval tick and the scramble both quantise to this. */
export const FRAME_MS = 1000 / 15;

/** Stagger between adjacent decode elements entering together (spec §7). */
export const STAGGER_MS = 300;

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Total scramble duration for a string of `len` chars: clamp(2·len+50, 500, 1500) ms. */
export function decodeDuration(len: number): number {
  const raw = 2 * len + 50;
  return raw < 500 ? 500 : raw > 1500 ? 1500 : raw;
}

/** Per-element start delay: index·300ms (elements entering together cascade). */
export function staggerOffset(index: number): number {
  return index * STAGGER_MS;
}

/** Frame index at `elapsedMs` (15fps quantisation) — the scramble is stable within one frame. */
export function frameIndex(elapsedMs: number): number {
  return Math.floor(Math.max(0, elapsedMs) / FRAME_MS);
}

/**
 * Count of head characters already resolved to their real value at fractional progress `p`.
 * Grows as p² so the reveal accelerates (slow start, fast finish) — ⌈p²·len⌉, monotonic
 * non-decreasing in p and exactly `len` at p=1.
 */
export function cleanHead(p: number, len: number): number {
  return Math.ceil(clamp01(p) * clamp01(p) * len);
}

/** cleanHead expressed against CONTINUOUS elapsed time (p = elapsed / duration). */
export function cleanHeadAt(elapsedMs: number, len: number): number {
  const p = clamp01(elapsedMs / decodeDuration(len));
  return cleanHead(p, len);
}

/**
 * The resolved-head count renderDecode actually uses at `elapsedMs`: elapsed is quantised to the
 * 15fps frame first (whole thing repaints at 15fps), so the head advances in frame steps, not
 * continuously. 0 before start, `len` at/after the duration. Exposed so the component + tests
 * agree on exactly which characters are locked.
 */
export function decodedHead(elapsedMs: number, len: number): number {
  const dur = decodeDuration(len);
  if (elapsedMs >= dur) return len;
  if (elapsedMs <= 0) return 0;
  const q = frameIndex(elapsedMs) * FRAME_MS;
  return cleanHead(clamp01(q / dur), len);
}

// Cheap deterministic hash → a digit index. Depends on (position, frame) so each unresolved slot
// shows a different digit every 15fps frame, but the SAME digit for every call within a frame
// (stability the component relies on to avoid tearing). No Math.random (determinism / repo rule).
function digitFor(index: number, frame: number): string {
  let h = (index * 73856093) ^ (frame * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return DECODE_CHARSET[h % 10];
}

/**
 * The displayed string at `elapsedMs`. Head chars [0, cleanHead) show the real text; the tail
 * scrambles through digits. Whitespace is never scrambled (keeps word shape readable). Past the
 * duration the whole real string is returned. Deterministic given (real, elapsedMs).
 */
export function renderDecode(real: string, elapsedMs: number): string {
  const len = real.length;
  if (elapsedMs >= decodeDuration(len)) return real; // raw elapsed vs duration (frame-agnostic finish)
  if (elapsedMs <= 0) return scrambleAll(real, 0);
  const head = decodedHead(elapsedMs, len);
  const frame = frameIndex(elapsedMs);
  let out = "";
  for (let i = 0; i < len; i++) {
    const ch = real[i];
    if (i < head || ch === " " || ch === "\n" || ch === "\t") out += ch;
    else out += digitFor(i, frame);
  }
  return out;
}

/** Fully-scrambled string at a given frame (the t≤0 opening state). Whitespace preserved. */
function scrambleAll(real: string, frame: number): string {
  let out = "";
  for (let i = 0; i < real.length; i++) {
    const ch = real[i];
    out += ch === " " || ch === "\n" || ch === "\t" ? ch : digitFor(i, frame);
  }
  return out;
}
