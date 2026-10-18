"use client";

// Doctor's page for Group A (RQ1). Creates a code for each patient and records the doctor's own
// rating of that patient's lifestyle health. It never shows a Waypoint score, so the rating stays
// blind. The password is held in memory for this visit only; closing the tab locks the page.

import { useState } from "react";
import ChoiceGroup, { ChoiceOption } from "@/components/ChoiceGroup";
import { PILLARS_META, PillarId } from "@/lib/composite";
import { ClinicPatient } from "@/lib/clinic";

const OVERALL: ChoiceOption[] = Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) }));
const FAMILIAR: ChoiceOption[] = [
  { value: 1, label: "1 Hardly at all" },
  { value: 2, label: "2 A little" },
  { value: 3, label: "3 Moderately" },
  { value: 4, label: "4 Well" },
  { value: 5, label: "5 Very well" },
];

type View = { kind: "list" } | { kind: "new"; code: string } | { kind: "rate"; code: string };

export default function DoctorPage() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [patients, setPatients] = useState<ClinicPatient[]>([]);
  const [view, setView] = useState<View>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/doctor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, ...body }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
    return json;
  }

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const json = await call({ action: "list" });
      setPatients(json.patients);
      setUnlocked(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function newPatient() {
    setBusy(true);
    setError(null);
    try {
      const json = await call({ action: "new" });
      setView({ kind: "new", code: json.code });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const studyLink = typeof window === "undefined" ? "" : `${window.location.origin}/?study=clinic`;
  const when = (iso: string) => new Date(iso).toLocaleString();

  if (!unlocked)
    return (
      <main className="screen">
        <div className="card">
          <p className="eyebrow">Doctor</p>
          <h1 className="question">Patient codes and ratings</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              refresh();
            }}
          >
            <label className="section-label" htmlFor="doctor-password">
              Password
            </label>
            <div className="field">
              <input
                id="doctor-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="note note-warn">{error}</p>}
            <button className="btn btn-primary" type="submit" disabled={!password || busy}>
              {busy ? "Opening…" : "Open"}
            </button>
          </form>
        </div>
      </main>
    );

  if (view.kind === "rate")
    return (
      <main className="screen">
        <RatingForm
          code={view.code}
          onSave={async (rating) => {
            await call({ action: "rate", code: view.code, rating });
            setView({ kind: "list" });
            await refresh();
          }}
          onCancel={() => setView({ kind: "list" })}
        />
      </main>
    );

  return (
    <main className="screen">
      <div className="card">
        <p className="eyebrow">Doctor</p>
        <h1 className="question">Patient codes and ratings</h1>

        {view.kind === "new" && (
          <div className="result-head">
            <p className="section-label">New patient code</p>
            <p className="band">{view.code}</p>
            <p className="hint">
              Give this code to the patient. They open {studyLink} on their phone and enter it. Then
              rate the patient below from your own knowledge.
            </p>
            <div className="actions">
              <button className="btn btn-primary" onClick={() => setView({ kind: "rate", code: view.code })}>
                Rate this patient
              </button>
            </div>
          </div>
        )}

        <div className="actions">
          <button className="btn btn-primary" onClick={newPatient} disabled={busy}>
            {busy ? "Working…" : "New patient"}
          </button>
          <button className="btn btn-ghost" onClick={refresh} disabled={busy}>
            Refresh
          </button>
        </div>
        {error && <p className="note note-warn">{error}</p>}

        <p className="section-label">Patients ({patients.length})</p>
        <div className="stats">
          {patients.length === 0 && (
            <div className="stat">
              <span>No patients yet</span>
              <b>—</b>
            </div>
          )}
          {patients.map((p) => (
            <div className="stat" key={p.code}>
              <span>
                {p.code} · {when(p.createdAt)}
              </span>
              {p.ratedAt ? (
                <b>Rated</b>
              ) : (
                <button className="linkbtn" onClick={() => setView({ kind: "rate", code: p.code })}>
                  Rate
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="note">Waypoint scores are never shown here, so your rating stays independent of them.</p>
      </div>
    </main>
  );
}

function RatingForm({
  code,
  onSave,
  onCancel,
}: {
  code: string;
  onSave: (rating: { overall: number; domains: Partial<Record<PillarId, number>>; familiarity: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [overall, setOverall] = useState<number | null>(null);
  const [familiarity, setFamiliarity] = useState<number | null>(null);
  const [domains, setDomains] = useState<Partial<Record<PillarId, number>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (overall == null || familiarity == null) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ overall, domains, familiarity });
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <p className="eyebrow">Patient {code}</p>
      <h1 className="question">Your rating of this patient</h1>
      <p className="note">
        Rate from your own clinical knowledge of this patient. Do not ask the Waypoint questions to
        decide your rating.
      </p>

      <p className="section-label">1. Overall lifestyle health (required)</p>
      <p className="hint">0 = very unhealthy lifestyle, 10 = very healthy lifestyle</p>
      <ChoiceGroup label="Overall lifestyle health, 0 to 10" options={OVERALL} value={overall} onChange={setOverall} variant="chips" />

      <p className="section-label">2. Each area (optional, leave blank if unsure)</p>
      <p className="hint">In every area, 0 = least healthy and 10 = healthiest.</p>
      {PILLARS_META.map((p) => (
        <div key={p.id}>
          <p className="hint">
            {p.label}
            {/* A doctor once scored a non-user 0 ("uses nothing"); 10 is the healthy end here (D46). */}
            {p.id === "substances" && " - 10 = uses no tobacco or alcohol, 0 = heavy use"}
          </p>
          <ChoiceGroup
            label={`${p.label}, 0 to 10`}
            options={OVERALL}
            value={domains[p.id] ?? null}
            onChange={(v) => setDomains((d) => ({ ...d, [p.id]: v }))}
            variant="chips"
          />
        </div>
      ))}

      <p className="section-label">3. How well do you know this patient&apos;s lifestyle? (required)</p>
      <ChoiceGroup label="How well you know this patient's lifestyle, 1 to 5" options={FAMILIAR} value={familiarity} onChange={setFamiliarity} variant="chips" />

      {error && <p className="note note-warn">{error}</p>}
      <div className="actions">
        <button className="btn btn-primary" onClick={save} disabled={overall == null || familiarity == null || saving}>
          {saving ? "Saving…" : "Save rating"}
        </button>
        <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>
          Back
        </button>
      </div>
    </div>
  );
}
