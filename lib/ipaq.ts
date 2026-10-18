// IPAQ-SF scoring for the Physical Activity pillar.
// Implements the decisions in Physical Activity/Physical_Activity_Decisions.md:
//  - MET values: walking 3.3, moderate 4.0, vigorous 8.0
//  - Total MET-min/week = sum of (MET x minutes/day x days/week)
//  - 0-100 score is EVIDENCE-DERIVED, not eyeballed: it is the share of the maximum
//    all-cause mortality risk reduction that activity can give, captured by this person.
//    Anchored to 2022+ dose-response evidence (self-reported PA): ~30% lower all-cause
//    mortality at the guideline (~600 MET-min/wk), rising to ~40% (the practical maximum)
//    at ~2400 MET-min/wk, then flattening. So the score is on a mortality-risk currency,
//    the same currency used later for cross-pillar weighting.
//        score = (1 - RR) / (1 - RR_PLATEAU) x 100, clamped [0,100].
//  - Sitting time: a small CONDITIONAL penalty (-5) only when the person is below the
//    activity guideline AND sits a lot (>= 8 h/day). Activity offsets sitting risk, so
//    active people are not penalised (Ekelund-type interaction, confirmed 2022-2024).

export const MET = { walking: 3.3, moderate: 4.0, vigorous: 8.0 } as const;

// Official IPAQ data-cleaning: cap any single activity duration at 180 min/day.
export const MAX_MIN_PER_DAY = 180;

export interface IpaqAnswers {
  vigDays: number; // 0-7
  vigMin: number; // minutes on a typical vigorous day
  modDays: number; // 0-7
  modMin: number;
  walkDays: number; // 0-7
  walkMin: number;
  sitHours: number; // hours on a typical weekday (used only for the conditional penalty)
}

export const emptyAnswers: IpaqAnswers = {
  vigDays: 0,
  vigMin: 0,
  modDays: 0,
  modMin: 0,
  walkDays: 0,
  walkMin: 0,
  sitHours: 0,
};

export type IpaqCategory = "Low" | "Moderate" | "High";

export interface IpaqResult {
  metWalking: number;
  metModerate: number;
  metVigorous: number;
  metTotal: number;
  relativeRisk: number; // estimated all-cause mortality RR vs inactive
  riskReductionPct: number; // (1 - RR) x 100, for display
  baseScore: number; // 0-100 from the risk map, before the sitting penalty
  sittingPenalty: number; // 0 or 5
  score: number; // 0-100 final pillar score (baseScore - penalty, clamped)
  category: IpaqCategory; // reference only (not used for the score)
  sitHoursPerDay: number;
}

function clampDays(days: number): number {
  if (!Number.isFinite(days)) return 0;
  return Math.min(7, Math.max(0, Math.round(days)));
}

// If no days, minutes are zero. Otherwise cap minutes/day at the IPAQ truncation limit.
function cleanMinutes(days: number, min: number): number {
  if (clampDays(days) === 0) return 0;
  if (!Number.isFinite(min) || min < 0) return 0;
  return Math.min(MAX_MIN_PER_DAY, min);
}

export function computeMetMinutes(a: IpaqAnswers) {
  const walkMin = cleanMinutes(a.walkDays, a.walkMin);
  const modMin = cleanMinutes(a.modDays, a.modMin);
  const vigMin = cleanMinutes(a.vigDays, a.vigMin);

  const metWalking = MET.walking * walkMin * clampDays(a.walkDays);
  const metModerate = MET.moderate * modMin * clampDays(a.modDays);
  const metVigorous = MET.vigorous * vigMin * clampDays(a.vigDays);

  return {
    metWalking,
    metModerate,
    metVigorous,
    metTotal: metWalking + metModerate + metVigorous,
  };
}

// ---- Evidence-based 0-100 map (mortality-risk currency) ----
// All-cause mortality relative-risk anchors by weekly MET-minutes (self-report), from
// 2022+ dose-response evidence. Linear interpolation between anchors; flat at the plateau.
const RR_ANCHORS: Array<[number, number]> = [
  [0, 1.0], // inactive = reference (no benefit captured)
  [300, 0.8], // ~half the guideline -> ~20% lower risk
  [600, 0.7], // WHO guideline minimum -> ~30% lower risk
  [1200, 0.65], // ~35% lower
  [2400, 0.6], // practical maximum -> ~40% lower; benefit flattens beyond here
];
export const RR_PLATEAU = 0.6; // ~40% maximum achievable reduction
export const GUIDELINE_MET = 600;

export function relativeRisk(metTotal: number): number {
  const m = Math.max(0, Number.isFinite(metTotal) ? metTotal : 0);
  const last = RR_ANCHORS[RR_ANCHORS.length - 1];
  if (m >= last[0]) return RR_PLATEAU;
  for (let i = 0; i < RR_ANCHORS.length - 1; i++) {
    const [x0, y0] = RR_ANCHORS[i];
    const [x1, y1] = RR_ANCHORS[i + 1];
    if (m >= x0 && m <= x1) {
      const t = (m - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return RR_PLATEAU;
}

// Share of the maximum achievable mortality-risk reduction, expressed 0-100.
export function scoreFromMet(metTotal: number): number {
  const rr = relativeRisk(metTotal);
  const score = ((1 - rr) / (1 - RR_PLATEAU)) * 100;
  return Math.round(Math.min(100, Math.max(0, score)));
}

// ---- Conditional sedentary penalty ----
// Sitting raises mortality risk mainly for people who are NOT active; high activity
// offsets it. So a small penalty applies only when below the guideline AND sitting a lot.
export const SITTING_THRESHOLD_HOURS = 8;
export const SITTING_PENALTY = 5;

export function sittingPenalty(metTotal: number, sitHours: number): number {
  const sits = Number.isFinite(sitHours) ? sitHours : 0;
  if (metTotal < GUIDELINE_MET && sits >= SITTING_THRESHOLD_HOURS) return SITTING_PENALTY;
  return 0;
}

// IPAQ Low/Moderate/High classification — shown for reference only, NOT used in the score.
export function classify(a: IpaqAnswers, metTotal: number): IpaqCategory {
  const vigDays = clampDays(a.vigDays);
  const modDays = clampDays(a.modDays);
  const walkDays = clampDays(a.walkDays);
  const vigMin = cleanMinutes(a.vigDays, a.vigMin);
  const modMin = cleanMinutes(a.modDays, a.modMin);
  const totalDays = Math.min(7, vigDays + modDays + walkDays);

  const high =
    (vigDays >= 3 && metTotal >= 1500) || (totalDays >= 7 && metTotal >= 3000);
  if (high) return "High";

  const moderate =
    (vigDays >= 3 && vigMin >= 20) ||
    (modDays >= 5 && modMin >= 30) ||
    (totalDays >= 5 && metTotal >= 600);
  if (moderate) return "Moderate";

  return "Low";
}

export function computeIpaq(a: IpaqAnswers): IpaqResult {
  const mets = computeMetMinutes(a);
  const rr = relativeRisk(mets.metTotal);
  const baseScore = scoreFromMet(mets.metTotal);
  const sitHoursPerDay = Number.isFinite(a.sitHours) ? Math.max(0, a.sitHours) : 0;
  const penalty = sittingPenalty(mets.metTotal, sitHoursPerDay);
  const score = Math.round(Math.min(100, Math.max(0, baseScore - penalty)));

  return {
    ...mets,
    relativeRisk: rr,
    riskReductionPct: Math.round((1 - rr) * 100),
    baseScore,
    sittingPenalty: penalty,
    score,
    category: classify(a, mets.metTotal),
    sitHoursPerDay,
  };
}
