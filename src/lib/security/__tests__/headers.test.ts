import { buildCsp, securityHeaders, supabaseOrigins } from "../headers";

const SUPABASE = "https://abcd.supabase.co";

function header(list: { key: string; value: string }[], key: string): string | undefined {
  return list.find((h) => h.key === key)?.value;
}

describe("supabaseOrigins", () => {
  it("returns the https origin and its websocket twin", () => {
    expect(supabaseOrigins(`${SUPABASE}/`)).toEqual([SUPABASE, "wss://abcd.supabase.co"]);
  });

  it("maps a local http project to ws", () => {
    expect(supabaseOrigins("http://127.0.0.1:54321")).toEqual([
      "http://127.0.0.1:54321",
      "ws://127.0.0.1:54321",
    ]);
  });

  it("ignores missing or malformed values", () => {
    expect(supabaseOrigins(undefined)).toEqual([]);
    expect(supabaseOrigins("not a url")).toEqual([]);
    expect(supabaseOrigins("javascript:alert(1)")).toEqual([]);
  });
});

describe("buildCsp", () => {
  it("allows Supabase in connect-src and never eval in production", () => {
    const csp = buildCsp({ supabaseUrl: SUPABASE, isDev: false });
    expect(csp).toContain(`connect-src 'self' ${SUPABASE} wss://abcd.supabase.co`);
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("worker-src 'self' blob:");
    // Breaks `next start` over http (same-origin redirects get upgraded); HSTS covers https.
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("allows eval only in development", () => {
    const csp = buildCsp({ isDev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self';");
  });
});

describe("securityHeaders", () => {
  it("sends HSTS in production only", () => {
    expect(header(securityHeaders({ isDev: false }), "Strict-Transport-Security")).toMatch(
      /max-age=\d+/,
    );
    expect(header(securityHeaders({ isDev: true }), "Strict-Transport-Security")).toBeUndefined();
  });

  it("includes the baseline headers", () => {
    const list = securityHeaders({ supabaseUrl: SUPABASE, isDev: false });
    expect(header(list, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(list, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header(list, "Permissions-Policy")).toContain("camera=()");
    expect(header(list, "Content-Security-Policy")).toContain("frame-ancestors 'none'");
  });
});
