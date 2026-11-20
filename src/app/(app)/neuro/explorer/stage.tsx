"use client";

import { Bvh, PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useState } from "react";

import { CAMERA_FOV_DEG, DEFAULT_DISTANCE } from "@/lib/brain/views";

import { BrainModel } from "./brain-model";
import { CameraRig } from "./camera-rig";
import { useExplorerStore } from "./explorer-context";
import { SelectionLabel } from "./selection-label";

function Lights() {
  return (
    <>
      <hemisphereLight args={["#e4ecff", "#3b2f33", 0.9]} />
      {/* Key light from the upper front left, fill from the right, rim from behind. */}
      <directionalLight position={[-3, 4, 5]} intensity={2.1} />
      <directionalLight position={[4, 1, 2]} intensity={0.55} color="#ffe4dc" />
      <directionalLight position={[0, 3, -5]} intensity={1.3} color="#b9d4ff" />
    </>
  );
}

/**
 * The WebGL scene. Loaded with next/dynamic (ssr: false) so three.js never runs on the server.
 */
export default function Stage({ reducedMotion }: { reducedMotion: boolean }) {
  const store = useExplorerStore();
  const [dpr, setDpr] = useState<number | [number, number]>([1, 2]);

  return (
    <Canvas
      camera={{ fov: CAMERA_FOV_DEG, near: 0.05, far: 50, position: [0, 0, DEFAULT_DISTANCE] }}
      dpr={dpr}
      frameloop={reducedMotion ? "demand" : "always"}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onPointerMissed={(event) => {
        if (event.type === "click") store.select(null);
      }}
      onCreated={({ gl }) => {
        // A lost context (driver reset, GPU memory pressure) leaves a frozen canvas; tell the
        // layout so it can offer a restart. preventDefault lets the browser try to restore it.
        gl.domElement.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          store.setContextLost(true);
        });
        gl.domElement.addEventListener("webglcontextrestored", () => store.setContextLost(false));
        gl.domElement.setAttribute("role", "img");
        gl.domElement.setAttribute(
          "aria-label",
          "Interactive 3D model of the human brain. Drag to rotate, scroll or pinch to zoom, right-drag to pan. Use the structure list to select a structure with the keyboard.",
        );
      }}
    >
      {/* Drop to 1x pixel ratio if the device cannot hold the frame rate. */}
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <Lights />
      <Suspense fallback={null}>
        <Bvh firstHitOnly>
          <BrainModel reducedMotion={reducedMotion} />
        </Bvh>
        <SelectionLabel />
        <CameraRig reducedMotion={reducedMotion} />
      </Suspense>
    </Canvas>
  );
}
