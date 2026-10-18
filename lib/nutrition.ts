// Nutrition pillar scoring — implements Nutrition/Nutrition_Decisions.md.
//
//  Instrument: rPDQS (rapid Prime Diet Quality Score), used INTACT (13 scored food-group items:
//    6 beneficial + 7 to-limit). Culture-general (food groups exist in every cuisine) — replaces
//    the Mediterranean-specific MEDAS, which mismeasured non-Mediterranean diets (olive oil,
//    sofrito, etc.).
//  Each item: 5 frequency options (less than once/week … twice a day or more). Numeric scoring:
//    beneficial items score 0-4 (more = better); to-limit items reverse-scored (4 - index).
//    Total 0-52, higher = healthier.
//  Scoring to 0-100: linear normalisation, DIRECT: score = (total / 52) x 100.
//  The rPDQS also has one UNSCORED alcohol item; it is omitted here (alcohol is covered by the
//    risky-substances pillar, and omitting an unscored item does not alter the validated score).
//  Input: self-report; reflects the past month.

export const RPDQS_MAX = 52;

// 5 frequency options, index 0-4 (order matters: beneficial = index, to-limit = 4 - index).
export const RPDQS_OPTIONS = [
  "Never or less than once a week",
  "Once a week",
  "2–4 times a week",
  "Nearly every day",
  "Twice a day or more",
];

export interface RpdqsItem {
  id: string;
  eyebrow: string;
  question: string;
  kind: "beneficial" | "limit";
}

// The 13 scored rPDQS food groups (Gicevic/Fung-lineage PDQS; rPDQS validation 2023).
export const RPDQS_ITEMS: RpdqsItem[] = [
  // --- 6 beneficial (higher intake = healthier) ---
  { id: "fish", eyebrow: "Nutrition · 1 of 13", question: "Over the past month, how often did you eat fish or seafood?", kind: "beneficial" },
  { id: "wholeGrains", eyebrow: "Nutrition · 2 of 13", question: "How often did you eat whole grains (e.g. brown rice, whole-grain bread, oats)?", kind: "beneficial" },
  { id: "beans", eyebrow: "Nutrition · 3 of 13", question: "How often did you eat beans, lentils or other legumes (dhal, chickpeas)?", kind: "beneficial" },
  { id: "vegetables", eyebrow: "Nutrition · 4 of 13", question: "How often did you eat vegetables?", kind: "beneficial" },
  { id: "fruits", eyebrow: "Nutrition · 5 of 13", question: "How often did you eat fruit?", kind: "beneficial" },
  { id: "nuts", eyebrow: "Nutrition · 6 of 13", question: "How often did you eat nuts or peanut butter?", kind: "beneficial" },
  // --- 7 to-limit (higher intake = less healthy; reverse-scored) ---
  { id: "processedMeat", eyebrow: "Nutrition · 7 of 13", question: "How often did you eat processed meats (sausages, ham, bacon, salami)?", kind: "limit" },
  { id: "redMeat", eyebrow: "Nutrition · 8 of 13", question: "How often did you eat red meat (beef, pork or lamb)?", kind: "limit" },
  { id: "fullFatDairy", eyebrow: "Nutrition · 9 of 13", question: "How often did you have full-fat dairy (whole milk, cheese, butter)?", kind: "limit" },
  { id: "fastFood", eyebrow: "Nutrition · 10 of 13", question: "How often did you eat fast food or deep-fried food?", kind: "limit" },
  { id: "sugaryDrinks", eyebrow: "Nutrition · 11 of 13", question: "How often did you drink sugary drinks (soft drinks, sweetened juice or tea)?", kind: "limit" },
  { id: "refinedGrains", eyebrow: "Nutrition · 12 of 13", question: "How often did you eat white bread, white rice or regular pasta?", kind: "limit" },
  { id: "sweets", eyebrow: "Nutrition · 13 of 13", question: "How often did you eat sweets or desserts (cakes, biscuits, ice cream)?", kind: "limit" },
];

export interface NutritionAnswers {
  // each item: chosen frequency index 0-4, or null (unanswered)
  rpdqs: Record<string, number | null>;
}

export const emptyNutritionAnswers: NutritionAnswers = {
  rpdqs: Object.fromEntries(RPDQS_ITEMS.map((it) => [it.id, null])),
};

// Points for one item: beneficial = index (0-4); to-limit = reverse (4 - index).
function itemPoints(item: RpdqsItem, choice: number | null): number {
  if (choice === null || choice === undefined) return 0;
  return item.kind === "beneficial" ? choice : 4 - choice;
}

export interface NutritionResult {
  total: number; // 0-52
  score: number; // 0-100 (linear normalisation, direct)
  answered: boolean;
}

export function computeNutrition(a: NutritionAnswers): NutritionResult {
  const choices = RPDQS_ITEMS.map((it) => a.rpdqs[it.id]);
  const answered = choices.every((c) => typeof c === "number");
  const total = RPDQS_ITEMS.reduce((s, it) => s + itemPoints(it, a.rpdqs[it.id]), 0);
  const score = Math.round(Math.min(100, Math.max(0, (total / RPDQS_MAX) * 100)));
  return { total, score, answered };
}
