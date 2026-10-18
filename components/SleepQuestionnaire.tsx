"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ISI_ITEMS,
  SleepAnswers,
  computeSleep,
  emptySleepAnswers,
} from "@/lib/sleep";
import { usePillarTelemetry } from "@/lib/usePillarTelemetry";
import { clearDraft, usePersistentState } from "@/lib/usePersistentState";
import { advanceDelay } from "@/lib/flow";
import ChapterHandoff from "@/components/ChapterHandoff";
import { ConcernId } from "@/lib/concerns";
import ChoiceGroup, { indexOptions } from "@/components/ChoiceGroup";

type StepKind = "intro" | "isi" | "duration" | "result";

interface Step {
  kind: StepKind;
  itemIndex?: number; // for isi steps
}

const STEPS: Step[] = [
  { kind: "intro" },
  ...ISI_ITEMS.map((_, i) => ({ kind: "isi" as const, itemIndex: i })),
  { kind: "duration" },
  { kind: "result" },
];

const HOUR_CHIPS = [5, 6, 7, 8, 9, 10];

export default function SleepQuestionnaire({
  onExit,
  onComplete,
  chapterMode,
  onProgress,
}: {
  onExit?: () => void;
  onComplete?: (score: number, concerns?: ConcernId[]) => void;
  // Reports position within this chapter so the parent can show continuous progress.
  onProgress?: (answered: number, total: number) => void;
  // Chapter mode (unified flow): skip this pillar's own intro and result screens.
  chapterMode?: boolean;
}) {
  // Autosaved: a refresh or interruption no longer destroys the assessment.
  const [answers, setAnswers] = usePersistentState<SleepAnswers>(
    "sleep.answers",
    emptySleepAnswers
  );
  const [index, setIndex] = usePersistentState<number>("sleep.index", 0);

  const steps = chapterMode ? STEPS.filter((s) => s.kind !== "intro") : STEPS;
  const step = steps[Math.min(index, steps.length - 1)];

  const questionCount = ISI_ITEMS.length + 1; // 7 ISI + duration
  const answeredCount = useMemo(() => {
    let n = 0;
    if (step.kind === "isi") n = step.itemIndex ?? 0;
    else if (step.kind === "duration") n = ISI_ITEMS.length;
    else if (step.kind === "result") n = questionCount;
    return n;
  }, [step, questionCount]);
  const progress = Math.round((answeredCount / questionCount) * 100);

  // ISI is a fixed-item instrument (all 7 asked) plus one duration item, so asked == full.
  // Telemetry still captures latency and straight-lining (RQ2b).
  const tel = usePillarTelemetry(
    "sleep",
    ISI_ITEMS.length + 1,
    step.kind === "isi"
      ? ISI_ITEMS[step.itemIndex as number].id
      : step.kind === "duration"
      ? "duration"
      : null
  );

  // Tapping an answer moves on by itself — roughly halves the taps across the assessment.
  // (Duration uses chips plus an optional exact entry, so it keeps its Next button.)
  function setIsi(id: string, value: number) {
    tel.answer(id, value);
    setAnswers((prev) => ({ ...prev, isi: { ...prev.isi, [id]: value } }));
    setTimeout(goNext, advanceDelay());
  }
  function setSelf(v: number | null) {
    tel.answer("duration", v);
    setAnswers((prev) => ({ ...prev, selfHours: v }));
  }
  function setDevice(v: number | null) {
    setAnswers((prev) => ({ ...prev, deviceHours: v }));
  }

  const goNext = () => setIndex((i) => Math.min(i + 1, steps.length - 1));
  const goBack = () => setIndex((i) => Math.max(i - 1, 0));
  const restart = () => {
    clearDraft("sleep.answers");
    clearDraft("sleep.index");
    setAnswers(emptySleepAnswers);
    setIndex(0);
  };

  useEffect(() => {
    if (chapterMode) onProgress?.(answeredCount, questionCount);
  }, [chapterMode, onProgress, answeredCount, questionCount]);

  return (
    <div className={chapterMode ? "chapter-body" : "card"}>
      {!chapterMode && step.kind !== "intro" && step.kind !== "result" && (
        <div className="progress" aria-hidden>
          <span style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
      )}

      {step.kind === "intro" && <Intro onStart={goNext} onExit={onExit} />}

      {step.kind === "isi" && (
        <IsiStep
          itemIndex={step.itemIndex as number}
          value={answers.isi[ISI_ITEMS[step.itemIndex as number].id]}
          onChange={(v) => setIsi(ISI_ITEMS[step.itemIndex as number].id, v)}
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {step.kind === "duration" && (
        <DurationStep
          selfHours={answers.selfHours}
          deviceHours={answers.deviceHours}
          onSelf={setSelf}
          onDevice={setDevice}
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {step.kind === "result" &&
        (chapterMode ? (
          <ChapterHandoff
            score={computeSleep(answers).sleepScore}
            onDone={(score) => {
              tel.complete(score);
              onComplete?.(score, computeSleep(answers).isiTotal >= 15 ? ["insomnia"] : []);
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
      <p className="eyebrow">Pillar 2 of 6 · Restorative sleep</p>
      <h1 className="question">Let&apos;s check your sleep</h1>
      <p className="hint">
        Seven quick questions about your sleep over the <b>last 2 weeks</b> (the Insomnia
        Severity Index), plus how long you usually sleep. Takes about a minute. You&apos;ll get a
        0–100 sleep score with a full breakdown of how it was calculated.
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

function IsiStep(props: {
  itemIndex: number;
  value: number | null;
  onChange: (v: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const item = ISI_ITEMS[props.itemIndex];
  return (
    <div>
      <p className="eyebrow">{item.eyebrow}</p>
      <h2 className="question">{item.question}</h2>
      {item.hint && <p className="hint">{item.hint}</p>}
      <ChoiceGroup
        label={item.question}
        options={indexOptions(item.options)}
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

function DurationStep(props: {
  selfHours: number | null;
  deviceHours: number | null;
  onSelf: (v: number | null) => void;
  onDevice: (v: number | null) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [showDevice, setShowDevice] = useState(props.deviceHours !== null);
  return (
    <div>
      <p className="eyebrow">Sleep · duration</p>
      <h2 className="question">
        On a typical night over the last 2 weeks, how many hours do you actually sleep?
      </h2>
      <p className="hint">Your best estimate of actual sleep, not time in bed.</p>
      <ChoiceGroup
        variant="chips"
        label="Hours of sleep on a typical night"
        options={HOUR_CHIPS.map((h) => ({ value: h, label: `${h} h` }))}
        value={props.selfHours}
        onChange={props.onSelf}
      />
      <div className="field">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={24}
          step={0.5}
          placeholder="Or type hours"
          value={props.selfHours ?? ""}
          onChange={(e) =>
            props.onSelf(e.target.value === "" ? null : Number(e.target.value))
          }
        />
        <span className="unit">hours / night</span>
      </div>

      {!showDevice ? (
        <button
          className="linkbtn"
          onClick={() => setShowDevice(true)}
          type="button"
        >
          + Add a device estimate (optional)
        </button>
      ) : (
        <div className="device-box">
          <p className="hint" style={{ margin: "0 0 8px" }}>
            Optional: if a watch or phone tracks your sleep, enter its average. If provided, this
            is used for the duration score instead of your estimate.
          </p>
          <div className="field">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={24}
              step={0.1}
              placeholder="Device average"
              value={props.deviceHours ?? ""}
              onChange={(e) =>
                props.onDevice(e.target.value === "" ? null : Number(e.target.value))
              }
            />
            <span className="unit">hours / night</span>
          </div>
        </div>
      )}

      <div className="actions">
        <button className="btn btn-ghost" onClick={props.onBack}>
          Back
        </button>
        <button
          className="btn btn-primary"
          onClick={props.onNext}
          disabled={
            (props.selfHours === null || props.selfHours <= 0) &&
            (props.deviceHours === null || props.deviceHours <= 0)
          }
        >
          See my score
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
  answers: SleepAnswers;
  onBack: () => void;
  onRestart: () => void;
  onExit?: () => void;
  onComplete?: (score: number, concerns?: ConcernId[]) => void;
}) {
  const r = computeSleep(answers);
  useEffect(() => {
    onComplete?.(r.sleepScore);
  }, [r.sleepScore]);
  const band =
    r.sleepScore >= 70
      ? "Healthy, restorative sleep"
      : r.sleepScore >= 40
      ? "Some sleep issues — room to improve"
      : "Poor sleep — worth attention";

  const highRisk = r.isiTotal >= 15; // moderate or severe insomnia

  return (
    <div>
      <div className="result-head">
        <p className="eyebrow">Your sleep score</p>
        <div
          className={`gauge ${r.sleepScore >= 70 ? "" : r.sleepScore >= 40 ? "mid" : "low"}`}
          style={{ ["--val" as any]: r.sleepScore }}
        >
          <div className="gauge-inner">
            <div className="gauge-score">{r.sleepScore}</div>
            <div className="gauge-of">out of 100</div>
          </div>
        </div>
        <div className="band">{band}</div>
      </div>

      {/* Transparent, derivable breakdown */}
      <p className="section-label">How your score was calculated</p>

      <div className="calc">
        <div className="calc-row">
          <div className="calc-head">
            <span className="calc-name">Sleep quality (ISI)</span>
            <span className="calc-out">{r.qualityScore}/100</span>
          </div>
          <div className="calc-math">
            ISI total {r.isiTotal}/28 → clinical-band mapping = {r.qualityScore}
          </div>
          <div className="calc-sub">
            {r.isiBand.category} (ISI {r.isiBand.range})
          </div>
        </div>

        <div className="calc-row">
          <div className="calc-head">
            <span className="calc-name">Sleep duration</span>
            <span className="calc-out">{r.durationScore}/100</span>
          </div>
          <div className="calc-math">
            {r.durationHours} h/night → mortality-risk curve (RR ≈ {r.durationRelativeRisk.toFixed(2)}; best at 7–8 h)
          </div>
          <div className="calc-sub">
            Source: {r.durationSource === "device" ? "device estimate" : "self-report"}
          </div>
        </div>

        <div className="calc-row calc-total">
          <div className="calc-head">
            <span className="calc-name">Combined sleep score</span>
            <span className="calc-out">{r.sleepScore}/100</span>
          </div>
          <div className="calc-math">
            {r.qualityWeight} × {r.qualityScore} + {r.durationWeight} × {r.durationScore} ={" "}
            {r.qualityContribution} + {r.durationContribution} = {r.sleepScore}
          </div>
          <div className="calc-sub">
            Quality weighted {Math.round(r.qualityWeight * 100)}% · duration{" "}
            {Math.round(r.durationWeight * 100)}%
          </div>
        </div>
      </div>

      {/* Per-item ISI detail */}
      <p className="section-label">Your ISI answers (0 = none, 4 = very severe)</p>
      <div className="stats">
        {ISI_ITEMS.map((it) => (
          <div className="stat" key={it.id}>
            <span>{shortLabel(it.id)}</span>
            <b>{answers.isi[it.id] ?? 0} / 4</b>
          </div>
        ))}
        <div className="stat">
          <span>ISI total</span>
          <b>{r.isiTotal} / 28</b>
        </div>
      </div>

      {highRisk && (
        <p className="note note-warn">
          Your answers suggest a moderate-to-severe level of insomnia symptoms. This tool is a
          wellbeing screen, not a diagnosis — if poor sleep is affecting you, consider speaking
          to a GP or a qualified health professional.
        </p>
      )}

      <p className="note">
        <b>How this is scored:</b> duration is read off the all-cause mortality risk curve
        (best at 7–8 h, and long sleep penalised more than short — the curve is lopsided);
        quality uses the validated ISI clinical bands, so normal sleep stays high. The two are
        combined 50/50. Reflects your last 2 weeks. This is a wellbeing screen, not a diagnosis.
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

function shortLabel(id: string): string {
  switch (id) {
    case "onset":
      return "Difficulty falling asleep";
    case "maintenance":
      return "Difficulty staying asleep";
    case "early":
      return "Waking too early";
    case "satisfaction":
      return "Sleep dissatisfaction";
    case "interference":
      return "Daytime interference";
    case "noticeable":
      return "Noticeable to others";
    case "worry":
      return "Worry / distress";
    default:
      return id;
  }
}
