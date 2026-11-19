import { SlidingWindowLimiter, describeWait } from "../rate-limit";

function limiter(limit: number, windowMs: number, maxKeys?: number) {
  let now = 1_000_000;
  const instance = new SlidingWindowLimiter({
    limit,
    windowMs,
    now: () => now,
    ...(maxKeys === undefined ? {} : { maxKeys }),
  });
  return {
    instance,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("SlidingWindowLimiter", () => {
  it("allows up to the limit, then reports the wait", () => {
    const { instance, advance } = limiter(3, 60_000);
    expect(instance.take("u")).toBe(0);
    advance(10_000);
    expect(instance.take("u")).toBe(0);
    expect(instance.take("u")).toBe(0);
    // The oldest attempt (t=0) leaves the window at t=60s; we are at t=10s.
    expect(instance.take("u")).toBe(50_000);
  });

  it("frees capacity as attempts leave the window", () => {
    const { instance, advance } = limiter(2, 1_000);
    instance.take("u");
    instance.take("u");
    expect(instance.take("u")).toBeGreaterThan(0);
    advance(1_001);
    expect(instance.take("u")).toBe(0);
  });

  it("does not count refused attempts", () => {
    const { instance, advance } = limiter(1, 1_000);
    instance.take("u");
    advance(500);
    expect(instance.take("u")).toBe(500);
    advance(501);
    expect(instance.take("u")).toBe(0);
  });

  it("keeps keys independent", () => {
    const { instance } = limiter(1, 60_000);
    expect(instance.take("alice")).toBe(0);
    expect(instance.take("alice")).toBeGreaterThan(0);
    expect(instance.take("bob")).toBe(0);
  });

  it("bounds the number of remembered keys", () => {
    const { instance } = limiter(1, 60_000, 2);
    instance.take("a");
    instance.take("b");
    instance.take("c"); // evicts "a", the least recently used
    expect(instance.take("a")).toBe(0);
    expect(instance.take("c")).toBeGreaterThan(0);
  });
});

describe("describeWait", () => {
  it("rounds up to whole minutes", () => {
    expect(describeWait(5_000)).toBe("a few seconds");
    expect(describeWait(60_000)).toBe("about 1 minute");
    expect(describeWait(61_000)).toBe("about 2 minutes");
  });
});
