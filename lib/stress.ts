// Stress pillar scoring — implements Stress/Stress_Decisions.md.
//
//  Instrument: PSS-10 (Perceived Stress Scale, 10 items), used INTACT (Cohen et al., 1983).
//    Recall: last month. Each item 0-4. Items 4, 5, 7, 8 are positively worded and reverse-scored.
//    Total 0-40, higher = more perceived stress.
//  Scoring: linear normalisation, INVERTED (higher stress = lower health score):
//        score = (1 - PSS_total / 40) x 100.   Direction: 100 = healthiest (least stress).
//    Linear (not band-based) because PSS-10 is a continuous appraisal scale with no formal clinical
//    cut-offs; the low/moderate/high bands are commonly cited but informal, so they are shown only
//    as a label, never used to score.
//  Input: self-report only. Reflects the last month.

export const PSS_MAX = 40;

export interface PssItem {
  id: string;
  eyebrow: string;
  question: string;
  reverse?: boolean; // positively worded items are reverse-scored
}

// Standard PSS-10 wording (Cohen, Kamarck & Mermelstein, 1983). All ask "In the last month…".
export const PSS_ITEMS: PssItem[] = [
  { id: "q1", eyebrow: "Stress · 1 of 10", question: "In the last month, how often have you been upset because of something that happened unexpectedly?" },
  { id: "q2", eyebrow: "Stress · 2 of 10", question: "In the last month, how often have you felt unable to control the important things in your life?" },
  { id: "q3", eyebrow: "Stress · 3 of 10", question: "In the last month, how often have you felt nervous and stressed?" },
  { id: "q4", eyebrow: "Stress · 4 of 10", question: "In the last month, how often have you felt confident about your ability to handle your personal problems?", reverse: true },
  { id: "q5", eyebrow: "Stress · 5 of 10", question: "In the last month, how often have you felt that things were going your way?", reverse: true },
  { id: "q6", eyebrow: "Stress · 6 of 10", question: "In the last month, how often have you found that you could not cope with all the things you had to do?" },
  { id: "q7", eyebrow: "Stress · 7 of 10", question: "In the last month, how often have you been able to control irritations in your life?", reverse: true },
  { id: "q8", eyebrow: "Stress · 8 of 10", question: "In the last month, how often have you felt that you were on top of things?", reverse: true },
  { id: "q9", eyebrow: "Stress · 9 of 10", question: "In the last month, how often have you been angered because of things that were outside your control?" },
  { id: "q10", eyebrow: "Stress · 10 of 10", question: "In the last month, how often have you felt difficulties were piling up so high that you could not overcome them?" },
];

// Shared 0-4 response options.
export const PSS_OPTIONS = ["Never", "Almost never", "Sometimes", "Fairly often", "Very often"];

export interface StressAnswers {
  // PSS item responses keyed by id, each 0-4 (null = unanswered). Stored as the RAW response;
  // reverse-scoring is applied in computeStress.
  pss: Record<string, number | null>;
}

export const emptyStressAnswers: StressAnswers = {
  pss: Object.fromEntries(PSS_ITEMS.map((it) => [it.id, null])),
};

export type StressCategory = "Low stress" | "Moderate stress" | "High stress";

export interface StressBand {
  category: StressCategory;
  range: string;
}

// Commonly cited (informal) PSS-10 bands — for display only, NOT used to score.
export function stressBand(total: number): StressBand {
  if (total <= 13) return { category: "Low stress", range: "0–13" };
  if (total <= 26) return { category: "Moderate stress", range: "14–26" };
  return { category: "High stress", range: "27–40" };
}

export interface StressResult {
  pssTotal: number; // 0-40, higher = more stress
  band: StressBand;
  score: number; // 0-100, 100 = healthiest (least stress)
  answered: boolean;
}

// Apply reverse-scoring where needed: positively worded items use (4 - raw).
function itemValue(item: PssItem, raw: number | null): number {
  if (raw === null || raw === undefined) return 0;
  return item.reverse ? 4 - raw : raw;
}

export function computeStress(a: StressAnswers): StressResult {
  const raws = PSS_ITEMS.map((it) => a.pss[it.id]);
  const answered = raws.every((v) => typeof v === "number");

  const pssTotal = PSS_ITEMS.reduce((sum, it) => sum + itemValue(it, a.pss[it.id]), 0);
  const score = Math.round(Math.min(100, Math.max(0, (1 - pssTotal / PSS_MAX) * 100)));

  return {
    pssTotal,
    band: stressBand(pssTotal),
    score,
    answered,
  };
}
