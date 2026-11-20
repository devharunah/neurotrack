import { type CameraCommand, createExplorerStore } from "../explorer-store";

describe("explorer store", () => {
  it("selects items of the current mode and ignores unknown slugs", () => {
    const store = createExplorerStore();
    store.select("cerebellum");
    expect(store.getState().selected).toBe("cerebellum");
    store.select("nucleus-accumbens"); // a deep-mode item
    expect(store.getState().selected).toBe("cerebellum");
    store.select(null);
    expect(store.getState().selected).toBeNull();
  });

  it("hides the right hemisphere when an item's view needs the inner surface", () => {
    const store = createExplorerStore();
    store.select("corpus-callosum");
    expect(store.getState().hiddenSide).toBe("rh");
    store.select("frontal-lobe");
    expect(store.getState().hiddenSide).toBeNull();
  });

  it("resets the menu view on selection, so a shared link cannot carry a stale view", () => {
    const store = createExplorerStore();
    store.setView("medial-left");
    store.select("cerebellum");
    expect(store.getState()).toMatchObject({ view: "default", hiddenSide: null });
  });

  it("keeps the selection across modes only when it exists in both", () => {
    const store = createExplorerStore();
    store.select("cerebellum");
    store.setMode("deep");
    expect(store.getState()).toMatchObject({ mode: "deep", selected: null });
    store.select("amygdala");
    store.setMode("structures");
    expect(store.getState().selected).toBeNull();
  });

  it("notifies subscribers only when something changes", () => {
    const store = createExplorerStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    store.hover("insula");
    store.hover("insula");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.hover(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("sends camera commands for views, zoom and reset", () => {
    const store = createExplorerStore();
    const commands: CameraCommand[] = [];
    store.onCommand((command) => commands.push(command));
    store.setView("medial-left");
    expect(store.getState()).toMatchObject({ view: "medial-left", hiddenSide: "rh" });
    store.zoom(1);
    store.select("insula");
    store.reset();
    expect(commands).toEqual([
      { type: "view", view: "medial-left" },
      { type: "zoom", direction: 1 },
      { type: "reset" },
    ]);
    expect(store.getState()).toMatchObject({ selected: null, view: "default", hiddenSide: null });
  });

  it("toggles atlas colours and records a lost graphics context", () => {
    const store = createExplorerStore();
    store.setAtlasColors(true);
    store.setContextLost(true);
    expect(store.getState()).toMatchObject({ atlasColors: true, contextLost: true });
  });

  it("updates screen insets only when a value changes", () => {
    const store = createExplorerStore();
    const listener = jest.fn();
    store.subscribe(listener);
    store.setInsets({ left: 0, right: 352, bottom: 0 });
    store.setInsets({ left: 0, right: 352, bottom: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().insets).toEqual({ left: 0, right: 352, bottom: 0 });
  });

  it("starts from a partial initial state", () => {
    const store = createExplorerStore({ mode: "deep", selected: "hippocampus" });
    expect(store.getState()).toMatchObject({
      mode: "deep",
      selected: "hippocampus",
      paused: false,
    });
  });
});
