// Admin statistics endpoint.
//
//  The public client can insert study sessions but, by row-level security, cannot read them back.
//  This route is the one place they are read: server-side only, with the service-role key, behind
//  the researcher's password. Both secrets are set in the hosting environment and never shipped to
//  the browser. It returns aggregates and anonymous value lists (see summariseStudy); the only per-person
//  rows are Group A codes with the doctor's rating beside the Waypoint score, for the researcher. Item
//  answers are read only to compute Cronbach's alpha here on the server and are not returned.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { RatingRow, StudyRow, summariseStudy } from "@/lib/adminStats";
import { passwordMatches } from "@/lib/passwordMatch";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!expected || !serviceKey || !url) {
    return NextResponse.json({ error: "Admin access is not configured yet." }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { password?: unknown; since?: unknown };
  if (typeof body.password !== "string" || !passwordMatches(body.password, expected)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  let query = db
    .from("study_sessions")
    .select("participant_id, arm, created_at, composite, scores, measures, metrics, items");
  // Records before recruitment began (test runs) can be left out by giving a start date.
  if (typeof body.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.since)) {
    query = query.gte("created_at", body.since);
  }

  const [{ data, error }, ratingsRes] = await Promise.all([
    query,
    db.from("clinic_patients").select("code, created_at, overall, familiarity, rated_at, activity, sleep, nutrition, stress, social, substances, domain_scale"),
  ]);
  if (error) {
    return NextResponse.json({ error: "Could not read the study data." }, { status: 500 });
  }
  // Ratings are optional for the dashboard: if the table is unreadable, show the rest.
  const ratings = (ratingsRes.error ? [] : ratingsRes.data ?? []) as RatingRow[];
  return NextResponse.json(summariseStudy((data ?? []) as StudyRow[], ratings));
}
