"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IpaqAnswers,
  computeIpaq,
  emptyAnswers,
} from "@/lib/ipaq";
import { usePillarTelemetry } from "@/lib/usePillarTelemetry";
import { clearDraft, usePersistentState } from "@/lib/usePersistentState";
import ChapterHandoff from "@/components/ChapterHandoff";
import { advanceDelay } from "@/lib/flow";
import ChoiceGroup, { indexOptions } from "@/components/ChoiceGroup";

type StepId =
  | "intro"
  | "vigDays"
  | "vigMin"
  | "modDays"
  | "modMin"
  | "walkDays"
  | "walkMin"
  | "sit"
  | "result";

interface Step {
  id: StepId;
  visible: (a: IpaqAnswers) => boolean;
}

// One-question-at-a-time flow with adaptive branching:
// the "minutes" question only appears if the matching "days" answer is > 0.
const STEPS: Step[] = [
  { id: "intro", visible: () => true },
  { id: "vigDays", visible: () => true },
  { id: "vigMin", visible: (a) => a.vigDays > 0 },
  { id: "modDays", visible: () => true },
  { id: "modMin", visible: (a) => a.modDays > 0 },
  { id: "walkDays", visible: () => true },
  { id: "walkMin", visible: (a) => a.walkDays > 0 },
  { id: "sit", visible: () => true },
  { id: "result", visible: () => true },
];

const MINUTE_CHIPS = [15, 30, 45, 60, 90];
const SIT_CHIPS = [2, 4, 6, 8, 10, 12];

// Items the full IPAQ-SF asks (vigorous days/min, moderate days/min, walking days/min, sitting) —
// the baseline the adaptive gating above is measured against (D19).
const FULL_ITEM_COUNT = 7;

export default function PhysicalActivityQuestionnaire({
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
  const [answers, setAnswers] = usePersistentState<IpaqAnswers>("activity.answers", emptyAnswers);
  const [index, setIndex] = usePersistentState<number>("activity.index", 0);

  const visibleSteps = useMemo(
    () => STEPS.filter((s) => s.visible(answers) && !(chapterMode && s.id === "intro")),
    [answers, chapterMode]
  );

  // Keep index valid if branching changes the visible list.
  const safeIndex = Math.min(index, visibleSteps.length - 1);
  const step = visibleSteps[safeIndex];

  const questionSteps = visibleSteps.filter(
    (s) => s.id !== "intro" && s.id !== "result"
  );
  const answeredCount = visibleSteps
    .slice(0, safeIndex)
    .filter((s) => s.id !== "intro" && s.id !== "result").length;
  const progress =
    questionSteps.length === 0
      ? 0
      : Math.round((answeredCount / questionSteps.length) * 100);

  const isQuestion = step.id !== "intro" && step.id !== "result";
  const tel = usePillarTelemetry("activity", FULL_ITEM_COUNT, isQuestion ? step.id : null);

  function set<K extends keyof IpaqAnswers>(key: K, value: IpaqAnswers[K]) {
    tel.answer(key as string, typeof value === "number" ? value : null);
    setAnswers((prev) => ({ ...prev, [key]: value }));
    // Auto-advance only on the "how many days" steps, which are plain option lists. The minutes
    // and sitting steps offer quick chips PLUS an optional exact entry, so they keep their Next
    // button — advancing there would stop someone typing a precise value.
    if (String(key).endsWith("Days")) setTimeout(goNext, advanceDelay());
  }

  function goNext() {
    setIndex((i) => Math.min(i + 1, visibleSteps.length - 1));
  }
  function goBack() {
    setIndex((i) => Math.max(i - 1, 0));
  }
  function restart() {
    clearDraft("activity.answers");
    clearDraft("activity.index");
    setAnswers(emptyAnswers);
    setIndex(0);
  }

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

      {step.id === "intro" && (
        <Intro onStart={goNext} onExit={onExit} />
      )}

      {step.id === "vigDays" && (
        <DaysStep
          eyebrow="Vigorous activity"
          question="In the last 7 days, how many days did you do vigorous activity?"
          hint="Hard effort that made you breathe much harder — e.g. running, fast cycling, heavy lifting (at least 10 minutes at a time)."
          value={answers.vigDays}
          onChange={(v) => set("vigDays", v)}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {step.id === "vigMin" && (
        <MinutesStep
          eyebrow="Vigorous activity"
          question="On those days, how long did you usually spend?"
          hint="Minutes on a typical day of vigorous activity."
          value={answers.vigMin}
          onChange={(v) => set("vigMin", v)}
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {step.id === "modDays" && (
        <DaysStep
          eyebrow="Moderate activity"
          question="In the last 7 days, how many days did you do moderate activity?"
          hint="Medium effort — e.g. cycling at a steady pace, doubles tennis. Do not include walking."
          value={answers.modDays}
          onChange={(v) => set("modDays", v)}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {step.id === "modMin" && (
        <MinutesStep
          eyebrow="Moderate activity"
          question="On those days, how long did you usually spend?"
          hint="Minutes on a typical day of moderate activity."
          value={answers.modMin}
          onChange={(v) => set("modMin", v)}
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {step.id === "walkDays" && (
        <DaysStep
          eyebrow="Walking"
          question="In the last 7 days, how many days did you walk for at least 10 minutes?"
          hint="Any walking — for travel, work, exercise or leisure."
          value={answers.walkDays}
          onChange={(v) => set("walkDays", v)}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {step.id === "walkMin" && (
        <MinutesStep
          eyebrow="Walking"
          question="On those days, how long did you usually walk?"
          hint="Minutes on a typical walking day."
          value={answers.walkMin}
          onChange={(v) => set("walkMin", v)}
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {step.id === "sit" && (
        <SitStep
          value={answers.sitHours}
          onChange={(v) => set("sitHours", v)}
          onNext={goNext}
          onBack={goBack}
        />
      )}

      {step.id === "result" &&
        (chapterMode ? (
          <ChapterHandoff
            score={computeIpaq(answers).score}
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
      <p className="eyebrow">Pillar 1 of 6</p>
      <h1 className="question">Let&apos;s check your physical activity</h1>
      <p className="hint">
        A few quick questions about your last 7 days. One at a time — it takes about a
        minute. We&apos;ll give you a 0–100 physical activity score at the end.
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

function DaysStep(props: {
  eyebrow: string;
  question: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <p className="eyebrow">{props.eyebrow}</p>
      <h2 className="question">{props.question}</h2>
      <p className="hint">{props.hint}</p>
      <ChoiceGroup
        variant="days"
        label={props.question}
        options={[0, 1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: d, label: d }))}
        value={props.value}
        onChange={props.onChange}
      />
      <div className="actions">
        <button className="btn btn-ghost" onClick={props.onBack}>
          Back
        </button>
        <button className="btn btn-primary" onClick={props.onNext}>
          Next
        </button>
      </div>
    </div>
  );
}

function MinutesStep(props: {
  eyebrow: string;
  question: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <p className="eyebrow">{props.eyebrow}</p>
      <h2 className="question">{props.question}</h2>
      <p className="hint">{props.hint}</p>
      <ChoiceGroup
        variant="chips"
        label={props.question}
        options={MINUTE_CHIPS.map((m) => ({ value: m, label: `${m} min` }))}
        value={props.value}
        onChange={props.onChange}
      />
      <div className="field">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Or type minutes"
          value={props.value === 0 ? "" : props.value}
          onChange={(e) => props.onChange(Number(e.target.value))}
        />
        <span className="unit">min / day</span>
      </div>
      <div className="actions">
        <button className="btn btn-ghost" onClick={props.onBack}>
          Back
        </button>
        <button
          className="btn btn-primary"
          onClick={props.onNext}
          disabled={!props.value || props.value <= 0}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function SitStep(props: {
  value: number;
  onChange: (v: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <p className="eyebrow">Sitting</p>
      <h2 className="question">On a typical weekday, how many hours do you spend sitting?</h2>
      {/* The hint describes what counts as sitting (IPAQ's own guidance) and deliberately says
          nothing about scoring: telling people that sitting lowers their score invites them to
          report less of it. */}
      <p className="hint">Include sitting at a desk, at meals, travelling, reading and in front of screens.</p>
      {/* Evenly spaced across the plausible range, so the choices do not suggest what is "normal"
          (the offered range of answers is known to shift reported durations). */}
      <ChoiceGroup
        variant="chips"
        label="On a typical weekday, how many hours do you spend sitting?"
        options={SIT_CHIPS.map((h) => ({ value: h, label: `${h} h` }))}
        value={props.value}
        onChange={props.onChange}
      />
      <div className="field">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={24}
          placeholder="Or type hours"
          value={props.value === 0 ? "" : props.value}
          onChange={(e) => props.onChange(Number(e.target.value))}
        />
        <span className="unit">hours / day</span>
      </div>
      <div className="actions">
        <button className="btn btn-ghost" onClick={props.onBack}>
          Back
        </button>
        <button className="btn btn-primary" onClick={props.onNext} disabled={!props.value || props.value <= 0}>
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
  answers: IpaqAnswers;
  onBack: () => void;
  onRestart: () => void;
  onExit?: () => void;
  onComplete?: (score: number) => void;
}) {
  const r = computeIpaq(answers);
  useEffect(() => {
    onComplete?.(r.score);
  }, [r.score]);
  const band =
    r.score >= 70 ? "Healthy activity level" : r.score >= 40 ? "Some activity — room to improve" : "Low activity";

  return (
    <div>
      <div className="result-head">
        <p className="eyebrow">Your physical activity score</p>
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

      <div className="stats">
        <div className="stat">
          <span>Total activity</span>
          <b>{Math.round(r.metTotal)} MET-min/week</b>
        </div>
        <div className="stat">
          <span>Walking</span>
          <b>{Math.round(r.metWalking)} MET-min</b>
        </div>
        <div className="stat">
          <span>Moderate</span>
          <b>{Math.round(r.metModerate)} MET-min</b>
        </div>
        <div className="stat">
          <span>Vigorous</span>
          <b>{Math.round(r.metVigorous)} MET-min</b>
        </div>
        <div className="stat">
          <span>Est. lower mortality risk</span>
          <b>{r.riskReductionPct}%</b>
        </div>
        <div className="stat">
          <span>IPAQ category (reference)</span>
          <b>{r.category}</b>
        </div>
        <div className="stat">
          <span>Sitting{r.sittingPenalty > 0 ? ` (−${r.sittingPenalty} pts)` : ""}</span>
          <b>{r.sitHoursPerDay} h/day</b>
        </div>
      </div>

      <p className="note">
        Your score is the share of the maximum mortality-risk reduction that activity can
        give: ~600 MET-min/week (the guideline) ≈ 75, and ~2400 MET-min/week (where the
        benefit flattens) = 100. A small −5 applies only if you sit a lot (≥8 h/day) and are
        below the guideline. Reflects your last 7 days — a wellbeing screen, not a diagnosis.
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
