"use client";

import { useState } from "react";
import PhysicalActivityQuestionnaire from "@/components/PhysicalActivityQuestionnaire";
import SleepQuestionnaire from "@/components/SleepQuestionnaire";
import NutritionQuestionnaire from "@/components/NutritionQuestionnaire";
import StressQuestionnaire from "@/components/StressQuestionnaire";
import SocialConnectionQuestionnaire from "@/components/SocialConnectionQuestionnaire";
import SubstancesQuestionnaire from "@/components/SubstancesQuestionnaire";
import {
  PillarId,
  WEIGHTING_LABEL,
  computeComposite,
} from "@/lib/composite";
import { saveAssessment } from "@/lib/db";
import { usePersistentState } from "@/lib/usePersistentState";

type View = "menu" | PillarId | "composite";

const PILLARS: { id: PillarId; n: string; title: string; desc: string }[] = [
  { id: "activity", n: "Pillar 1", title: "Physical activity", desc: "IPAQ-SF · last 7 days · MET-minutes → 0–100" },
  { id: "sleep", n: "Pillar 2", title: "Restorative sleep", desc: "ISI + duration · last 2 weeks → 0–100" },
  { id: "nutrition", n: "Pillar 3", title: "Nutrition", desc: "rPDQS · diet quality → 0–100" },
  { id: "stress", n: "Pillar 4", title: "Stress management", desc: "PSS-10 · perceived stress (last month) → 0–100" },
  { id: "social", n: "Pillar 5", title: "Social connection", desc: "LSNS-6 · social network → 0–100" },
  { id: "substances", n: "Pillar 6", title: "Avoiding risky substances", desc: "AUDIT-C + smoking → 0–100" },
];

function tone(score: number): string {
  return score >= 70 ? "" : score >= 40 ? "mid" : "low";
}

export default function PillarApp({
  session,
  onRequireAuth,
  studyMode,
  onStudyComplete,
}: {
  session?: unknown | null;
  onRequireAuth?: () => void;
  // Study mode: no sign-in prompts, and a Continue button once all six pillars are done.
  studyMode?: boolean;
  onStudyComplete?: (scores: Partial<Record<PillarId, number>>) => void;
} = {}) {
  const [view, setView] = useState<View>("menu");
  // Autosaved alongside the per-pillar drafts, so a refresh keeps the overall score too.
  const [scores, setScores] = usePersistentState<Partial<Record<PillarId, number>>>(
    "composite.scores",
    {}
  );

  const back = () => setView("menu");
  const record = (id: PillarId) => (score: number) =>
    setScores((prev) => ({ ...prev, [id]: score }));

  if (view === "activity")
    return <PhysicalActivityQuestionnaire onExit={back} onComplete={record("activity")} />;
  if (view === "sleep")
    return <SleepQuestionnaire onExit={back} onComplete={record("sleep")} />;
  if (view === "nutrition")
    return <NutritionQuestionnaire onExit={back} onComplete={record("nutrition")} />;
  if (view === "stress")
    return <StressQuestionnaire onExit={back} onComplete={record("stress")} />;
  if (view === "social")
    return <SocialConnectionQuestionnaire onExit={back} onComplete={record("social")} />;
  if (view === "substances")
    return <SubstancesQuestionnaire onExit={back} onComplete={record("substances")} />;
  if (view === "composite")
    return (
      <CompositeView
        scores={scores}
        onBack={back}
        signedIn={!!session}
        onRequireAuth={onRequireAuth}
        studyMode={studyMode}
      />
    );

  const result = computeComposite(scores);

  return (
    <div className="card">
      <p className="eyebrow">Waypoint</p>
      <h1 className="question">Your six-pillar health score</h1>
      <p className="hint">
        Six quick check-ins — activity, sleep, nutrition, stress, social connection and substances.
        Each gives a 0–100 score; together they make your overall Waypoint score.
      </p>

      {studyMode && result.allComplete && (
        <button
          className="btn btn-primary"
          style={{ width: "100%", marginBottom: 16 }}
          onClick={() => onStudyComplete?.(scores)}
        >
          All six done — continue
        </button>
      )}

      <button
        className="menu-item"
        onClick={() => setView("composite")}
        style={{ marginBottom: 12 }}
      >
        <div className="menu-text">
          <span className="menu-n">Overall</span>
          <span className="menu-title">Your overall health score</span>
          <span className="menu-desc">
            {result.completed}/{result.total} pillars completed · {WEIGHTING_LABEL}
          </span>
        </div>
        <span className="menu-badge ready">
          {result.composite != null ? result.composite : "—"}
        </span>
      </button>

      <div className="menu">
        {PILLARS.map((p) => {
          const s = scores[p.id];
          return (
            <button key={p.id} className="menu-item" onClick={() => setView(p.id)}>
              <div className="menu-text">
                <span className="menu-n">{p.n}</span>
                <span className="menu-title">{p.title}</span>
                <span className="menu-desc">{p.desc}</span>
              </div>
              <span className="menu-badge ready">{typeof s === "number" ? s : "Try"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CompositeView({
  scores,
  onBack,
  signedIn,
  onRequireAuth,
  studyMode,
}: {
  scores: Partial<Record<PillarId, number>>;
  onBack: () => void;
  signedIn?: boolean;
  onRequireAuth?: () => void;
  studyMode?: boolean;
}) {
  const r = computeComposite(scores);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleSave() {
    if (!signedIn) {
      onRequireAuth?.();
      return;
    }
    setSaveState("saving");
    const { error } = await saveAssessment(r.composite, scores, WEIGHTING_LABEL);
    setSaveState(error ? "error" : "saved");
  }

  return (
    <div className="card">
      <div className="result-head">
        <p className="eyebrow">Overall health score</p>
        {r.composite != null ? (
          <div
            className={`gauge ${tone(r.composite)}`}
            style={{ ["--val" as any]: r.composite }}
          >
            <div className="gauge-inner">
              <div className="gauge-score">{r.composite}</div>
              <div className="gauge-of">out of 100</div>
            </div>
          </div>
        ) : (
          <p className="hint">Complete at least one pillar to see a score.</p>
        )}
        <div className="band">
          {WEIGHTING_LABEL} · {r.completed}/{r.total} pillars
        </div>
      </div>

      <p className="section-label">Domain scores</p>
      <div className="stats">
        {r.rows.map((row) => (
          <div className="stat" key={row.id}>
            <span>
              {row.label} <span style={{ color: "var(--muted)" }}>· {Math.round(row.weight * 100)}%</span>
            </span>
            <b>{row.score != null ? `${row.score}/100` : "—"}</b>
          </div>
        ))}
      </div>

      <p className="section-label">How the composite is calculated</p>
      {r.allComplete ? (
        <div className="calc">
          <div className="calc-row calc-total">
            <div className="calc-head">
              <span className="calc-name">Weighted average</span>
              <span className="calc-out">{r.composite}/100</span>
            </div>
            <div className="calc-math">
              {r.rows.map((row) => row.contribution).join(" + ")} = {r.composite}
            </div>
            <div className="calc-sub">
              Each pillar weighted by its evidence-based severity (shown above)
            </div>
          </div>
        </div>
      ) : (
        <p className="hint">
          Complete all six pillars for the full composite ({r.completed}/6 done so far).
        </p>
      )}

      <p className="note">
        <b>{WEIGHTING_LABEL}.</b> Pillars are weighted by how strongly each is linked to health
        outcomes, so higher-impact areas count more toward your Waypoint score. These weights are
        provisional and under clinical review. A wellbeing screen, not a diagnosis.
      </p>

      <div className="actions">
        <button className="btn btn-ghost" onClick={onBack}>
          Back to pillars
        </button>
        {r.allComplete && !studyMode && (
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saveState === "saving" || saveState === "saved"}
          >
            {saveState === "saved"
              ? "Saved ✓"
              : saveState === "saving"
              ? "Saving…"
              : signedIn
              ? "Save to my history"
              : "Sign in to save"}
          </button>
        )}
      </div>
      {saveState === "error" && (
        <p className="note note-warn">Couldn&apos;t save — please try again.</p>
      )}
    </div>
  );
}
