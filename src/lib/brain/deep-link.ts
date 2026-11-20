/**
 * Shareable explorer URLs: `?mode=deep&s=nucleus-accumbens&view=left`.
 * Unknown or inconsistent values are dropped rather than trusted.
 */
import { type ExplorerMode, getExplorerItem } from "./catalog";
import { MENU_VIEWS, type ViewPresetId, isViewPresetId } from "./views";

export interface ExplorerLink {
  mode: ExplorerMode;
  selected: string | null;
  view: ViewPresetId | null;
}

export function parseExplorerLink(search: string): ExplorerLink {
  const params = new URLSearchParams(search);
  const rawMode = params.get("mode");
  const slug = params.get("s");
  const rawView = params.get("view");

  // A slug alone is enough: pick the mode it belongs to.
  let mode: ExplorerMode = rawMode === "deep" ? "deep" : "structures";
  if (slug && !getExplorerItem(mode, slug) && rawMode === null) {
    mode = getExplorerItem("deep", slug) ? "deep" : mode;
  }
  const selected = slug && getExplorerItem(mode, slug) ? slug : null;
  const view = rawView && isViewPresetId(rawView) && MENU_VIEWS.includes(rawView) ? rawView : null;
  return { mode, selected, view };
}

/** Query string for a state (without the leading `?`); empty for the default state. */
export function formatExplorerLink({ mode, selected, view }: ExplorerLink): string {
  const params = new URLSearchParams();
  if (mode !== "structures") params.set("mode", mode);
  if (selected) params.set("s", selected);
  if (view && view !== "default") params.set("view", view);
  return params.toString();
}
