"use client";

import { useSyncExternalStore } from "react";

/** Tailwind's `lg` breakpoint: floating panels on the stage from here up. */
const DESKTOP_QUERY = "(min-width: 1024px)";
/** Wide enough to keep the structure list open next to the brain by default. */
const WIDE_QUERY = "(min-width: 1536px)";

type Subscribe = (onChange: () => void) => () => void;
const subscribers = new Map<string, Subscribe>();

/** One stable subscribe function per query, so React does not resubscribe every render. */
function subscribeTo(query: string): Subscribe {
  let subscribe = subscribers.get(query);
  if (!subscribe) {
    subscribe = (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    };
    subscribers.set(query, subscribe);
  }
  return subscribe;
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscribeTo(query),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}

export function useIsWide(): boolean {
  return useMediaQuery(WIDE_QUERY);
}
