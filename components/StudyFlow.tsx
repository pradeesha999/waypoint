"use client";

// STUDY MODE — the end-to-end participant journey for the evaluation study.
//
//   consent  ->  assessment (arm allocated at random)  ->  post-questions  ->  thank you + save
//
//  Arm allocation is handled by studyArm() in telemetry: random once per participant, then sticky.
//  Nothing is recorded before consent, and nothing is sent unless consentedAt is set.

import { useState } from "react";
import ConsentScreen from "@/components/ConsentScreen";
import ControlForm from "@/components/ControlForm";
import UnifiedAssessment from "@/components/UnifiedAssessment";
import StudyMeasures from "@/components/StudyMeasures";
import Bloom, { BloomLegend } from "@/components/Bloom";
import { PillarId, computeComposite } from "@/lib/composite";
import { StudyMeasureAnswers, summariseMeasures } from "@/lib/measures";
import { clearAllDrafts } from "@/lib/usePersistentState";
import { isValidCode, normaliseCode } from "@/lib/clinic";
import {
  StudyArm,
  clearWarmup,
  clinicCode,
  cohort,
  flushSession,
  loadSession,
  loadWarmup,
  recordConsent,
  recordFinalScores,
  recordMeasures,
  recordStart,
  resetSession,
  startNewParticipant,
  setClinicCode,
  studyArm,
} from "@/lib/telemetry";

type Stage = "code" | "consent" | "assessment" | "measures" | "done" | "declined";

export default function StudyFlow({ onExit }: { onExit?: () => void }) {
  // Group A patients first enter the code their doctor gave them (see /doctor).
  const [stage, setStage] = useState<Stage>(() => (cohort() === "clinic" ? "code" : "consent"));
  const [arm, setArm] = useState<StudyArm>("app");
  const [scores, setScores] = useState<Partial<Record<PillarId, number>>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function handleConsent() {
    // Each consent is a new participant (D42): a shared phone records every person separately.
    startNewParticipant();
    resetSession(); // start a clean session, then stamp consent
    clearAllDrafts(); // a shared device must never carry a previous participant's answers over
    clearWarmup();
    const allocated = studyArm();
    setArm(allocated);
    recordConsent();
    // Best-effort: a failed marker must never stop the participant from starting.
    void recordStart();
    setStage("assessment");
  }

  function finishAssessment(s: Partial<Record<PillarId, number>>) {
    setScores(s);
    recordFinalScores(computeComposite(s).composite, s);
    setStage("measures");
  }

  async function finishMeasures(m: StudyMeasureAnswers) {
    recordMeasures(summariseMeasures(m));
    setStage("done");
    setSaveState("saving");
    const { error } = await flushSession();
    setSaveState(error ? "error" : "saved");
    // A shared clinic device must never carry this patient's code over to the next one.
    if (!error) setClinicCode(null);
  }

  if (stage === "code")
    return (
      <ClinicCodeScreen
        onValid={(code) => {
          setClinicCode(code);
          setStage("consent");
        }}
      />
    );

  if (stage === "consent")
    return <ConsentScreen onConsent={handleConsent} onDecline={() => setStage("declined")} />;

  if (stage === "declined")
    return (
      <div className="card">
        <p className="eyebrow">No problem</p>
        <h1 className="question">Thanks for your time</h1>
        <p className="hint">
          You have not taken part and nothing has been recorded. You can close this page.
        </p>
        {onExit && (
          <div className="actions">
            <button className="btn btn-ghost" onClick={onExit}>
              Back to Waypoint
            </button>
          </div>
        )}
      </div>
    );

  if (stage === "assessment")
    return arm === "form" ? (
      <ControlForm onComplete={finishAssessment} />
    ) : (
      <UnifiedAssessment onFinish={finishAssessment} hideScores={cohort() === "clinic"} />
    );

  if (stage === "measures")
    return (
      <StudyMeasures onDone={finishMeasures} initial={loadWarmup()} skipUsability={cohort() === "clinic"} />
    );

  const composite = computeComposite(scores).composite;
  // Group A (doctor comparison): the participant shows this screen to the doctor, who writes the code
  // on the rating form. The score is withheld so the doctor's rating stays blind to it (RQ1).
  const code = clinicCode(loadSession().participantId);
  if (code)
    return (
      <div className="card">
        <div className="result-head">
          <p className="eyebrow">All done</p>
          <h1 className="question">Thank you for taking part</h1>
          <p className="section-label">Your participant code</p>
          <p className="band">{code}</p>
        </div>
        <p className="hint">
          Your answers have been saved under the code your doctor gave you. Your score is not shown
          here so that the doctor&apos;s own assessment stays independent of it.
        </p>
        <div aria-live="polite">
          {saveState === "saving" && <p className="hint">Saving…</p>}
          {saveState === "saved" && <p className="hint">Saved.</p>}
          {saveState === "error" && (
            <p className="note note-warn">
              Your responses didn&apos;t reach us. Check your connection and reload this page.
            </p>
          )}
        </div>
      </div>
    );

  return (
    <div className="card">
      <div className="result-head">
        <p className="eyebrow">All done</p>
        <h1 className="question">Thank you for taking part</h1>
        {composite != null && (
          <>
            <Bloom scores={scores} composite={composite} size={210} />
            <p className="band">{composite} out of 100 · your overall Waypoint score</p>
          </>
        )}
      </div>

      {composite != null && <BloomLegend scores={scores} />}

      <p className="hint">
        Your answers have been recorded anonymously and will be used only for this dissertation.
      </p>
      <p className="note note-warn">
        This is a wellbeing questionnaire, not a medical diagnosis. If any of your results concern
        you, please speak to a doctor or other health professional.
      </p>
      {/* The save result is announced, not just painted — this screen appears while the request is
          still in flight, so the outcome arrives after the participant has stopped looking. */}
      <div aria-live="polite">
        {saveState === "saving" && <p className="hint">Saving…</p>}
        {saveState === "saved" && <p className="hint">Saved. You can close this page.</p>}
        {saveState === "error" && (
          <p className="note note-warn">
            Your responses didn&apos;t reach us. Check your connection and reload this page — your
            answers are still stored on this device.
          </p>
        )}
      </div>
      {onExit && (
        <div className="actions">
          <button className="btn btn-primary" onClick={onExit}>
            Back to Waypoint
          </button>
        </div>
      )}
    </div>
  );
}

// Group A only: the patient types the code the doctor gave them. It is checked against the codes the
// doctor created, so a typo cannot store answers under a code that no rating will ever match.
function ClinicCodeScreen({ onValid }: { onValid: (code: string) => void }) {
  const [raw, setRaw] = useState(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("code") ?? ""
  );
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = normaliseCode(raw);

  async function check() {
    if (!isValidCode(code)) {
      setError("A code has 6 letters and numbers. Please check it with your doctor.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/clinic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (json.valid) onValid(code);
      else if (json.used) setError("That code has already been used. Please ask your doctor for a new code.");
      else setError("That code was not recognised. Please check it with your doctor.");
    } catch {
      setError("Could not check the code. Check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="card">
      <p className="eyebrow">Before you start</p>
      <h1 className="question">Enter the code from your doctor</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <label className="section-label" htmlFor="clinic-code">
          Your code
        </label>
        <div className="field">
          <input
            id="clinic-code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={8}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </div>
        <p className="hint">The code links your answers to your doctor&apos;s notes without using your name.</p>
        <div aria-live="polite">{error && <p className="note note-warn">{error}</p>}</div>
        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={!code || checking}>
            {checking ? "Checking…" : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
