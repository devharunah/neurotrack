import { z } from "zod";

/** Mirrors the API caps in api/app/quantum/schemas.py. The API re-validates everything. */
export const MAX_QUBITS = 8;
export const MAX_GATES = 64;
export const MAX_SHOTS = 8192;

export const SINGLE_QUBIT_OPS = ["x", "y", "z", "h"] as const;
export type SingleQubitOp = (typeof SINGLE_QUBIT_OPS)[number];
export type GateOp = SingleQubitOp | "cx";

export type Gate =
  | { op: SingleQubitOp; target: number }
  | { op: "cx"; control: number; target: number };

export interface Circuit {
  numQubits: number;
  gates: Gate[];
}

export const GATE_INFO: Record<GateOp, { label: string; description: string }> = {
  x: { label: "X", description: "Bit flip: swaps |0> and |1>." },
  y: { label: "Y", description: "Bit flip plus phase flip." },
  z: { label: "Z", description: "Phase flip: leaves |0>, negates |1>." },
  h: { label: "H", description: "Hadamard: creates an equal superposition." },
  cx: { label: "CNOT", description: "Flips the target when the control is |1>." },
};

const gateSchema = z.union([
  z.object({
    op: z.enum(SINGLE_QUBIT_OPS),
    target: z
      .number()
      .int()
      .min(0)
      .max(MAX_QUBITS - 1),
  }),
  z.object({
    op: z.literal("cx"),
    control: z
      .number()
      .int()
      .min(0)
      .max(MAX_QUBITS - 1),
    target: z
      .number()
      .int()
      .min(0)
      .max(MAX_QUBITS - 1),
  }),
]);

export const noiseSchema = z.object({
  depolarizing_1q: z.number().min(0).max(0.5),
  depolarizing_2q: z.number().min(0).max(0.5),
  readout: z.number().min(0).max(0.5),
});

export const runInputSchema = z
  .object({
    num_qubits: z.number().int().min(1).max(MAX_QUBITS),
    gates: z.array(gateSchema).max(MAX_GATES),
    shots: z.number().int().min(1).max(MAX_SHOTS),
    noise: noiseSchema.optional(),
    seed: z.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    value.gates.forEach((gate, index) => {
      const used = gate.op === "cx" ? [gate.control, gate.target] : [gate.target];
      if (used.some((q) => q >= value.num_qubits)) {
        ctx.addIssue({ code: "custom", message: `Gate ${index + 1} uses a missing qubit` });
      }
      if (gate.op === "cx" && gate.control === gate.target) {
        ctx.addIssue({ code: "custom", message: `Gate ${index + 1}: control equals target` });
      }
    });
  });

export type RunInput = z.infer<typeof runInputSchema>;

export function emptyCircuit(numQubits = 2): Circuit {
  return { numQubits, gates: [] };
}

export function addGate(circuit: Circuit, gate: Gate): Circuit {
  if (circuit.gates.length >= MAX_GATES) {
    return circuit;
  }
  const used = gate.op === "cx" ? [gate.control, gate.target] : [gate.target];
  if (used.some((q) => q < 0 || q >= circuit.numQubits)) {
    return circuit;
  }
  if (gate.op === "cx" && gate.control === gate.target) {
    return circuit;
  }
  return { ...circuit, gates: [...circuit.gates, gate] };
}

export function removeGate(circuit: Circuit, index: number): Circuit {
  return { ...circuit, gates: circuit.gates.filter((_, i) => i !== index) };
}

/** Changing the qubit count drops any gate that touches a qubit that no longer exists. */
export function setQubitCount(circuit: Circuit, numQubits: number): Circuit {
  const n = Math.min(MAX_QUBITS, Math.max(1, Math.trunc(numQubits)));
  const gates = circuit.gates.filter((gate) =>
    gate.op === "cx" ? gate.control < n && gate.target < n : gate.target < n,
  );
  return { numQubits: n, gates };
}

export function toRunInput(
  circuit: Circuit,
  shots: number,
  noise?: z.infer<typeof noiseSchema>,
): RunInput {
  return {
    num_qubits: circuit.numQubits,
    gates: circuit.gates.map((gate) => ({ ...gate })),
    shots,
    ...(noise ? { noise } : {}),
  };
}

/** API preset circuits use `control: null` on single-qubit gates; normalise to our union. */
export function fromApiCircuit(input: {
  num_qubits: number;
  gates?: { op: GateOp; target: number; control?: number | null }[];
}): Circuit {
  const gates: Gate[] = (input.gates ?? []).flatMap((gate): Gate[] => {
    if (gate.op === "cx") {
      return typeof gate.control === "number"
        ? [{ op: "cx", control: gate.control, target: gate.target }]
        : [];
    }
    return [{ op: gate.op, target: gate.target }];
  });
  return { numQubits: input.num_qubits, gates };
}
