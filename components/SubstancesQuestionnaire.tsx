"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AUDIT_ITEMS,
  SMOKING_OPTIONS,
  SMOKING_QUESTION,
  SubstancesAnswers,
  computeSubstances,
  drinks,
  emptySubstancesAnswers,
} from "@/lib/substances";
import { usePillarTelemetry } from "@/lib/usePillarTelemetry";
import { clearDraft, usePersistentState } from "@/lib/usePersistentState";
import { advanceDelay } from "@/lib/flow";
import ChapterHandoff from "@/components/ChapterHandoff";
import ChoiceGroup, { indexOptions } from "@/components/ChoiceGroup";

type StepId = "intro" | "a1" | "a2" | "a3" | "smoking" | "result";

interface Step {
  id: StepId;
  visible: (a: SubstancesAnswers) => boolean;
}

// Items the full instrument asks (AUDIT-C 3 + smoking status 1) — the baseline the adaptive
// gating below is measured against (D19).
const FULL_ITEM_COUNT = 4;

// Adaptive branching: the "how much / how often" alcohol items only appear if the person drinks.
const STEPS: Step[] = [
  { id: "intro", visible: () => true },
  { id: "a1", visible: () => true },
  { id: "a2", visible: (a) => drinks(a) },
  { id: "a3", visible: (a) => drinks(a) },
  { id: "smoking", visible: () => true },
  { id: "result", visible: () => true },
];

export default function SubstancesQuestionnaire({
  onExit,
  onComplete,
  chapterMode,
  onProgress,
}: {
  onExit?: () => void;
  onComplete?: (score: number) => void;
  // Reports position within this chapter so the parent can show continuous progress.
  onProgress?: (answered: number, total: number) => void;
  // Chapter mode (unified flow): skip this pillar's own intro and result screens.
  chapterMode?: boolean;
}) {
  // Autosaved: a refresh or interruption no longer destroys the assessment.
  const [answers, setAnswers] = usePersistentState<SubstancesAnswers>(
    "substances.answers",
    emptySubstancesAnswers
  );
  const [index, setIndex] = usePersistentState<number>("substances.index", 0);

  const visibleSteps = useMemo(
    () => STEPS.filter((s) => s.visible(answers) && !(chapterMode && s.id === "intro")),
    [answers, chapterMode]
  );
  const safeIndex = Math.min(index, visibleSteps.length - 1);
  const step = visibleSteps[safeIndex];

  const questionSteps = visibleSteps.filter((s) => s.id !== "intro" && s.id !== "result");
  const answeredCount = visibleSteps
    .slice(0, safeIndex)
    .filter((s) => s.id !== "intro" && s.id !== "result").length;
  const progress =
    questionSteps.length === 0 ? 0 : Math.round((answeredCount / questionSteps.length) * 100);

  const isQuestion = step.id !== "intro" && step.id !== "result";
  const tel = usePillarTelemetry("substances", FULL_ITEM_COUNT, isQuestion ? step.id : null);

  // Tapping an answer moves on by itself — roughly halves the taps across the assessment.
  function set<K extends keyof SubstancesAnswers>(key: K, value: SubstancesAnswers[K]) {
    tel.answer(key as string, typeof value === "number" ? value : null);
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setTimeout(goNext, advanceDelay());
  }
  const goNext = () => setIndex((i) => Math.min(i + 1, visibleSteps.length - 1));
  const goBack = () => setIndex((i) => Math.max(i - 1, 0));
  const restart = () => {
    clearDraft("substances.answers");
    clearDraft("substances.index");
    setAnswers(emptySubstancesAnswers);
    setIndex(0);
  };

  const auditItem = AUDIT_ITEMS.find((it) => it.id === step.id);

  useEffect(() => {
    if (chapterMode) onProgress?.(answeredCount, questionSteps.length);
  }, [chapterMode, onProgress, answeredCount, questionSteps.length]);

  return (
    <div className={chapterMode ? "chapter-body" : "card"}>
      {!chapterMode && step.id !== "intro" && step.id !== "result" && (
        <div className="progress" aria-hidden>
          <span style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
      )}

      {step.id === "intro" && <Intro onStart={goNext} onExit={onExit} />}

      {auditItem && (
        <ChoiceStep
          eyebrow={auditItem.eyebrow}
          question={auditItem.question}
          options={auditItem.options}
          value={answers[auditItem.id]}
          onChange={(v) => set(auditItem.id, v)}
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {step.id === "smoking" && (
        <ChoiceStep
          eyebrow="Substances · tobacco"
          question={SMOKING_QUESTION}
          options={SMOKING_OPTIONS}
          value={answers.smoking}
          onChange={(v) => set("smoking", v)}
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {step.id === "result" &&
        (chapterMode ? (
          <ChapterHandoff
            score={computeSubstances(answers).score}
            onDone={(score) => {
              tel.complete(score);
              onComplete?.(score);
            }}
          />
        ) : (
          <Result
            answers={answers}
            onBack={goBack}
            onRestart={restart}
            onExit={onExit}
            onComplete={(score) => {
              tel.complete(score);
              onComplete?.(score);
            }}
          />
        ))}
    </div>
  );
}

function Intro({ onStart, onExit }: { onStart: () => void; onExit?: () => void }) {
  return (
    <div>
      <p className="eyebrow">Pillar 6 of 6 · Risky substances</p>
      <h1 className="question">Let&apos;s check alcohol &amp; tobacco</h1>
      <p className="hint">
        A few quick questions about drinking (AUDIT-C) and smoking. Takes under a minute — if you
        don&apos;t drink, we skip the follow-ups. You&apos;ll get a 0–100 score at the end.
      </p>
      <div className="actions">
        {onExit && (
          <button className="btn btn-ghost" onClick={onExit}>
            Back
          </button>
        )}
        <button className="btn btn-primary" onClick={onStart}>
          Start
        </button>
      </div>
    </div>
  );
}

function ChoiceStep(props: {
  eyebrow: string;
  question: string;
  options: string[];
  value: number | null;
  onChange: (v: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <p className="eyebrow">{props.eyebrow}</p>
      <h2 className="question">{props.question}</h2>
      <ChoiceGroup
        label={props.question}
        options={indexOptions(props.options)}
        value={props.value}
        onChange={props.onChange}
      />
      <div className="actions">
        <button className="btn btn-ghost" onClick={props.onBack}>
          Back
        </button>
        <button
          className="btn btn-primary"
          onClick={props.onNext}
          disabled={props.value === null}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function Result({
  answers,
  onBack,
  onRestart,
  onExit,
  onComplete,
}: {
  answers: SubstancesAnswers;
  onBack: () => void;
  onRestart: () => void;
  onExit?: () => void;
  onComplete?: (score: number) => void;
}) {
  const r = computeSubstances(answers);
  useEffect(() => {
    onComplete?.(r.score);
  }, [r.score]);
  const band =
    r.score >= 70
      ? "Low risk"
      : r.score >= 40
      ? "Some risk — worth watching"
      : "Higher risk — worth attention";

  return (
    <div>
      <div className="result-head">
        <p className="eyebrow">Your risky substances score</p>
        <div
          className={`gauge ${r.score >= 70 ? "" : r.score >= 40 ? "mid" : "low"}`}
          style={{ ["--val" as any]: r.score }}
        >
          <div className="gauge-inner">
            <div className="gauge-score">{r.score}</div>
            <div className="gauge-of">out of 100</div>
          </div>
        </div>
        <div className="band">{band}</div>
      </div>

      <p className="section-label">How your score was calculated</p>
      <div className="calc">
        <div className="calc-row">
          <div className="calc-head">
            <span className="calc-name">Alcohol (AUDIT-C)</span>
            <span className="calc-out">{r.alcoholScore}/100</span>
          </div>
          <div className="calc-math">
            AUDIT-C {r.auditTotal}/12 → (1 − {r.auditTotal}/12) × 100 = {r.alcoholScore}
          </div>
          <div className="calc-sub">
            {r.hazardousDrinking ? "At/above the hazardous-drinking cut-off" : "Below the hazardous-drinking cut-off"}
          </div>
        </div>
        <div className="calc-row">
          <div className="calc-head">
            <span className="calc-name">Tobacco (smoking status)</span>
            <span className="calc-out">{r.tobaccoScore}/100</span>
          </div>
          <div className="calc-sub">{r.currentSmoker ? "Current smoker" : "Not a current smoker"}</div>
        </div>
        <div className="calc-row calc-total">
          <div className="calc-head">
            <span className="calc-name">Combined score</span>
            <span className="calc-out">{r.score}/100</span>
          </div>
          <div className="calc-math">
            0.5 × {r.alcoholScore} + 0.5 × {r.tobaccoScore} = {r.score}
          </div>
        </div>
      </div>

      {(r.hazardousDrinking || r.currentSmoker) && (
        <p className="note note-warn">
          Your answers suggest {r.hazardousDrinking ? "drinking at a hazardous level" : ""}
          {r.hazardousDrinking && r.currentSmoker ? " and " : ""}
          {r.currentSmoker ? "current smoking" : ""}. This tool is a wellbeing screen, not a
          diagnosis — cutting down has real health benefits, and a GP or a service like a quitline
          can help.
        </p>
      )}

      <p className="note">
        Each behaviour is scored 0–100 (higher = less risky) and the two are combined 50/50. Higher
        overall = less risky substance use = healthier. A wellbeing screen, not a diagnosis.
      </p>

      <div className="actions">
        <button className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
        <button className="btn btn-primary" onClick={onRestart}>
          Start again
        </button>
      </div>
      {onExit && (
        <button className="linkbtn" style={{ marginTop: 12 }} onClick={onExit} type="button">
          ← Back to all pillars
        </button>
      )}
    </div>
  );
}
