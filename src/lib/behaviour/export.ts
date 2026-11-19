/** Builds the pseudonymous CSV export of a study. Pure: the Route Handler does the I/O. */
import { type CsvValue, slugify, toCsv } from "./csv";
import type { ObservationRecord, ParticipantRecord } from "./records";
import type { Questionnaire } from "./schemas";
import { toZonedIso } from "./time";

/** Byte-order mark, so spreadsheet software opens the file as UTF-8. */
export const BOM = String.fromCharCode(0xfeff);

export interface StudyExport {
  csv: string;
  rowCount: number;
  filename: string;
}

export function buildStudyExport(input: {
  title: string;
  synthetic: boolean;
  questionnaire: Questionnaire;
  timeZone: string;
  participants: readonly ParticipantRecord[];
  observations: readonly ObservationRecord[];
  now: Date;
}): StudyExport {
  const byId = new Map(input.participants.map((p) => [p.id, p]));
  const custom = input.questionnaire.custom;
  const header = [
    "pseudonym",
    "synthetic",
    "observed_at_utc",
    "observed_at_local",
    "mood",
    "stress",
    "sleep_quality",
    "craving_intensity",
    "environment",
    "social_context",
    "substance_use",
    ...custom.map((q) => `custom_${q.id}`),
  ];

  const rows: CsvValue[][] = [];
  for (const o of input.observations) {
    const participant = byId.get(o.participant_id);
    if (!participant) {
      continue;
    }
    const at = new Date(o.observed_at);
    rows.push([
      participant.pseudonym,
      participant.synthetic,
      at.toISOString(),
      toZonedIso(at, input.timeZone),
      o.mood,
      o.stress,
      o.sleep_quality,
      o.craving_intensity,
      o.environment,
      o.social_context,
      o.substance_use,
      ...custom.map((q) => {
        const value = o.answers[q.id];
        return typeof value === "number" || typeof value === "string" ? value : null;
      }),
    ]);
  }

  const date = input.now.toISOString().slice(0, 10);
  const kind = input.synthetic ? "synthetic" : "pseudonymous";
  return {
    csv: `${BOM}${toCsv(header, rows)}`,
    rowCount: rows.length,
    filename: `${slugify(input.title)}-${kind}-${date}.csv`,
  };
}
