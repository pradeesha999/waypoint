"use client";

import { useEffect, useState } from "react";
import {
  LSNS_ITEMS,
  LSNS_OPTIONS,
  SocialAnswers,
  computeSocial,
  emptySocialAnswers,
} from "@/lib/social";
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
  ...LSNS_ITEMS.map((_, i) => ({ kind: "item" as const, itemIndex: i })),
  { kind: "result" },
];

export default function SocialConnectionQuestionnaire({
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
  const [answers, setAnswers] = usePersistentState<SocialAnswers>(
    "social.answers",
    emptySocialAnswers
  );
  const [index, setIndex] = usePersistentState<number>("social.index", 0);

  const steps = chapterMode ? STEPS.filter((s) => s.kind !== "intro") : STEPS;
  const step = steps[Math.min(index, steps.length - 1)];
  const questionCount = LSNS_ITEMS.length;
  let answered = 0;
  if (step.kind === "item") answered = step.itemIndex ?? 0;
  else if (step.kind === "result") answered = questionCount;
  const progress = Math.round((answered / questionCount) * 100);

  // LSNS-6 is a fixed-item instrument: all items are asked, so asked == full. Telemetry still
  // captures latency and straight-lining (RQ2b).
  const tel = usePillarTelemetry(
    "social",
    LSNS_ITEMS.length,
    step.kind === "item" ? LSNS_ITEMS[step.itemIndex as number].id : null
  );

  const goNext = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const goBack = () => setIndex((i) => Math.max(i - 1, 0));

  // Tapping an answer moves on by itself — roughly halves the taps across the assessment.
  function setItem(id: string, value: number) {
    tel.answer(id, value);
    setAnswers((prev) => ({ ...prev, lsns: { ...prev.lsns, [id]: value } }));
    setTimeout(goNext, advanceDelay());
  }

  const restart = () => {
    clearDraft("social.answers");
    clearDraft("social.index");
    setAnswers(emptySocialAnswers);
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
          value={answers.lsns[LSNS_ITEMS[step.itemIndex as number].id]}
          onChange={(v) => setItem(LSNS_ITEMS[step.itemIndex as number].id, v)}
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {step.kind === "result" &&
        (chapterMode ? (
          <ChapterHandoff
            score={computeSocial(answers).score}
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
      <p className="eyebrow">Pillar 5 of 6 · Social connection</p>
      <h1 className="question">Let&apos;s check your social connection</h1>
      <p className="hint">
        Six quick questions about your family and friends (the Lubben Social Network Scale). Takes
        about a minute. You&apos;ll get a 0–100 social connection score at the end.
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
  const item = LSNS_ITEMS[props.itemIndex];
  return (
    <div>
      <p className="eyebrow">{item.eyebrow}</p>
      <h2 className="question">{item.question}</h2>
      <ChoiceGroup
        label={item.question}
        options={indexOptions(LSNS_OPTIONS)}
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
  answers: SocialAnswers;
  onBack: () => void;
  onRestart: () => void;
  onExit?: () => void;
  onComplete?: (score: number) => void;
}) {
  const r = computeSocial(answers);
  useEffect(() => {
    onComplete?.(r.score);
  }, [r.score]);
  const band =
    r.score >= 70
      ? "Well connected"
      : r.score >= 40
      ? "Moderately connected"
      : "Limited connection";

  return (
    <div>
      <div className="result-head">
        <p className="eyebrow">Your social connection score</p>
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
            <span className="calc-name">Social network (LSNS-6)</span>
            <span className="calc-out">{r.score}/100</span>
          </div>
          <div className="calc-math">
            LSNS-6 total {r.total}/30 → {r.total}/30 × 100 = {r.score}
          </div>
          <div className="calc-sub">
            Family {r.familyTotal}/15 · Friends {r.friendsTotal}/15
          </div>
        </div>
      </div>

      {r.isolated && (
        <p className="note note-warn">
          Your answers suggest you may be at risk of social isolation (LSNS-6 below 12). This tool is
          a wellbeing screen, not a diagnosis — building regular contact with family, friends, or
          community groups can help, and a GP can point you to local support.
        </p>
      )}

      <p className="note">
        Your score is your LSNS-6 total rescaled to 0–100, so higher = a stronger social network =
        healthier. A total below 12 is the validated marker for being at risk of social isolation, so
        it&apos;s shown as a flag rather than used to change the score. Reflects your current network
        — a wellbeing screen, not a diagnosis.
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
