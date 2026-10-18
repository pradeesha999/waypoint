// Study progress for the researcher's dashboard (/admin).
//
//  Pure, so it can be tested and reused in the analysis without a database. It returns counts, rates,
//  medians and anonymous value lists for the charts: no participant id, code or answer to an individual
//  question leaves the server. The page is behind the researcher's password and the figures are
//  preliminary; the reported analysis is run separately in Python.
//
//  Two kinds of row share the study_sessions table (D33):
//   - start markers, sent on consent, with metrics.event === "start" and no answers;
//   - finished sessions, sent at the end, carrying the answers and quality metrics.
//  Completion rate is finished / started. Group A (doctor comparison) records carry a "clinic-<CODE>-"
//  id prefix; everything else is Group B, the online app-versus-form comparison (see cohort()).

import { analyseClinic, ClinicAnalysis, ItemAnswer } from "@/lib/clinicAnalysis";
import { PillarId } from "@/lib/composite";
import { BURDEN_OPTIONS } from "@/lib/measures";
import { isVeryFast, STRAIGHT_LINE_RUN } from "@/lib/quality";
import { StudyArm } from "@/lib/telemetry";

// Runs of identical consecutive answers within each questionnaire, as the stored flag counts them
// (telemetry longestRun: recorded order, revisits included, per pillar).
function longRuns(items: ItemAnswer[] | null | undefined): ClinicStatus["runs"] {
  const byPillar: Record<string, ItemAnswer[]> = {};
  for (const it of items ?? []) (byPillar[it.pillar ?? ""] ??= []).push(it);
  const out: ClinicStatus["runs"] = [];
  for (const [pillar, seq] of Object.entries(byPillar)) {
    let start = 0;
    for (let i = 1; i <= seq.length; i++) {
      const same = i < seq.length && seq[i].value !== null && seq[i].value === seq[i - 1].value;
      if (same) continue;
      if (i - start >= STRAIGHT_LINE_RUN && typeof seq[start].value === "number")
        out.push({ pillar, length: i - start, value: seq[start].value as number, items: seq.slice(start, i).map((x) => x.itemId) });
      start = i;
    }
  }
  return out;
}

// Recruitment targets from Chapter 3.
export const TARGETS = { perArm: 40, minPerArm: 20, clinic: 20, retest: 10, retestDays: 7 };

export interface StudyRow {
  participant_id: string;
  arm: StudyArm;
  created_at: string;
  composite: number | null;
  scores?: Record<string, number> | null;
  items?: ItemAnswer[] | null; // answers per question; used on the server for Cronbach's alpha, never returned
  measures: {
    susScore?: number | null;
    burden?: number | null;
    age?: string | null;
    gender?: string | null;
  } | null;
  metrics: {
    event?: string;
    completedAll?: boolean;
    medianMsPerItem?: number;
    totalDurationMs?: number;
    carelessFlag?: boolean; // stored as recorded; summaries use the two indicators below (lib/quality.ts)
    fastResponsePct?: number;
    straightLining?: boolean;
    device?: string; // persistent device id (D42); absent on records made before it existed
  } | null;
}

export interface RatingRow {
  code: string;
  created_at?: string | null;
  activity?: number | null;
  sleep?: number | null;
  nutrition?: number | null;
  stress?: number | null;
  social?: number | null;
  substances?: number | null;
  domain_scale?: string | null;
  overall: number | null;
  familiarity: number | null;
  rated_at: string | null;
}

export interface ArmStats {
  started: number;
  finished: number;
  completionPct: number | null;
  completedAll: number;
  medianMinutes: number | null;
  medianSecondsPerItem: number | null;
  medianSus: number | null;
  typicalEffort: string | null;
  fastPct: number | null; // % of finished participants answering very fast (the careless indicator)
  runsPct: number | null; // % with a long run of identical answers (reported, often honest)
  // Anonymous value lists for the distribution charts.
  minutes: number[];
  sus: number[];
  effort: number[]; // burden option index per finished participant
}

export type ClinicStep = "waypoint" | "doctor" | "both" | "done";

export interface ClinicStatus {
  code: string;
  created: string | null;
  rated: string | null;
  started: string | null; // Waypoint start marker, if any
  finished: string | null;
  todo: ClinicStep; // what is still missing: "waypoint", "doctor", "both", or nothing ("done")
  doctorOverall: number | null; // 0-10
  waypoint: number | null; // 0-100
  doctorAreas: Partial<Record<string, number>>; // doctor's area ratings, on domainScale
  waypointAreas: Partial<Record<string, number>>; // Waypoint domain scores, 0-100
  domainScale: string | null; // "0-10", or "1-5" for ratings made before the scale changed
  familiarity: number | null; // 1-5, how well the doctor knows this patient's lifestyle
  minutes: number | null; // total time on Waypoint
  secPerItem: number | null; // median seconds per question
  fastPct: number | null; // share of this patient's answers given in under 1.2 s
  veryFast: boolean | null; // the careless indicator (lib/quality.ts)
  // Each run of STRAIGHT_LINE_RUN+ identical answers in one questionnaire, with the questions and the
  // repeated answer (raw option value), so the researcher can judge whether it is honest (e.g. a good
  // sleeper answering "None" to every insomnia item). Reported, not treated as careless.
  runs: { pillar: string; length: number; value: number; items: string[] }[];
}

export interface AdminStats {
  started: number;
  finished: number;
  online: ArmStats;
  arms: Record<StudyArm, ArmStats>;
  clinic: ArmStats;
  clinicMedianComposite: number | null;
  codesIssued: number;
  rated: number;
  // Group A pairs: Waypoint score against the doctor's overall rating, matched by code.
  pairs: { code: string; score: number; rating: number }[];
  spearman: number | null;
  // Online participants with a second finished session at least TARGETS.retestDays later.
  retest: { done: number; gapsDays: number[] };
  perDay: { date: string; started: number; finished: number }[];
  // Group A by code: who still has a step to do, and the doctor's rating beside the Waypoint score.
  // Codes are not identifying; this page is behind the researcher's password and never seen by the doctor.
  clinicList: ClinicStatus[];
  // Live RQ1 analysis on the complete Group A pairs (preliminary; the script gives the reported values).
  clinicAnalysis: ClinicAnalysis;
  first: string | null;
  last: string | null;
}

function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const round1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

export const isClinic = (r: StudyRow) => r.participant_id.startsWith("clinic-");
export const isStart = (r: StudyRow) => r.metrics?.event === "start";
const codeOf = (id: string) => /^clinic-([A-HJKMNP-Z2-9]{6})-/.exec(id)?.[1] ?? null;

// One record per person: someone who reopens the link creates a second start marker, and a retest
// creates a second finished session. Counting rows would deflate the completion rate and double-count
// people in the distributions, so each person counts once, by their earliest record.
//
// Shared phones: before 2026-10-10 a new person on a device already used for the study inherited that
// device's participant id. A finished session whose age group or gender differs from the earlier one
// on the same id is therefore a different person and is counted separately. Since D42 every visit
// gets a new participant id, so this only matters for those older records.
const personKey = (r: StudyRow) =>
  `${r.participant_id}|${r.measures?.age ?? ""}|${r.measures?.gender ?? ""}`;

function firstPerPerson(rows: StudyRow[]): StudyRow[] {
  const seen = new Set<string>();
  return [...rows]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .filter((r) => !seen.has(personKey(r)) && seen.add(personKey(r)) !== undefined);
}

function groupStats(rows: StudyRow[]): ArmStats {
  const starts = firstPerPerson(rows.filter(isStart));
  const done = firstPerPerson(rows.filter((r) => !isStart(r)));
  const nums = (f: (r: StudyRow) => number | null | undefined) =>
    done.map(f).filter((x): x is number => typeof x === "number" && Number.isFinite(x));

  const effortList = nums((r) => r.measures?.burden);
  const effort = median(effortList);
  const fast = done.filter((r) => isVeryFast(r.metrics?.fastResponsePct)).length;
  const runs = done.filter((r) => r.metrics?.straightLining).length;
  const minutes = nums((r) => r.metrics?.totalDurationMs).map((ms) => round1(ms / 60000) as number);
  const itemMs = median(nums((r) => r.metrics?.medianMsPerItem));
  const sus = nums((r) => r.measures?.susScore);

  return {
    started: starts.length,
    finished: done.length,
    // A finish without a marker (e.g. the marker failed to send) must not push the rate past 100%.
    completionPct: starts.length
      ? Math.min(100, Math.round((done.length / starts.length) * 100))
      : null,
    completedAll: done.filter((r) => r.metrics?.completedAll).length,
    medianMinutes: round1(median(minutes)),
    medianSecondsPerItem: itemMs == null ? null : round1(itemMs / 1000),
    medianSus: round1(median(sus)),
    typicalEffort: effort == null ? null : BURDEN_OPTIONS[Math.round(effort)] ?? null,
    fastPct: done.length ? Math.round((fast / done.length) * 1000) / 10 : null,
    runsPct: done.length ? Math.round((runs / done.length) * 1000) / 10 : null,
    minutes,
    sus,
    effort: effortList,
  };
}

export function summariseStudy(rows: StudyRow[], ratings: RatingRow[] = []): AdminStats {
  const clinic = rows.filter(isClinic);
  const online = rows.filter((r) => !isClinic(r));

  const byDay: Record<string, { started: number; finished: number }> = {};
  const firstStarts = firstPerPerson(rows.filter(isStart));
  const firstDone = firstPerPerson(rows.filter((r) => !isStart(r)));
  for (const r of [...firstStarts, ...firstDone]) {
    const day = r.created_at.slice(0, 10);
    const d = (byDay[day] ??= { started: 0, finished: 0 });
    if (isStart(r)) d.started += 1;
    else d.finished += 1;
  }
  const perDay = Object.keys(byDay)
    .sort()
    .slice(-14)
    .map((date) => ({ date, ...byDay[date] }));

  // Retest: the same person finishing twice, at least retestDays apart. Since D42 every visit has a
  // new participant id, so a person is matched by device (the device id, or the participant id on
  // older records, which was the device id then) plus age group and gender.
  const finishedById = new Map<string, number[]>();
  for (const r of online) {
    if (isStart(r)) continue;
    const key = `${r.metrics?.device ?? r.participant_id}|${r.measures?.age ?? ""}|${r.measures?.gender ?? ""}`;
    (finishedById.get(key) ?? finishedById.set(key, []).get(key)!).push(Date.parse(r.created_at));
  }
  const gapsDays: number[] = [];
  finishedById.forEach((ts) => {
    if (ts.length < 2) return;
    ts.sort((a, b) => a - b);
    const gap = (ts[ts.length - 1] - ts[0]) / 86400000;
    if (gap >= TARGETS.retestDays) gapsDays.push(Math.round(gap * 10) / 10);
  });

  // Clinic status by code: rated by the doctor, started and finished Waypoint.
  const firstBy = (pred: (r: StudyRow) => boolean) => {
    const m = new Map<string, string>();
    for (const r of clinic) {
      const code = codeOf(r.participant_id);
      if (!code || !pred(r)) continue;
      const prev = m.get(code);
      if (!prev || r.created_at < prev) m.set(code, r.created_at);
    }
    return m;
  };
  const startedBy = firstBy(isStart);
  const finishedBy = firstBy((r) => !isStart(r));
  const finishedRow = new Map<string, StudyRow>();
  for (const r of clinic) {
    const code = codeOf(r.participant_id);
    if (code && !isStart(r) && finishedBy.get(code) === r.created_at) finishedRow.set(code, r);
  }
  const AREAS = ["activity", "sleep", "nutrition", "stress", "social", "substances"] as const;
  const codes = new Set<string>([...ratings.map((r) => r.code), ...Array.from(finishedBy.keys())]);
  const order: Record<ClinicStep, number> = { waypoint: 0, doctor: 1, both: 2, done: 3 };
  const clinicList: ClinicStatus[] = Array.from(codes)
    .map((code) => {
      const rt = ratings.find((r) => r.code === code);
      const rated = rt && rt.overall != null ? rt.rated_at ?? null : null;
      const finished = finishedBy.get(code) ?? null;
      const todo: ClinicStep = rated && finished ? "done" : rated ? "waypoint" : finished ? "doctor" : "both";
      const fr = finishedRow.get(code);
      const doctorAreas: Partial<Record<string, number>> = {};
      const waypointAreas: Partial<Record<string, number>> = {};
      for (const a of AREAS) {
        const dv = rt?.[a];
        if (typeof dv === "number") doctorAreas[a] = dv;
        const wv = fr?.scores?.[a];
        if (typeof wv === "number") waypointAreas[a] = wv;
      }
      return {
        code,
        created: rt?.created_at ?? null,
        rated,
        started: startedBy.get(code) ?? null,
        finished,
        todo,
        doctorOverall: rated ? rt?.overall ?? null : null,
        waypoint: typeof fr?.composite === "number" ? fr.composite : null,
        doctorAreas,
        waypointAreas,
        domainScale: rt?.domain_scale ?? null,
        familiarity: rated ? rt?.familiarity ?? null : null,
        minutes: typeof fr?.metrics?.totalDurationMs === "number" ? round1(fr.metrics.totalDurationMs / 60000) : null,
        secPerItem: typeof fr?.metrics?.medianMsPerItem === "number" ? round1(fr.metrics.medianMsPerItem / 1000) : null,
        fastPct: typeof fr?.metrics?.fastResponsePct === "number" ? fr.metrics.fastResponsePct : null,
        veryFast: fr ? isVeryFast(fr.metrics?.fastResponsePct) : null,
        runs: longRuns(fr?.items),
      };
    })
    .sort((a, b) => order[a.todo] - order[b.todo] || (b.created ?? "").localeCompare(a.created ?? ""));

  // Group A pairs: one finished session per code (the first) matched to the doctor's rating.
  const complete = clinicList.filter((c) => c.todo === "done" && c.waypoint != null && c.doctorOverall != null);
  const pairs = complete.map((c) => ({ code: c.code, score: c.waypoint as number, rating: c.doctorOverall as number }));
  // Domain ratings made on the old 1-5 scale are put on 0-10 so all ratings share one scale.
  const to10 = (c: ClinicStatus, v: number) => (c.domainScale === "1-5" ? (v - 1) * 2.5 : v);
  // Alpha follows the analysis script's rule: the last finished session per participant id.
  const doneRows = (arm: StudyArm) => {
    const last = new Map<string, StudyRow>();
    for (const r of [...online].sort((x, y) => x.created_at.localeCompare(y.created_at)))
      if (!isStart(r) && r.arm === arm) last.set(r.participant_id, r);
    return Array.from(last.values()).map((r) => r.items ?? []);
  };
  const clinicAnalysis = analyseClinic(
    complete.map((c) => ({
      composite: c.waypoint,
      scores: (finishedRow.get(c.code)?.scores ?? null) as Partial<Record<PillarId, number>> | null,
      doctorOverall: c.doctorOverall as number,
      doctorAreas: Object.fromEntries(Object.entries(c.doctorAreas).map(([k, v]) => [k, to10(c, v as number)])),
    })),
    {
      clinic: Array.from(finishedRow.values()).map((r) => r.items ?? []),
      app: doneRows("app"),
      form: doneRows("form"),
    }
  );

  const times = rows.map((r) => r.created_at).sort();

  return {
    started: firstStarts.length,
    finished: firstDone.length,
    online: groupStats(online),
    arms: {
      app: groupStats(online.filter((r) => r.arm === "app")),
      form: groupStats(online.filter((r) => r.arm === "form")),
    },
    clinic: groupStats(clinic),
    clinicMedianComposite: median(
      clinic
        .filter((r) => !isStart(r))
        .map((r) => r.composite)
        .filter((x): x is number => typeof x === "number")
    ),
    codesIssued: ratings.length,
    rated: ratings.filter((r) => r.overall != null).length,
    pairs,
    spearman: clinicAnalysis.overall.rho,
    retest: { done: gapsDays.length, gapsDays },
    perDay,
    clinicList,
    clinicAnalysis,
    first: times[0] ?? null,
    last: times[times.length - 1] ?? null,
  };
}
