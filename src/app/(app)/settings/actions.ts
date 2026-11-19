"use server";

import { revalidatePath } from "next/cache";

import { deleteAllExperiments, updateDisplayName } from "@/lib/account";
import { deleteHistorySchema, displayNameSchema } from "@/lib/account/schema";
import { getSessionUser } from "@/lib/auth";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function updateDisplayNameAction(
  raw: unknown,
): Promise<ActionResult<{ displayName: string }>> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: "You need to be signed in." };
  }
  const parsed = displayNameSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid display name." };
  }
  if (!(await updateDisplayName(user.id, parsed.data))) {
    return { ok: false, error: "Could not save your display name. Please try again." };
  }
  revalidatePath("/settings");
  return { ok: true, data: { displayName: parsed.data } };
}

export async function deleteHistoryAction(
  raw: unknown,
): Promise<ActionResult<{ deleted: number }>> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, error: "You need to be signed in." };
  }
  const parsed = deleteHistorySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Confirmation required." };
  }
  const deleted = await deleteAllExperiments(user.id);
  if (deleted === null) {
    return { ok: false, error: "Could not delete your history. Nothing was removed." };
  }
  // Every lab page and the dashboard list experiments.
  revalidatePath("/", "layout");
  return { ok: true, data: { deleted } };
}
