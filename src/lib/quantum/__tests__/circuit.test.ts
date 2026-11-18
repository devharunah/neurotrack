import {
  MAX_GATES,
  addGate,
  emptyCircuit,
  fromApiCircuit,
  removeGate,
  runInputSchema,
  setQubitCount,
  toRunInput,
} from "../circuit";

describe("circuit model", () => {
  it("adds gates immutably", () => {
    const start = emptyCircuit(2);
    const next = addGate(start, { op: "h", target: 0 });

    expect(start.gates).toHaveLength(0);
    expect(next.gates).toEqual([{ op: "h", target: 0 }]);
  });

  it("rejects gates on missing qubits and CNOT onto itself", () => {
    const circuit = emptyCircuit(2);

    expect(addGate(circuit, { op: "x", target: 2 })).toBe(circuit);
    expect(addGate(circuit, { op: "cx", control: 1, target: 1 })).toBe(circuit);
  });

  it("caps the gate count", () => {
    let circuit = emptyCircuit(1);
    for (let i = 0; i < MAX_GATES + 5; i += 1) {
      circuit = addGate(circuit, { op: "x", target: 0 });
    }
    expect(circuit.gates).toHaveLength(MAX_GATES);
  });

  it("removes a gate by index", () => {
    const circuit = addGate(addGate(emptyCircuit(1), { op: "h", target: 0 }), {
      op: "z",
      target: 0,
    });
    expect(removeGate(circuit, 0).gates).toEqual([{ op: "z", target: 0 }]);
  });

  it("drops gates on removed qubits when shrinking", () => {
    let circuit = emptyCircuit(3);
    circuit = addGate(circuit, { op: "h", target: 0 });
    circuit = addGate(circuit, { op: "cx", control: 0, target: 2 });
    circuit = addGate(circuit, { op: "x", target: 1 });

    const shrunk = setQubitCount(circuit, 2);
    expect(shrunk.numQubits).toBe(2);
    expect(shrunk.gates).toEqual([
      { op: "h", target: 0 },
      { op: "x", target: 1 },
    ]);
  });

  it("produces API input that passes validation", () => {
    let circuit = emptyCircuit(2);
    circuit = addGate(circuit, { op: "h", target: 0 });
    circuit = addGate(circuit, { op: "cx", control: 0, target: 1 });

    const input = toRunInput(circuit, 1024);
    expect(runInputSchema.safeParse(input).success).toBe(true);
    expect(input).toEqual({
      num_qubits: 2,
      gates: [
        { op: "h", target: 0 },
        { op: "cx", control: 0, target: 1 },
      ],
      shots: 1024,
    });
  });

  it("rejects invalid run input", () => {
    expect(runInputSchema.safeParse({ num_qubits: 1, gates: [], shots: 0 }).success).toBe(false);
    expect(
      runInputSchema.safeParse({
        num_qubits: 1,
        gates: [{ op: "x", target: 3 }],
        shots: 10,
      }).success,
    ).toBe(false);
  });

  it("normalises API preset circuits", () => {
    expect(
      fromApiCircuit({
        num_qubits: 2,
        gates: [
          { op: "h", target: 0, control: null },
          { op: "cx", target: 1, control: 0 },
        ],
      }),
    ).toEqual({
      numQubits: 2,
      gates: [
        { op: "h", target: 0 },
        { op: "cx", control: 0, target: 1 },
      ],
    });
  });
});
