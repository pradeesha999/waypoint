// Profile — age band and gender, remembered once for a signed-in user.
//
//  A returning user should not be asked their age group and gender every single month. Anonymous
//  study participants are unaffected: they have no account, so they still answer both in the
//  warm-up, and the study's demographic data is unchanged.

import { supabase } from "@/lib/supabase";

export interface Profile {
  ageBand: string | null;
  gender: string | null;
}

export const emptyProfile: Profile = { ageBand: null, gender: null };

export function isProfileComplete(p: Profile | null): boolean {
  return !!p && !!p.ageBand && !!p.gender;
}

// Returns null when signed out, when no row exists yet, or on any error — every caller treats a
// null profile the same way (ask the questions), so failure degrades to the normal path.
export async function getProfile(): Promise<Profile | null> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("age_band, gender")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error || !data) return null;
    return { ageBand: data.age_band ?? null, gender: data.gender ?? null };
  } catch {
    return null;
  }
}

export async function saveProfile(p: Profile): Promise<{ error: unknown | null }> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: "not signed in" };
    const { error } = await supabase.from("profiles").upsert(
      {
        user_id: auth.user.id,
        age_band: p.ageBand,
        gender: p.gender,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    return { error: error ?? null };
  } catch (error) {
    return { error };
  }
}

// A short greeting name from the account email — "pradeesha@x.com" becomes "Pradeesha".
// Purely cosmetic; falls back to nothing rather than showing a raw address.
export function displayNameFromEmail(email?: string | null): string | null {
  if (!email) return null;
  const local = email.split("@")[0];
  if (!local) return null;
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
