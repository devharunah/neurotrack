// Streamed while a lab page's server work (auth, Supabase reads) finishes. Sits inside the
// (app) layout, so the sidebar stays put and only the content area shows the skeleton.
export default function AppLoading() {
  return (
    <div className="max-w-5xl animate-pulse space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-md bg-line" />
        <div className="h-4 w-80 max-w-full rounded-md bg-line" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["a", "b", "c"].map((key) => (
          <div key={key} className="h-28 rounded-2xl border border-line bg-card" />
        ))}
      </div>
      <div className="h-64 rounded-2xl border border-line bg-card" />
    </div>
  );
}
