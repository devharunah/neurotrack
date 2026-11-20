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
      {
        // The brain model's file name carries a content hash (tools/brain-pipeline), so a
        // changed model gets a new URL and the old one can be cached for good.
        source: "/models/:file(brain\\.[0-9a-f]{10}\\.glb)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
