"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** All 2^n outcomes for small circuits so zero-probability states are visible; observed only above. */
function outcomes(numQubits: number, observed: string[]): string[] {
  if (numQubits <= 5) {
    return Array.from({ length: 2 ** numQubits }, (_, i) => i.toString(2).padStart(numQubits, "0"));
  }
  return [...new Set(observed)].sort();
}

export function Histogram({
  numQubits,
  ideal,
  noisy,
}: {
  numQubits: number;
  ideal: Record<string, number>;
  noisy: Record<string, number> | null;
}) {
  const keys = outcomes(numQubits, [...Object.keys(ideal), ...Object.keys(noisy ?? {})]);
  const data = keys.map((key) => ({
    outcome: key,
    ideal: ideal[key] ?? 0,
    ...(noisy ? { noisy: noisy[key] ?? 0 } : {}),
  }));

  return (
    <div className="h-72 w-full" data-testid="histogram">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e6ec" />
          <XAxis dataKey="outcome" tick={{ fontFamily: "monospace", fontSize: 12 }} />
          <YAxis
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            domain={[0, 1]}
            width={44}
            tick={{ fontSize: 12 }}
          />
          <Tooltip formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} />
          {noisy && <Legend />}
          <Bar dataKey="ideal" name="Ideal" fill="#6d28d9" radius={[4, 4, 0, 0]} />
          {noisy && <Bar dataKey="noisy" name="With noise" fill="#f59e0b" radius={[4, 4, 0, 0]} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
