"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { RwTrial } from "@/lib/models/rescorla-wagner";
import type { TdResult } from "@/lib/models/td-learning";

/** Validated with the dataviz palette checker against a white surface (CVD ΔE ≥ 20). */
export const COLORS = {
  value: "#be185d",
  cue: "#6250d6",
  reward: "#eb6834",
  positive: "#be185d",
  negative: "#2563eb",
  neutral: "#f0efec",
  grid: "#e2e6ec",
  phase: "#f6f7f9",
} as const;

const fmt = (v: unknown): string => Number(v).toFixed(3);

function ChartFrame({
  title,
  caption,
  children,
  testId,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <figure className="min-w-0 rounded-2xl border border-line bg-card p-4" data-testid={testId}>
      <figcaption>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted">{caption}</p>
      </figcaption>
      <div className="mt-3 h-60 w-full">{children}</div>
    </figure>
  );
}

export function RwValueChart({
  trials,
  acquisitionTrials,
  asymptote,
}: {
  trials: RwTrial[];
  acquisitionTrials: number;
  asymptote: number;
}) {
  const total = trials.length;
  return (
    <ChartFrame
      testId="rw-value-chart"
      title="Associative strength V over trials"
      caption={`V after each trial. Dashed line: λ = ${asymptote.toFixed(2)}${
        acquisitionTrials < total ? ". Shaded: extinction phase (λ = 0)" : ""
      }.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={trials} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
          {acquisitionTrials < total && (
            <ReferenceArea
              x1={acquisitionTrials + 0.5}
              x2={total + 0.5}
              fill={COLORS.phase}
              fillOpacity={1}
              ifOverflow="extendDomain"
            />
          )}
          <XAxis
            dataKey="trial"
            type="number"
            domain={[1, Math.max(total, 2)]}
            tick={{ fontSize: 12 }}
            allowDecimals={false}
          />
          <YAxis domain={[0, "auto"]} width={40} tick={{ fontSize: 12 }} />
          <ReferenceLine y={asymptote} stroke="#6b7789" strokeDasharray="4 4" />
          <Tooltip formatter={fmt} labelFormatter={(t) => `Trial ${String(t)}`} />
          <Line
            dataKey="v"
            name="V"
            stroke={COLORS.value}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function RwErrorChart({ trials }: { trials: RwTrial[] }) {
  return (
    <ChartFrame
      testId="rw-error-chart"
      title="Prediction error λ − V over trials"
      caption="Positive (magenta) when the outcome is better than predicted, negative (blue) when worse."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={trials} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barGap={0}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey="trial" tick={{ fontSize: 12 }} minTickGap={16} />
          <YAxis width={40} tick={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="#6b7789" />
          <Tooltip formatter={fmt} labelFormatter={(t) => `Trial ${String(t)}`} />
          <Bar dataKey="error" name="λ − V" isAnimationActive={false}>
            {trials.map((t) => (
              <Cell key={t.trial} fill={t.error >= 0 ? COLORS.positive : COLORS.negative} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function TdShiftChart({
  series,
}: { series: { trial: number; cue: number; reward: number }[] }) {
  return (
    <ChartFrame
      testId="td-shift-chart"
      title="Prediction error δ at cue time and at reward time"
      caption="As learning proceeds, δ at the reward shrinks and δ at the cue grows."
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey="trial" tick={{ fontSize: 12 }} minTickGap={16} />
          <YAxis width={40} tick={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="#6b7789" />
          <Tooltip formatter={fmt} labelFormatter={(t) => `Trial ${String(t)}`} />
          <Legend verticalAlign="top" height={28} iconType="plainline" />
          <Line
            dataKey="cue"
            name="δ at cue"
            stroke={COLORS.cue}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="reward"
            name="δ at reward"
            stroke={COLORS.reward}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function mix(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  const out = [0, 1, 2].map((i) =>
    Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${out.join("")}`;
}

/** Diverging colour: gray at 0, magenta for positive δ, blue for negative δ. */
export function deltaColor(delta: number, maxAbs: number): string {
  if (maxAbs <= 0) {
    return COLORS.neutral;
  }
  const t = Math.min(1, Math.abs(delta) / maxAbs);
  return mix(COLORS.neutral, delta >= 0 ? COLORS.positive : COLORS.negative, t);
}

const MAX_ROWS = 40;

/** Rows = a sample of trials (top = first), columns = time steps (cue → reward). */
export function TdHeatStrip({ result }: { result: TdResult }) {
  const d = result.params.delaySteps;
  const n = result.trials.length;
  const stride = Math.max(1, Math.ceil(n / MAX_ROWS));
  const rows = result.trials.filter((_, i) => i % stride === 0 || i === n - 1);
  const maxAbs = Math.max(1e-9, ...rows.flatMap((row) => row.delta.map((x) => Math.abs(x))));

  const cellW = 100 / (d + 1);
  const rowH = 8;
  const height = rows.length * rowH;
  const first = rows[0];
  const last = rows.at(-1);

  return (
    <figure
      className="min-w-0 rounded-2xl border border-line bg-card p-4"
      data-testid="td-heatstrip"
    >
      <figcaption>
        <p className="font-semibold">δ within each trial (heat-strip)</p>
        <p className="mt-0.5 text-xs leading-5 text-muted">
          Each row is one trial{stride > 1 ? ` (every ${stride}th shown)` : ""}, first trial at the
          top. Columns run from cue onset (left) to reward time (right). Magenta = positive δ, blue
          = negative δ, gray ≈ 0. Watch the colour move from the right edge to the left.
        </p>
      </figcaption>
      <div className="mt-3 flex gap-2">
        <div className="flex flex-col justify-between py-0.5 text-right text-[10px] text-muted">
          <span>Trial {first?.trial}</span>
          <span>Trial {last?.trial}</span>
        </div>
        <svg
          role="img"
          aria-label={`Heat-strip of prediction error over ${n} trials and ${d + 1} time steps. In trial ${first?.trial}, δ at the cue is ${fmt(first?.delta[0])} and at the reward ${fmt(first?.delta[d])}; in trial ${last?.trial}, δ at the cue is ${fmt(last?.delta[0])} and at the reward ${fmt(last?.delta[d])}.`}
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          className="h-64 w-full rounded"
        >
          {rows.map((row, r) =>
            row.delta.map((delta, t) => (
              <rect
                key={`${row.trial}-${t}`}
                x={t * cellW}
                y={r * rowH}
                width={cellW - 0.4}
                height={rowH - 0.6}
                fill={deltaColor(delta, maxAbs)}
              >
                <title>{`Trial ${row.trial}, ${t === 0 ? "cue" : t === d ? "reward" : `step ${t}`}: δ = ${fmt(delta)}`}</title>
              </rect>
            )),
          )}
        </svg>
      </div>
      <div className="mt-1 flex justify-between pl-12 text-[10px] text-muted">
        <span>cue</span>
        <span>reward</span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <span>−{maxAbs.toFixed(2)}</span>
        <span
          aria-hidden="true"
          className="h-2 w-32 rounded"
          style={{
            background: `linear-gradient(to right, ${COLORS.negative}, ${COLORS.neutral}, ${COLORS.positive})`,
          }}
        />
        <span>+{maxAbs.toFixed(2)}</span>
      </div>
    </figure>
  );
}
