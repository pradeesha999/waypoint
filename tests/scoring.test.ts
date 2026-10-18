// Functional tests of the scoring engine and history rules (thesis Table 5.x, "Functionality").
// Run: npx tsx tests/scoring.test.ts   (prints one line per test case and exits 1 on any failure)

import { computeComposite, PILLAR_WEIGHTS, EQUAL_WEIGHTS, PILLARS_META } from "../lib/composite";
import { computeStress, PSS_ITEMS } from "../lib/stress";
import { computeSocial, LSNS_ITEMS } from "../lib/social";
import { computeNutrition, RPDQS_ITEMS } from "../lib/nutrition";
import { computeSubstances, drinks } from "../lib/substances";
import { computeSleep, ISI_ITEMS } from "../lib/sleep";
import { computeIpaq } from "../lib/ipaq";
import { bandOf } from "../lib/bands";
import { buildHistory, domainChanges, MIN_MEANINGFUL_CHANGE } from "../lib/history";

let failed = 0;
function check(id: string, what: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${what}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}

// T1 weights
const wsum = Object.values(PILLAR_WEIGHTS).reduce((a, b) => a + b, 0);
check("T1", "Literature-derived weights sum to 1", Math.abs(wsum - 1) < 1e-9, `sum ${wsum.toFixed(4)}`);

// T2 worked example (Appendix F, Table F1)
const ex = { activity: 81, sleep: 82, nutrition: 58, stress: 55, social: 50, substances: 88 };
const c = computeComposite(ex);
check("T2", "Worked example gives the overall score in Appendix F (73)", c.composite === 73, `got ${c.composite}`);
const eq = Math.round(PILLARS_META.reduce((s, p) => s + EQUAL_WEIGHTS[p.id] * (ex as any)[p.id], 0));
check("T3", "Same answers with equal weights give 69, as Appendix F notes", eq === 69, `got ${eq}`);

// T4 partial result stays on the 0-100 scale
const part = computeComposite({ activity: 80, sleep: 60 });
const expect = Math.round((PILLAR_WEIGHTS.activity * 80 + PILLAR_WEIGHTS.sleep * 60) / (PILLAR_WEIGHTS.activity + PILLAR_WEIGHTS.sleep));
check("T4", "A partial result is the weighted mean of the domains completed", part.composite === expect && part.completed === 2, `got ${part.composite}, expected ${expect}`);

// T5 healthiest and least healthy answers reach the ends of each domain scale
const best = (items: { id: string; reverse?: boolean }[]) => Object.fromEntries(items.map((i) => [i.id, i.reverse ? 4 : 0]));
const worst = (items: { id: string; reverse?: boolean }[]) => Object.fromEntries(items.map((i) => [i.id, i.reverse ? 0 : 4]));
const ends = [
  computeStress({ pss: best(PSS_ITEMS) }).score === 100 && computeStress({ pss: worst(PSS_ITEMS) }).score === 0,
  computeSocial({ lsns: Object.fromEntries(LSNS_ITEMS.map((i) => [i.id, 5])) }).score === 100 &&
    computeSocial({ lsns: Object.fromEntries(LSNS_ITEMS.map((i) => [i.id, 0])) }).score === 0,
  computeNutrition({ rpdqs: Object.fromEntries(RPDQS_ITEMS.map((i) => [i.id, i.kind === "beneficial" ? 4 : 0])) }).score === 100 &&
    computeNutrition({ rpdqs: Object.fromEntries(RPDQS_ITEMS.map((i) => [i.id, i.kind === "beneficial" ? 0 : 4])) }).score === 0,
  computeSubstances({ a1: 0, a2: null, a3: null, smoking: 0 }).score === 100 &&
    computeSubstances({ a1: 4, a2: 4, a3: 4, smoking: 4 }).score === 0,
];
check("T5", "Healthiest answers score 100 and least healthy 0 (stress, social, nutrition, substances)", ends.every(Boolean), ends.join(","));

// T6 reverse-scored stress items
const allNever = computeStress({ pss: Object.fromEntries(PSS_ITEMS.map((i) => [i.id, 0])) });
check("T6", "PSS-10 positive items are reverse-scored (all 'Never' gives total 16)", allNever.pssTotal === 16, `total ${allNever.pssTotal}`);

// T7 sleep: no insomnia and 7-8 hours is healthiest; severe insomnia and 4 hours scores low
const sGood = computeSleep({ isi: Object.fromEntries(ISI_ITEMS.map((i) => [i.id, 0])), selfHours: 7.5, deviceHours: null });
const sBad = computeSleep({ isi: Object.fromEntries(ISI_ITEMS.map((i) => [i.id, 4])), selfHours: 4, deviceHours: null });
check("T7", "Sleep: no insomnia with 7.5 h scores 100; severe insomnia with 4 h scores below 40", sGood.sleepScore === 100 && sBad.sleepScore < 40, `${sGood.sleepScore} / ${sBad.sleepScore}`);

// T8 activity: none scores 0; guideline-level activity scores high
const aNone = computeIpaq({ vigDays: 0, vigMin: 0, modDays: 0, modMin: 0, walkDays: 0, walkMin: 0, sitHours: 4 });
const aHigh = computeIpaq({ vigDays: 3, vigMin: 30, modDays: 3, modMin: 30, walkDays: 5, walkMin: 30, sitHours: 4 });
check("T8", "Physical activity: no activity scores 0; regular activity scores 70 or more", aNone.score === 0 && aHigh.score >= 70, `${aNone.score} / ${aHigh.score}`);

// T9 skip rule
check("T9", "AUDIT-C follow-up questions are skipped for a non-drinker", !drinks({ a1: 0, a2: null, a3: null, smoking: 0 }) && drinks({ a1: 1, a2: null, a3: null, smoking: 0 }));

// T10 bands
check("T10", "Colour bands: 70 and above good, 40-69 middle, below 40 low", bandOf(70) === "" && bandOf(69) === "mid" && bandOf(40) === "mid" && bandOf(39) === "low");

// T11-T12 history rules
const day = 86_400_000;
const now = Date.now();
const mk = (id: string, daysAgo: number, composite: number, sleep: number) => ({
  id, createdAt: new Date(now - daysAgo * day).toISOString(), composite,
  scores: { activity: 60, sleep, nutrition: 60, stress: 60, social: 60, substances: 60 },
});
const h1 = buildHistory([mk("a", 40, 60, 60), mk("b", 5, 60 + MIN_MEANINGFUL_CHANGE, 75)]);
const h2 = buildHistory([mk("a", 15, 60, 60), mk("b", 5, 80, 80)]);
check("T11", "History reports a change of 10+ points between check-ins 28+ days apart, and 'too soon' under 28 days",
  !!h1[0].change?.meaningful && h2[0].change?.comparable === false);
const dc = domainChanges(h1[0], h1[1], PILLARS_META.map((p) => p.id));
const sleepRow = dc.rows.find((r) => r.id === "sleep")!;
const actRow = dc.rows.find((r) => r.id === "activity")!;
check("T12", "History marks the area that changed (sleep +15) and leaves unchanged areas unmarked", dc.comparable && sleepRow.meaningful && sleepRow.delta === 15 && !actRow.meaningful);

// T13 cut-offs that raise a result of clinical concern (lib/concerns.ts, FR8)
const isi15 = computeSleep({ isi: Object.fromEntries(ISI_ITEMS.map((i, k) => [i.id, [3, 3, 3, 3, 1, 1, 1][k]])), selfHours: 7, deviceHours: null }).isiTotal;
const isi14 = computeSleep({ isi: Object.fromEntries(ISI_ITEMS.map((i, k) => [i.id, [3, 3, 3, 2, 1, 1, 1][k]])), selfHours: 7, deviceHours: null }).isiTotal;
const iso = computeSocial({ lsns: Object.fromEntries(LSNS_ITEMS.map((i, k) => [i.id, k < 5 ? 2 : 1])) });
const notIso = computeSocial({ lsns: Object.fromEntries(LSNS_ITEMS.map((i) => [i.id, 2])) });
const haz = computeSubstances({ a1: 2, a2: 1, a3: 1, smoking: 0 });
const safe = computeSubstances({ a1: 1, a2: 1, a3: 1, smoking: 1 });
const smoker = computeSubstances({ a1: 0, a2: null, a3: null, smoking: 4 });
check("T13", "Warnings: insomnia at ISI 15 (not 14), isolation below LSNS 12, hazardous drinking at AUDIT-C 4, current smoking",
  isi15 === 15 && isi14 === 14 && iso.isolated && !notIso.isolated && haz.hazardousDrinking && !safe.hazardousDrinking && !safe.currentSmoker && smoker.currentSmoker,
  `ISI ${isi15}/${isi14}, LSNS ${iso.total}/${notIso.total}, AUDIT-C ${haz.auditTotal}/${safe.auditTotal}`);

console.log(failed ? `${failed} FAILED` : "All passed");
process.exit(failed ? 1 : 0);
