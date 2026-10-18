// Score bands — the one place the 0-100 → colour mapping is defined.
//
//  The same `score >= 70 ? "" : score >= 40 ? "mid" : "low"` expression was written out by hand in
//  eight components. Eight copies of a threshold is eight places to disagree, so it lives here.
//
//  IMPORTANT: these are DISPLAY bands, not scoring. Nothing here changes a pillar score or the
//  composite — it only decides which colour token the number is drawn in. No band carries a verdict
//  word ("thriving", "at risk", …): none of the instruments in this study defines one, so inventing
//  labels would be putting an interpretation on the screen that the research cannot support.
//
//  Colour is therefore never the only signal by design: every place a band colour is used, the
//  number itself is on screen beside it.

export type Band = "" | "mid" | "low";

export const BAND_GOOD_MIN = 70;
export const BAND_MID_MIN = 40;

/** Band class for a 0-100 score. Returns "" (good), "mid", or "low". */
export function bandOf(score: number): Band {
  if (score >= BAND_GOOD_MIN) return "";
  if (score >= BAND_MID_MIN) return "mid";
  return "low";
}

/** The CSS colour token a band draws in — used by the Bloom, which fills in SVG. */
export function bandToken(score: number): string {
  const b = bandOf(score);
  return b === "" ? "var(--good)" : b === "mid" ? "var(--mid)" : "var(--low)";
}
