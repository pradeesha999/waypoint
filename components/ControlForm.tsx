"use client";

// CONTROL ARM — the traditional single-page form.
//
//  This is the baseline the friction-optimised app is compared against (RQ2/RQ2b). It must be a
//  FAIR baseline, not a deliberately weakened one: identical items, identical wording, identical
//  scoring, and a conventional layout of the kind a normal web survey would use (all questions on
//  one scrolling page, radio buttons, one submit at the end).
//
//  The ONLY difference from the app arm is delivery. Nothing here changes what is measured.

import { useMemo, useRef, useState } from "react";
import { IpaqAnswers, computeIpaq, emptyAnswers } from "@/lib/ipaq";
import { ISI_ITEMS, SleepAnswers, computeSleep, emptySleepAnswers } from "@/lib/sleep";
import {
  RPDQS_ITEMS,
  RPDQS_OPTIONS,
  NutritionAnswers,
  computeNutrition,
  emptyNutritionAnswers,
} from "@/lib/nutrition";
import { PSS_ITEMS, PSS_OPTIONS, StressAnswers, computeStress, emptyStressAnswers } from "@/lib/stress";
import { LSNS_ITEMS, LSNS_OPTIONS, SocialAnswers, computeSocial, emptySocialAnswers } from "@/lib/social";
import {
  AUDIT_ITEMS,
  SMOKING_OPTIONS,
  SMOKING_QUESTION,
  SubstancesAnswers,
  computeSubstances,
  drinks,
  emptySubstancesAnswers,
} from "@/lib/substances";
import { PillarId } from "@/lib/composite";
import { recordItem, recordPillarComplete, recordPillarStart } from "@/lib/telemetry";

const DAY_OPTIONS = ["0", "1", "2", "3", "4", "5", "6", "7"];

export default function ControlForm({
  onComplete,
}: {
  onComplete: (scores: Partial<Record<PillarId, number>>) => void;
}) {
  const [ipaq, setIpaq] = useState<IpaqAnswers>(emptyAnswers);
  const [sleep, setSleep] = useState<SleepAnswers>(emptySleepAnswers);
  const [nutrition, setNutrition] = useState<NutritionAnswers>(emptyNutritionAnswers);
  const [stress, setStress] = useState<StressAnswers>(emptyStressAnswers);
  const [social, setSocial] = useState<SocialAnswers>(emptySocialAnswers);
  const [subs, setSubs] = useState<SubstancesAnswers>(emptySubstancesAnswers);
  const [submitted, setSubmitted] = useState(false);
  // Set once Submit is pressed with gaps, so unanswered questions are marked only after an attempt.
  const [tried, setTried] = useState(false);

  const started = useRef(Date.now());
  const lastTouch = useRef(Date.now());

  // Every pillar is "started" as soon as the page loads, since all items are visible at once.
  const initialised = useRef(false);
  if (!initialised.current) {
    initialised.current = true;
    (["activity", "sleep", "nutrition", "stress", "social", "substances"] as PillarId[]).forEach(
      recordPillarStart
    );
  }

  // Record latency per answered item so the two arms are measured the same way.
  function track(pillar: PillarId, itemId: string, value: number | null) {
    const now = Date.now();
    recordItem(pillar, itemId, value, now - lastTouch.current);
    lastTouch.current = now;
  }

  const scores = useMemo(
    () => ({
      activity: computeIpaq(ipaq).score,
      sleep: computeSleep(sleep).sleepScore,
      nutrition: computeNutrition(nutrition).score,
      stress: computeStress(stress).score,
      social: computeSocial(social).score,
      substances: computeSubstances(subs).score,
    }),
    [ipaq, sleep, nutrition, stress, social, subs]
  );

  // A blank item would otherwise be scored as if answered (an empty insomnia item reads as "none"),
  // so the form, like any standard survey with required questions, submits only when complete.
  // The day questions start at 0, as in the IPAQ; a minutes question appears, and is checked, only
  // when its days are above 0, mirroring the IPAQ skip rule and the app.
  const missing = useMemo(() => {
    const m = new Set<string>();
    if (ipaq.vigDays > 0 && !ipaq.vigMin) m.add("vigMin");
    if (ipaq.modDays > 0 && !ipaq.modMin) m.add("modMin");
    if (ipaq.walkDays > 0 && !ipaq.walkMin) m.add("walkMin");
    if (!ipaq.sitHours) m.add("sitHours");
    ISI_ITEMS.forEach((it) => sleep.isi[it.id] == null && m.add(it.id));
    if (sleep.selfHours == null) m.add("duration");
    RPDQS_ITEMS.forEach((it) => nutrition.rpdqs[it.id] == null && m.add(it.id));
    LSNS_ITEMS.forEach((it) => social.lsns[it.id] == null && m.add(it.id));
    PSS_ITEMS.forEach((it) => stress.pss[it.id] == null && m.add(it.id));
    if (subs.a1 == null) m.add("a1");
    if (drinks(subs)) {
      if (subs.a2 == null) m.add("a2");
      if (subs.a3 == null) m.add("a3");
    }
    if (subs.smoking == null) m.add("smoking");
    return m;
  }, [ipaq, sleep, nutrition, stress, social, subs]);
  const miss = (id: string) => tried && missing.has(id);

  function handleSubmit() {
    if (missing.size > 0) {
      setTried(true);
      setTimeout(() => document.querySelector(".form-card .note-warn")?.scrollIntoView({ block: "center" }), 50);
      return;
    }
    const elapsed = Date.now() - started.current;
    // The control form asks every item of every instrument — no adaptive gating.
    const full: Record<PillarId, number> = {
      activity: 7,
      sleep: ISI_ITEMS.length + 1,
      nutrition: RPDQS_ITEMS.length,
      stress: PSS_ITEMS.length,
      social: LSNS_ITEMS.length,
      substances: AUDIT_ITEMS.length + 1,
    };
    (Object.keys(full) as PillarId[]).forEach((p) =>
      recordPillarComplete(p, scores[p], full[p], full[p], Math.round(elapsed / 6))
    );
    setSubmitted(true);
    onComplete(scores);
  }

  if (submitted) return null;

  return (
    <div className="card form-card">
      <p className="eyebrow">Health questionnaire</p>
      <h1 className="question">Please answer all the questions below</h1>
      <p className="hint">
        There are six sections. Please answer every question as accurately as you can, then press
        Submit at the bottom. If you would rather not answer something, you can stop at any time by
        closing the page.
      </p>

      {/* ---------- 1. Physical activity (IPAQ-SF) ---------- */}
      <h2 className="form-section">1. Physical activity — the last 7 days</h2>
      <NumRow
        label="On how many days did you do vigorous physical activity (heavy lifting, running, fast cycling)?"
        options={DAY_OPTIONS}
        value={ipaq.vigDays}
        onChange={(v) => { track("activity", "vigDays", v); setIpaq({ ...ipaq, vigDays: v }); }}
      />
      {ipaq.vigDays > 0 && (
        <MinRow
          label="On those days, how many minutes did you usually spend doing vigorous activity?"
          value={ipaq.vigMin}
          missing={miss("vigMin")}
          onChange={(v) => { track("activity", "vigMin", v); setIpaq({ ...ipaq, vigMin: v }); }}
        />
      )}
      <NumRow
        label="On how many days did you do moderate physical activity (light load carrying, cycling at a regular pace)?"
        options={DAY_OPTIONS}
        value={ipaq.modDays}
        onChange={(v) => { track("activity", "modDays", v); setIpaq({ ...ipaq, modDays: v }); }}
      />
      {ipaq.modDays > 0 && (
        <MinRow
          label="On those days, how many minutes did you usually spend doing moderate activity?"
          value={ipaq.modMin}
          missing={miss("modMin")}
          onChange={(v) => { track("activity", "modMin", v); setIpaq({ ...ipaq, modMin: v }); }}
        />
      )}
      <NumRow
        label="On how many days did you walk for at least 10 minutes at a time?"
        options={DAY_OPTIONS}
        value={ipaq.walkDays}
        onChange={(v) => { track("activity", "walkDays", v); setIpaq({ ...ipaq, walkDays: v }); }}
      />
      {ipaq.walkDays > 0 && (
        <MinRow
          label="On those days, how many minutes did you usually spend walking?"
          value={ipaq.walkMin}
          missing={miss("walkMin")}
          onChange={(v) => { track("activity", "walkMin", v); setIpaq({ ...ipaq, walkMin: v }); }}
        />
      )}
      <MinRow
        label="On a typical weekday, how many hours did you spend sitting?"
        unit="hours"
        max={24}
        missing={miss("sitHours")}
        value={ipaq.sitHours}
        onChange={(v) => { track("activity", "sitHours", v); setIpaq({ ...ipaq, sitHours: v }); }}
      />

      {/* ---------- 2. Sleep (ISI + duration) ---------- */}
      <h2 className="form-section">2. Sleep — the last 2 weeks</h2>
      {ISI_ITEMS.map((it) => (
        <RadioRow
          key={it.id}
          label={it.question}
          hint={it.hint}
          options={it.options}
          value={sleep.isi[it.id]}
          missing={miss(it.id)}
          onChange={(v) => {
            track("sleep", it.id, v);
            setSleep({ ...sleep, isi: { ...sleep.isi, [it.id]: v } });
          }}
        />
      ))}
      <MinRow
        label="On a typical night, how many hours do you actually sleep?"
        unit="hours"
        max={16}
        value={sleep.selfHours ?? 0}
        missing={miss("duration")}
        onChange={(v) => { track("sleep", "duration", v); setSleep({ ...sleep, selfHours: v }); }}
      />

      {/* ---------- 3. Nutrition (rPDQS) ---------- */}
      <h2 className="form-section">3. Nutrition — a typical week</h2>
      {RPDQS_ITEMS.map((it) => (
        <RadioRow
          key={it.id}
          label={it.question}
          options={RPDQS_OPTIONS}
          value={nutrition.rpdqs[it.id]}
          missing={miss(it.id)}
          onChange={(v) => {
            track("nutrition", it.id, v);
            setNutrition({ ...nutrition, rpdqs: { ...nutrition.rpdqs, [it.id]: v } });
          }}
        />
      ))}

      {/* ---------- 4. Social connection (LSNS-6) ---------- */}
      <h2 className="form-section">4. Social connection</h2>
      {LSNS_ITEMS.map((it) => (
        <RadioRow
          key={it.id}
          label={it.question}
          options={LSNS_OPTIONS}
          value={social.lsns[it.id]}
          missing={miss(it.id)}
          onChange={(v) => {
            track("social", it.id, v);
            setSocial({ ...social, lsns: { ...social.lsns, [it.id]: v } });
          }}
        />
      ))}

      {/* ---------- 5. Stress (PSS-10) ---------- */}
      <h2 className="form-section">5. Stress — the last month</h2>
      {PSS_ITEMS.map((it) => (
        <RadioRow
          key={it.id}
          label={it.question}
          options={PSS_OPTIONS}
          value={stress.pss[it.id]}
          missing={miss(it.id)}
          onChange={(v) => {
            track("stress", it.id, v);
            setStress({ ...stress, pss: { ...stress.pss, [it.id]: v } });
          }}
        />
      ))}

      {/* ---------- 6. Alcohol & tobacco (AUDIT-C + smoking) ---------- */}
      <h2 className="form-section">6. Alcohol and tobacco</h2>
      {/* Follow-ups appear only for drinkers, as in the AUDIT-C's own skip rule and the app. */}
      {AUDIT_ITEMS.filter((it) => it.id === "a1" || drinks(subs)).map((it) => (
        <RadioRow
          key={it.id}
          label={it.question}
          options={it.options}
          value={subs[it.id]}
          missing={miss(it.id)}
          onChange={(v) => { track("substances", it.id, v); setSubs({ ...subs, [it.id]: v }); }}
        />
      ))}
      <RadioRow
        label={SMOKING_QUESTION}
        options={SMOKING_OPTIONS}
        value={subs.smoking}
        missing={miss("smoking")}
        onChange={(v) => { track("substances", "smoking", v); setSubs({ ...subs, smoking: v }); }}
      />

      {tried && missing.size > 0 && (
        <p className="note note-warn" role="alert">
          {missing.size === 1 ? "1 question is" : `${missing.size} questions are`} still unanswered. They
          are marked above.
        </p>
      )}
      <div className="actions">
        <button className="btn btn-primary" onClick={handleSubmit}>
          Submit
        </button>
      </div>
      <p className="note">A wellbeing questionnaire, not a medical diagnosis.</p>
    </div>
  );
}

function RadioRow({
  label,
  hint,
  options,
  value,
  onChange,
  missing = false,
}: {
  label: string;
  hint?: string;
  options: string[];
  value: number | null;
  onChange: (v: number) => void;
  missing?: boolean;
}) {
  return (
    <div className="form-row">
      <p className="form-label">{label}</p>
      {hint && <p className="form-hint">{hint}</p>}
      {missing && <p className="note note-warn">Please answer this question.</p>}
      <div className="form-options">
        {options.map((o, i) => (
          <label key={i} className="form-opt">
            <input type="radio" checked={value === i} onChange={() => onChange(i)} />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function NumRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="form-row">
      <p className="form-label">{label}</p>
      <div className="form-options">
        {options.map((o, i) => (
          <label key={i} className="form-opt">
            <input type="radio" checked={value === i} onChange={() => onChange(i)} />
            <span>{o}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function MinRow({
  label,
  value,
  onChange,
  unit = "minutes",
  max = 600,
  missing = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  max?: number;
  missing?: boolean;
}) {
  return (
    <div className="form-row">
      <p className="form-label">{label}</p>
      {missing && <p className="note note-warn">Please answer this question.</p>}
      <div className="form-inline">
        <input
          type="number"
          min={0}
          max={max}
          value={value === 0 ? "" : value}
          placeholder="0"
          onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
        />
        <span className="form-unit">{unit}</span>
      </div>
    </div>
  );
}
