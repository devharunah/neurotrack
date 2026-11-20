"use client";

import {
  type ReactNode,
  createContext,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { formatExplorerLink, parseExplorerLink } from "@/lib/brain/deep-link";
import {
  type ExplorerState,
  type ExplorerStore,
  createExplorerStore,
} from "@/lib/brain/explorer-store";

const ExplorerContext = createContext<ExplorerStore | null>(null);

/** One store per explorer instance. R3F's Canvas bridges this context into the 3D scene. */
export function ExplorerProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createExplorerStore);
  return <ExplorerContext value={store}>{children}</ExplorerContext>;
}

export function useExplorerStore(): ExplorerStore {
  const store = use(ExplorerContext);
  if (!store) {
    throw new Error("useExplorerStore must be used inside <ExplorerProvider>");
  }
  return store;
}

/** Subscribe to one slice of explorer state; re-renders only when that slice changes. */
export function useExplorer<T>(selector: (state: ExplorerState) => T): T {
  const store = useExplorerStore();
  const read = () => selector(store.getState());
  return useSyncExternalStore(store.subscribe, read, read);
}

/**
 * Applies `?mode=…&s=…&view=…` once on load, then mirrors the state back into the URL with
 * replaceState, so a selection can be shared without adding history entries.
 */
export function useDeepLink(store: ExplorerStore): void {
  useEffect(() => {
    const link = parseExplorerLink(window.location.search);
    store.setMode(link.mode);
    if (link.selected) store.select(link.selected);
    if (link.view) store.setView(link.view);

    let current = window.location.search;
    return store.subscribe(() => {
      const { mode, selected, view } = store.getState();
      const query = formatExplorerLink({ mode, selected, view });
      const next = query ? `?${query}` : "";
      if (next === current) return;
      current = next;
      const { pathname, hash } = window.location;
      window.history.replaceState(window.history.state, "", `${pathname}${next}${hash}`);
    });
  }, [store]);
}
