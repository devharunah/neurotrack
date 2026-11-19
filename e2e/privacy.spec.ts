import { expect, test } from "@playwright/test";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";

/**
 * Row-level security, checked against the real Supabase project with two real users.
 *
 * Talks to PostgREST directly through @supabase/supabase-js (no browser), exactly as someone
 * holding a valid session token could. Skipped unless all of these are set in the environment
 * running Playwright:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 *   E2E_USER_EMAIL, E2E_USER_PASSWORD (user A), E2E_USER2_EMAIL, E2E_USER2_PASSWORD (user B).
 * Use two dedicated test accounts. Every row the spec creates is deleted again.
 */
const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
const userA = { email: process.env["E2E_USER_EMAIL"], password: process.env["E2E_USER_PASSWORD"] };
const userB = {
  email: process.env["E2E_USER2_EMAIL"],
  password: process.env["E2E_USER2_PASSWORD"],
};

const configured = Boolean(
  url && key && userA.email && userA.password && userB.email && userB.password,
);

async function signedInClient(credentials: {
  email?: string | undefined;
  password?: string | undefined;
}): Promise<{ client: SupabaseClient; id: string }> {
  const client = createClient(url ?? "", key ?? "", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: credentials.email ?? "",
    password: credentials.password ?? "",
  });
  expect(error, error?.message).toBeNull();
  const id = data.user?.id;
  expect(id).toBeTruthy();
  return { client, id: id ?? "" };
}

test.describe("row-level security between two users", () => {
  test.skip(!configured, "Set the Supabase URL/key and both E2E users' credentials to run");
  test.describe.configure({ mode: "serial" });

  let a: { client: SupabaseClient; id: string };
  let b: { client: SupabaseClient; id: string };
  let experimentId = "";
  let queryId = "";
  let displayNameA: string | null = null;

  test.beforeAll(async () => {
    a = await signedInClient(userA);
    b = await signedInClient(userB);
    expect(a.id).not.toBe(b.id);

    const { data: profile, error: profileError } = await a.client
      .from("profiles")
      .select("display_name")
      .eq("id", a.id)
      .single<{ display_name: string | null }>();
    expect(profileError).toBeNull();
    displayNameA = profile?.display_name ?? null;

    const { data: experiment, error } = await a.client
      .from("experiments")
      .insert({
        module: "quantum",
        kind: "e2e-privacy",
        title: "RLS probe (E2E)",
        config: { probe: true },
        result: { probe: true },
      })
      .select("id")
      .single<{ id: string }>();
    expect(error, error?.message).toBeNull();
    experimentId = experiment?.id ?? "";

    const { data: query, error: queryError } = await a.client
      .from("research_queries")
      .insert({ query: "rls probe (e2e)", mode: "search" })
      .select("id")
      .single<{ id: string }>();
    expect(queryError, queryError?.message).toBeNull();
    queryId = query?.id ?? "";
  });

  test.afterAll(async () => {
    if (!a) return;
    if (experimentId) await a.client.from("experiments").delete().eq("id", experimentId);
    if (queryId) await a.client.from("research_queries").delete().eq("id", queryId);
    await a.client.auth.signOut();
    await b?.client.auth.signOut();
  });

  test("user B cannot read, change or delete user A's experiments", async () => {
    const read = await b.client.from("experiments").select("id").eq("id", experimentId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const byOwner = await b.client.from("experiments").select("id").eq("user_id", a.id);
    expect(byOwner.data).toEqual([]);

    // There is no update policy on experiments at all, so this changes nothing for anyone.
    const update = await b.client
      .from("experiments")
      .update({ title: "tampered" })
      .eq("id", experimentId)
      .select("id");
    expect(update.data ?? []).toEqual([]);

    const remove = await b.client
      .from("experiments")
      .delete({ count: "exact" })
      .eq("id", experimentId);
    expect(remove.count ?? 0).toBe(0);

    // Nor can B write a row that claims to be A's.
    const forged = await b.client.from("experiments").insert({
      user_id: a.id,
      module: "quantum",
      kind: "e2e-privacy",
      config: {},
      result: {},
    });
    expect(forged.error).not.toBeNull();

    const stillThere = await a.client
      .from("experiments")
      .select("id, title")
      .eq("id", experimentId)
      .single<{ id: string; title: string | null }>();
    expect(stillThere.error).toBeNull();
    expect(stillThere.data?.title).toBe("RLS probe (E2E)");
  });

  test("user B cannot read, change or delete user A's profile", async () => {
    const read = await b.client.from("profiles").select("id, display_name").eq("id", a.id);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const update = await b.client
      .from("profiles")
      .update({ display_name: "tampered" })
      .eq("id", a.id)
      .select("id");
    expect(update.data ?? []).toEqual([]);

    // No delete policy on profiles: a delete matches nothing, even for the owner's own row.
    const remove = await b.client.from("profiles").delete({ count: "exact" }).eq("id", a.id);
    expect(remove.count ?? 0).toBe(0);

    const mine = await a.client
      .from("profiles")
      .select("display_name")
      .eq("id", a.id)
      .single<{ display_name: string | null }>();
    expect(mine.data?.display_name ?? null).toBe(displayNameA);
  });

  test("neither user can change their own role", async () => {
    for (const user of [a, b]) {
      const before = await user.client
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single<{ role: string }>();
      expect(before.error).toBeNull();

      // Only display_name has an UPDATE grant, so Postgres refuses the statement outright.
      const escalate = await user.client
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", user.id)
        .select("role");
      expect(escalate.error).not.toBeNull();

      const after = await user.client
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single<{ role: string }>();
      expect(after.data?.role).toBe(before.data?.role);
    }
  });

  test("user B cannot see user A's research history or study links", async () => {
    const queries = await b.client.from("research_queries").select("id").eq("id", queryId);
    expect(queries.error).toBeNull();
    expect(queries.data).toEqual([]);

    const saved = await b.client.from("saved_references").select("id").eq("user_id", a.id);
    expect(saved.data ?? []).toEqual([]);

    const links = await b.client
      .from("participant_links")
      .select("participant_id")
      .eq("user_id", a.id);
    expect(links.data ?? []).toEqual([]);

    // The join-attempt log is internal to the database: no client can read it, even their own.
    const attempts = await b.client.from("join_attempts").select("id").eq("user_id", b.id);
    expect(attempts.error).not.toBeNull();
  });
});
