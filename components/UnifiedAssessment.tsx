"use client";

// THE UNIFIED ASSESSMENT (decision D28, spec: Docs/Assessment_Flow_Spec.md)
//
//  One continuous journey instead of six separate questionnaires reached from a menu:
//
//    warm-up (2 easy questions)  ->  6 domain chapters  ->  final score
//                                       \
//                                        one merged transition between chapters
//
//  Design decisions and their evidence:
//   - No per-chapter intro screen. Chen et al. (2022, Int. J. Market Research, n=3,128) found
//     breakoffs cluster at the start of a questionnaire and wherever "an introduction statement
//     indicates a new set of questions" — so announcing each domain on its own screen would add six
//     extra exit points at exactly the riskiest kind of moment.
//   - ONE transition per boundary, not two, and it pays the user first (their domain score + the
//     running total) before asking for more.
//   - Progress is HONEST (see below). No head-start framing: no 2022+ replication of the endowed
//     progress effect could be found, and overstating progress is not defensible in a research
//     instrument (decisions D29/D31).
//   - In the last third the progress switches from a percentage to "2 sections left, ~2 minutes".
//   - Least personal domain first, most sensitive (alcohol/tobacco) last. NOTE: this is a considered
//     sequencing choice for sensitive material, NOT a completion claim — Chen et al. found sensitive
//     topics carried LOWER breakoff risk than introduction statements (D30).

import { useCallback, useEffect, useState } from "react";
import PhysicalActivityQuestionnaire from "@/components/PhysicalActivityQuestionnaire";
import { CONCERN_ORDER, CONCERN_TEXT, ConcernId } from "@/lib/concerns";
import SleepQuestionnaire from "@/components/SleepQuestionnaire";
import NutritionQuestionnaire from "@/components/NutritionQuestionnaire";
import SocialConnectionQuestionnaire from "@/components/SocialConnectionQuestionnaire";
import StressQuestionnaire from "@/components/StressQuestionnaire";
import SubstancesQuestionnaire from "@/components/SubstancesQuestionnaire";
import { PillarId, computeComposite } from "@/lib/composite";
import { AGE_OPTIONS, AGE_QUESTION, GENDER_OPTIONS, GENDER_QUESTION } from "@/lib/measures";
import { COUNTUP_MS, prefersReducedMotion } from "@/lib/flow";
import { clearAllDrafts, usePersistentState } from "@/lib/usePersistentState";
import { saveAssessment } from "@/lib/db";
import { Profile, getProfile, isProfileComplete, saveProfile } from "@/lib/profile";
import { recordWarmup } from "@/lib/telemetry";
import { downloadCheckIn, nextCheckInDate } from "@/lib/reminder";
import { PILLARS_META } from "@/lib/composite";
import { WEIGHTING_LABEL } from "@/lib/composite";
import ChoiceGroup, { indexOptions } from "@/components/ChoiceGroup";
import Bloom, { BloomLegend } from "@/components/Bloom";
import { bandOf } from "@/lib/bands";

// Domain order: least personal first, most sensitive last (spec §2).
interface Chapter {
  id: PillarId;
  name: string;
  blurb: string; // one line naming what is coming next
  minutes: number; // rough time, used for "about N minutes left"
  items: number; // questions this chapter asks — used for HONEST progress
}

const CHAPTERS: Chapter[] = [
  { id: "activity", name: "Physical activity", blurb: "how much you move", minutes: 1, items: 7 },
  { id: "sleep", name: "Sleep", blurb: "how well you rest", minutes: 1.5, items: 8 },
  { id: "nutrition", name: "Nutrition", blurb: "how you eat", minutes: 2, items: 13 },
  { id: "social", name: "Social connection", blurb: "the people around you", minutes: 1, items: 6 },
  { id: "stress", name: "Stress", blurb: "how you cope", minutes: 1.5, items: 10 },
  { id: "substances", name: "Alcohol & tobacco", blurb: "a few last questions", minutes: 1, items: 4 },
];

const WARMUP_ITEMS = 2;
const TOTAL_ITEMS = WARMUP_ITEMS + CHAPTERS.reduce((n, c) => n + c.items, 0);

type Stage = "warmup" | "chapter" | "transition" | "done";

export default function UnifiedAssessment({
  onFinish,
  onExit,
  signedIn,
  onRequireAuth,
  hideScores = false,
  onViewHistory,
}: {
  // Product mode: after saving, takes the user to their history of results.
  onViewHistory?: () => void;
  // Doctor group (RQ1): no score is ever shown, so the patient cannot pass it on to the doctor
  // before the doctor's own rating. The between-domain score screens and the final score are skipped.
  hideScores?: boolean;
  onFinish?: (scores: Partial<Record<PillarId, number>>) => void;
  onExit?: () => void;
  // Product mode only: lets the finished score be saved to the signed-in user's history.
  // In study mode onFinish is supplied instead and saving is handled by the study flow.
  signedIn?: boolean;
  onRequireAuth?: () => void;
}) {
  const [stage, setStage] = useState<Stage>("warmup");
  // A signed-in user who has already told us their age band and gender is not asked again.
  // Anonymous study participants have no profile, so they always see the warm-up and the
  // study's demographic data is unaffected.
  const [profileChecked, setProfileChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!signedIn) {
      setProfileChecked(true);
      return;
    }
    getProfile().then((p) => {
      if (cancelled) return;
      if (isProfileComplete(p)) setStage((st) => (st === "warmup" ? "chapter" : st));
      setProfileChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
  const [chapterIndex, setChapterIndex] = usePersistentState<number>("flow.chapter", 0);
  const [scores, setScores] = usePersistentState<Partial<Record<PillarId, number>>>(
    "composite.scores",
    {}
  );
  // Results of clinical concern reported by each chapter, shown on the final screen (FR8).
  const [concerns, setConcerns] = usePersistentState<Partial<Record<PillarId, ConcernId[]>>>(
    "composite.concerns",
    {}
  );
  const [lastScore, setLastScore] = useState<number | null>(null);
  // Position inside the chapter currently on screen, reported up by the chapter itself, so the
  // progress bar advances with every question rather than jumping once per domain.
  const [inChapter, setInChapter] = useState<{ answered: number; total: number }>({
    answered: 0,
    total: 0,
  });
  const [prevComposite, setPrevComposite] = useState<number | null>(null);

  // Hooks must run on every render, so this lives above the early returns below — React counts
  // hooks per render and a conditional one crashes the component.
  const reportProgress = useCallback(
    (answered: number, total: number) => setInChapter({ answered, total }),
    []
  );

  const chapter = CHAPTERS[Math.min(chapterIndex, CHAPTERS.length - 1)];
  const result = computeComposite(scores);

  // HONEST progress: the true share of questions answered so far.
  //
  //  An earlier version showed 15% once the two warm-up questions were done, counting screens rather
  //  than questions. That is a "fast-to-slow" indicator: the meta-analytic evidence says such
  //  indicators do reduce drop-off, but they are also criticised as deceptive, and this platform is a
  //  research instrument whose consent form promises straight dealing with participants. Overstating
  //  progress is not worth the completion it might buy, so the denominator is the real item count.
  const itemsDone =
    WARMUP_ITEMS +
    CHAPTERS.slice(0, chapterIndex).reduce((n, c) => n + c.items, 0) +
    Math.min(inChapter.answered, chapter.items);
  const progress = Math.round((itemsDone / TOTAL_ITEMS) * 100);
  const remaining = CHAPTERS.slice(chapterIndex);
  const minutesLeft = Math.max(1, Math.round(remaining.reduce((m, c) => m + c.minutes, 0)));
  // Goal gradient: switch to explicit proximity for the last two chapters.
  const nearTheEnd = remaining.length > 0 && remaining.length <= 2;

  function finishChapter(id: PillarId, score: number) {
    setPrevComposite(result.composite);
    setLastScore(score);
    const nextScores = { ...scores, [id]: score };
    setScores(nextScores);
    if (!hideScores) {
      setStage("transition");
      return;
    }
    // No score screen: move straight on, and at the end hand the scores over without showing them.
    setInChapter({ answered: 0, total: 0 });
    const next = chapterIndex + 1;
    if (next >= CHAPTERS.length) onFinish?.(nextScores);
    else setChapterIndex(next);
  }

  function continueFromTransition() {
    setInChapter({ answered: 0, total: 0 });
    const next = chapterIndex + 1;
    if (next >= CHAPTERS.length) {
      setStage("done");
    } else {
      setChapterIndex(next);
      setStage("chapter");
    }
  }

  // ---- Warm-up ----
  if (stage === "warmup") {
    // Showing the warm-up and then yanking it away once the profile arrives would be worse than
    // a brief pause, so hold until the lookup settles.
    if (signedIn && !profileChecked) {
      return (
        <div className="card">
          <p className="hint">One moment…</p>
        </div>
      );
    }
    return (
      <WarmUp onDone={() => setStage("chapter")} onExit={onExit} signedIn={signedIn} />
    );
  }

  // ---- Final ----
  if (stage === "done") {
    return (
      <FinalScore
        scores={scores}
        concerns={CONCERN_ORDER.filter((c) => Object.values(concerns).some((list) => list?.includes(c)))}
        onFinish={onFinish}
        signedIn={signedIn}
        onRequireAuth={onRequireAuth}
        onViewHistory={onViewHistory}
        onRestart={() => {
          clearAllDrafts();
          setScores({});
          setConcerns({});
          setChapterIndex(0);
          setStage("warmup");
        }}
      />
    );
  }

  // ---- Chapter transition (the one screen between domains) ----
  if (stage === "transition") {
    const next = CHAPTERS[chapterIndex + 1];
    return (
      <ChapterTransition
        justFinished={chapter}
        score={lastScore ?? 0}
        scores={scores}
        fromComposite={prevComposite}
        toComposite={result.composite ?? 0}
        next={next}
        minutesLeft={Math.max(1, minutesLeft - Math.round(chapter.minutes))}
        onContinue={continueFromTransition}
        onExit={onExit}
      />
    );
  }

  // ---- A chapter ----
  const done = (score: number, found: ConcernId[] = []) => {
    setConcerns({ ...concerns, [chapter.id]: found });
    finishChapter(chapter.id, score);
  };
  return (
    <div className="card">
      <FlowProgress
        percent={progress}
        nearTheEnd={nearTheEnd}
        sectionsLeft={remaining.length}
        minutesLeft={minutesLeft}
      />
      {/* The chapter tag is the screen's h1. In chapter mode the questionnaire's own intro screen
          (which carried the h1 in standalone mode) is skipped, so without this the page would open
          on an h2 with no h1 above it. It looks like a label and reads like a heading, which is
          exactly what it is: "Sleep, question 3 of 8". */}
      <h1 className="chapter-tag">
        {chapter.name}
        {inChapter.total > 0 && (
          <span className="chapter-pos">
            {" · "}
            {Math.min(inChapter.answered + 1, inChapter.total)} of {inChapter.total}
          </span>
        )}
      </h1>

      {chapter.id === "activity" && (
        <PhysicalActivityQuestionnaire chapterMode onComplete={done} onProgress={reportProgress} />
      )}
      {chapter.id === "sleep" && <SleepQuestionnaire chapterMode onComplete={done} onProgress={reportProgress} />}
      {chapter.id === "nutrition" && <NutritionQuestionnaire chapterMode onComplete={done} onProgress={reportProgress} />}
      {chapter.id === "social" && <SocialConnectionQuestionnaire chapterMode onComplete={done} onProgress={reportProgress} />}
      {chapter.id === "stress" && <StressQuestionnaire chapterMode onComplete={done} onProgress={reportProgress} />}
      {chapter.id === "substances" && <SubstancesQuestionnaire chapterMode onComplete={done} onProgress={reportProgress} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FlowProgress({
  percent,
  nearTheEnd,
  sectionsLeft,
  minutesLeft,
}: {
  percent: number;
  nearTheEnd: boolean;
  sectionsLeft: number;
  minutesLeft: number;
}) {
  return (
    <div className="flow-progress">
      <div className="progress" aria-hidden>
        <span style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <p className="flow-progress-label">
        {nearTheEnd
          ? `${sectionsLeft} section${sectionsLeft === 1 ? "" : "s"} left · about ${minutesLeft} minute${
              minutesLeft === 1 ? "" : "s"
            }`
          : `${percent}% complete`}
      </p>
    </div>
  );
}

// Two easy, non-personal questions asked BEFORE the progress bar appears, so the bar can honestly
// start part-filled rather than at zero (endowed progress). These are needed for the analysis
// anyway, so nothing is wasted.
function WarmUp({
  onDone,
  onExit,
  signedIn,
}: {
  onDone: () => void;
  onExit?: () => void;
  signedIn?: boolean;
}) {
  const [age, setAge] = usePersistentState<number | null>("flow.age", null);
  const [gender, setGender] = usePersistentState<number | null>("flow.gender", null);
  const [step, setStep] = useState(0);

  const questions = [
    { q: AGE_QUESTION, options: AGE_OPTIONS, value: age, set: setAge },
    { q: GENDER_QUESTION, options: GENDER_OPTIONS, value: gender, set: setGender },
  ];
  const current = questions[step];

  function choose(i: number) {
    current.set(i);
    const finishing = step === 1;
    // In the study, the end-of-study questions reuse these instead of asking again.
    if (finishing) recordWarmup(age, i);
    if (finishing && signedIn) {
      // Remember these so a returning user is never asked again. Best-effort: a failure here must
      // not block the assessment, it only means the questions are asked again next time.
      // On the finishing step, age is already chosen and `i` is the gender just picked.
      const answers: Profile = {
        ageBand: age != null ? AGE_OPTIONS[age] ?? null : null,
        gender: GENDER_OPTIONS[i] ?? null,
      };
      void saveProfile(answers);
    }
    setTimeout(() => (step === 0 ? setStep(1) : onDone()), prefersReducedMotion() ? 0 : 280);
  }

  return (
    <div className="card">
      <p className="eyebrow">Getting started</p>
      <h1 className="question">{current.q}</h1>
      <ChoiceGroup
        label={current.q}
        options={indexOptions(current.options)}
        value={current.value}
        onChange={choose}
      />
      {onExit && (
        <button className="linkbtn" style={{ marginTop: 12 }} onClick={onExit} type="button">
          ← Back
        </button>
      )}
    </div>
  );
}

// The single screen between chapters, and the reward moment of the whole product. It pays the
// participant first — their domain score, then the running total moving up, then the Bloom with one
// more petal filled — before it asks for anything more.
//
// Deliberately NOT auto-advancing. This screen carries information the participant is meant to
// read, and content that moves on by itself cannot be read at the reader's own pace. WCAG's
// "Pause, Stop, Hide" criterion exists for exactly this. Five extra taps across the assessment is a
// trivial price next to ~50 answers.
function ChapterTransition({
  justFinished,
  score,
  scores,
  fromComposite,
  toComposite,
  next,
  minutesLeft,
  onContinue,
  onExit,
}: {
  justFinished: Chapter;
  score: number;
  scores: Partial<Record<PillarId, number>>;
  fromComposite: number | null;
  toComposite: number;
  next?: Chapter;
  minutesLeft: number;
  onContinue: () => void;
  onExit?: () => void;
}) {
  const rose = fromComposite != null && toComposite > fromComposite;

  return (
    <div className="card chapter-transition">
      {/* One live region for the whole reveal. A screen-reader user hears the score they just
          earned announced, once, instead of silence followed by a changed page. */}
      <div aria-live="polite">
        <p className="eyebrow">{justFinished.name} — done</p>
        <p className={`score-display ${bandOf(score)}`}>{score}</p>
        <p className="score-of">out of 100</p>
      </div>

      <Bloom scores={scores} composite={toComposite} justFilled={justFinished.id} size={168} />

      <div className="running-total">
        <span className="running-label">Your Waypoint score so far</span>
        <span className="running-value">
          {fromComposite != null && <span className="running-prev">{fromComposite}</span>}
          <span className="running-now">{toComposite}</span>
          {rose && (
            <span className="running-arrow" aria-hidden>
              ↑
            </span>
          )}
        </span>
        <span className="running-note">Provisional — it updates as you go.</span>
      </div>

      {next ? (
        <p className="next-up">
          Next: <strong>{next.name}</strong> — {next.blurb}
          <span className="next-time"> · about {minutesLeft} min left</span>
        </p>
      ) : (
        <p className="next-up">That&apos;s everything — let&apos;s see your score.</p>
      )}
      <button className="btn btn-primary" style={{ width: "100%", marginTop: 18 }} onClick={onContinue}>
        {next ? "Keep going" : "See my score"}
      </button>

      {/* Leaving is offered only outside the study. Every answer is already saved and this is the
          natural stopping point, but putting an exit on the reward screen of the STUDY arm would
          push the completion rate the study is trying to measure. */}
      {onExit && next && (
        <button className="linkbtn leave-link" onClick={onExit} type="button">
          Finish here for now — your answers are saved
        </button>
      )}
    </div>
  );
}

// Final reveal, with a short count-up — the one moment worth savouring.
function FinalScore({
  scores,
  concerns = [],
  onFinish,
  onRestart,
  signedIn,
  onRequireAuth,
  onViewHistory,
}: {
  scores: Partial<Record<PillarId, number>>;
  concerns?: ConcernId[];
  onFinish?: (scores: Partial<Record<PillarId, number>>) => void;
  onRestart: () => void;
  signedIn?: boolean;
  onRequireAuth?: () => void;
  onViewHistory?: () => void;
}) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const r = computeComposite(scores);
  const target = r.composite ?? 0;
  const [shown, setShown] = useState(prefersReducedMotion() ? target : 0);

  useEffect(() => {
    if (prefersReducedMotion()) return setShown(target);
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNTUP_MS);
      // ease-out so it decelerates into the final number
      setShown(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // The count-up is decoration; the number is the result. A backgrounded tab throttles frames to
    // a crawl, so if this unmounts (or the effect re-runs) mid-count the final value is written
    // outright rather than left stranded at whatever frame it reached.
    return () => {
      cancelAnimationFrame(raf);
      setShown(target);
    };
  }, [target]);

  async function handleSave() {
    if (!signedIn) return onRequireAuth?.();
    setSaveState("saving");
    const { error } = await saveAssessment(r.composite, scores, WEIGHTING_LABEL);
    setSaveState(error ? "error" : "saved");
  }

  // Plain facts only: the highest and lowest area. No verdict words, since no instrument defines one.
  const ranked = PILLARS_META.filter((p) => typeof scores[p.id] === "number").sort(
    (a, b) => (scores[b.id] as number) - (scores[a.id] as number)
  );
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];
  const nextDate = nextCheckInDate();
  const nextLabel = nextDate.toLocaleDateString(undefined, { day: "numeric", month: "long" });

  return (
    <div className="card card-wide">
      <div className="result-layout">
        <div className="result-head">
          <p className="eyebrow">All six areas complete</p>
          <h1 className="question">Your Waypoint score</h1>
          {/* The composite lives in the middle of the Bloom, so the object that has been filling up
              all the way through is the same object that finally answers the question. */}
          <Bloom scores={scores} composite={shown} size={224} />
          {/* The count-up is shown, never announced: a live region on a number that ticks ~50 times
              would read out every intermediate value. The screen-reader user gets the result once,
              already settled, from the Bloom's own label and this line. */}
          <p className="band" aria-hidden>
            {shown} out of 100
          </p>
          <p className="visually-hidden" aria-live="polite">
            {`Your Waypoint score is ${target} out of 100, from all six areas.`}
          </p>
        </div>

        <div>
          <p className="section-label">Your six areas</p>
          <BloomLegend scores={scores} />
          {strongest && weakest && strongest.id !== weakest.id && (
            <div className="stats">
              <div className="stat">
                <span>Highest area</span>
                <b>
                  {strongest.label} · {Math.round(scores[strongest.id] as number)}
                </b>
              </div>
              <div className="stat">
                <span>Most room to improve</span>
                <b>
                  {weakest.label} · {Math.round(scores[weakest.id] as number)}
                </b>
              </div>
            </div>
          )}
          {concerns.length > 0 && (
            <div role="status">
              <p className="section-label">Worth talking to a doctor about</p>
              {concerns.map((c) => (
                <p className="note note-warn" key={c}>
                  {CONCERN_TEXT[c]}
                </p>
              ))}
            </div>
          )}
          <p className="note">
            A wellbeing screen, not a diagnosis. Areas are weighted by how strongly each is linked to
            health outcomes, so higher-impact areas count for more. If anything here worries you,
            please speak to a doctor or health worker.
          </p>
        </div>
      </div>

      {saveState === "saved" && (
        <div className="retake-card" role="status">
          <p className="retake-title">Saved. Your next check-in: {nextLabel}</p>
          <p className="hint">
            Habits take a few weeks to show a real change, so Waypoint compares results at least 28
            days apart. Check in again around {nextLabel} to see which areas are moving.
          </p>
          <div className="actions">
            <button
              className="btn btn-ghost"
              onClick={() => downloadCheckIn(nextDate, window.location.origin)}
            >
              Add to my calendar
            </button>
            {onViewHistory && (
              <button className="btn btn-primary" onClick={onViewHistory}>
                See my history
              </button>
            )}
          </div>
        </div>
      )}

      {onFinish ? (
        // Study mode. On a phone the results stack into one long column, so a Continue button at
        // the end sat below the fold and participants left at the score without reaching the
        // usability questions, which is also when the session is saved. The bar is sticky so it
        // stays on screen, and it says plainly that one step is left. "Start again" is not offered
        // here: restarting mid-study would discard the participant's answers.
        <div className="study-next">
          <p className="study-next-text">
            <b>One last step.</b> A few quick questions about how this felt. Your answers are saved
            after them.
          </p>
          <button className="btn btn-primary" onClick={() => onFinish(scores)}>
            Continue
          </button>
        </div>
      ) : (
        <div className="actions">
          <button className="btn btn-ghost" onClick={onRestart}>
            Start again
          </button>
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
        </div>
      )}
      {saveState === "error" && (
        <p className="note note-warn">
          Your score didn&apos;t save. Check your connection and press Save again — it is still on
          this device.
        </p>
      )}
    </div>
  );
}
