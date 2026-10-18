// Group A (doctor comparison, RQ1): patient codes and the doctor's rating.
//
//  The doctor creates a code for each patient, the patient enters it in Waypoint, and the doctor
//  rates the same code without ever seeing the patient's score. The code is the only link between
//  the two records, so no name is needed anywhere.
//
//  Pure functions only, so the same validation runs in the browser and on the server.

import { PillarId } from "@/lib/composite";

// No I, L, O, 0 or 1: they are easy to misread when a code is copied from one screen to another.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && code.split("").every((c) => CODE_ALPHABET.includes(c));
}

export interface DoctorRating {
  overall: number; // 0-10, overall lifestyle health
  domains: Partial<Record<PillarId, number>>; // optional, 0-10 each (1-5 before 2026-10-11, see domainScale)
  familiarity: number; // 1-5, how well the doctor knows this patient's lifestyle
}

export interface ClinicPatient {
  code: string;
  createdAt: string;
  ratedAt: string | null;
  // "1-5" for areas rated before the scale changed to 0-10 (2026-10-11, at the doctor's request).
  domainScale: string | null;
}

export const DOMAIN_IDS: PillarId[] = ["activity", "sleep", "nutrition", "stress", "social", "substances"];

const intIn = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

// Returns a clean rating, or null if anything is missing or out of range.
export function validateRating(x: unknown): DoctorRating | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  if (!intIn(r.overall, 0, 10) || !intIn(r.familiarity, 1, 5)) return null;
  const domainsIn = (r.domains ?? {}) as Record<string, unknown>;
  const domains: Partial<Record<PillarId, number>> = {};
  for (const id of DOMAIN_IDS) {
    const v = domainsIn[id];
    if (v == null) continue;
    if (!intIn(v, 0, 10)) return null;
    domains[id] = v;
  }
  return { overall: r.overall, domains, familiarity: r.familiarity };
}
