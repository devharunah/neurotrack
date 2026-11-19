"use client";

import { Html, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { AdditiveBlending, type Mesh, type MeshBasicMaterial } from "three";

import {
  BRAIN_REGIONS,
  type BrainRegion,
  type Vec3,
  explorerPositions,
} from "@/lib/content/brain-regions";

export interface BrainCanvasProps {
  selected: string | null;
  hovered: string | null;
  reducedMotion: boolean;
  onSelect: (slug: string) => void;
  onHover: (slug: string | null) => void;
}

const SHELL_COLOR = "#e2c6d4";

/**
 * Stylised, schematic brain: two translucent hemisphere ellipsoids, a cerebellum and a brainstem.
 * Built from primitives (no external model files). Proportions are illustrative, not anatomical.
 */
function BrainShell() {
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.72, 0.05, 0]} scale={[0.7, 0.95, 1.58]}>
          <sphereGeometry args={[1, 48, 32]} />
          <meshPhysicalMaterial
            color={SHELL_COLOR}
            transparent
            opacity={0.16}
            roughness={0.35}
            depthWrite={false}
          />
        </mesh>
      ))}
      {/* Cerebellum: tucked under the back of the hemispheres. */}
      <mesh position={[0, -0.72, -1.2]} scale={[0.82, 0.42, 0.48]}>
        <sphereGeometry args={[1, 40, 24]} />
        <meshPhysicalMaterial
          color={SHELL_COLOR}
          transparent
          opacity={0.2}
          roughness={0.5}
          depthWrite={false}
        />
      </mesh>
      {/* Brainstem: angled down and slightly back from the midbrain. */}
      <mesh position={[0, -1.05, -0.45]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.11, 0.9, 24]} />
        <meshPhysicalMaterial
          color={SHELL_COLOR}
          transparent
          opacity={0.24}
          roughness={0.5}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function RegionNode({
  region,
  position,
  showLabel,
  active,
  selected,
  reducedMotion,
  onSelect,
  onHover,
}: {
  region: BrainRegion;
  position: Vec3;
  showLabel: boolean;
  active: boolean;
  selected: boolean;
  reducedMotion: boolean;
  onSelect: (slug: string) => void;
  onHover: (slug: string | null) => void;
}) {
  const halo = useRef<Mesh>(null);
  const { color } = region.explorer;
  // Drawn a little smaller than the content radius so neighbouring regions stay distinguishable.
  const radius = region.explorer.radius * 0.75;

  useFrame(({ clock }) => {
    const mesh = halo.current;
    if (!mesh) {
      return;
    }
    const base = active ? 1.75 : 1.35;
    const pulse = selected && !reducedMotion ? 0.12 * Math.sin(clock.elapsedTime * 2.4) : 0;
    mesh.scale.setScalar(base + pulse);
    (mesh.material as MeshBasicMaterial).opacity = active ? 0.34 : 0.16;
  });

  const handleOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(region.slug);
  };
  const handleOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    onHover(null);
  };
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(region.slug);
  };

  return (
    <group position={[...position]}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: a Three.js mesh, not a DOM node; the region list beside the canvas is the keyboard equivalent. */}
      <mesh
        scale={active ? 1.2 : 1}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[radius, 32, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={active ? 1.4 : 0.55}
          roughness={0.3}
          toneMapped={false}
        />
      </mesh>
      {/* Additive halo for the glow; ignores pointer events so it never steals a hover. */}
      <mesh ref={halo} raycast={() => null}>
        <sphereGeometry args={[radius, 24, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.16}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {showLabel && (
        <Html
          center
          position={[0, radius + 0.16, 0]}
          style={{ pointerEvents: "none" }}
          zIndexRange={[20, 0]}
        >
          <span className="whitespace-nowrap rounded-md bg-ink/85 px-2 py-0.5 text-xs font-medium text-white shadow">
            {region.name}
          </span>
        </Html>
      )}
    </group>
  );
}

function CursorFeedback({ hovered }: { hovered: string | null }) {
  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);
  return null;
}

export default function BrainCanvas({
  selected,
  hovered,
  reducedMotion,
  onSelect,
  onHover,
}: BrainCanvasProps) {
  return (
    <Canvas
      camera={{ position: [2.9, 1.1, 2.7], fov: 40 }}
      dpr={[1, 2]}
      frameloop={reducedMotion ? "demand" : "always"}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        gl.domElement.setAttribute("role", "img");
        gl.domElement.setAttribute(
          "aria-label",
          "Interactive 3D model of a stylised brain showing six reward-related regions. Drag to rotate, scroll to zoom. Use the region list to select a region with the keyboard.",
        );
      }}
    >
      <CursorFeedback hovered={hovered} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 5, 3]} intensity={1.4} />
      <directionalLight position={[-4, -2, -3]} intensity={0.4} />
      <BrainShell />
      {BRAIN_REGIONS.flatMap((region) =>
        explorerPositions(region).map((position, i) => (
          <RegionNode
            key={`${region.slug}-${i}`}
            region={region}
            position={position}
            showLabel={i === 0 && (hovered === region.slug || selected === region.slug)}
            active={hovered === region.slug || selected === region.slug}
            selected={selected === region.slug}
            reducedMotion={reducedMotion}
            onSelect={onSelect}
            onHover={onHover}
          />
        )),
      )}
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping={!reducedMotion}
        minDistance={2.6}
        maxDistance={7}
        autoRotate={!reducedMotion && selected === null}
        autoRotateSpeed={0.6}
      />
    </Canvas>
  );
}
