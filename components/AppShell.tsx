"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getHistory, AssessmentRow } from "@/lib/db";
import { PILLARS_META } from "@/lib/composite";
import Landing from "@/components/Landing";
import StudyFlow from "@/components/StudyFlow";
import UnifiedAssessment from "@/components/UnifiedAssessment";
import { buildHistory, ageLabel, dueForRetake, domainChanges } from "@/lib/history";
import { displayNameFromEmail } from "@/lib/profile";

type Screen = "home" | "app" | "auth" | "history" | "study" | "newpass";

export default function AppShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>("home");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // Arriving from a password-reset email: ask for the new password before anything else.
      if (event === "PASSWORD_RECOVERY") setScreen("newpass");
    });
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
          {screen === "history" && (
            <HistoryScreen
              onBack={() => setScreen("home")}
              email={session?.user?.email ?? null}
              accessToken={session?.access_token ?? null}
              onDeleted={() => { supabase.auth.signOut(); setScreen("home"); }}
            />
          )}
          {screen === "newpass" && <NewPasswordScreen onDone={() => setScreen("home")} />}
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
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgKind, setMsgKind] = useState<"error" | "info">("info");

  async function submit() {
    setBusy(true);
    setMsg(null);
    if (mode === "forgot") {
      // The link brings the user back here; AppShell sees PASSWORD_RECOVERY and asks for a new password.
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      setBusy(false);
      setMsgKind(error ? "error" : "info");
      // Same wording whether or not the email has an account, so the form cannot be used to find accounts.
      setMsg(error ? `${error.message} Please try again in a minute.` : "If an account exists for that email, a reset link is on its way. Check your inbox.");
      return;
    }
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
      <h1 className="question">{mode === "in" ? "Sign in" : mode === "up" ? "Create your account" : "Reset your password"}</h1>
      <p className="hint">
        {mode === "forgot"
          ? "Enter your email and we will send you a link to choose a new password."
          : "Save your scores and track them over time. We store only your assessment data, kept private to your account."}
      </p>

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
      {mode !== "forgot" && (
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
      )}

      {/* One live region, always in the DOM. A message inserted into a region that only appears
          when there is one is often missed by screen readers — the region has to exist first. */}
      <div aria-live="polite">
        {msg && <p className={`note ${msgKind === "error" ? "note-warn" : ""}`}>{msg}</p>}
      </div>

      <div className="actions">
        <button className="btn btn-ghost" onClick={onBack}>Back</button>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={busy || !email || (mode !== "forgot" && !password)}
        >
          {busy ? "…" : mode === "in" ? "Sign in" : mode === "up" ? "Sign up" : "Send reset link"}
        </button>
      </div>
      <button
        className="linkbtn"
        style={{ marginTop: 12 }}
        onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}
      >
        {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
      {mode === "in" && (
        <button className="linkbtn" onClick={() => { setMode("forgot"); setMsg(null); }}>
          Forgot your password?
        </button>
      )}
      <p className="note">This is a wellbeing screen, not a medical diagnosis.</p>
    </div>
  );
}

function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    if (password.length < 6) return setMsg("Use at least 6 characters.");
    if (password !== again) return setMsg("The two passwords do not match. Type the same password twice.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setMsg(`${error.message} Open the reset link from your email again and retry.`);
    else setDone(true);
  }

  return (
    <div className="card">
      <p className="eyebrow">Waypoint</p>
      <h1 className="question">Choose a new password</h1>
      {done ? (
        <>
          <p className="hint">Your password has been changed and you are signed in.</p>
          <div className="actions">
            <button className="btn btn-primary" onClick={onDone}>Continue</button>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label className="visually-hidden" htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="visually-hidden" htmlFor="new-password-again">New password again</label>
            <input
              id="new-password-again"
              type="password"
              autoComplete="new-password"
              placeholder="New password again"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
          </div>
          <div aria-live="polite">{msg && <p className="note note-warn">{msg}</p>}</div>
          <div className="actions">
            <button className="btn btn-primary" onClick={save} disabled={busy || !password || !again}>
              {busy ? "…" : "Save new password"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function HistoryScreen({
  onBack,
  email,
  accessToken,
  onDeleted,
}: {
  onBack: () => void;
  email: string | null;
  accessToken: string | null;
  onDeleted: () => void;
}) {
  const [rows, setRows] = useState<AssessmentRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

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
  // The check-in the user tapped (newest by default) and the one before it, for the six-area view.
  const at = Math.min(picked, Math.max(views.length - 1, 0));
  const current = views[at];
  const before = views[at + 1];
  const areas = current ? domainChanges(current, before, PILLARS_META.map((p) => p.id)) : null;
  const moved = areas ? areas.rows.filter((r) => r.meaningful) : [];
  const labelOf = (id: string) => PILLARS_META.find((p) => p.id === id)?.label ?? id;

  async function deleteAccount() {
    if (!accessToken) return;
    setDeleting(true);
    setDeleteErr(null);
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => null);
    setDeleting(false);
    if (res && res.ok) onDeleted();
    else setDeleteErr("We could not delete your account just now. Check your connection and try again.");
  }

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

          <p className="section-label">Every check-in · tap one to see its six areas</p>
          <ul className="stats">
            {views.map((v, i) => (
              <li key={v.id}>
                <button
                  type="button"
                  className="stat stat-pick"
                  aria-pressed={i === at}
                  onClick={() => setPicked(i)}
                >
                  <span>
                    {v.monthLabel}
                    {v.change && !v.change.comparable && (
                      <span className="too-soon"> · too soon to compare</span>
                    )}
                  </span>
                  <b className={`hist-score ${v.composite != null ? tone(v.composite) : ""}`}>
                    {v.composite != null ? `${v.composite}/100` : "—"}
                  </b>
                </button>
              </li>
            ))}
          </ul>

          {current && areas && (
            <>
              <p className="section-label">
                Your six areas · {current.monthLabel}
                {before ? ` · compared with ${before.shortLabel}` : ""}
              </p>
              <div className="stats">
                {PILLARS_META.map((p) => {
                  const r = areas.rows.find((x) => x.id === p.id)!;
                  return (
                    <div className="stat" key={p.id}>
                      <span>{p.label}</span>
                      <b className={`hist-score ${r.score != null ? tone(r.score) : ""}`}>
                        {r.score ?? "—"}
                        {r.meaningful && r.delta != null && (
                          <span className={`area-change ${r.delta > 0 ? "up" : "down"}`}>
                            {r.delta > 0 ? ` ▲ +${r.delta}` : ` ▼ ${r.delta}`}
                          </span>
                        )}
                      </b>
                    </div>
                  );
                })}
              </div>
              <p className="note">
                {!before
                  ? "This is your first check-in, so there is nothing to compare it with yet."
                  : !areas.comparable
                    ? "These two check-ins are less than 28 days apart, so no area is marked as changed."
                    : moved.length === 0
                      ? "No area changed by more than its natural variation since the check-in before."
                      : `Changed since the check-in before: ${moved
                          .map((m) => labelOf(m.id).toLowerCase())
                          .join(", ")}. Smaller differences are within each questionnaire's natural variation.`}
              </p>
            </>
          )}

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

      <p className="section-label">Your account</p>
      {email && <p className="hint">Signed in as {email}</p>}
      {!confirmDelete ? (
        <button className="linkbtn linkbtn-danger" onClick={() => setConfirmDelete(true)}>
          Delete my account and data
        </button>
      ) : (
        <div className="note note-warn" role="group" aria-label="Confirm account deletion">
          <p>This permanently deletes your account and every saved check-in. It cannot be undone.</p>
          <div className="actions">
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Keep my account
            </button>
            <button className="btn btn-primary" onClick={deleteAccount} disabled={deleting || !accessToken}>
              {deleting ? "Deleting…" : "Yes, delete everything"}
            </button>
          </div>
          <div aria-live="polite">{deleteErr && <p>{deleteErr}</p>}</div>
        </div>
      )}
    </div>
  );
}
