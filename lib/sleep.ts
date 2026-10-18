// Sleep pillar scoring — implements Sleep/Sleep_Decisions.md.
//
//  Instrument: ISI (7 items, 0–4 each, total 0–28, higher = worse) + one sleep-duration question.
//  Scoring (combine quality + duration, 50/50):
//    1. Quality  = band-based mapping of the ISI total, anchored to the validated clinical
//                  cut-offs (0–7 no insomnia, 8–14 subthreshold, 15–21 moderate, 22–28 severe),
//                  so the whole "no insomnia" range scores high (fixes the linear-penalty issue).
//    2. Duration = read off the all-cause mortality risk curve, which is ASYMMETRIC (too little
//                  is bad, too much is worse). Score = (RR_max − RR) / (RR_max − RR_opt) × 100,
//                  so 100 = the 7–8 h optimum and long sleep is penalised more than short sleep.
//                  This puts the duration half on a mortality-risk currency (like physical activity).
//    3. Sleep    = 0.5 × Quality + 0.5 × Duration.
//  Direction: 0–100 where 100 = healthiest.
//  Recall window: last 2 weeks (ISI).
//
//  Honest note: insomnia has no per-point mortality figure, so the QUALITY half is anchored to
//  clinical severity bands, not mortality RR. Sleep is therefore a blend (duration on the risk
//  scale, quality on the clinical scale). Reverse causation (illness lengthens sleep) and the
//  omitted sleep-health dimensions (regularity, timing) are stated as limitations in the docs.

export const QUALITY_WEIGHT = 0.5;
export const DURATION_WEIGHT = 0.5;
export const ISI_MAX = 28;

// ---- ISI items (standard wording, abbreviated for a friction-optimised UI) ----

export interface IsiItem {
  id: string;
  eyebrow: string;
  question: string;
  hint?: string;
  options: string[]; // 5 labels, indices 0–4
}

export const ISI_ITEMS: IsiItem[] = [
  {
    id: "onset",
    eyebrow: "Sleep · 1 of 7",
    question: "Over the last 2 weeks, how severe has your difficulty falling asleep been?",
    options: ["None", "Mild", "Moderate", "Severe", "Very severe"],
  },
  {
    id: "maintenance",
    eyebrow: "Sleep · 2 of 7",
    question: "How severe has your difficulty staying asleep been?",
    hint: "Waking up during the night and struggling to get back to sleep.",
    options: ["None", "Mild", "Moderate", "Severe", "Very severe"],
  },
  {
    id: "early",
    eyebrow: "Sleep · 3 of 7",
    question: "How severe has your problem with waking up too early been?",
    options: ["None", "Mild", "Moderate", "Severe", "Very severe"],
  },
  {
    id: "satisfaction",
    eyebrow: "Sleep · 4 of 7",
    question: "How satisfied are you with your current sleep pattern?",
    options: [
      "Very satisfied",
      "Satisfied",
      "Moderately satisfied",
      "Dissatisfied",
      "Very dissatisfied",
    ],
  },
  {
    id: "interference",
    eyebrow: "Sleep · 5 of 7",
    question:
      "How much does your sleep problem interfere with your daily functioning?",
    hint: "E.g. daytime tiredness, mood, work or concentration.",
    options: ["Not at all", "A little", "Somewhat", "Much", "Very much"],
  },
  {
    id: "noticeable",
    eyebrow: "Sleep · 6 of 7",
    question:
      "How noticeable to others do you think your sleep problem is, in terms of affecting your quality of life?",
    options: ["Not at all", "A little", "Somewhat", "Much", "Very much"],
  },
  {
    id: "worry",
    eyebrow: "Sleep · 7 of 7",
    question: "How worried or distressed are you about your current sleep problem?",
    options: ["Not at all", "A little", "Somewhat", "Much", "Very much"],
  },
];

export type DurationSource = "self" | "device";

export interface SleepAnswers {
  // ISI item responses keyed by item id, each 0–4 (null = unanswered).
  isi: Record<string, number | null>;
  selfHours: number | null; // self-reported typical hours/night
  deviceHours: number | null; // optional device estimate (overrides self if present)
}

export const emptySleepAnswers: SleepAnswers = {
  isi: Object.fromEntries(ISI_ITEMS.map((it) => [it.id, null])),
  selfHours: null,
  deviceHours: null,
};

export type IsiCategory =
  | "No clinically significant insomnia"
  | "Subthreshold insomnia"
  | "Moderate insomnia"
  | "Severe insomnia";

export interface IsiBand {
  category: IsiCategory;
  range: string;
}

export function isiCategory(total: number): IsiBand {
  if (total <= 7) return { category: "No clinically significant insomnia", range: "0–7" };
  if (total <= 14) return { category: "Subthreshold insomnia", range: "8–14" };
  if (total <= 21) return { category: "Moderate insomnia", range: "15–21" };
  return { category: "Severe insomnia", range: "22–28" };
}

// ---- Quality: band-based ISI -> 0-100 ----
// Anchored to the validated ISI cut-offs so the whole "no insomnia" range (0-7) stays high and
// the score drops more steeply through the clinical bands. Linear interpolation between anchors.
const ISI_SCORE_ANCHORS: Array<[number, number]> = [
  [0, 100], // best
  [7, 85], // top of "no clinically significant insomnia"
  [14, 60], // top of subthreshold
  [21, 30], // top of moderate
  [28, 0], // most severe
];

export function qualityScoreFromIsi(isiTotal: number): number {
  const t = Math.min(ISI_MAX, Math.max(0, isiTotal));
  for (let i = 0; i < ISI_SCORE_ANCHORS.length - 1; i++) {
    const [x0, y0] = ISI_SCORE_ANCHORS[i];
    const [x1, y1] = ISI_SCORE_ANCHORS[i + 1];
    if (t >= x0 && t <= x1) {
      const f = (t - x0) / (x1 - x0);
      return Math.round(y0 + f * (y1 - y0));
    }
  }
  return 0;
}

// ---- Duration: asymmetric mortality-risk curve -> 0-100 ----
// All-cause mortality relative risk (vs the 7-8 h optimum) by hours/night, anchored to the 2022+
// asymmetric evidence (Ungvari et al., 2025: short sleep ~+14%, long sleep ~+34%). The long side
// rises more steeply than the short side, reflecting the J-shape; the all-cause mortality signal
// for SHORT sleep is genuinely weak, so short nights are only mildly penalised here (their lived
// harms are captured by the ISI quality half). Linear interpolation between anchors.
const DURATION_OPT_RR = 1.0; // optimum (7-8 h)
const DURATION_MAX_RR = 1.5; // worst-case RR mapping to a score of 0 (~+50%, the long-sleep extreme)
const DURATION_RR_ANCHORS: Array<[number, number]> = [
  [0, 1.16],
  [3, 1.16],
  [4, 1.14],
  [5, 1.1],
  [6, 1.05],
  [7, 1.0],
  [8, 1.0],
  [9, 1.18],
  [10, 1.34], // ≈ +34% — Ungvari et al. (2025) long-sleep anchor
  [11, 1.45],
  [12, 1.5],
  [24, 1.5],
];

export function durationRelativeRisk(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return DURATION_MAX_RR;
  const h = Math.min(24, Math.max(0, hours));
  for (let i = 0; i < DURATION_RR_ANCHORS.length - 1; i++) {
    const [x0, y0] = DURATION_RR_ANCHORS[i];
    const [x1, y1] = DURATION_RR_ANCHORS[i + 1];
    if (h >= x0 && h <= x1) {
      const f = (h - x0) / (x1 - x0);
      return y0 + f * (y1 - y0);
    }
  }
  return DURATION_MAX_RR;
}

export function durationScore(hours: number): number {
  const rr = durationRelativeRisk(hours);
  const score = ((DURATION_MAX_RR - rr) / (DURATION_MAX_RR - DURATION_OPT_RR)) * 100;
  return Math.round(Math.min(100, Math.max(0, score)));
}

export interface SleepResult {
  // Quality (ISI)
  isiTotal: number;
  isiBand: IsiBand;
  qualityScore: number; // 0–100 (band-based)
  isiAnswered: boolean;
  // Duration
  durationHours: number;
  durationSource: DurationSource;
  durationRelativeRisk: number; // estimated all-cause mortality RR vs the 7-8 h optimum
  durationScore: number; // 0–100 (risk-based)
  // Combine
  qualityWeight: number;
  durationWeight: number;
  qualityContribution: number; // weight × score
  durationContribution: number;
  sleepScore: number; // 0–100 pillar score
}

export function computeSleep(a: SleepAnswers): SleepResult {
  const values = ISI_ITEMS.map((it) => a.isi[it.id]);
  const isiAnswered = values.every((v) => typeof v === "number");
  const isiTotal = values.reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0);
  const band = isiCategory(isiTotal);
  const qualityScore = qualityScoreFromIsi(isiTotal);

  const usingDevice = typeof a.deviceHours === "number" && a.deviceHours > 0;
  const durationHours = usingDevice ? (a.deviceHours as number) : a.selfHours ?? 0;
  const rr = durationRelativeRisk(durationHours);
  const dScore = durationScore(durationHours);

  const qContribution = QUALITY_WEIGHT * qualityScore;
  const dContribution = DURATION_WEIGHT * dScore;
  const sleepScore = Math.round(Math.min(100, Math.max(0, qContribution + dContribution)));

  return {
    isiTotal,
    isiBand: band,
    qualityScore,
    isiAnswered,
    durationHours,
    durationSource: usingDevice ? "device" : "self",
    durationRelativeRisk: rr,
    durationScore: dScore,
    qualityWeight: QUALITY_WEIGHT,
    durationWeight: DURATION_WEIGHT,
    qualityContribution: Math.round(qContribution * 10) / 10,
    durationContribution: Math.round(dContribution * 10) / 10,
    sleepScore,
  };
}
