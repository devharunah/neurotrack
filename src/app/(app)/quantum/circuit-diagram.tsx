"use client";

import type { Circuit, Gate } from "@/lib/quantum/circuit";
import { GATE_INFO } from "@/lib/quantum/circuit";

const ROW = 52;
const COL = 52;
const LEFT = 56;
const TOP = 28;
const BOX = 32;

/**
 * Draws the circuit left to right, one gate per column. Clicking a gate removes it; the qubit
 * labels are buttons that place the selected gate on that qubit.
 */
export function CircuitDiagram({
  circuit,
  pendingControl,
  onQubitClick,
  onGateClick,
}: {
  circuit: Circuit;
  pendingControl: number | null;
  onQubitClick: (qubit: number) => void;
  onGateClick: (index: number) => void;
}) {
  const columns = Math.max(circuit.gates.length + 1, 6);
  const width = LEFT + columns * COL + 24;
  const height = TOP + circuit.numQubits * ROW;
  const y = (q: number) => TOP + q * ROW + ROW / 2 - 10;
  const x = (i: number) => LEFT + i * COL + COL / 2;
  const qubits = Array.from({ length: circuit.numQubits }, (_, q) => q);

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Circuit with ${circuit.numQubits} qubits and ${circuit.gates.length} gates`}
        className="block"
      >
        {qubits.map((q) => (
          <g key={`wire-${q}`}>
            <line x1={LEFT - 6} x2={width - 12} y1={y(q)} y2={y(q)} stroke="#94a3b8" />
            <foreignObject x={4} y={y(q) - 14} width={LEFT - 12} height={28}>
              <button
                type="button"
                onClick={() => onQubitClick(q)}
                className={`h-7 w-full rounded-md font-mono text-xs ${
                  pendingControl === q
                    ? "bg-quantum text-white"
                    : "bg-quantum-soft text-quantum hover:bg-quantum hover:text-white"
                }`}
                aria-label={`Place gate on qubit ${q}`}
              >
                q{q}
              </button>
            </foreignObject>
          </g>
        ))}

        {circuit.gates.map((gate, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: gates are positional; the index is their identity.
          <GateGlyph key={i} gate={gate} index={i} x={x(i)} y={y} onRemove={onGateClick} />
        ))}

        {qubits.map((q) => (
          <g key={`measure-${q}`} aria-hidden>
            <rect
              x={width - 34}
              y={y(q) - 11}
              width={22}
              height={22}
              rx={4}
              fill="white"
              stroke="#94a3b8"
            />
            <path
              d={`M ${width - 30} ${y(q) + 5} A 7 7 0 0 1 ${width - 16} ${y(q) + 5}`}
              fill="none"
              stroke="#64748b"
            />
            <line x1={width - 23} y1={y(q) + 5} x2={width - 17} y2={y(q) - 6} stroke="#64748b" />
          </g>
        ))}
      </svg>
    </div>
  );
}

const PURPLE = "#6d28d9";

function GateGlyph({
  gate,
  index,
  x,
  y,
  onRemove,
}: {
  gate: Gate;
  index: number;
  x: number;
  y: (qubit: number) => number;
  onRemove: (index: number) => void;
}) {
  const top = gate.op === "cx" ? Math.min(gate.control, gate.target) : gate.target;
  const bottom = gate.op === "cx" ? Math.max(gate.control, gate.target) : gate.target;
  const hitTop = y(top) - BOX / 2;
  const hitHeight = y(bottom) - y(top) + BOX;

  return (
    <g>
      {gate.op === "cx" ? (
        <>
          <line
            x1={x}
            x2={x}
            y1={y(gate.control)}
            y2={y(gate.target)}
            stroke={PURPLE}
            strokeWidth={2}
          />
          <circle cx={x} cy={y(gate.control)} r={6} fill={PURPLE} />
          <circle cx={x} cy={y(gate.target)} r={13} fill="white" stroke={PURPLE} strokeWidth={2} />
          <line
            x1={x - 13}
            x2={x + 13}
            y1={y(gate.target)}
            y2={y(gate.target)}
            stroke={PURPLE}
            strokeWidth={2}
          />
          <line
            x1={x}
            x2={x}
            y1={y(gate.target) - 13}
            y2={y(gate.target) + 13}
            stroke={PURPLE}
            strokeWidth={2}
          />
        </>
      ) : (
        <>
          <rect
            x={x - BOX / 2}
            y={y(gate.target) - BOX / 2}
            width={BOX}
            height={BOX}
            rx={6}
            fill={PURPLE}
          />
          <text
            x={x}
            y={y(gate.target) + 5}
            textAnchor="middle"
            fontSize={14}
            fontWeight={600}
            fill="white"
          >
            {GATE_INFO[gate.op].label}
          </text>
        </>
      )}
      <foreignObject x={x - BOX / 2} y={hitTop} width={BOX} height={hitHeight}>
        <button
          type="button"
          onClick={() => onRemove(index)}
          aria-label={`Remove ${GATE_INFO[gate.op].label} gate ${index + 1}`}
          title="Click to remove"
          className="h-full w-full cursor-pointer rounded-md hover:bg-red-500/20"
        />
      </foreignObject>
    </g>
  );
}
