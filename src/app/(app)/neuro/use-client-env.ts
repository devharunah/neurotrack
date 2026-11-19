"use client";

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True when the user asked the OS to minimise motion. Treated as true during SSR, to be safe. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => true,
  );
}

let webglSupport: boolean | undefined;

function detectWebgl(): boolean {
  if (webglSupport === undefined) {
    try {
      const canvas = document.createElement("canvas");
      webglSupport = Boolean(
        window.WebGLRenderingContext && (canvas.getContext("webgl2") ?? canvas.getContext("webgl")),
      );
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

const noopSubscribe = (): (() => void) => () => {};

/** "pending" during SSR and hydration, then whether this browser can create a WebGL context. */
export function useWebglSupport(): "pending" | boolean {
  return useSyncExternalStore<"pending" | boolean>(noopSubscribe, detectWebgl, () => "pending");
}
