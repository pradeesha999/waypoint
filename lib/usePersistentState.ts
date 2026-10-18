"use client";

// Autosave / resume.
//
//  Answers previously lived only in React state, so a refresh, an incoming call, or a stray back
//  button destroyed the whole assessment. For the evaluation study that is worse than a UX bug: the
//  person becomes a dropout caused by a DEFECT rather than by friction, which contaminates the
//  completion measure RQ2 compares between arms.
//
//  This hook behaves like useState but mirrors the value to localStorage on every change and
//  restores it on mount, so progress survives a reload.
//
//  SSR note: the first render must match the server output, so the stored value is applied in an
//  effect after mount rather than during render. `hydrated` reports when that has happened.

import { Dispatch, SetStateAction, useEffect, useState } from "react";

const PREFIX = "waypoint.draft.";

const isBrowser = () => typeof window !== "undefined";

export function usePersistentState<T>(
  key: string,
  initial: T
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const storageKey = PREFIX + key;
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // corrupt or unavailable storage — fall back to the initial value
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // storage full or blocked — never break the questionnaire over this
    }
  }, [storageKey, value, hydrated]);

  return [value, setValue, hydrated];
}

// Clear one saved draft (used by "Start again").
export function clearDraft(key: string) {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

// Clear every saved draft. Called when a new study participant consents, so one participant can
// never inherit a previous person's in-progress answers on a shared device.
export function clearAllDrafts() {
  if (!isBrowser()) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

// True if any pillar has a part-finished draft (used to offer "continue where you left off").
export function hasAnyDraft(): boolean {
  if (!isBrowser()) return false;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX) && k.endsWith(".index")) {
        const raw = window.localStorage.getItem(k);
        if (raw && Number(JSON.parse(raw)) > 0) return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}
