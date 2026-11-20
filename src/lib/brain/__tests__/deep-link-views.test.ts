import { formatExplorerLink, parseExplorerLink } from "../deep-link";
import {
  DEFAULT_DISTANCE,
  MIN_DISTANCE,
  VIEW_PRESETS,
  VIEW_SHORTCUTS,
  focalOffsetForInsets,
  framingDistance,
  isViewPresetId,
  viewPosition,
} from "../views";

describe("explorer deep links", () => {
  it("parses a full link", () => {
    expect(parseExplorerLink("?mode=deep&s=nucleus-accumbens&view=left")).toEqual({
      mode: "deep",
      selected: "nucleus-accumbens",
      view: "left",
    });
  });

  it("infers the mode from the slug when the link has none", () => {
    expect(parseExplorerLink("?s=amygdala")).toMatchObject({ mode: "deep", selected: "amygdala" });
    expect(parseExplorerLink("?s=cerebellum")).toMatchObject({
      mode: "structures",
      selected: "cerebellum",
    });
  });

  it("drops unknown or inconsistent values", () => {
    expect(parseExplorerLink("?s=<script>&view=nowhere&mode=x")).toEqual({
      mode: "structures",
      selected: null,
      view: null,
    });
    // Only views offered in the view menu are accepted.
    expect(parseExplorerLink("?view=front-left").view).toBeNull();
    // An explicit mode wins over the slug's mode.
    expect(parseExplorerLink("?mode=structures&s=amygdala").selected).toBeNull();
  });

  it("formats links and round-trips them", () => {
    const link = { mode: "deep", selected: "hippocampus", view: "posterior" } as const;
    expect(formatExplorerLink(link)).toBe("mode=deep&s=hippocampus&view=posterior");
    expect(parseExplorerLink(`?${formatExplorerLink(link)}`)).toEqual(link);
    expect(formatExplorerLink({ mode: "structures", selected: null, view: "default" })).toBe("");
  });
});

describe("camera views", () => {
  it("recognises preset ids", () => {
    expect(isViewPresetId("medial-left")).toBe(true);
    expect(isViewPresetId("toString")).toBe(false);
  });

  it("puts the camera on the expected side for each axis view", () => {
    const at = (id: keyof typeof VIEW_PRESETS) =>
      viewPosition(VIEW_PRESETS[id], [0, 0, 0], 1).map((v) => Math.round(v * 1000) / 1000);
    expect(at("anterior")).toEqual([0, 0, 1]);
    expect(at("left")).toEqual([-1, 0, 0]);
    expect(at("right")).toEqual([1, 0, 0]);
    expect(at("posterior")[2]).toBe(-1);
    expect(at("superior")[1]).toBeGreaterThan(0.99);
    expect(at("inferior")[1]).toBeLessThan(-0.99);
  });

  it("frames small structures closer than large ones, within limits", () => {
    expect(framingDistance(0.05)).toBe(MIN_DISTANCE);
    expect(framingDistance(5)).toBe(DEFAULT_DISTANCE);
    expect(framingDistance(0.5)).toBeGreaterThan(MIN_DISTANCE);
    expect(framingDistance(0.5)).toBeLessThan(DEFAULT_DISTANCE);
  });
});

describe("panel-aware framing", () => {
  it("shifts the view towards the uncovered side", () => {
    const [x, y] = focalOffsetForInsets({ left: 0, right: 300, bottom: 0 }, 4, 600);
    expect(x).toBeGreaterThan(0);
    expect(y).toBe(-0);
    const [, up] = focalOffsetForInsets({ left: 0, right: 0, bottom: 200 }, 4, 600);
    expect(up).toBeLessThan(0);
  });

  it("is zero with no panels and scales with distance", () => {
    expect(focalOffsetForInsets({ left: 0, right: 0, bottom: 0 }, 4, 600)).toEqual([0, -0]);
    const near = focalOffsetForInsets({ left: 0, right: 300, bottom: 0 }, 2, 600)[0];
    const far = focalOffsetForInsets({ left: 0, right: 300, bottom: 0 }, 4, 600)[0];
    expect(far).toBeCloseTo(near * 2);
    expect(focalOffsetForInsets({ left: 0, right: 300, bottom: 0 }, 4, 0)).toEqual([0, 0]);
  });

  it("maps number keys to distinct views", () => {
    const views = Object.values(VIEW_SHORTCUTS);
    expect(new Set(views).size).toBe(views.length);
    expect(VIEW_SHORTCUTS["7"]).toBe("medial-left");
  });
});
