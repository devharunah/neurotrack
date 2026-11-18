export function Disclaimer({ children }: { children?: React.ReactNode }) {
  return (
    <p
      role="note"
      className="rounded-lg border border-amber-200 bg-warn-soft px-4 py-3 text-sm leading-6 text-warn"
    >
      <strong className="font-semibold">Educational and experimental.</strong>{" "}
      {children ??
        "NeuroTrack is a research and learning tool. It does not diagnose, predict relapse, recommend treatment or measure brain activity."}
    </p>
  );
}
