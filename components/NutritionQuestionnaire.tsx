"use client";

import { useEffect, useState } from "react";
import {
  RPDQS_ITEMS,
  RPDQS_OPTIONS,
  NutritionAnswers,
  computeNutrition,
  emptyNutritionAnswers,
} from "@/lib/nutrition";
import { usePillarTelemetry } from "@/lib/usePillarTelemetry";
import { clearDraft, usePersistentState } from "@/lib/usePersistentState";
import { advanceDelay } from "@/lib/flow";
import ChapterHandoff from "@/components/ChapterHandoff";
import ChoiceGroup, { indexOptions } from "@/components/ChoiceGroup";

type StepKind = "intro" | "item" | "result";

interface Step {
  kind: StepKind;
  itemIndex?: number;
}

const STEPS: Step[] = [
  { kind: "intro" },
  ...RPDQS_ITEMS.map((_, i) => ({ kind: "item" as const, itemIndex: i })),
  { kind: "result" },
];

export default function NutritionQuestionnaire({
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
  const [answers, setAnswers] = usePersistentState<NutritionAnswers>(
    "nutrition.answers",
    emptyNutritionAnswers
  );
  const [index, setIndex] = usePersistentState<number>("nutrition.index", 0);

  const steps = chapterMode ? STEPS.filter((s) => s.kind !== "intro") : STEPS;
  const step = steps[Math.min(index, steps.length - 1)];
  const questionCount = RPDQS_ITEMS.length;
  let answered = 0;
  if (step.kind === "item") answered = step.itemIndex ?? 0;
  else if (step.kind === "result") answered = questionCount;
  const progress = Math.round((answered / questionCount) * 100);

  // rPDQS is a fixed-item instrument: all items are asked, so asked == full. Telemetry still
  // captures latency and straight-lining (RQ2b).
  const tel = usePillarTelemetry(
    "nutrition",
    RPDQS_ITEMS.length,
    step.kind === "item" ? RPDQS_ITEMS[step.itemIndex as number].id : null
  );

  const goNext = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const goBack = () => setIndex((i) => Math.max(i - 1, 0));

  // Tapping an answer moves on by itself — roughly halves the taps across the assessment.
  function setItem(id: string, value: number) {
    tel.answer(id, value);
    setAnswers((prev) => ({ ...prev, rpdqs: { ...prev.rpdqs, [id]: value } }));
    setTimeout(goNext, advanceDelay());
  }

  const restart = () => {
    clearDraft("nutrition.answers");
    clearDraft("nutrition.index");
    setAnswers(emptyNutritionAnswers);
    setIndex(0);
  };

  useEffect(() => {
    if (chapterMode) onProgress?.(answered, questionCount);
  }, [chapterMode, onProgress, answered, questionCount]);

  return (
    <div className={chapterMode ? "chapter-body" : "card"}>
      {!chapterMode && step.kind !== "intro" && step.kind !== "result" && (
        <div className="progress" aria-hidden>
          <span style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
      )}

      {step.kind === "intro" && <Intro onStart={goNext} onExit={onExit} />}

      {step.kind === "item" && (
        <ItemStep
          itemIndex={step.itemIndex as number}
          value={answers.rpdqs[RPDQS_ITEMS[step.itemIndex as number].id]}
          onChange={(v) => setItem(RPDQS_ITEMS[step.itemIndex as number].id, v)}
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {step.kind === "result" &&
        (chapterMode ? (
          <ChapterHandoff
            score={computeNutrition(answers).score}
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
      <p className="eyebrow">Pillar 3 of 6 · Nutrition</p>
      <h1 className="question">Let&apos;s check your diet</h1>
      <p className="hint">
        Thirteen quick questions about how often you eat certain foods over the past month (the
        rapid Prime Diet Quality Score). About two minutes. You&apos;ll get a 0–100 nutrition score
        at the end.
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

function ItemStep(props: {
  itemIndex: number;
  value: number | null;
  onChange: (v: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const item = RPDQS_ITEMS[props.itemIndex];
  return (
    <div>
      <p className="eyebrow">{item.eyebrow}</p>
      <h2 className="question">{item.question}</h2>
      <ChoiceGroup
        label={item.question}
        options={indexOptions(RPDQS_OPTIONS)}
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
  answers: NutritionAnswers;
  onBack: () => void;
  onRestart: () => void;
  onExit?: () => void;
  onComplete?: (score: number) => void;
}) {
  const r = computeNutrition(answers);
  useEffect(() => {
    onComplete?.(r.score);
  }, [r.score]);

  const band =
    r.score >= 70 ? "Strong diet quality" : r.score >= 40 ? "Moderate — room to improve" : "Lower diet quality";

  return (
    <div>
      <div className="result-head">
        <p className="eyebrow">Your nutrition score</p>
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
        <div className="calc-row calc-total">
          <div className="calc-head">
            <span className="calc-name">Diet quality (rPDQS)</span>
            <span className="calc-out">{r.score}/100</span>
          </div>
          <div className="calc-math">
            rPDQS total {r.total}/52 → {r.total}/52 × 100 = {r.score}
          </div>
          <div className="calc-sub">
            More healthy food groups + fewer to-limit ones = higher score
          </div>
        </div>
      </div>

      <p className="note">
        Your score rescales the rapid Prime Diet Quality Score (13 food groups) to 0–100: eating
        more of the beneficial groups (fish, whole grains, legumes, vegetables, fruit, nuts) and
        less of the to-limit ones (processed/red meat, full-fat dairy, fast food, sugary drinks,
        refined grains, sweets) raises it. Reflects your past month — a wellbeing screen, not a
        diagnosis.
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
