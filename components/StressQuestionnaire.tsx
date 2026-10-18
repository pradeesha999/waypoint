"use client";

import { useEffect, useState } from "react";
import {
  PSS_ITEMS,
  PSS_OPTIONS,
  StressAnswers,
  computeStress,
  emptyStressAnswers,
} from "@/lib/stress";
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
  ...PSS_ITEMS.map((_, i) => ({ kind: "item" as const, itemIndex: i })),
  { kind: "result" },
];

export default function StressQuestionnaire({
  onExit,
  onComplete,
  chapterMode,
  onProgress,
}: {
  onExit?: () => void;
  onComplete?: (score: number) => void;
  // Reports position within this chapter so the parent can show continuous progress.
  onProgress?: (answered: number, total: number) => void;
  // Chapter mode (unified flow): skip this pillar's own intro and result screens and hand the
  // score straight back, so the parent can show one merged transition instead.
  chapterMode?: boolean;
}) {
  // Autosaved: a refresh or interruption no longer destroys the assessment.
  const [answers, setAnswers] = usePersistentState<StressAnswers>(
    "stress.answers",
    emptyStressAnswers
  );
  const [index, setIndex] = usePersistentState<number>("stress.index", 0);

  const steps = chapterMode ? STEPS.filter((s) => s.kind !== "intro") : STEPS;
  const step = steps[Math.min(index, steps.length - 1)];
  const questionCount = PSS_ITEMS.length;
  let answered = 0;
  if (step.kind === "item") answered = step.itemIndex ?? 0;
  else if (step.kind === "result") answered = questionCount;
  const progress = Math.round((answered / questionCount) * 100);

  // PSS-10 is a fixed-item instrument: every item is asked, so asked == full (no gating possible
  // without breaking the instrument). Telemetry still captures latency and straight-lining (RQ2b).
  const tel = usePillarTelemetry(
    "stress",
    PSS_ITEMS.length,
    step.kind === "item" ? PSS_ITEMS[step.itemIndex as number].id : null
  );

  const goNext = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const goBack = () => setIndex((i) => Math.max(i - 1, 0));

  // Tapping an answer moves on by itself — roughly halves the taps across the assessment.
  function setItem(id: string, value: number) {
    tel.answer(id, value);
    setAnswers((prev) => ({ ...prev, pss: { ...prev.pss, [id]: value } }));
    setTimeout(goNext, advanceDelay());
  }

  const restart = () => {
    clearDraft("stress.answers");
    clearDraft("stress.index");
    setAnswers(emptyStressAnswers);
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
          value={answers.pss[PSS_ITEMS[step.itemIndex as number].id]}
          onChange={(v) => setItem(PSS_ITEMS[step.itemIndex as number].id, v)}
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {step.kind === "result" &&
        (chapterMode ? (
          <ChapterHandoff
            score={computeStress(answers).score}
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
      <p className="eyebrow">Pillar 4 of 6 · Stress</p>
      <h1 className="question">Let&apos;s check your stress</h1>
      <p className="hint">
        Ten quick questions about how you&apos;ve felt over the <b>last month</b> (the Perceived
        Stress Scale). Takes about two minutes. You&apos;ll get a 0–100 stress score at the end.
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
  const item = PSS_ITEMS[props.itemIndex];
  return (
    <div>
      <p className="eyebrow">{item.eyebrow}</p>
      <h2 className="question">{item.question}</h2>
      <ChoiceGroup
        label={item.question}
        options={indexOptions(PSS_OPTIONS)}
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
  answers: StressAnswers;
  onBack: () => void;
  onRestart: () => void;
  onExit?: () => void;
  onComplete?: (score: number) => void;
}) {
  const r = computeStress(answers);
  useEffect(() => {
    onComplete?.(r.score);
  }, [r.score]);
  const band =
    r.score >= 70
      ? "Low stress — healthy range"
      : r.score >= 40
      ? "Moderate stress — worth watching"
      : "High stress — worth attention";

  const highStress = r.pssTotal >= 27; // informal high-stress band

  return (
    <div>
      <div className="result-head">
        <p className="eyebrow">Your stress score</p>
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
            <span className="calc-name">Perceived stress (PSS-10)</span>
            <span className="calc-out">{r.score}/100</span>
          </div>
          <div className="calc-math">
            PSS total {r.pssTotal}/40 → (1 − {r.pssTotal}/40) × 100 = {r.score}
          </div>
          <div className="calc-sub">
            {r.band.category} (PSS {r.band.range}, informal band)
          </div>
        </div>
      </div>

      {highStress && (
        <p className="note note-warn">
          Your answers suggest a high level of perceived stress over the last month. This tool is a
          wellbeing screen, not a diagnosis — if stress is affecting you, consider speaking to a GP
          or a qualified health professional.
        </p>
      )}

      <p className="note">
        Your score is your PSS-10 total rescaled to 0–100 and flipped, so higher = less stress =
        healthier. PSS-10 has no formal clinical cut-offs, so the low/moderate/high band is shown
        only as a label. Reflects your last month — a wellbeing screen, not a diagnosis.
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
