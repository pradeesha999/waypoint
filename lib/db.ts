import { supabase } from "@/lib/supabase";
import { PillarId } from "@/lib/composite";

export interface AssessmentRow {
  id: string;
  created_at: string;
  composite: number | null;
  scores: Partial<Record<PillarId, number>>;
  weighting: string | null;
}

// Save one completed assessment for the signed-in user. RLS + a default of auth.uid() set user_id.
export async function saveAssessment(
  composite: number | null,
  scores: Partial<Record<PillarId, number>>,
  weighting: string
) {
  return supabase.from("assessments").insert({ composite, scores, weighting });
}

// Fetch the signed-in user's past assessments, newest first.
export async function getHistory(): Promise<AssessmentRow[]> {
  const { data, error } = await supabase
    .from("assessments")
    .select("id, created_at, composite, scores, weighting")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AssessmentRow[];
}
