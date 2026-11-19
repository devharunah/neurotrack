import { z } from "zod";

// Runs before any application code in the browser (Next.js `instrumentation-client` convention).
// Zod 4 probes for `new Function` support when an object schema is created so it can compile a
// faster parser. Under our CSP (no 'unsafe-eval' in production) the probe is refused: harmless,
// because Zod catches it, but every page using a schema logged a CSP violation. Turning the JIT
// off skips the probe; client-side schemas are small, so the speed difference is negligible.
z.config({ jitless: true });
