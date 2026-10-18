// Telemetry — the measurement layer for the evaluation study (RQ2 / RQ2b).
//
//  RQ2  (friction → completion): completion rate, per-pillar dropout, time on task.
//  RQ2b (friction → data quality): response latency, straight-lining, completeness.
//  D19  (adaptive item-selection): items actually asked vs the instrument's full length.
//
//  Design notes:
//  - Participants are ANONYMOUS. Requiring an account is itself friction and would bias RQ2,
//    so a random participant id is kept in localStorage; no personal data is recorded.
//  - Recording is best-effort and never blocks or breaks the questionnaire UI.
//  - Metric computation is pure (see computeQualityMetrics) so it can be unit-tested and reused
//    for the thesis analysis without touching the browser.

import { PillarId } from "@/lib/composite";
import { supabase } from "@/lib/supabase";
import { FAST_RESPONSE_MS, FAST_SHARE_PCT, STRAIGHT_LINE_RUN } from "@/lib/quality";

// Study arm: the friction-optimised app vs the traditional single-page form (control).
export type StudyArm = "app" | "form";

export interface ItemEvent {
  pillar: PillarId;
  itemId: string;
  value: number | null; // chosen option index (null = skipped/gated away)
  msOnItem: number; // time from the item appearing to it being answered
  at: string;
}

export interface PillarEvent {
  pillar: PillarId;
  itemsAsked: number; // items this participant actually saw (after adaptive gating)
  itemsFull: number; // items the full instrument would ask
  durationMs: number;
  score: number;
  at: string;
}

export interface SessionData {
  participantId: string;
  arm: StudyArm;
  startedAt: string;
  consentedAt: string | null; // set only when the participant ticks consent (ethics gate)
  pillarsStarted: PillarId[];
  items: ItemEvent[];
  pillars: PillarEvent[];
  composite: number | null;
  scores: Partial<Record<PillarId, number>>;
  measures: unknown | null; // summariseMeasures() output — SUS, burden, SRH, condition, demographics
}

const STORAGE_KEY = "waypoint.telemetry.v1";
const PID_KEY = "waypoint.pid.v1";
const ARM_KEY = "waypoint.arm.v1";

// Data-quality thresholds live in lib/quality.ts (one definition for the app, dashboard and analysis).
export { FAST_RESPONSE_MS, STRAIGHT_LINE_RUN };

const isBrowser = () => typeof window !== "undefined";

function readLocal<T>(key: string): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked — telemetry is best-effort, never break the UI
  }
}

// Which study group this visit belongs to, read from the recruitment link.
//   ?study=clinic  -> Group A, the doctor comparison (RQ1). Always the app arm, and a fresh id per
//                     person, because several participants may share one clinic device.
//   ?study=<other> -> Group B, the online app-versus-form comparison (RQ3, RQ4). Random, sticky arm.
// Group A records are tagged with a "clinic-" id prefix so they are never mixed into Group B.
export type Cohort = "online" | "clinic";

export function cohort(): Cohort {
  if (!isBrowser()) return "online";
  return new URLSearchParams(window.location.search).get("study") === "clinic" ? "clinic" : "online";
}

function newId(): string {
  return isBrowser() && typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// Stable anonymous id per browser. Not linked to any account or personal detail.
export function participantId(): string {
  const existing = readLocal<string>(PID_KEY);
  if (existing) return existing;
  const id = newId();
  writeLocal(PID_KEY, id);
  return id;
}

// Every visit is a new participant: each time someone agrees on the consent screen they get a fresh
// participant id, so a phone passed from one person to the next (a child to a parent) records each of
// them separately, and a reload starts a new instance. A separate, persistent device id is stored with
// each record so the 7-day retest can still be paired (same device, same age group and gender).
const DEVICE_KEY = "waypoint.device.v1";

export function deviceId(): string {
  const existing = readLocal<string>(DEVICE_KEY);
  if (existing) return existing;
  // A browser used before this change keeps its old participant id as its device id, so retests of
  // earlier participants still pair with their first record.
  const id = readLocal<string>(PID_KEY) ?? newId();
  writeLocal(DEVICE_KEY, id);
  return id;
}

export function startNewParticipant() {
  if (!isBrowser()) return;
  deviceId(); // fix the device id before the old participant id is cleared
  try {
    window.localStorage.removeItem(PID_KEY);
  } catch {
    // best-effort, like the rest of telemetry
  }
}

// Researcher preview: ?study=1&preview=app or &preview=form shows one version on demand.
// Nothing from a preview is ever sent, so previews cannot enter the study data.
export function previewArm(): StudyArm | null {
  if (!isBrowser()) return null;
  const v = new URLSearchParams(window.location.search).get("preview");
  return v === "app" || v === "form" ? v : null;
}

// Recruitment channel: ?study=1&src=public (or any short tag) marks where a link was shared, so the
// analysis can compare people reached through the researcher's own network (links without a tag) with
// people reached publicly. Kept per device so a reload without the tag keeps it. Never shown or asked.
const SOURCE_KEY = "waypoint.source.v1";

export function recruitmentSource(): string | null {
  if (!isBrowser()) return null;
  const raw = new URLSearchParams(window.location.search).get("src");
  if (raw && /^[a-z0-9-]{1,24}$/i.test(raw)) {
    writeLocal(SOURCE_KEY, raw.toLowerCase());
    return raw.toLowerCase();
  }
  return readLocal<string>(SOURCE_KEY);
}

// Random allocation to a study arm, sticky per participant (between-subjects design, D15).
// The clinic group always uses the app, since it tests the score rather than the delivery.
export function studyArm(): StudyArm {
  const preview = previewArm();
  if (preview) return preview;
  if (cohort() === "clinic") return "app";
  const existing = readLocal<StudyArm>(ARM_KEY);
  if (existing === "app" || existing === "form") return existing;
  const arm: StudyArm = Math.random() < 0.5 ? "app" : "form";
  writeLocal(ARM_KEY, arm);
  return arm;
}

// The code the doctor gave a Group A patient, entered before consent. Kept so that the session id
// carries it ("clinic-<CODE>-<random>"), which is how the doctor's rating is matched to the score.
const CLINIC_CODE_KEY = "waypoint.clinicCode.v1";

export function setClinicCode(code: string | null) {
  if (!isBrowser()) return;
  try {
    if (code) window.localStorage.setItem(CLINIC_CODE_KEY, code);
    else window.localStorage.removeItem(CLINIC_CODE_KEY);
  } catch {
    // best-effort, like the rest of telemetry
  }
}

function pendingClinicCode(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(CLINIC_CODE_KEY);
  } catch {
    return null;
  }
}

export function emptySession(): SessionData {
  const code = pendingClinicCode();
  return {
    participantId:
      cohort() === "clinic" ? `clinic-${code ? `${code}-` : ""}${newId()}` : participantId(),
    arm: studyArm(),
    startedAt: new Date().toISOString(),
    consentedAt: null,
    pillarsStarted: [],
    items: [],
    pillars: [],
    composite: null,
    scores: {},
    measures: null,
  };
}

// The doctor's patient code carried in a Group A session id ("clinic-<CODE>-<random>"), so the
// rating can be matched to the score without a name and with no extra column.
export function clinicCode(id: string): string | null {
  const m = /^clinic-([A-HJKMNP-Z2-9]{6})-/.exec(id);
  return m ? m[1] : null;
}

export function loadSession(): SessionData {
  return readLocal<SessionData>(STORAGE_KEY) ?? emptySession();
}

function saveSession(s: SessionData) {
  writeLocal(STORAGE_KEY, s);
}

function update(fn: (s: SessionData) => SessionData) {
  if (!isBrowser()) return;
  saveSession(fn(loadSession()));
}

// --- Recording ---

export function recordPillarStart(pillar: PillarId) {
  update((s) =>
    s.pillarsStarted.includes(pillar)
      ? s
      : { ...s, pillarsStarted: [...s.pillarsStarted, pillar] }
  );
}

export function recordItem(
  pillar: PillarId,
  itemId: string,
  value: number | null,
  msOnItem: number
) {
  update((s) => ({
    ...s,
    items: [...s.items, { pillar, itemId, value, msOnItem, at: new Date().toISOString() }],
  }));
}

export function recordPillarComplete(
  pillar: PillarId,
  score: number,
  itemsAsked: number,
  itemsFull: number,
  durationMs: number
) {
  update((s) => ({
    ...s,
    pillars: [
      ...s.pillars.filter((p) => p.pillar !== pillar), // keep one row per pillar on retakes
      { pillar, itemsAsked, itemsFull, durationMs, score, at: new Date().toISOString() },
    ],
  }));
}

// Ethics gate: called when the participant ticks consent. Nothing should be flushed without this.
export function recordConsent() {
  update((s) => ({ ...s, consentedAt: new Date().toISOString() }));
}

export function recordFinalScores(
  composite: number | null,
  scores: Partial<Record<PillarId, number>>
) {
  update((s) => ({ ...s, composite, scores }));
}

// The warm-up's age group and gender (option indexes), kept so the end-of-study questions do not
// ask them a second time.
const WARMUP_KEY = "waypoint.warmup.v1";

export function recordWarmup(age: number | null, gender: number | null) {
  writeLocal(WARMUP_KEY, { age, gender });
}

export function loadWarmup(): { age: number | null; gender: number | null } | null {
  return readLocal<{ age: number | null; gender: number | null }>(WARMUP_KEY);
}

export function clearWarmup() {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(WARMUP_KEY);
  } catch {
    // best-effort
  }
}

export function recordMeasures(measures: unknown) {
  update((s) => ({ ...s, measures }));
}

export function resetSession() {
  if (!isBrowser()) return;
  saveSession(emptySession());
}

// --- Metrics (pure — safe to unit-test and to run over exported study data) ---

export interface QualityMetrics {
  pillarsStarted: number;
  pillarsCompleted: number;
  completedAll: boolean;
  droppedPillars: PillarId[]; // started but never completed → per-pillar dropout (RQ2)
  itemsAsked: number;
  itemsFull: number;
  adaptiveSavingPct: number; // % of items avoided by gating (D19 headline number)
  medianMsPerItem: number;
  fastResponses: number; // answered under FAST_RESPONSE_MS
  fastResponsePct: number;
  maxStraightLineRun: number; // longest run of identical consecutive answers in a pillar
  straightLining: boolean;
  carelessFlag: boolean; // RQ2b: any data-quality concern on this response set
  totalDurationMs: number;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// Longest run of identical consecutive answers, computed within each pillar separately
// (a run across pillar boundaries is not straight-lining — different instruments).
function longestRun(items: ItemEvent[]): number {
  const byPillar: Partial<Record<PillarId, (number | null)[]>> = {};
  for (const it of items) {
    (byPillar[it.pillar] ??= []).push(it.value);
  }
  let best = 0;
  for (const values of Object.values(byPillar) as (number | null)[][]) {
    let run = 0;
    let prev: number | null | undefined;
    for (const v of values) {
      run = v !== null && v === prev ? run + 1 : 1;
      if (run > best) best = run;
      prev = v;
    }
  }
  return best;
}

export function computeQualityMetrics(s: SessionData): QualityMetrics {
  const completedIds = s.pillars.map((p) => p.pillar);
  const dropped = s.pillarsStarted.filter((p) => !completedIds.includes(p));

  const itemsAsked = s.pillars.reduce((n, p) => n + p.itemsAsked, 0);
  const itemsFull = s.pillars.reduce((n, p) => n + p.itemsFull, 0);

  const latencies = s.items.map((i) => i.msOnItem).filter((m) => m > 0);
  const fast = latencies.filter((m) => m < FAST_RESPONSE_MS).length;
  const maxRun = longestRun(s.items);
  const straightLining = maxRun >= STRAIGHT_LINE_RUN;

  return {
    pillarsStarted: s.pillarsStarted.length,
    pillarsCompleted: s.pillars.length,
    completedAll: s.pillars.length === 6,
    droppedPillars: dropped,
    itemsAsked,
    itemsFull,
    adaptiveSavingPct:
      itemsFull > 0 ? Math.round(((itemsFull - itemsAsked) / itemsFull) * 1000) / 10 : 0,
    medianMsPerItem: median(latencies),
    fastResponses: fast,
    fastResponsePct:
      latencies.length > 0 ? Math.round((fast / latencies.length) * 1000) / 10 : 0,
    maxStraightLineRun: maxRun,
    straightLining,
    carelessFlag: straightLining || (latencies.length > 0 && (fast / latencies.length) * 100 > FAST_SHARE_PCT),
    totalDurationMs: s.pillars.reduce((n, p) => n + p.durationMs, 0),
  };
}

// --- Persistence (best-effort; anonymous insert, see Docs/Telemetry_Schema.sql) ---

// Start marker, sent the moment a participant consents (D33).
//
//  Without it only finished sessions reach the database, so the number who started and then gave up
//  is invisible and completion rate (RQ3, secondary) cannot be measured. The marker carries no
//  answers: only the random id, the arm and the time. The consent screen discloses it. The finished
//  session is paired with its marker by participant_id + started_at.
export async function recordStart(): Promise<{ error: unknown | null }> {
  if (!isBrowser() || previewArm()) return { error: null }; // previews are never sent
  const s = loadSession();
  if (!s.consentedAt) return { error: "not consented" };
  try {
    const { error } = await supabase.from("study_sessions").insert({
      participant_id: s.participantId,
      arm: s.arm,
      started_at: s.startedAt,
      consented_at: s.consentedAt,
      composite: null,
      scores: {},
      measures: null,
      metrics: { event: "start", device: deviceId(), source: recruitmentSource() },
      pillars: [],
      items: [],
    });
    return { error: error ?? null };
  } catch (error) {
    return { error };
  }
}

export async function flushSession(): Promise<{ error: unknown | null }> {
  if (!isBrowser() || previewArm()) return { error: null }; // previews are never sent
  const s = loadSession();
  // Ethics gate: never send anything for a participant who did not consent.
  if (!s.consentedAt) return { error: "not consented" };
  const m = computeQualityMetrics(s);
  try {
    const { error } = await supabase.from("study_sessions").insert({
      participant_id: s.participantId,
      arm: s.arm,
      started_at: s.startedAt,
      consented_at: s.consentedAt,
      composite: s.composite,
      scores: s.scores,
      measures: s.measures,
      metrics: { ...m, event: "complete", device: deviceId(), source: recruitmentSource() },
      pillars: s.pillars,
      items: s.items,
    });
    return { error: error ?? null };
  } catch (error) {
    return { error };
  }
}
