import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LabModule = "quantum" | "neuro" | "behaviour" | "research";

export interface ExperimentRow {
  id: string;
  module: LabModule;
  kind: string;
  title: string | null;
  config: unknown;
  result: unknown;
  created_at: string;
}

export async function saveExperiment(input: {
  module: LabModule;
  kind: string;
  title?: string;
  config: unknown;
  result: unknown;
}): Promise<{ id: string } | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("experiments")
    .insert({
      module: input.module,
      kind: input.kind,
      title: input.title ?? null,
      config: input.config,
      result: input.result,
    })
    .select("id")
    .single<{ id: string }>();
  return error ? null : data;
}

export async function listExperiments(module?: LabModule, limit = 10): Promise<ExperimentRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("experiments")
    .select("id, module, kind, title, config, result, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (module) {
    query = query.eq("module", module);
  }
  const { data, error } = await query.returns<ExperimentRow[]>();
  return error || !data ? [] : data;
}
