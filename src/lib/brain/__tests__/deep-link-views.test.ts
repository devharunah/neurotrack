import { formatExplorerLink, parseExplorerLink } from "../deep-link";
import {
  DEFAULT_DISTANCE,
  MIN_DISTANCE,
  VIEW_PRESETS,
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
