// Group A live analysis for the researcher's dashboard (RQ1, and the RQ2 link to the doctor).
//
//  Mirrors the Chapter 3 plan and Analysis/run_analysis.py so the dashboard shows the direction of the
//  results while data are still arriving: the Spearman correlation between the Waypoint score and the
//  doctor's overall rating with its p-value and 95% confidence interval, the same for each domain and for
//  each of the three weightings, and Cronbach's alpha per questionnaire. Pure, and run on the server only:
//  item answers are used here and never sent to the browser. The reported figures still come from the
//  Python script at data freeze.

import { EQUAL_WEIGHTS, PILLAR_WEIGHTS, PillarId } from "@/lib/composite";

export const DOMAINS: PillarId[] = ["activity", "sleep", "nutrition", "stress", "social", "substances"];

// Clinician-suggested weights (D47): stress and social connection set equal, the rest unchanged.
const SS = (PILLAR_WEIGHTS.stress + PILLAR_WEIGHTS.social) / 2;
export const CLINICIAN_WEIGHTS: Record<PillarId, number> = { ...PILLAR_WEIGHTS, stress: SS, social: SS };

export const WEIGHTINGS = [
  { key: "primary", label: "Literature-derived (primary)", weights: PILLAR_WEIGHTS },
  { key: "equal", label: "Equal", weights: EQUAL_WEIGHTS },
  { key: "clinician", label: "Clinician-suggested", weights: CLINICIAN_WEIGHTS },
] as const;

export interface ItemAnswer {
  pillar?: string;
  itemId: string;
  value: number | null;
  at?: string;
}

export interface Corr {
  n: number;
  rho: number | null;
  p: number | null;
  lo: number | null; // 95% confidence interval
  hi: number | null;
}

export interface Alpha {
  alpha: number | null;
  n: number;
}

export interface ClinicAnalysis {
  overall: Corr; // Waypoint score (as shown to the patient) vs doctor's overall rating
  weightings: { key: string; label: string; corr: Corr }[];
  domains: { id: PillarId; corr: Corr }[];
  // Cronbach's alpha per questionnaire: Group A, and Group B by version for comparison.
  alpha: { name: string; clinic: Alpha; app: Alpha; form: Alpha }[];
  // rho needed for p < .05 (two-sided) at the current number of pairs and at the target of 20.
  critical: { now: number | null; target: number };
}

// ----------------------------------------------------------------------------- statistics

// Average ranks; ties share the mean rank.
function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}

function pearson(x: number[], y: number[]): number | null {
  const mx = x.reduce((a, b) => a + b, 0) / x.length;
  const my = y.reduce((a, b) => a + b, 0) / y.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

function logGamma(z: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const k of c) ser += k / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

// Continued fraction for the regularised incomplete beta function (Numerical Recipes, betacf).
function betacf(a: number, b: number, x: number): number {
  const EPS = 3e-14, FPMIN = 1e-300;
  let c = 1, d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function ibeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

// Two-sided p for a correlation from the t distribution with n - 2 df (as scipy.stats.spearmanr).
function corrP(r: number, n: number): number {
  if (Math.abs(r) >= 1) return 0;
  const df = n - 2;
  const t2 = (r * r * df) / (1 - r * r);
  return ibeta(df / 2, 0.5, df / (df + t2));
}

// 95% CI for rho by the Fisher z transformation, standard error 1 / sqrt(n - 3).
function corrCI(r: number, n: number): [number, number] | null {
  if (n < 4) return null;
  const rr = Math.max(-0.9999, Math.min(0.9999, r));
  const z = Math.atanh(rr);
  const se = 1 / Math.sqrt(n - 3);
  return [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)];
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function spearmanTest(x: (number | null | undefined)[], y: (number | null | undefined)[]): Corr {
  const px: number[] = [], py: number[] = [];
  x.forEach((v, i) => {
    const w = y[i];
    if (typeof v === "number" && Number.isFinite(v) && typeof w === "number" && Number.isFinite(w)) {
      px.push(v);
      py.push(w);
    }
  });
  const n = px.length;
  const empty: Corr = { n, rho: null, p: null, lo: null, hi: null };
  if (n < 3) return empty;
  const rho = pearson(ranks(px), ranks(py));
  if (rho == null) return empty; // one of the two is constant
  const ci = corrCI(rho, n);
  return { n, rho: r2(rho), p: r3(corrP(rho, n)), lo: ci ? r2(ci[0]) : null, hi: ci ? r2(ci[1]) : null };
}

// Smallest |rho| with p < .05 at n pairs (bisection on the same t approximation).
export function criticalRho(n: number): number | null {
  if (n < 4) return null;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (corrP(mid, n) < 0.05) hi = mid;
    else lo = mid;
  }
  return r2(hi);
}

export function cronbach(matrix: number[][]): number | null {
  if (matrix.length < 3 || (matrix[0]?.length ?? 0) < 2) return null;
  const k = matrix[0].length;
  const variance = (v: number[]) => {
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    return v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1);
  };
  let itemVar = 0;
  for (let j = 0; j < k; j++) itemVar += variance(matrix.map((row) => row[j]));
  const totVar = variance(matrix.map((row) => row.reduce((a, b) => a + b, 0)));
  return totVar > 0 ? r2((k / (k - 1)) * (1 - itemVar / totVar)) : null;
}

// ----------------------------------------------------------------------------- questionnaires

// Item ids and reverse-scored items as in run_analysis.py.
const ISI = ["onset", "maintenance", "early", "satisfaction", "interference", "noticeable", "worry"];
const PSS = Array.from({ length: 10 }, (_, i) => `q${i + 1}`);
const PSS_REV = new Set(["q4", "q5", "q7", "q8"]);
const LSNS = ["famSeen", "famEase", "famHelp", "friSeen", "friEase", "friHelp"];
const RPDQS_GOOD = ["fish", "wholeGrains", "beans", "vegetables", "fruits", "nuts"];
const RPDQS_LIMIT = ["processedMeat", "redMeat", "fullFatDairy", "fastFood", "sugaryDrinks", "refinedGrains", "sweets"];

const SCALES: { name: string; ids: string[]; rev?: Set<string> }[] = [
  { name: "ISI (sleep)", ids: ISI },
  { name: "PSS-10 (stress)", ids: PSS, rev: PSS_REV },
  { name: "LSNS-6 (social)", ids: LSNS },
  { name: "rPDQS (nutrition)", ids: [...RPDQS_GOOD, ...RPDQS_LIMIT], rev: new Set(RPDQS_LIMIT) },
];

// Last answer per question; answers skipped by the questionnaire's own logic (null) are not answers.
export function lastAnswers(items: ItemAnswer[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of [...(items ?? [])].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""))) {
    if (typeof it.value === "number") out[it.itemId] = it.value;
  }
  return out;
}

function alphaFor(people: Record<string, number>[], ids: string[], rev?: Set<string>): Alpha {
  // Every reversed item here runs 0-4, so reversing is 4 - value.
  const mat = people
    .filter((a) => ids.every((i) => i in a))
    .map((a) => ids.map((i) => (rev?.has(i) ? 4 - a[i] : a[i])));
  return { alpha: cronbach(mat), n: mat.length };
}

// ----------------------------------------------------------------------------- the analysis

export interface PairInput {
  composite: number | null; // as shown to the patient (primary weights)
  scores: Partial<Record<PillarId, number>> | null;
  doctorOverall: number;
  doctorAreas: Partial<Record<string, number>>; // 0-10 (converted from 1-5 where needed)
}

function weighted(scores: Partial<Record<PillarId, number>> | null, w: Record<PillarId, number>): number | null {
  if (!scores) return null;
  let num = 0, den = 0;
  for (const d of DOMAINS) {
    const v = scores[d];
    if (typeof v === "number") {
      num += w[d] * v;
      den += w[d];
    }
  }
  // Rounded like the score shown to the patient, so the primary row matches the overall correlation.
  // Trimmed to 6 dp first so a true half (453 / 6 = 75.5) is not read as 75.4999... by floating point.
  return den ? Math.round(Math.round((num / den) * 1e6) / 1e6) : null;
}

export function analyseClinic(
  pairs: PairInput[],
  answers: { clinic: ItemAnswer[][]; app: ItemAnswer[][]; form: ItemAnswer[][] }
): ClinicAnalysis {
  const doc = pairs.map((p) => p.doctorOverall);
  const people = {
    clinic: answers.clinic.map(lastAnswers),
    app: answers.app.map(lastAnswers),
    form: answers.form.map(lastAnswers),
  };
  return {
    overall: spearmanTest(pairs.map((p) => p.composite), doc),
    weightings: WEIGHTINGS.map((w) => ({
      key: w.key,
      label: w.label,
      corr: spearmanTest(pairs.map((p) => weighted(p.scores, w.weights)), doc),
    })),
    domains: DOMAINS.map((id) => ({
      id,
      corr: spearmanTest(pairs.map((p) => p.scores?.[id]), pairs.map((p) => p.doctorAreas[id])),
    })),
    alpha: SCALES.map((s) => ({
      name: s.name,
      clinic: alphaFor(people.clinic, s.ids, s.rev),
      app: alphaFor(people.app, s.ids, s.rev),
      form: alphaFor(people.form, s.ids, s.rev),
    })),
    critical: { now: criticalRho(pairs.length), target: criticalRho(20) as number },
  };
}
