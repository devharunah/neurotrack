/**
 * Security headers for every route. Pure, so `next.config.ts` can import it and Jest can test it.
 *
 * CSP strategy: the "without nonces" policy from Next's CSP guide
 * (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md). Nonces would force
 * every page into dynamic rendering; `'unsafe-inline'` scripts are needed for Next's inline RSC
 * payload without them. `'unsafe-eval'` is development-only (React's dev tooling uses eval);
 * neither React, Next nor three.js need it in production.
 */

export interface SecurityHeaderOptions {
  /** `NEXT_PUBLIC_SUPABASE_URL`, read at build time. Added to `connect-src` (https and wss). */
  supabaseUrl?: string;
  /** `NODE_ENV === "development"`. Allows eval and drops HSTS. */
  isDev: boolean;
}

export interface Header {
  key: string;
  value: string;
}

/** Origins of the Supabase project, or none if the URL is missing or malformed. */
export function supabaseOrigins(supabaseUrl: string | undefined): string[] {
  if (!supabaseUrl) return [];
  let url: URL;
  try {
    url = new URL(supabaseUrl);
  } catch {
    return [];
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return [];
  const socket = url.protocol === "https:" ? "wss:" : "ws:";
  return [url.origin, `${socket}//${url.host}`];
}

export function buildCsp({ supabaseUrl, isDev }: SecurityHeaderOptions): string {
  const supabase = supabaseOrigins(supabaseUrl);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'wasm-unsafe-eval' lets WebAssembly compile (the meshopt decoder for the NeuroLab brain
    // model). It does not permit JS eval(); that stays dev-only for React's tooling.
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // Recharts and React `style` props write inline styles.
    "style-src": ["'self'", "'unsafe-inline'"],
    // three.js textures and canvases use blob: and data: URLs.
    "img-src": ["'self'", "blob:", "data:", ...supabase.slice(0, 1)],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...supabase],
    // three.js / drei helpers spin up workers from blob: URLs.
    "worker-src": ["'self'", "blob:"],
    "media-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
    "manifest-src": ["'self'"],
  };
  // No `upgrade-insecure-requests`: it also upgrades same-origin redirects, so `next start` over
  // plain http (local production checks, the Playwright suite) failed whenever the proxy
  // redirected to /login. Production is https-only through the host's redirect plus HSTS, and
  // no page loads http: subresources, so the directive added nothing there.
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions): Header[] {
  const headers: Header[] = [
    { key: "Content-Security-Policy", value: buildCsp(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Legacy companion to frame-ancestors for older browsers.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (!options.isDev) {
    // No `preload`: that is a request to be hard-coded into browsers for the whole registrable
    // domain, which only the domain's owner should opt into deliberately (hstspreload.org).
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }
  return headers;
}
