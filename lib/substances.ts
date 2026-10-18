// Risky substances pillar scoring — implements Risky Substances/Risky_Substances_Decisions.md.
//
//  Scope: alcohol + tobacco (the two dominant modifiable substance-mortality risks).
//  Instruments (used INTACT):
//    - Alcohol: AUDIT-C (3 items, Bush et al., 1998). Each 0-4, total 0-12, higher = riskier.
//      Adaptive branching: if "Never" drink, items 2-3 are skipped and the total is 0.
//    - Tobacco: single smoking-status item (GATS-style), mapped on an evidence-informed ordinal
//      gradient (never best → daily worst), reflecting the smoking-status mortality gradient.
//  Scoring: each component normalised to 0-100 (inverted: more use → lower), then combined 50/50:
//      alcohol  = (1 - AUDIT-C/12) x 100
//      tobacco  = ordinal map (never 100 ... daily 0)
//      pillar   = 0.5 x alcohol + 0.5 x tobacco
//    Direction: 100 = no risky use = healthiest.
//  Flags: AUDIT-C >= 4 = hazardous drinking; current smoking — both signpost to support.
//  Input: self-report only.

export const AUDITC_MAX = 12;
export const HAZARD_CUTOFF = 4; // AUDIT-C >= 4 = hazardous (canonical; >=3 for women — see docs)
export const ALCOHOL_WEIGHT = 0.5;
export const TOBACCO_WEIGHT = 0.5;

export interface AuditItem {
  id: "a1" | "a2" | "a3";
  eyebrow: string;
  question: string;
  options: string[]; // 5 options, indices 0-4
}

export const AUDIT_ITEMS: AuditItem[] = [
  {
    id: "a1",
    eyebrow: "Substances · alcohol 1 of 3",
    question: "How often do you have a drink containing alcohol?",
    options: ["Never", "Monthly or less", "2–4 times a month", "2–3 times a week", "4+ times a week"],
  },
  {
    id: "a2",
    eyebrow: "Substances · alcohol 2 of 3",
    question: "How many standard drinks do you have on a typical day when you are drinking?",
    options: ["1–2", "3–4", "5–6", "7–9", "10 or more"],
  },
  {
    id: "a3",
    eyebrow: "Substances · alcohol 3 of 3",
    question: "How often do you have 6 or more drinks on one occasion?",
    options: ["Never", "Less than monthly", "Monthly", "Weekly", "Daily or almost daily"],
  },
];

export const SMOKING_QUESTION = "Which best describes your smoking?";
export const SMOKING_OPTIONS = [
  "Never smoked",
  "Former smoker — quit over a year ago",
  "Former smoker — quit within the last year",
  "Currently smoke occasionally (not daily)",
  "Currently smoke daily",
];
// Evidence-informed ordinal map (0-100), reflecting the smoking-status mortality gradient.
const SMOKING_SCORES = [100, 75, 50, 30, 0];

export interface SubstancesAnswers {
  a1: number | null;
  a2: number | null;
  a3: number | null;
  smoking: number | null; // index into SMOKING_OPTIONS
}

export const emptySubstancesAnswers: SubstancesAnswers = {
  a1: null,
  a2: null,
  a3: null,
  smoking: null,
};

// Whether the alcohol follow-ups (a2, a3) should be shown: only if the person drinks.
export function drinks(a: SubstancesAnswers): boolean {
  return typeof a.a1 === "number" && a.a1 > 0;
}

export interface SubstancesResult {
  auditTotal: number; // 0-12
  alcoholScore: number; // 0-100
  hazardousDrinking: boolean; // AUDIT-C >= 4
  tobaccoScore: number; // 0-100
  currentSmoker: boolean;
  score: number; // 0-100 pillar score
  answered: boolean;
}

export function computeSubstances(a: SubstancesAnswers): SubstancesResult {
  // Alcohol: non-drinkers (a1 = 0) score 0 on the AUDIT-C regardless of skipped follow-ups.
  const a1 = typeof a.a1 === "number" ? a.a1 : 0;
  const a2 = drinks(a) && typeof a.a2 === "number" ? a.a2 : 0;
  const a3 = drinks(a) && typeof a.a3 === "number" ? a.a3 : 0;
  const auditTotal = a1 + a2 + a3;
  const alcoholScore = Math.round((1 - auditTotal / AUDITC_MAX) * 100);

  // Tobacco: ordinal map.
  const smokingIdx = typeof a.smoking === "number" ? a.smoking : 0;
  const tobaccoScore = SMOKING_SCORES[smokingIdx] ?? 0;

  const score = Math.round(
    Math.min(100, Math.max(0, ALCOHOL_WEIGHT * alcoholScore + TOBACCO_WEIGHT * tobaccoScore))
  );

  // "answered" = alcohol path complete (a1, plus a2/a3 if a drinker) and smoking answered.
  const alcoholAnswered =
    typeof a.a1 === "number" && (!drinks(a) || (typeof a.a2 === "number" && typeof a.a3 === "number"));
  const answered = alcoholAnswered && typeof a.smoking === "number";

  return {
    auditTotal,
    alcoholScore,
    hazardousDrinking: auditTotal >= HAZARD_CUTOFF,
    tobaccoScore,
    currentSmoker: smokingIdx >= 3,
    score,
    answered,
  };
}
