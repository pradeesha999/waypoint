"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getHistory, AssessmentRow } from "@/lib/db";
import { PILLARS_META } from "@/lib/composite";
import Landing from "@/components/Landing";
import StudyFlow from "@/components/StudyFlow";
import UnifiedAssessment from "@/components/UnifiedAssessment";
import { buildHistory, ageLabel, dueForRetake } from "@/lib/history";
import { displayNameFromEmail } from "@/lib/profile";

type Screen = "home" | "app" | "auth" | "history" | "study";

export default function AppShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>("home");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Participants reach the study with ?study=1 — a single link to share when recruiting.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("study")) {
      setScreen("study");
    }
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setScreen("home");
  };

  return (
    <div>
      <header className="topbar">
        {/* translate="no" — machine translation turns a product name into a common noun, and a
            participant who came for "Waypoint" then cannot find it. */}
        <button className="brand" translate="no" onClick={() => setScreen("home")}>
          Waypoint
        </button>
        {session?.user?.email && (
          <span className="greeting">
            Hi, {displayNameFromEmail(session.user.email) ?? "there"}
          </span>
        )}
        <div className="topbar-actions">
          {screen !== "app" && (
            <button className="linkbtn topbar-link" onClick={() => setScreen("app")}>
              Start assessment
            </button>
          )}
          {session ? (
            <>
              <button className="linkbtn topbar-link" onClick={() => setScreen("history")}>History</button>
              <button className="linkbtn topbar-link" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <button className="linkbtn topbar-link" onClick={() => setScreen("auth")}>Sign in</button>
          )}
        </div>
      </header>

      {screen === "home" ? (
        <Landing
          onStart={() => setScreen("app")}
          onSignIn={() => setScreen("auth")}
          signedIn={!!session}
        />
      ) : (
        <main className="screen" id="main">
          {screen === "study" && <StudyFlow onExit={() => setScreen("home")} />}
          {screen === "auth" && <AuthScreen onBack={() => setScreen("home")} />}
          {screen === "history" && <HistoryScreen onBack={() => setScreen("home")} />}
          {screen === "app" && (
            <UnifiedAssessment
              onExit={() => setScreen("home")}
              signedIn={!!session}
              onRequireAuth={() => setScreen("auth")}
              onViewHistory={() => setScreen("history")}
            />
          )}
        </main>
      )}
    </div>
  );
}

function AuthScreen({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<"error" | "info">("info");

  async function submit() {
    setBusy(true);
    setMsg(null);
    const fn =
      mode === "in"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { data, error } = await fn;
    setBusy(false);
    if (error) {
      setMsgKind("error");
      // Errors say what happened and what to do next. Supabase's own wording covers the first half
      // only, so the next step is appended rather than replacing a message we don't control.
      setMsg(`${error.message} Check your email and password, then try again.`);
    } else if (mode === "up" && !data.session) {
      // Only when the project requires email confirmation; otherwise sign-up signs the user in.
      setMsgKind("info");
      setMsg("Check your email to confirm your account, then come back and sign in.");
    } else onBack();
  }

  return (
    <div className="card">
      <p className="eyebrow">Waypoint</p>
      <h1 className="question">{mode === "in" ? "Sign in" : "Create your account"}</h1>
      <p className="hint">Save your scores and track them over time. We store only your assessment data, kept private to your account.</p>

      {/* Real labels, not placeholder-as-label: a placeholder disappears the moment someone starts
          typing, which is exactly when a person who has been interrupted needs to know what the
          field was for. Correct `type`, `inputMode` and `autocomplete` let the phone offer the
          right keyboard and the password manager fill it. Spellcheck off — an email is not prose,
          and the red squiggle reads as an error. */}
      <div className="field">
        <label className="visually-hidden" htmlFor="auth-email">
          Email address
        </label>
        <input
          id="auth-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          autoCapitalize="none"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="visually-hidden" htmlFor="auth-password">
          Password
        </label>
        <input
          id="auth-password"
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          spellCheck={false}
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {/* One live region, always in the DOM. A message inserted into a region that only appears
          when there is one is often missed by screen readers — the region has to exist first. */}
      <div aria-live="polite">
        {msg && <p className={`note ${msgKind === "error" ? "note-warn" : ""}`}>{msg}</p>}
      </div>

      <div className="actions">
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy || !email || !password}>
          {busy ? "…" : mode === "in" ? "Sign in" : "Sign up"}
        </button>
      </div>
      <button
        className="linkbtn"
        style={{ marginTop: 12 }}
        onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}
      >
        {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
      <p className="note">This is a wellbeing screen, not a medical diagnosis.</p>
    </div>
  );
}

function HistoryScreen({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<AssessmentRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getHistory().then(setRows).catch((e) => setErr(e.message ?? "Could not load history"));
  }, []);

  const tone = (s: number) => (s >= 70 ? "" : s >= 40 ? "mid" : "low");

  const views =
    rows && rows.length > 0
      ? buildHistory(
          rows.map((r) => ({
            id: r.id,
            createdAt: r.created_at,
            composite: r.composite,
            scores: r.scores,
          }))
        )
      : [];
  const latest = views[0];

  return (
    <div className="card">
      <p className="eyebrow">Waypoint</p>
      <h1 className="question">Your check-ins</h1>

      {err && (
        <p className="note note-warn">
          We couldn&apos;t load your check-ins just now. Please check your connection and try again.
        </p>
      )}
      {!rows && !err && <p className="hint">Loading your check-ins…</p>}

      {rows && rows.length === 0 && (
        <div className="empty-state">
          <div className="empty-gauge" aria-hidden />
          <h2 className="empty-title">No check-ins saved yet</h2>
          <p className="hint">
            Take your first check-in and your score will appear here, so you can watch it change
            from month to month.
          </p>
          <div className="actions">
            <button className="btn btn-primary" onClick={onBack}>
              Take your first check-in
            </button>
          </div>
        </div>
      )}

      {latest && (
        <>
          <div className="result-head">
            <div
              className={`gauge ${latest.composite != null ? tone(latest.composite) : ""}`}
              style={{ ["--val" as any]: latest.composite ?? 0 }}
            >
              <div className="gauge-inner">
                <div className="gauge-score">{latest.composite ?? "—"}</div>
                <div className="gauge-of">out of 100</div>
              </div>
            </div>
            <div className="band">
              {latest.monthLabel} · {ageLabel(latest.daysAgo)}
            </div>
            {latest.change && (
              <p
                className={`change-pill ${
                  latest.change.meaningful ? (latest.change.delta > 0 ? "up" : "down") : "flat"
                }`}
              >
                {latest.change.label}
              </p>
            )}
          </div>

          {dueForRetake(latest) && (
            <div className="retake-card">
              <p className="retake-title">Ready for a fresh check-in?</p>
              <p className="hint">
                Your last one was {ageLabel(latest.daysAgo).toLowerCase()}. Enough time has passed
                for your score to have genuinely moved.
              </p>
              <button className="btn btn-primary" onClick={onBack}>
                Start a new check-in
              </button>
            </div>
          )}

          <p className="section-label">Every check-in</p>
          <div className="stats">
            {views.map((v) => (
              <div className="stat" key={v.id}>
                <span>
                  {v.monthLabel}
                  {v.change && !v.change.comparable && (
                    <span className="too-soon"> · too soon to compare</span>
                  )}
                </span>
                <b className={`hist-score ${v.composite != null ? tone(v.composite) : ""}`}>
                  {v.composite != null ? `${v.composite}/100` : "—"}
                </b>
              </div>
            ))}
          </div>

          <p className="note">
            A change is only reported when enough time has passed for your score to move, and when
            it is larger than the natural variation of the questionnaires. Smaller differences are
            shown as no meaningful change.
          </p>
        </>
      )}

      <div className="actions">
        <button className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
