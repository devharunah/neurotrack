import type { NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { buildStudyExport } from "@/lib/behaviour/export";
import { getStudy, loadStudyData } from "@/lib/behaviour/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const plain = (message: string, status: number) =>
  new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

/**
 * Researcher-only, pseudonymous CSV export. RLS decides membership: a non-member cannot read
 * the study, so `getStudy` returns null and the request is refused. Every export is logged in
 * `export_audit` (through the `log_study_export` RPC) before any data is sent; if the log cannot be
 * written, nothing is exported.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/behaviour/studies/[studyId]/export">,
) {
  if (!(await getSessionUser())) {
    return plain("You need to be signed in.", 401);
  }
  const { studyId } = await ctx.params;
  const study = await getStudy(studyId);
  if (!study) {
    return plain("Study not found, or you are not a researcher on it.", 404);
  }

  let data: Awaited<ReturnType<typeof loadStudyData>>;
  try {
    data = await loadStudyData(study.id);
  } catch {
    return plain("Could not read the study data.", 500);
  }
  if (data.truncated) {
    return plain("This study is too large to export in one file.", 413);
  }

  const now = new Date();
  const result = buildStudyExport({
    title: study.title,
    synthetic: study.synthetic,
    questionnaire: study.questionnaire,
    timeZone: study.schedule.timezone,
    participants: data.participants,
    observations: data.observations,
    now,
  });

  // The database counts the rows it logs (`log_study_export`); clients cannot write the audit
  // table directly. A check-in saved between the read above and this call can make the logged
  // count differ from the file by a row or two; the log is the authoritative record.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("log_study_export", { p_study_id: study.id });
  if (error) {
    return plain("The export could not be logged, so it was not created.", 500);
  }

  return new Response(result.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-NeuroTrack-Data": study.synthetic ? "synthetic" : "pseudonymous",
    },
  });
}
