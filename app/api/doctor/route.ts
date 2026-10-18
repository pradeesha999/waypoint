// Doctor endpoint for Group A (RQ1).
//
//  Behind the doctor's password, with the service-role key held in the hosting environment. It can
//  create a patient code, list the codes made so far, and save a rating against a code. It never
//  reads study_sessions, so the doctor cannot see any patient's score: the rating stays blind.

import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { passwordMatches } from "@/lib/passwordMatch";
import { CODE_ALPHABET, CODE_LENGTH, isValidCode, normaliseCode, validateRating } from "@/lib/clinic";

export const dynamic = "force-dynamic";

function newCode(): string {
  let c = "";
  for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return c;
}

export async function POST(req: Request) {
  const expected = process.env.DOCTOR_PASSWORD;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!expected || !serviceKey || !url) {
    return NextResponse.json({ error: "Doctor access is not configured yet." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.password !== "string" || !passwordMatches(body.password, expected)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  if (body.action === "new") {
    // A clash is very unlikely (31^6 codes), but retry rather than fail if one happens.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      const { error } = await db.from("clinic_patients").insert({ code });
      if (!error) return NextResponse.json({ code });
    }
    return NextResponse.json({ error: "Could not create a code. Try again." }, { status: 500 });
  }

  if (body.action === "list") {
    const { data, error } = await db
      .from("clinic_patients")
      .select("code, created_at, rated_at, domain_scale")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: "Could not load patients." }, { status: 500 });
    return NextResponse.json({
      patients: (data ?? []).map((r) => ({
        code: r.code,
        createdAt: r.created_at,
        ratedAt: r.rated_at,
        domainScale: r.domain_scale,
      })),
    });
  }

  if (body.action === "rate") {
    const code = typeof body.code === "string" ? normaliseCode(body.code) : "";
    const rating = validateRating(body.rating);
    if (!isValidCode(code) || !rating) {
      return NextResponse.json({ error: "The rating is incomplete." }, { status: 400 });
    }
    const { data, error } = await db
      .from("clinic_patients")
      .update({
        overall: rating.overall,
        familiarity: rating.familiarity,
        activity: rating.domains.activity ?? null,
        sleep: rating.domains.sleep ?? null,
        nutrition: rating.domains.nutrition ?? null,
        stress: rating.domains.stress ?? null,
        social: rating.domains.social ?? null,
        substances: rating.domains.substances ?? null,
        domain_scale: "0-10",
        rated_at: new Date().toISOString(),
      })
      .eq("code", code)
      .select("code");
    if (error) return NextResponse.json({ error: "Could not save the rating." }, { status: 500 });
    if (!data || data.length === 0) return NextResponse.json({ error: "Unknown code." }, { status: 404 });
    return NextResponse.json({ saved: true });
  }

  return NextResponse.json({ error: "Unknown request." }, { status: 400 });
}
