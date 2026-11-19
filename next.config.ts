import type { NextConfig } from "next";

import { securityHeaders } from "./src/lib/security/headers";

// Build-time reads. `requireEnv` would fail CI builds that run without Supabase secrets; with no
// URL the CSP simply has no Supabase origin in connect-src. NODE_ENV is set by Next itself.
const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const isDev = process.env["NODE_ENV"] === "development";

const nextConfig: NextConfig = {
  // Generates route types into .next/types, so a typo in a `Link href` or a
  // `router.push` is a compile error rather than a 404 someone finds later.
  typedRoutes: true,
  // No `X-Powered-By: Next.js` fingerprint.
  poweredByHeader: false,
  experimental: {
    // Types the environment variables the dev server loaded, which gives
    // `requireEnv` callers real completions instead of a bare string.
    typedEnv: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({ isDev, ...(supabaseUrl ? { supabaseUrl } : {}) }),
      },
    ];
  },
};

export default nextConfig;
