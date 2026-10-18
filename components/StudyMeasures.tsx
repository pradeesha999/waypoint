"use client";

// Post-assessment questions, asked identically in BOTH study arms.
//   RQ4 — usability (SUS) and perceived burden
//   RQ3 — self-rated health (concurrent validity) and chronic condition (known-groups)
// Kept after the pillars so answering them cannot influence the pillar responses.
// Group A (clinic) skips the usability page (D50): SUS and burden answer RQ3/RQ4, which use Group B only.

import { useState } from "react";
import {
  AGE_OPTIONS,
  AGE_QUESTION,
  BURDEN_OPTIONS,
  BURDEN_QUESTION,
  CONDITION_OPTIONS,
  CONDITION_QUESTION,
  GENDER_OPTIONS,
  GENDER_QUESTION,
  SRH_OPTIONS,
  SRH_QUESTION,
  SUS_ITEMS,
  SUS_OPTIONS,
  StudyMeasureAnswers,
  emptyMeasures,
} from "@/lib/measures";
import ChoiceGroup, { indexOptions } from "@/components/ChoiceGroup";

type Section = "health" | "usability" | "about";

export default function StudyMeasures({
  onDone,
  initial,
  skipUsability = false,
}: {
  onDone: (m: StudyMeasureAnswers) => void;
  skipUsability?: boolean;
  // Age group and gender already given in the warm-up (app arm), so they are not asked twice.
  initial?: { age: number | null; gender: number | null } | null;
}) {
  const [m, setM] = useState<StudyMeasureAnswers>(() => ({
    ...emptyMeasures,
    age: initial?.age ?? null,
    gender: initial?.gender ?? null,
  }));
  const [section, setSection] = useState<Section>("health");
  const skipAbout = initial?.age != null && initial?.gender != null;
  const of = 1 + (skipUsability ? 0 : 1) + (skipAbout ? 0 : 1);
  const healthLast = skipUsability && skipAbout;

  const set = <K extends keyof StudyMeasureAnswers>(k: K, v: StudyMeasureAnswers[K]) =>
    setM((prev) => ({ ...prev, [k]: v }));

  // These answers are needed for the analysis (SUS is only scorable with all ten items), so each
  // page moves on only once every question on it is answered. Demographics stay optional.
  const healthDone = m.srh != null && m.condition != null;
  const usabilityDone = m.burden != null && SUS_ITEMS.every((it) => m.sus[it.id] != null);

  if (section === "health") {
    return (
      <div className="card">
        <p className="eyebrow">Almost done · 1 of {of}</p>
        <h1 className="question">Two quick questions about your health</h1>
        <p className="hint">These help us check whether the score works the way it should.</p>

        <Choice
          label={SRH_QUESTION}
          options={SRH_OPTIONS}
          value={m.srh}
          onChange={(v) => set("srh", v)}
        />
        <Choice
          label={CONDITION_QUESTION}
          options={CONDITION_OPTIONS}
          value={m.condition}
          onChange={(v) => set("condition", v)}
        />

        {!healthDone && <p className="hint">Please answer both questions to continue.</p>}
        <div className="actions">
          <button
            className="btn btn-primary"
            disabled={!healthDone}
            onClick={() => (healthLast ? onDone(m) : setSection(skipUsability ? "about" : "usability"))}
          >
            {healthLast ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    );
  }

  if (section === "usability") {
    return (
      <div className="card">
        <p className="eyebrow">Almost done · 2 of {of}</p>
        <h1 className="question">How did you find it?</h1>
        <p className="hint">There are no right answers — please just say how it felt.</p>

        <Choice
          label={BURDEN_QUESTION}
          options={BURDEN_OPTIONS}
          value={m.burden}
          onChange={(v) => set("burden", v)}
        />

        {SUS_ITEMS.map((it) => (
          <Choice
            key={it.id}
            label={it.text}
            options={SUS_OPTIONS}
            value={m.sus[it.id] ?? null}
            onChange={(v) => set("sus", { ...m.sus, [it.id]: v })}
          />
        ))}

        {!usabilityDone && <p className="hint">Please answer every question to continue.</p>}
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => setSection("health")}>
            Back
          </button>
          <button
            className="btn btn-primary"
            disabled={!usabilityDone}
            onClick={() => (skipAbout ? onDone(m) : setSection("about"))}
          >
            {skipAbout ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="eyebrow">Almost done · {of} of {of}</p>
      <h1 className="question">A little about you</h1>
      <p className="hint">
        This is only used to describe the group of people who took part. You can skip either question.
      </p>

      <Choice label={AGE_QUESTION} options={AGE_OPTIONS} value={m.age} onChange={(v) => set("age", v)} />
      <Choice
        label={GENDER_QUESTION}
        options={GENDER_OPTIONS}
        value={m.gender}
        onChange={(v) => set("gender", v)}
      />

      <div className="actions">
        <button className="btn btn-ghost" onClick={() => setSection(skipUsability ? "health" : "usability")}>
          Back
        </button>
        <button className="btn btn-primary" onClick={() => onDone(m)}>
          Finish
        </button>
      </div>
    </div>
  );
}

function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="form-row">
      <p className="form-label">{label}</p>
      <ChoiceGroup
        label={label}
        options={indexOptions(options)}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}
