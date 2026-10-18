// Data-quality rules: the one place the careless-answering thresholds are defined.
//
//  Two indicators, reported separately (thesis Section 5.5, Table 5.2; Analysis/run_analysis.py uses the
//  same values):
//   - very fast answering: more than half of a participant's answers given in under FAST_RESPONSE_MS.
//     This is the indicator of not reading the questions.
//   - long runs: STRAIGHT_LINE_RUN or more identical answers in a row within one questionnaire. Reported,
//     but not read as careless on its own: on short single-construct scales a run is often honest (a good
//     sleeper answers "None" to all seven insomnia items).
//  The stored metrics.carelessFlag (either indicator) is kept as recorded for completeness; summaries use
//  the two indicators.
//
//  No imports, so the admin page can use it without pulling in the Supabase client.

export const FAST_RESPONSE_MS = 1200;
export const FAST_SHARE_PCT = 50;
export const STRAIGHT_LINE_RUN = 5;

export const isVeryFast = (fastResponsePct: number | null | undefined) =>
  typeof fastResponsePct === "number" && fastResponsePct > FAST_SHARE_PCT;
