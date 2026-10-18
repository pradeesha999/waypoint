"use client";

// Researcher dashboard: where the study stands against its targets, and an early look at each research
// question. Figures are preliminary; Group A shows live correlations and p-values so the direction of RQ1
// can be followed as ratings arrive, but the reported analysis is done in Python.
// The password is held in memory for this visit only, so closing the tab locks the page again.

import { useState } from "react";
import { AdminStats, ArmStats, ClinicStatus, TARGETS } from "@/lib/adminStats";
import { Alpha, Corr } from "@/lib/clinicAnalysis";
import { BURDEN_OPTIONS } from "@/lib/measures";
import s from "./admin.module.css";

const show = (v: number | string | null | undefined, unit = "") => (v == null ? "-" : `${v}${unit}`);
const COLOR = { app: "var(--c-app)", form: "var(--c-form)" } as const;
const NAME = { app: "Waypoint", form: "Web form" } as const;

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [since, setSince] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, since }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong.");
        setStats(null);
      } else {
        setStats(json as AdminStats);
        setLoadedAt(new Date());
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  if (!stats)
    return (
      <main className={s.root}>
        <div className={`card ${s.login}`}>
          <p className="eyebrow">Researcher</p>
          <h1 className="question">Study dashboard</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
          >
            <label className="section-label" htmlFor="admin-password">
              Password
            </label>
            <div className="field">
              <input
                id="admin-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <label className="section-label" htmlFor="admin-since">
              Count records from (optional)
            </label>
            <div className="field">
              <input id="admin-since" type="date" value={since} onChange={(e) => setSince(e.target.value)} />
            </div>
            <p className="hint">Set this to the day recruitment started to leave out test runs.</p>
            {error && <p className="note note-warn">{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={!password || loading}>
              {loading ? "Loading…" : "Open dashboard"}
            </button>
          </form>
        </div>
      </main>
    );

  const { app, form } = stats.arms;
  const clinic = stats.clinicAnalysis;

  return (
    <main className={s.root}>
      <div className={s.header}>
        <h1>Study dashboard</h1>
        <div className={s.actions}>
          <span className={s.meta}>
            {loadedAt ? `Updated ${loadedAt.toLocaleTimeString()}` : ""}
            {since ? ` · from ${since}` : ""}
          </span>
          <button className="btn btn-ghost" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setStats(null);
              setPassword("");
            }}
          >
            Lock
          </button>
        </div>
      </div>
      <p className={s.banner}>
        Live, preliminary figures for monitoring only. Group A correlations and p-values update as patients
        are added and show the direction of the results; the reported results come from the analysis script.
      </p>

      <div className={s.grid}>
        {/* ---------------- Recruitment ---------------- */}
        <section className={`${s.panel} ${s.wide}`}>
          <h2>Recruitment against targets</h2>
          <p className={s.sub}>
            Finished participants. The dark tick marks the minimum needed; the full bar is the target.
          </p>
          <div className={s.tiles}>
            <Tile label="Agreed to take part" value={stats.started} note="all groups" />
            <Tile label="Finished" value={stats.finished} note="all groups" />
            <Tile label="Online completion" value={show(stats.online.completionPct, "%")} note={`${stats.online.finished} of ${stats.online.started} online`} />
            <Tile label="Latest activity" value={stats.last ? new Date(stats.last).toLocaleDateString() : "-"} note={stats.last ? new Date(stats.last).toLocaleTimeString() : ""} />
          </div>
          <Progress label="Group B · Waypoint" n={app.finished} target={TARGETS.perArm} min={TARGETS.minPerArm} color={COLOR.app} />
          <Progress label="Group B · Web form" n={form.finished} target={TARGETS.perArm} min={TARGETS.minPerArm} color={COLOR.form} />
          <Progress label="Group A · clinic patients finished" n={stats.clinic.finished} target={TARGETS.clinic} color="var(--brand)" />
          <Progress label={`Group A · rated by the doctor (${stats.codesIssued} codes issued)`} n={stats.rated} target={TARGETS.clinic} color="var(--brand)" />
          <Progress label={`Retest · repeated after ${TARGETS.retestDays}+ days`} n={stats.retest.done} target={TARGETS.retest} color="var(--muted)" />
        </section>

        <section className={`${s.panel} ${s.wide}`}>
          <h2>Daily activity</h2>
          <p className={s.sub}>People who agreed to take part and people who finished, per day (last 14 days, UTC).</p>
          <DayChart days={stats.perDay} />
        </section>

        {/* ---------------- RQ3 effort and data quality ---------------- */}
        <section className={s.panel}>
          <h2>RQ3 · Time to complete</h2>
          <p className={s.sub}>Total minutes per finished participant. Lower means less effort. Tick = median.</p>
          <ArmLegend />
          <DotStrip
            rows={[
              { key: "app", values: app.minutes },
              { key: "form", values: form.minutes },
            ]}
            unit="min"
          />
        </section>

        <section className={s.panel}>
          <h2>RQ3 · Perceived effort</h2>
          <p className={s.sub}>&quot;How much effort did completing this assessment take?&quot; Share of each version.</p>
          <ArmLegend />
          <EffortBars app={app.effort} form={form.effort} />
        </section>

        <section className={s.panel}>
          <h2>RQ3 · Completion and data quality</h2>
          <p className={s.sub}>
            Data quality should be no worse in Waypoint than in the web form. Very fast answering (over half the
            answers under 1.2 s) is the careless indicator; long runs are often honest on short scales.
          </p>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Measure</th>
                <th>Waypoint</th>
                <th>Web form</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Agreed to take part", (a: ArmStats) => show(a.started)],
                  ["Finished", (a) => show(a.finished)],
                  ["Completion rate", (a) => show(a.completionPct, "%")],
                  ["Median total time", (a) => show(a.medianMinutes, " min")],
                  ["Median time per question", (a) => show(a.medianSecondsPerItem, " s")],
                  ["Very fast answering", (a) => show(a.fastPct, "%")],
                  ["Long runs of identical answers", (a) => show(a.runsPct, "%")],
                ] as [string, (a: ArmStats) => string][]
              ).map(([label, pick]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{pick(app)}</td>
                  <td>{pick(form)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ---------------- RQ4 usability ---------------- */}
        <section className={s.panel}>
          <h2>RQ4 · Usability (SUS)</h2>
          <p className={s.sub}>System Usability Scale per participant. Dashed line = average benchmark of 68.</p>
          <ArmLegend />
          <DotStrip
            rows={[
              { key: "app", values: app.sus },
              { key: "form", values: form.sus },
            ]}
            domain={[0, 100]}
            reference={{ value: 68, label: "68" }}
          />
        </section>

        {/* ---------------- Group A codes ---------------- */}
        <section className={`${s.panel} ${s.wide}`}>
          <h2>Clinic patients by code</h2>
          <p className={s.sub}>
            Each patient needs two steps: the doctor&apos;s rating and the Waypoint assessment. Codes with a step
            still missing are listed first. The doctor rates 0 to 10; it is also shown multiplied by 10 so it sits
            beside the Waypoint score (0 to 100), but RQ1 compares their order, not their size. Time is the
            patient&apos;s total time on Waypoint; familiarity is how well the doctor knows the patient&apos;s
            lifestyle (1-5). &quot;Very fast answering&quot; (over half the answers under 1.2 s) is the careless
            indicator; a long run of identical answers is shown for checking but is often honest. Open
            &quot;Areas&quot; for the six domains. Dates are in your local time.
          </p>
          <div className={s.tiles}>
            <Tile label="Complete" value={stats.clinicList.filter((c) => c.todo === "done").length} note="rated and Waypoint done" />
            <Tile label="Waiting for Waypoint" value={stats.clinicList.filter((c) => c.todo === "waypoint").length} note="rated, patient not finished" />
            <Tile label="Waiting for rating" value={stats.clinicList.filter((c) => c.todo === "doctor").length} note="Waypoint done, not rated" />
            <Tile label="Not started" value={stats.clinicList.filter((c) => c.todo === "both").length} note="code made, nothing yet" />
          </div>
          <div className={s.tiles}>
            <Tile label="Median time, clinic" value={show(stats.clinic.medianMinutes, " min")} note={`Group B Waypoint: ${show(app.medianMinutes, " min")}`} />
            <Tile label="Median per question, clinic" value={show(stats.clinic.medianSecondsPerItem, " s")} note={`Group B Waypoint: ${show(app.medianSecondsPerItem, " s")}`} />
            <Tile label="Very fast answering, clinic" value={show(stats.clinic.fastPct, "%")} note={`long runs ${show(stats.clinic.runsPct, "%")} (often honest)`} />
          </div>
          <ClinicTable list={stats.clinicList} />
        </section>

        {/* ---------------- RQ1 doctor agreement ---------------- */}
        <section className={`${s.panel} ${s.wide}`}>
          <h2>RQ1 · Waypoint score against the doctor&apos;s rating</h2>
          <p className={s.sub}>
            Complete Group A patients (rated and finished), matched by code. Spearman&apos;s rho asks whether the
            two put patients in the same order: 0 is no agreement, 1 perfect; about 0.1 is weak, 0.3 moderate and
            0.5 strong. p below .05 means the agreement is unlikely to be chance. Points rising to the right mean
            they agree.
          </p>
          <div className={s.tiles}>
            <Tile label="Complete pairs" value={stats.pairs.length} note={`target ${TARGETS.clinic}`} />
            <Tile label="Spearman rho" value={show(clinic.overall.rho)} note={ciText(clinic.overall) || "needs 4+ pairs for a CI"} />
            <Tile label="p-value" value={pText(clinic.overall.p)} note={readCorr(clinic.overall)} />
            <Tile
              label="rho needed for p < .05"
              value={show(clinic.critical.now)}
              note={`at ${stats.pairs.length} pairs; ${clinic.critical.target} at ${TARGETS.clinic}`}
            />
          </div>
          <Scatter pairs={stats.pairs} />
        </section>

        <section className={`${s.panel} ${s.wide}`}>
          <h2>RQ1 · Agreement by domain</h2>
          <p className={s.sub}>
            The doctor&apos;s rating of each domain (0-10) against Waypoint&apos;s domain score (0-100), complete
            patients only. Shows which domains self-report and clinical judgement agree on.
          </p>
          <CorrTable
            head="Domain"
            rows={clinic.domains.map((d) => [AREA_ROWS.find(([id]) => id === d.id)?.[1] ?? d.id, d.corr])}
          />
        </section>

        <section className={`${s.panel} ${s.wide}`}>
          <h2>RQ2 · Each weighting against the doctor</h2>
          <p className={s.sub}>
            The same answers scored with the three weightings, each correlated with the doctor&apos;s overall rating.
            Reported, not used to switch weights: the literature-derived weights stay primary.
          </p>
          <CorrTable head="Weighting" rows={clinic.weightings.map((w) => [w.label, w.corr])} />
        </section>

        <section className={`${s.panel} ${s.wide}`}>
          <h2>Internal consistency (Cronbach&apos;s alpha)</h2>
          <p className={s.sub}>
            Whether the questions within each questionnaire hang together: 0.70 or above is acceptable. Group A
            alpha is unstable until about 20 patients; Group B is shown for comparison. n = people who answered
            every item of that questionnaire.
          </p>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Questionnaire</th>
                  <th>Group A (clinic)</th>
                  <th>Group B · Waypoint</th>
                  <th>Group B · Web form</th>
                </tr>
              </thead>
              <tbody>
                {clinic.alpha.map((a) => (
                  <tr key={a.name}>
                    <td>{a.name}</td>
                    <td>{alphaText(a.clinic)}</td>
                    <td>{alphaText(a.app)}</td>
                    <td>{alphaText(a.form)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

// ----------------------------------------------------------------------------- pieces

const AREA_ROWS: [string, string][] = [
  ["activity", "Physical activity"],
  ["sleep", "Sleep"],
  ["nutrition", "Nutrition"],
  ["stress", "Stress"],
  ["social", "Social connection"],
  ["substances", "Tobacco and alcohol"],
];

const STEP_LABEL: Record<ClinicStatus["todo"], string> = {
  waypoint: "Needs Waypoint",
  doctor: "Needs doctor's rating",
  both: "Not started",
  done: "Complete",
};
const STEP_CLASS: Record<ClinicStatus["todo"], string> = {
  waypoint: s.chipWait,
  doctor: s.chipWait,
  both: s.chipIdle,
  done: s.chipDone,
};

const pText = (p: number | null) => (p == null ? "-" : p < 0.001 ? "< .001" : p.toFixed(3).replace(/^0/, ""));
const ciText = (c: Corr) => (c.lo == null || c.hi == null ? "" : `95% CI ${c.lo} to ${c.hi}`);
const alphaText = (a: Alpha) => (a.alpha == null ? `- (n ${a.n})` : `${a.alpha.toFixed(2)} (n ${a.n})`);

// Plain reading of a correlation, to help word the results.
function readCorr(c: Corr) {
  if (c.rho == null) return c.n < 3 ? "needs 3+ pairs" : "no variation yet";
  const a = Math.abs(c.rho);
  const size = a < 0.1 ? "no" : a < 0.3 ? "weak" : a < 0.5 ? "moderate" : "strong";
  const dir = a < 0.1 ? "" : c.rho > 0 ? " positive" : " negative";
  return `${size}${dir} agreement, ${c.p != null && c.p < 0.05 ? "significant" : "not significant yet"}`;
}

function CorrTable({ head, rows }: { head: string; rows: [string, Corr][] }) {
  return (
    <div className={s.tableWrap}>
      <table className={`${s.table} ${s.leftTable}`}>
        <thead>
          <tr>
            <th>{head}</th>
            <th>n</th>
            <th>rho</th>
            <th>95% CI</th>
            <th>p</th>
            <th>Reading</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, c]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className={s.num}>{c.n}</td>
              <td className={s.num}>{show(c.rho)}</td>
              <td className={s.num}>{c.lo == null ? "-" : `${c.lo} to ${c.hi}`.replace(/ /g, " ")}</td>
              <td className={s.num}>{pText(c.p)}</td>
              <td>{readCorr(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function when(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function ClinicTable({ list }: { list: ClinicStatus[] }) {
  if (!list.length) return <p className={s.empty}>No codes issued yet.</p>;
  return (
    <div className={s.tableWrap}>
      <table className={`${s.table} ${s.leftTable}`}>
        <thead>
          <tr>
            <th>Code</th>
            <th>Status</th>
            <th>Doctor (0-10)</th>
            <th>Doctor x10</th>
            <th>Waypoint (0-100)</th>
            <th>Time (min)</th>
            <th>Per question (s)</th>
            <th>Under 1.2 s (%)</th>
            <th>Familiarity (1-5)</th>
            <th>Doctor rated</th>
            <th>Waypoint finished</th>
            <th>Areas</th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.code}>
              <td className={s.code}>{c.code}</td>
              <td>
                <span className={`${s.chip} ${STEP_CLASS[c.todo]}`}>{STEP_LABEL[c.todo]}</span>
                {!c.finished && c.started && <span className={s.tileNote}> started, not finished</span>}
                {c.veryFast && (
                  <>
                    {" "}
                    <span className={`${s.chip} ${s.chipWait}`}>very fast answering</span>
                  </>
                )}
                {c.runs.length > 0 && (
                  <details>
                    <summary className={s.tileNote}>long run (often honest)</summary>
                    <span className={s.tileNote}>
                      {c.runs.map((r) => `${r.pillar}: ${r.length} same answers in a row (option ${r.value}: ${r.items.join(", ")})`).join("; ")}
                    </span>
                  </details>
                )}
              </td>
              <td className={s.num}>{c.doctorOverall ?? ""}</td>
              <td className={s.num}>{c.doctorOverall != null ? c.doctorOverall * 10 : ""}</td>
              <td className={s.num}>{c.waypoint ?? ""}</td>
              <td className={s.num}>{c.minutes ?? ""}</td>
              <td className={s.num}>{c.secPerItem ?? ""}</td>
              <td className={s.num}>{c.fastPct ?? ""}</td>
              <td className={s.num}>{c.familiarity ?? ""}</td>
              <td>{c.rated ? when(c.rated) : "Not yet"}</td>
              <td>{c.finished ? when(c.finished) : "Not yet"}</td>
              <td>
                {Object.keys(c.doctorAreas).length || Object.keys(c.waypointAreas).length ? (
                  <details>
                    <summary>Areas</summary>
                    <table className={s.areaTable}>
                      <thead>
                        <tr>
                          <th>Area</th>
                          <th>Doctor ({c.domainScale === "1-5" ? "1-5" : "0-10"})</th>
                          <th>Waypoint</th>
                        </tr>
                      </thead>
                      <tbody>
                        {AREA_ROWS.map(([id, label]) => (
                          <tr key={id}>
                            <td>{label}</td>
                            <td className={s.num}>{c.doctorAreas[id] ?? ""}</td>
                            <td className={s.num}>{c.waypointAreas[id] ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ) : (
                  ""
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className={s.tile}>
      <span className={s.tileLabel}>{label}</span>
      <span className={s.tileValue}>{value}</span>
      {note && <span className={s.tileNote}>{note}</span>}
    </div>
  );
}

function Progress({ label, n, target, min, color }: { label: string; n: number; target: number; min?: number; color: string }) {
  const pct = Math.min(100, (n / target) * 100);
  return (
    <div className={s.progress}>
      <div className={s.progressHead}>
        <span>{label}</span>
        <b>
          {n} / {target}
          {min ? ` (min ${min})` : ""}
        </b>
      </div>
      <div className={s.track} role="img" aria-label={`${label}: ${n} of ${target}`}>
        <div className={s.fill} style={{ width: `${pct}%`, background: color }} />
        {min && <span className={s.minTick} style={{ left: `calc(${(min / target) * 100}% - 1px)` }} />}
      </div>
    </div>
  );
}

function ArmLegend() {
  return (
    <div className={s.legend}>
      {(["app", "form"] as const).map((k) => (
        <span key={k}>
          <span className={s.swatch} style={{ background: COLOR[k] }} />
          {NAME[k]}
        </span>
      ))}
    </div>
  );
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

function DotStrip({
  rows,
  domain,
  reference,
  unit = "",
}: {
  rows: { key: "app" | "form"; values: number[] }[];
  domain?: [number, number];
  reference?: { value: number; label: string };
  unit?: string;
}) {
  const all = rows.flatMap((r) => r.values);
  if (!all.length) return <p className={s.empty}>No finished participants yet.</p>;
  const lo = domain ? domain[0] : 0;
  const hi = domain ? domain[1] : Math.max(5, Math.ceil(Math.max(...all) / 5) * 5);
  const W = 520, L = 72, R = 16, rowH = 44, top = 8;
  const H = top + rows.length * rowH + 24;
  const x = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const ticks = Array.from({ length: 6 }, (_, i) => lo + ((hi - lo) * i) / 5);
  return (
    <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Distribution by version">
      {ticks.map((t) => (
        <g key={t}>
          <line className={s.gridLine} x1={x(t)} x2={x(t)} y1={top} y2={H - 20} />
          <text x={x(t)} y={H - 6} textAnchor="middle">
            {Math.round(t)}
          </text>
        </g>
      ))}
      {reference && (
        <g>
          <line className={s.refLine} x1={x(reference.value)} x2={x(reference.value)} y1={top} y2={H - 20} />
          <text x={x(reference.value) + 4} y={top + 10}>
            {reference.label}
          </text>
        </g>
      )}
      {rows.map((r, i) => {
        const cy = top + i * rowH + rowH / 2;
        const med = median(r.values);
        return (
          <g key={r.key}>
            <text x={0} y={cy + 4}>
              {NAME[r.key]}
            </text>
            {r.values.map((v, j) => (
              <circle
                key={j}
                cx={x(v)}
                cy={cy + (((j * 37) % 13) - 6)}
                r={4.5}
                fill={COLOR[r.key]}
                fillOpacity={0.75}
                stroke="var(--card)"
                strokeWidth={1.5}
              >
                <title>{`${NAME[r.key]}: ${v}${unit ? " " + unit : ""}`}</title>
              </circle>
            ))}
            {med != null && (
              <g>
                <line x1={x(med)} x2={x(med)} y1={cy - 13} y2={cy + 13} stroke="var(--ink)" strokeWidth={2} />
                <text className={s.valueText} x={x(med)} y={cy - 16} textAnchor="middle">
                  {Math.round(med * 10) / 10}
                </text>
              </g>
            )}
            {!r.values.length && (
              <text x={L + 4} y={cy + 4}>
                none yet
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function EffortBars({ app, form }: { app: number[]; form: number[] }) {
  if (!app.length && !form.length) return <p className={s.empty}>No answers yet.</p>;
  const share = (xs: number[], k: number) => (xs.length ? (xs.filter((v) => Math.round(v) === k).length / xs.length) * 100 : 0);
  const W = 520, L = 178, R = 40, rowH = 34, barH = 11, top = 4;
  const H = top + BURDEN_OPTIONS.length * rowH;
  const x = (p: number) => (p / 100) * (W - L - R);
  return (
    <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Perceived effort by version">
      {BURDEN_OPTIONS.map((label, k) => {
        const y = top + k * rowH;
        return (
          <g key={label}>
            <text x={0} y={y + barH + 4}>
              {label}
            </text>
            {(
              [
                ["app", app, 0],
                ["form", form, barH + 2],
              ] as const
            ).map(([key, xs, dy]) => {
              const p = share(xs as number[], k);
              return (
                <g key={key}>
                  <rect x={L} y={y + dy} width={Math.max(p > 0 ? 3 : 0, x(p))} height={barH} rx={2} fill={COLOR[key]}>
                    <title>{`${NAME[key]}: ${Math.round(p)}% (${(xs as number[]).filter((v) => Math.round(v) === k).length})`}</title>
                  </rect>
                  {p > 0 && (
                    <text x={L + x(p) + 4} y={y + dy + barH - 1}>
                      {Math.round(p)}%
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function DayChart({ days }: { days: { date: string; started: number; finished: number }[] }) {
  if (!days.length) return <p className={s.empty}>No activity yet.</p>;
  const W = 1000, L = 28, B = 22, top = 16, H = 190;
  const max = Math.max(1, ...days.map((d) => Math.max(d.started, d.finished)));
  const slot = (W - L) / days.length;
  const bw = Math.min(22, slot / 3);
  const y = (v: number) => top + (1 - v / max) * (H - top - B);
  return (
    <>
      <div className={s.legend}>
        <span>
          <span className={s.swatch} style={{ background: "var(--c-neutral)" }} />
          Agreed to take part
        </span>
        <span>
          <span className={s.swatch} style={{ background: "var(--brand)" }} />
          Finished
        </span>
      </div>
      <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily activity">
        {[0, Math.ceil(max / 2), max].map((t) => (
          <g key={t}>
            <line className={s.gridLine} x1={L} x2={W} y1={y(t)} y2={y(t)} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = L + slot * i + slot / 2;
          return (
            <g key={d.date}>
              {(
                [
                  [d.started, "var(--c-neutral)", -bw - 1, "agreed"],
                  [d.finished, "var(--brand)", 1, "finished"],
                ] as const
              ).map(([v, fill, dx, what]) => (
                <g key={what}>
                  <rect x={cx + dx} y={y(v)} width={bw} height={Math.max(0, H - B - y(v))} rx={2} fill={fill}>
                    <title>{`${d.date}: ${v} ${what}`}</title>
                  </rect>
                  {v > 0 && (
                    <text className={s.valueText} x={cx + dx + bw / 2} y={y(v) - 4} textAnchor="middle">
                      {v}
                    </text>
                  )}
                </g>
              ))}
              <text x={cx} y={H - 6} textAnchor="middle">
                {d.date.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
    </>
  );
}

function Scatter({ pairs }: { pairs: { code: string; score: number; rating: number }[] }) {
  if (!pairs.length) return <p className={s.empty}>No rated patients with a finished assessment yet.</p>;
  const W = 1000, L = 44, B = 34, top = 10, R = 16, H = 300;
  const x = (r: number) => L + (r / 10) * (W - L - R);
  const y = (v: number) => top + (1 - v / 100) * (H - top - B);
  return (
    <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Waypoint score against doctor rating">
      {[0, 25, 50, 75, 100].map((t) => (
        <g key={`y${t}`}>
          <line className={s.gridLine} x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
          <text x={L - 8} y={y(t) + 4} textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {Array.from({ length: 11 }, (_, r) => (
        <text key={`x${r}`} x={x(r)} y={H - B + 16} textAnchor="middle">
          {r}
        </text>
      ))}
      <text x={(W + L) / 2} y={H - 2} textAnchor="middle">
        Doctor&apos;s overall rating (0-10)
      </text>
      <text x={L + 6} y={top + 14}>
        Waypoint score (0-100)
      </text>
      {pairs.map((p, i) => (
        <circle key={i} cx={x(p.rating)} cy={y(p.score)} r={6} fill="var(--brand)" fillOpacity={0.8} stroke="var(--card)" strokeWidth={2}>
          <title>{`${p.code}: doctor ${p.rating}/10 · Waypoint ${p.score}`}</title>
        </circle>
      ))}
    </svg>
  );
}
