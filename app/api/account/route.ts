// Deletes the signed-in user's account and everything stored against it.
//
//  The caller proves who they are with their own access token; the service key then deletes that user
//  only. assessments and profiles reference auth.users with ON DELETE CASCADE, so removing the user
//  removes their check-ins and profile in the same step. Study records are anonymous and never linked
//  to an account, so nothing here touches them.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const del = await admin.auth.admin.deleteUser(data.user.id);
  if (del.error) return NextResponse.json({ error: "Could not delete the account." }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
