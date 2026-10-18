import { createClient } from "@supabase/supabase-js";

// Client-side Supabase client. Uses the public URL + publishable (anon) key — both safe to expose.
// The DB password / service-role key are NEVER used here.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
