// Checks a patient code before a Group A participant starts.
//
//  Answers only whether the code exists and is still unused, so a typing mistake is caught before the
//  patient's answers are recorded under a code the doctor never issued, and one code can never carry two
//  patients (each code matches one doctor's rating). Nothing else about the code is returned.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isValidCode, normaliseCode } from "@/lib/clinic";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? normaliseCode(body.code) : "";
  if (!isValidCode(code)) return NextResponse.json({ valid: false });

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const [issued, finished] = await Promise.all([
    db.from("clinic_patients").select("code").eq("code", code).limit(1),
    db.from("study_sessions").select("id").like("participant_id", `clinic-${code}-%`).eq("metrics->>event", "complete").limit(1),
  ]);
  if (issued.error || finished.error) {
    return NextResponse.json({ error: "Could not check the code." }, { status: 500 });
  }
  if ((issued.data ?? []).length === 0) return NextResponse.json({ valid: false });
  if ((finished.data ?? []).length > 0) return NextResponse.json({ valid: false, used: true });
  return NextResponse.json({ valid: true });
}
