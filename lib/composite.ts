// Composite health score — combines the six pillar scores into one 0-100 score.
//
//  Architecture (OECD/JRC composite-indicator pipeline): each pillar is already normalised to
//  0-100 (100 = healthiest); here we WEIGHT and AGGREGATE them by a weighted average.
//
//  WEIGHTING: evidence-based severity weights, derived from all-cause mortality relative risk per
//  pillar via weight ∝ (RR − 1), normalised to sum 1.0 (see Docs/Weighting_Derivation.md and thesis
//  §4.6). Doctors review them separately (D38). PILLAR_WEIGHTS below is the single place
//  to change the vector; EQUAL_WEIGHTS is kept alongside it for the RQ3 comparison, not as a fallback.

export type PillarId =
  | "activity"
  | "sleep"
  | "nutrition"
  | "stress"
  | "social"
  | "substances";

export interface PillarMeta {
  id: PillarId;
  label: string;
}

export const PILLARS_META: PillarMeta[] = [
  { id: "activity", label: "Physical activity" },
  { id: "sleep", label: "Restorative sleep" },
  { id: "nutrition", label: "Nutrition" },
  { id: "stress", label: "Stress management" },
  { id: "social", label: "Social connection" },
  { id: "substances", label: "Avoiding risky substances" },
];

// --- Weighting (the one place to change the weight vector) ---
// Evidence-based severity weights. Derived from all-cause mortality relative risk (RR) per pillar via
// transformation A: weight ∝ (RR − 1), normalised to sum 1.0 (total excess risk 2.09). Every RR is pinned
// to a published source (thesis Table 3.1). Amended 2026-10-10 (decision D40): the smoking RR now comes
// from an Asian population (B. Wang et al., 2026, 1.53) instead of Western cohorts (Cho et al., 2024, 2.75,
// which gave substances 0.5289); the old vector is kept below for the sensitivity analysis. Sums to 1.0.
export const EQUAL_WEIGHT = 1 / 6;
export const PILLAR_WEIGHTS: Record<PillarId, number> = {
  activity: 0.2153, // RR 1.45 (1/0.69) - Garcia et al. (2023)
  sleep: 0.1627, // RR 1.34 - Ungvari et al. (2025)
  nutrition: 0.1196, // RR 1.25 (1/0.80) - Hao & Li (2024)
  stress: 0.0957, // RR 1.20 - Glei & Weinstein (2024)
  social: 0.1531, // RR 1.32 - Wang et al. (2023)
  substances: 0.2536, // RR 1.53 - B. Wang et al. (2026), current vs never smoker, Hong Kong cohort
};

// The pre-amendment vector (smoking RR 2.75, Cho et al., 2024). Not used for scoring; kept so the
// analysis and any audit can reproduce the scores shown to participants before 2026-10-10.
export const PILLAR_WEIGHTS_V1: Record<PillarId, number> = {
  activity: 0.1358,
  sleep: 0.1027,
  nutrition: 0.0755,
  stress: 0.0604,
  social: 0.0967,
  substances: 0.5289,
};

// Equal weights retained for the research comparison (weighted vs equal, RQ3).
export const EQUAL_WEIGHTS: Record<PillarId, number> = {
  activity: EQUAL_WEIGHT,
  sleep: EQUAL_WEIGHT,
  nutrition: EQUAL_WEIGHT,
  stress: EQUAL_WEIGHT,
  social: EQUAL_WEIGHT,
  substances: EQUAL_WEIGHT,
};

export const WEIGHTING_LABEL = "Evidence-based severity weights (provisional)";

export interface CompositeRow {
  id: PillarId;
  label: string;
  score: number | null; // null = pillar not completed yet
  weight: number; // nominal weight (e.g. 1/6)
  contribution: number | null; // weight × score (only sums to the composite when all six are done)
}

export interface CompositeResult {
  rows: CompositeRow[];
  completed: number;
  total: number;
  allComplete: boolean;
  composite: number | null; // equal-weighted average over completed pillars (0-100), or null if none
}

export function computeComposite(scores: Partial<Record<PillarId, number>>): CompositeResult {
  // Weight sum over completed pillars, so a partial result renormalises to 0-100.
  const completedWeight = PILLARS_META.reduce(
    (s, p) => s + (typeof scores[p.id] === "number" ? PILLAR_WEIGHTS[p.id] : 0),
    0
  );

  const rows: CompositeRow[] = PILLARS_META.map((p) => {
    const raw = scores[p.id];
    const score = typeof raw === "number" ? raw : null;
    const weight = PILLAR_WEIGHTS[p.id];
    // contribution = renormalised weight × score (sums to the composite).
    const contribution =
      score != null && completedWeight > 0
        ? Math.round(((weight / completedWeight) * score) * 10) / 10
        : null;
    return { id: p.id, label: p.label, score, weight, contribution };
  });

  const completed = rows.filter((r) => r.score != null).length;
  const total = rows.length;
  const allComplete = completed === total;

  // Weighted average over completed pillars (Σ weightᵢ·scoreᵢ / Σ weightᵢ).
  const composite =
    completed > 0 && completedWeight > 0
      ? Math.round(
          PILLARS_META.reduce(
            (s, p) =>
              s + (typeof scores[p.id] === "number" ? PILLAR_WEIGHTS[p.id] * (scores[p.id] as number) : 0),
            0
          ) / completedWeight
        )
      : null;

  return { rows, completed, total, allComplete, composite };
}
