import "server-only";

import type { components } from "@/lib/api/schema";
import { getAccessToken } from "@/lib/auth";
import { requireEnv } from "@/lib/env";

export type RunRequest = components["schemas"]["RunRequest"];
export type RunResult = components["schemas"]["RunResult"];
export type Preset = components["schemas"]["Preset"];
export type QmlCompareRequest = components["schemas"]["QmlCompareRequest"];
export type QmlCompareResult = components["schemas"]["QmlCompareResult"];
export type BehaviourRowsRequest = components["schemas"]["RowsRequest"];
export type BehaviourObservationRow = components["schemas"]["ObservationRow"];
export type AssociationsRequest = components["schemas"]["AssociationsRequest"];
export type AssociationsResult = components["schemas"]["AssociationsResult"];
export type Association = components["schemas"]["Association"];
export type BehaviourSummary = components["schemas"]["SummaryResult"];

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function call<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (init.auth !== false) {
    const token = await getAccessToken();
    if (!token) {
      throw new ApiError("You need to be signed in.", 401);
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${requireEnv("NEUROTRACK_API_URL")}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      "The NeuroTrack API is not reachable. Start it with `pnpm dev:api` and check NEUROTRACK_API_URL.",
      503,
    );
  }

  if (!response.ok) {
    throw new ApiError(await describeError(response), response.status);
  }
  return (await response.json()) as T;
}

async function describeError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === "string") {
        return detail;
      }
      if (Array.isArray(detail)) {
        return detail
          .map((item: { msg?: string }) => item.msg ?? "Invalid input")
          .join("; ");
      }
    }
  } catch {
    // Fall through to the generic message.
  }
  return `API request failed with status ${response.status}`;
}

export const api = {
  presets: () => call<Preset[]>("/quantum/presets", { auth: false }),
  runCircuit: (body: RunRequest) =>
    call<RunResult>("/quantum/run", { method: "POST", body: JSON.stringify(body) }),
  qmlCompare: (body: QmlCompareRequest) =>
    call<QmlCompareResult>("/quantum/qml/compare", { method: "POST", body: JSON.stringify(body) }),
  behaviourAssociations: (body: AssociationsRequest) =>
    call<AssociationsResult>("/behaviour/associations", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  behaviourSummary: (body: BehaviourRowsRequest) =>
    call<BehaviourSummary>("/behaviour/summary", { method: "POST", body: JSON.stringify(body) }),
};
