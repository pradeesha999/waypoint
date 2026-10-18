"use client";

import PillarIcon from "@/components/PillarIcon";
import Bloom from "@/components/Bloom";
import { PillarId } from "@/lib/composite";

const PILLARS: { id: PillarId; name: string; line: string }[] = [
  { id: "activity", name: "Physical activity", line: "How much you move" },
  { id: "sleep", name: "Restorative sleep", line: "How well you rest" },
  { id: "nutrition", name: "Nutrition", line: "How you eat" },
  { id: "social", name: "Social connection", line: "Your support network" },
  { id: "stress", name: "Stress", line: "How you cope" },
  { id: "substances", name: "Alcohol & tobacco", line: "What you drink and smoke" },
];

// A worked example, not a real result. Shown pre-filled so someone arriving by QR code can see the
// thing they are being offered before deciding whether to spend eight minutes on it — the same
// component they will meet on every reveal screen, not an illustration of it.
const PREVIEW: Partial<Record<PillarId, number>> = {
  activity: 74,
  sleep: 61,
  nutrition: 83,
  social: 52,
};

export default function Landing({
  onStart,
  onSignIn,
  signedIn,
}: {
  onStart: () => void;
  onSignIn: () => void;
  signedIn: boolean;
}) {
  return (
    <div className="landing" id="main">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Waypoint</p>
          <h1 className="hero-title">Six short check-ins. One picture of your health.</h1>
          <p className="hero-tagline">
            A waypoint is where you stop and check your position. This is that, for your health.
          </p>
          <p className="hero-sub">
            You answer a few questions about how you sleep, move, eat and feel. After each one you
            get a score straight away — so you don&apos;t have to finish everything to get something
            useful out of it.
          </p>
          <div className="hero-cta">
            <button className="btn btn-primary hero-btn" onClick={onStart}>
              Start my first check-in
            </button>
            {!signedIn && (
              <button className="btn btn-ghost hero-btn" onClick={onSignIn}>
                Sign in
              </button>
            )}
          </div>
          <p className="hero-note">
            No account needed to start · about 8 minutes · a wellbeing screen, not a diagnosis
          </p>
        </div>

        <div className="hero-bloom">
          <Bloom scores={PREVIEW} composite={68} size={236} decorative />
          <p className="hero-bloom-caption">
            One petal for each area. They fill in as you answer.
          </p>
        </div>
      </section>

      <h2 className="section-label">What gets measured</h2>
      <section className="pillar-grid">
        {PILLARS.map((p) => (
          <div className="pillar-card" key={p.name}>
            <span className="pillar-icon" aria-hidden>
              <PillarIcon id={p.id} />
            </span>
            <span className="pillar-name">{p.name}</span>
            <span className="pillar-line">{p.line}</span>
          </div>
        ))}
      </section>

      <h2 className="section-label">How it works</h2>
      <section className="steps">
        <div className="step">
          <span className="step-n" aria-hidden>
            1
          </span>
          <span className="step-t">
            Answer one question at a time. One tap each — nothing to type, nothing to work out.
          </span>
        </div>
        <div className="step">
          <span className="step-n" aria-hidden>
            2
          </span>
          <span className="step-t">
            Get a 0–100 score the moment you finish each area, explained in plain words.
          </span>
        </div>
        <div className="step">
          <span className="step-n" aria-hidden>
            3
          </span>
          <span className="step-t">
            Stop whenever you like. Your answers are kept on this device, so you can pick up later.
          </span>
        </div>
      </section>

      <div className="landing-cta">
        <button className="btn btn-primary hero-btn" onClick={onStart}>
          Start my first check-in
        </button>
      </div>
    </div>
  );
}
