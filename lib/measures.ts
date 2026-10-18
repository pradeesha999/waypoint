// Study measures — the extra questions the evaluation needs, beyond the six pillars.
//
//  RQ4  usability      -> System Usability Scale (SUS), 10 items, used intact
//  RQ4  burden         -> single-item perceived burden
//  RQ3  concurrent     -> single-item self-rated health (SRH)
//  RQ3  known-groups   -> self-reported chronic condition (yes/no)
//
//  These are asked AFTER the assessment, in both study arms, so the arms differ only in how the
//  six pillars were delivered.

export interface ScaleItem {
  id: string;
  text: string;
}

// --- SUS (System Usability Scale) ---
// Used intact: the 10 standard items in the standard order, with only the noun adapted
// ("the system" -> "this health assessment"), which is the usual practice for SUS.
// Odd items are positively worded, even items negatively worded.
export const SUS_OPTIONS = [
  "Strongly disagree",
  "Disagree",
  "Neutral",
  "Agree",
  "Strongly agree",
];

export const SUS_ITEMS: ScaleItem[] = [
  { id: "sus1", text: "I think that I would like to use this health assessment frequently." },
  { id: "sus2", text: "I found this health assessment unnecessarily complex." },
  { id: "sus3", text: "I thought this health assessment was easy to use." },
  { id: "sus4", text: "I think that I would need the support of a technical person to be able to use this health assessment." },
  // Wording simplified 2026-10-08 (same meaning): "the various functions ... were well integrated".
  { id: "sus5", text: "I found that the different parts of this health assessment worked well together." },
  { id: "sus6", text: "I thought there was too much inconsistency in this health assessment." },
  { id: "sus7", text: "I would imagine that most people would learn to use this health assessment very quickly." },
  // "cumbersome" -> "awkward" 2026-10-08: the published substitution, since "cumbersome" is often
  // misunderstood by non-native English speakers (Finstad, 2006; Bangor, Kortum & Miller, 2008).
  { id: "sus8", text: "I found this health assessment very awkward to use." },
  { id: "sus9", text: "I felt very confident using this health assessment." },
  { id: "sus10", text: "I needed to learn a lot of things before I could get going with this health assessment." },
];

// Standard SUS scoring: odd items score (x-1), even items score (5-x); sum x 2.5 -> 0-100.
// Note: 0-100 here is a usability score, NOT a percentage and not comparable to the pillar scores.
export function scoreSus(answers: Record<string, number | null>): number | null {
  let total = 0;
  for (let i = 0; i < SUS_ITEMS.length; i++) {
    const v = answers[SUS_ITEMS[i].id];
    if (typeof v !== "number") return null; // SUS requires all 10 items
    const position = v + 1; // stored 0-4, scored 1-5
    total += i % 2 === 0 ? position - 1 : 5 - position;
  }
  return Math.round(total * 2.5 * 10) / 10;
}

// --- Perceived burden (RQ4) ---
export const BURDEN_QUESTION = "How much effort did completing this assessment take?";
export const BURDEN_OPTIONS = [
  "No effort at all",
  "A little effort",
  "A moderate amount of effort",
  "A lot of effort",
  "A great deal of effort",
];

// --- Self-rated health (RQ3, concurrent validity) ---
// The standard single-item general self-rated health question. Widely used and itself a validated
// predictor of health outcomes; free of licensing restrictions.
export const SRH_QUESTION = "In general, would you say your health is:";
export const SRH_OPTIONS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

// Rescaled 0-100 so it can be correlated directly with the composite (both: higher = healthier).
export function srhTo100(value: number | null): number | null {
  if (typeof value !== "number") return null;
  return Math.round((value / (SRH_OPTIONS.length - 1)) * 100);
}

// --- Known-groups (RQ3) ---
export const CONDITION_QUESTION =
  "Have you been told by a doctor that you have a long-term health condition (for example diabetes, heart disease, high blood pressure, asthma, or depression)?";
export const CONDITION_OPTIONS = ["No", "Yes", "Prefer not to say"];

// --- Demographics (kept minimal — only what the analysis needs) ---
export const AGE_QUESTION = "What is your age group?";
export const AGE_OPTIONS = ["18–24", "25–34", "35–44", "45–54", "55–64", "65+"];

export const GENDER_QUESTION = "What is your gender?";
export const GENDER_OPTIONS = ["Woman", "Man", "Other", "Prefer not to say"];

export interface StudyMeasureAnswers {
  sus: Record<string, number | null>;
  burden: number | null;
  srh: number | null;
  condition: number | null;
  age: number | null;
  gender: number | null;
}

export const emptyMeasures: StudyMeasureAnswers = {
  sus: {},
  burden: null,
  srh: null,
  condition: null,
  age: null,
  gender: null,
};

export interface MeasureSummary {
  susScore: number | null;
  burden: number | null;
  srh: number | null;
  srh100: number | null;
  hasCondition: boolean | null;
  age: string | null;
  gender: string | null;
}

export function summariseMeasures(m: StudyMeasureAnswers): MeasureSummary {
  return {
    susScore: scoreSus(m.sus),
    burden: m.burden,
    srh: m.srh,
    srh100: srhTo100(m.srh),
    hasCondition: m.condition === null || m.condition === 2 ? null : m.condition === 1,
    age: m.age != null ? AGE_OPTIONS[m.age] : null,
    gender: m.gender != null ? GENDER_OPTIONS[m.gender] : null,
  };
}
