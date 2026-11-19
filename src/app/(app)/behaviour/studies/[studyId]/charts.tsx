"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { type DashboardData, MIN_CELL } from "@/lib/behaviour/analytics";

/** Validated with the dataviz palette checker on a white surface (CVD ΔE ≥ 30). */
const COLORS = {
  primary: "#b45309",
  mood: "#2563eb",
  stress: "#c2410c",
  muted: "#d5dae1",
  grid: "#e2e6ec",
  axis: "#6b7789",
} as const;

const tick = { fontSize: 12, fill: COLORS.axis };
const shortDate = (key: unknown) => {
  const [, month, day] = String(key).split("-");
  return `${day}/${month}`;
};

function ChartFrame({
  title,
  caption,
  synthetic,
  testId,
  children,
  table,
}: {
  title: string;
  caption: string;
  synthetic: boolean;
  testId: string;
  children: React.ReactNode;
  table: { headers: string[]; rows: (string | number)[][] };
}) {
  return (
    <figure className="min-w-0 rounded-2xl border border-line bg-card p-4" data-testid={testId}>
      <figcaption>
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {title}
          {synthetic && (
            <span className="rounded bg-behaviour-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-behaviour">
              synthetic
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-muted">{caption}</p>
      </figcaption>
      <div className="mt-3 h-60 w-full">{children}</div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted">Show data</summary>
        <div className="mt-2 max-h-48 overflow-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-muted">
              <tr>
                {table.headers.map((h) => (
                  <th key={h} className="py-1 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={String(row[0])} className="border-t border-line">
                  {row.map((cell, i) => (
                    <td key={table.headers[i]} className="py-1 pr-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

const dash = (v: number | null) => (v === null ? "–" : v);

export function StudyCharts({ data, synthetic }: { data: DashboardData; synthetic: boolean }) {
  const hasMoodOrStress = data.days.some((d) => d.mood !== null || d.stress !== null);
  const hasCraving = data.craving.some((c) => c.count > 0);
  const answered = (points: DashboardData["environment"]) =>
    points.some((p) => p.key !== "unanswered" && p.count > 0);

  return (
    <section aria-labelledby="charts-heading" className="space-y-4">
      <h2 id="charts-heading" className="text-lg font-semibold">
        Descriptive dashboard
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          testId="chart-frequency"
          title="Observations per day"
          caption="Number of check-ins on each local study day."
          synthetic={synthetic}
          table={{
            headers: ["Day", "Observations"],
            rows: data.days.map((d) => [d.date, d.count]),
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.days} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
              <XAxis dataKey="date" tick={tick} tickFormatter={shortDate} minTickGap={20} />
              <YAxis width={36} tick={tick} allowDecimals={false} />
              <Tooltip labelFormatter={(d) => String(d)} />
              <Bar
                dataKey="count"
                name="Observations"
                fill={COLORS.primary}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        {hasCraving && (
          <ChartFrame
            testId="chart-craving"
            title="Craving intensity distribution"
            caption="How often each craving score (0 = none, 10 = overwhelming) was reported."
            synthetic={synthetic}
            table={{
              headers: ["Craving score", "Observations"],
              rows: data.craving.map((c) => [c.label, c.count]),
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.craving} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="label" tick={tick} />
                <YAxis width={36} tick={tick} allowDecimals={false} />
                <Tooltip labelFormatter={(l) => `Craving ${String(l)}`} />
                <Bar
                  dataKey="count"
                  name="Observations"
                  fill={COLORS.primary}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}

        {hasMoodOrStress && (
          <ChartFrame
            testId="chart-trends"
            title="Mood and stress over time"
            caption="Daily mean score across all participants (0–10). Days without check-ins are gaps."
            synthetic={synthetic}
            table={{
              headers: ["Day", "Mean mood", "Mean stress"],
              rows: data.days.map((d) => [d.date, dash(d.mood), dash(d.stress)]),
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.days} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="date" tick={tick} tickFormatter={shortDate} minTickGap={20} />
                <YAxis width={36} tick={tick} domain={[0, 10]} />
                <Tooltip labelFormatter={(d) => String(d)} />
                <Legend verticalAlign="top" height={28} iconType="plainline" />
                <Line
                  dataKey="mood"
                  name="Mood"
                  stroke={COLORS.mood}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="stress"
                  name="Stress"
                  stroke={COLORS.stress}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}

        {hasCraving && (
          <ChartFrame
            testId="chart-hour"
            title="Craving by time of day"
            caption={`Mean craving by local hour. Hours with fewer than ${MIN_CELL} check-ins are left blank. This describes the group, not anyone's pattern.`}
            synthetic={synthetic}
            table={{
              headers: ["Hour", "n", "Mean craving"],
              rows: data.hours.map((h) => [h.label, h.n, dash(h.mean)]),
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.hours} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
                <XAxis dataKey="label" tick={tick} interval={2} />
                <YAxis width={36} tick={tick} domain={[0, 10]} />
                <Tooltip
                  formatter={(value, _name, item) => [
                    `${String(value)} (n = ${String((item.payload as { n: number }).n)})`,
                    "Mean craving",
                  ]}
                />
                <Bar
                  dataKey="mean"
                  name="Mean craving"
                  fill={COLORS.primary}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}

        {answered(data.environment) && (
          <ChartFrame
            testId="chart-environment"
            title="Where check-ins happened"
            caption="Number of check-ins in each environment."
            synthetic={synthetic}
            table={{
              headers: ["Environment", "Observations"],
              rows: data.environment.map((e) => [e.label, e.count]),
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.environment}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COLORS.grid} />
                <XAxis type="number" tick={tick} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={tick} width={110} />
                <Tooltip />
                <Bar
                  dataKey="count"
                  name="Observations"
                  fill={COLORS.primary}
                  radius={[0, 3, 3, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}

        {answered(data.social) && (
          <ChartFrame
            testId="chart-social"
            title="Social context"
            caption="Number of check-ins by who the participant was with."
            synthetic={synthetic}
            table={{
              headers: ["Social context", "Observations"],
              rows: data.social.map((e) => [e.label, e.count]),
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.social}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COLORS.grid} />
                <XAxis type="number" tick={tick} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={tick} width={110} />
                <Tooltip />
                <Bar
                  dataKey="count"
                  name="Observations"
                  fill={COLORS.primary}
                  radius={[0, 3, 3, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}
      </div>

      <AdherenceTable data={data} synthetic={synthetic} />
    </section>
  );
}

function AdherenceTable({ data, synthetic }: { data: DashboardData; synthetic: boolean }) {
  return (
    <figure className="rounded-2xl border border-line bg-card p-4" data-testid="chart-missing">
      <figcaption>
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          Missing observations per participant
          {synthetic && (
            <span className="rounded bg-behaviour-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-behaviour">
              synthetic
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-muted">
          Check-ins expected by the schedule since enrolment (up to today, the end of the study or
          withdrawal) against those received. Most missing first. Pseudonyms only.
        </p>
      </figcaption>
      <div className="mt-3 max-h-96 overflow-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className="sticky top-0 bg-card text-xs text-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">Pseudonym</th>
              <th className="py-2 pr-3 font-medium">Consent</th>
              <th className="py-2 pr-3 font-medium">Expected</th>
              <th className="py-2 pr-3 font-medium">Received</th>
              <th className="py-2 pr-3 font-medium">Missing</th>
              <th className="w-1/3 py-2 font-medium">Completion</th>
            </tr>
          </thead>
          <tbody>
            {data.adherence.map((p) => (
              <tr key={p.pseudonym} className="border-t border-line">
                <td className="py-1.5 pr-3 font-mono">{p.pseudonym}</td>
                <td className="py-1.5 pr-3 text-xs text-muted">{p.consent}</td>
                <td className="py-1.5 pr-3">{p.expected}</td>
                <td className="py-1.5 pr-3">{p.observed}</td>
                <td className="py-1.5 pr-3 font-medium">{p.missing}</td>
                <td className="py-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 flex-1 overflow-hidden rounded-full"
                      style={{ backgroundColor: COLORS.muted }}
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round((p.completion ?? 0) * 100)}%`,
                          backgroundColor: COLORS.primary,
                        }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs">
                      {p.completion === null ? "–" : `${Math.round(p.completion * 100)}%`}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
