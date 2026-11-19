import { z } from "zod";

/** Matches the `char_length(display_name) <= 80` check on `public.profiles`. */
export const DISPLAY_NAME_MAX = 80;

/** The phrase a user types to confirm deleting all their experiment history. */
export const DELETE_CONFIRMATION = "DELETE";

// Control characters (C0, DEL, C1) and bidi overrides would make a name render misleadingly.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/;

export const displayNameSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Enter a display name.")
      .max(DISPLAY_NAME_MAX, `Keep it to ${DISPLAY_NAME_MAX} characters or fewer.`)
      .refine((value) => !UNSAFE_CHARS.test(value), "Remove the control characters."),
  );

export const deleteHistorySchema = z.object({
  confirmation: z.literal(DELETE_CONFIRMATION, {
    error: `Type ${DELETE_CONFIRMATION} to confirm.`,
  }),
});

/** File name for the JSON export, e.g. `neurotrack-export-2026-11-19.json`. */
export function exportFileName(now: Date): string {
  return `neurotrack-export-${now.toISOString().slice(0, 10)}.json`;
}
