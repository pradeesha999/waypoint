// History: month labels, and when a comparison between two check-ins is actually meaningful.
//
//  Two separate ideas, deliberately kept apart:
//
//   1. HOW A CHECK-IN IS LABELLED — by month ("January 2026"), because that is how people think
//      about tracking something monthly.
//   2. WHETHER TWO CHECK-INS CAN BE COMPARED — decided by the ACTUAL DAYS between them, never by
//      the label. Someone who checks in on 28 January and again on 3 February is six days apart,
//      not a month; labelling alone would imply a real change where none can exist.
//
//  Why 28 days: the instruments ask about the last 7 days (activity), the last 2 weeks (sleep) and
//  the last month (stress, diet). The longest of those bounds how quickly the composite can
//  genuinely move — a repeat sooner than that re-interrogates largely the same period.
//
//  Pure functions with no browser or database dependency, so they can be unit-tested and reused
//  when the study data is analysed.

import { PillarId } from "@/lib/composite";

export const MIN_COMPARISON_DAYS = 28;

// Smallest change we are willing to call a change.
//
//  Every questionnaire has natural wobble, and reporting movement smaller than that wobble would
//  tell the user something untrue. The figure comes from this study's own test–retest data
//  (D54; Analysis/run_analysis.py, rq1.retest):
//
//      SEM   = SD × √(1 − ICC)   = 10.34 × √(1 − 0.881) = 3.57
//      MDC95 = 1.96 × √2 × SEM   = 9.9, rounded to 10
//
//  SD is the spread of the composite across Group B; ICC is the 7-day retest (10 pairs).
export const MIN_MEANINGFUL_CHANGE = 10;

export interface CheckIn {
  id: string;
  createdAt: string; // ISO
  composite: number | null;
  scores: Partial<Record<PillarId, number>>;
}

export interface CheckInView extends CheckIn {
  monthLabel: string; // "January 2026"
  shortLabel: string; // "Jan"
  daysAgo: number;
  // Comparison with the PREVIOUS check-in, or null when there isn't one.
  change: {
    delta: number;
    daysSincePrevious: number;
    comparable: boolean; // enough time elapsed for a change to be possible at all
    meaningful: boolean; // comparable AND larger than measurement error
    label: string; // what to actually show the user
  } | null;
}

// Dates are formatted by Intl, not by a hardcoded English month table. A participant whose phone
// is set to Sinhala or Tamil sees the month in their own language, and the format follows their
// locale's conventions rather than ours. `undefined` as the locale means "whatever the browser is
// set to" — the right default, since nothing here is locale-specific to the study.
const LONG_MONTH = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const SHORT_MONTH = new Intl.DateTimeFormat(undefined, { month: "short" });

export function daysBetween(a: string | Date, b: string | Date): number {
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  return Math.floor(Math.abs(t2 - t1) / 86_400_000);
}

export function monthLabel(iso: string): string {
  return LONG_MONTH.format(new Date(iso));
}

export function shortMonthLabel(iso: string): string {
  return SHORT_MONTH.format(new Date(iso));
}

// Build the display model. `rows` may be in any order; the result is newest first.
export function buildHistory(rows: CheckIn[], now: Date = new Date()): CheckInView[] {
  const sorted = [...rows].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return sorted.map((row, i) => {
    const previous = sorted[i + 1]; // the next one down is older
    let change: CheckInView["change"] = null;

    if (previous && row.composite != null && previous.composite != null) {
      const delta = row.composite - previous.composite;
      const gap = daysBetween(previous.createdAt, row.createdAt);
      const comparable = gap >= MIN_COMPARISON_DAYS;
      const meaningful = comparable && Math.abs(delta) >= MIN_MEANINGFUL_CHANGE;

      let label: string;
      if (!comparable) {
        label = `Taken ${gap} ${gap === 1 ? "day" : "days"} after the last one — too soon to compare`;
      } else if (!meaningful) {
        label = "No meaningful change";
      } else {
        label = `${delta > 0 ? "+" : ""}${delta} since ${shortMonthLabel(previous.createdAt)}`;
      }

      change = { delta, daysSincePrevious: gap, comparable, meaningful, label };
    }

    return {
      ...row,
      monthLabel: monthLabel(row.createdAt),
      shortLabel: shortMonthLabel(row.createdAt),
      daysAgo: daysBetween(row.createdAt, now.toISOString()),
      change,
    };
  });
}

// Is the most recent check-in old enough that a fresh one would be worth taking?
export function dueForRetake(latest: CheckInView | undefined): boolean {
  return !!latest && latest.daysAgo >= MIN_COMPARISON_DAYS;
}

// Plain-English age of a score, for the results and history screens.
export function ageLabel(daysAgo: number): string {
  if (daysAgo <= 0) return "Taken today";
  if (daysAgo === 1) return "1 day old";
  if (daysAgo < 30) return `${daysAgo} days old`;
  const months = Math.floor(daysAgo / 30);
  return months === 1 ? "About a month old" : `About ${months} months old`;
}
