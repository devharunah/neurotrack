"use client";

import { CameraControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { type ComponentRef, useCallback, useEffect, useRef } from "react";
import { Box3, Sphere } from "three";

import { getExplorerItem } from "@/lib/brain/catalog";
import {
  DEEP_FOCUS_DISTANCE,
  DEFAULT_DISTANCE,
  MAX_DISTANCE,
  MIN_DISTANCE,
  STRUCTURE_FOCUS_DISTANCE,
  VIEW_PRESETS,
  type ViewPreset,
  focalOffsetForInsets,
  framingDistance,
  viewPosition,
} from "@/lib/brain/views";

import { useExplorerStore } from "./explorer-context";

type Controls = ComponentRef<typeof CameraControls>;
type Vec3 = readonly [number, number, number];

const ORIGIN: Vec3 = [0, 0, 0];
/** Seconds without input before auto-rotation eases back in. */
const IDLE_SECONDS = 4;
/** One revolution every ~80 s: slow enough to read, fast enough to notice. */
const ROTATE_SPEED = (2 * Math.PI) / 80;
/** Seconds for auto-rotation to ease from still to full speed. */
const RAMP_SECONDS = 1.5;
/** Time a camera tween is given before auto-rotation may resume. */
const TWEEN_SECONDS = 1.4;

/**
 * Sole owner of the camera: user input (orbit, zoom, pan) through camera-controls, focus on
 * the selected structure, view presets, reset, zoom buttons and idle auto-rotation.
 */
export function CameraRig({ reducedMotion }: { reducedMotion: boolean }) {
  const ref = useRef<Controls>(null);
  const store = useExplorerStore();
  const scene = useThree((state) => state.scene);
  // Read lazily: depending on the size would re-run the setup effect (and reset the camera)
  // on every resize.
  const getThree = useThree((state) => state.get);
  const motion = useRef({
    interacting: false,
    lastInput: Number.NEGATIVE_INFINITY,
    tweenUntil: 0,
    speed: 0,
  });
  const animate = !reducedMotion;
  /** Distance the camera is heading to (camera-controls reports where a tween started). */
  const lastDistance = useRef(DEFAULT_DISTANCE);

  const goTo = useCallback(
    (view: ViewPreset, target: Vec3, distance: number, transition = animate) => {
      const controls = ref.current;
      if (!controls) return;
      // Stop any auto-rotation now: a rotate() during the tween would snap its angle.
      motion.current.speed = 0;
      lastDistance.current = distance;
      const [x, y, z] = viewPosition(view, target, distance);
      void controls.setLookAt(x, y, z, target[0], target[1], target[2], transition);
      const [fx, fy] = focalOffsetForInsets(
        store.getState().insets,
        distance,
        getThree().size.height,
      );
      void controls.setFocalOffset(fx, fy, 0, transition);
      motion.current.tweenUntil = performance.now() / 1000 + (transition ? TWEEN_SECONDS : 0);
    },
    [animate, getThree, store],
  );

  const focus = useCallback(
    (slug: string, transition = animate) => {
      const { mode, hiddenSide } = store.getState();
      const item = getExplorerItem(mode, slug);
      if (!item) return;
      const box = new Box3();
      for (const name of item.nodes) {
        if (hiddenSide && name.startsWith(`${hiddenSide}_`)) continue;
        const object = scene.getObjectByName(name);
        if (object) box.expandByObject(object);
      }
      if (box.isEmpty()) return;
      const sphere = box.getBoundingSphere(new Sphere());
      const centre = sphere.center.toArray() as [number, number, number];
      const minimum = mode === "deep" ? DEEP_FOCUS_DISTANCE : STRUCTURE_FOCUS_DISTANCE;
      const distance = framingDistance(sphere.radius, undefined, minimum);
      goTo(VIEW_PRESETS[item.view], centre, distance, transition);
    },
    [animate, goTo, scene, store],
  );

  // Initial pose, then follow selection changes and camera commands.
  useEffect(() => {
    const initial = store.getState();
    goTo(VIEW_PRESETS.default, ORIGIN, DEFAULT_DISTANCE, false);
    if (initial.selected) focus(initial.selected, false);
    else if (initial.view !== "default")
      goTo(VIEW_PRESETS[initial.view], ORIGIN, DEFAULT_DISTANCE, false);

    let previous = initial.selected;
    let previousInsets = initial.insets;
    const unsubscribe = store.subscribe(() => {
      const { selected, insets } = store.getState();
      if (insets !== previousInsets) {
        // A panel opened or closed: re-centre in the space that is still visible.
        previousInsets = insets;
        const controls = ref.current;
        if (controls) {
          const [fx, fy] = focalOffsetForInsets(
            insets,
            lastDistance.current,
            getThree().size.height,
          );
          void controls.setFocalOffset(fx, fy, 0, animate);
        }
      }
      if (selected === previous) return;
      previous = selected;
      if (selected) focus(selected);
    });
    const unsubscribeCommands = store.onCommand((command) => {
      const controls = ref.current;
      if (command.type === "reset") goTo(VIEW_PRESETS.default, ORIGIN, DEFAULT_DISTANCE);
      if (command.type === "view") goTo(VIEW_PRESETS[command.view], ORIGIN, DEFAULT_DISTANCE);
      if (command.type === "zoom" && controls) {
        void controls.dolly(command.direction * 0.6, animate);
        lastDistance.current = Math.min(
          MAX_DISTANCE,
          Math.max(MIN_DISTANCE, lastDistance.current - command.direction * 0.6),
        );
        motion.current.lastInput = performance.now() / 1000;
      }
    });
    return () => {
      unsubscribe();
      unsubscribeCommands();
    };
  }, [animate, focus, getThree, goTo, store]);

  useFrame((_, delta) => {
    const controls = ref.current;
    if (!controls) return;
    const m = motion.current;
    const now = performance.now() / 1000;
    const { selected, paused } = store.getState();
    const idle = !m.interacting && now - m.lastInput > IDLE_SECONDS && now > m.tweenUntil;
    const target = animate && !paused && selected === null && idle ? ROTATE_SPEED : 0;
    m.speed += (target - m.speed) * Math.min(1, delta / RAMP_SECONDS);
    if (target === 0 && m.speed < 1e-4) m.speed = 0;
    if (m.speed > 0) void controls.rotate(m.speed * delta, 0, false);
  });

  const onInputStart = () => {
    motion.current.interacting = true;
    motion.current.speed = 0;
    motion.current.lastInput = performance.now() / 1000;
  };
  const onInputEnd = () => {
    motion.current.interacting = false;
    motion.current.lastInput = performance.now() / 1000;
  };

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      smoothTime={reducedMotion ? 0 : 0.35}
      draggingSmoothTime={reducedMotion ? 0 : 0.12}
      onControlStart={onInputStart}
      onControlEnd={onInputEnd}
    />
  );
}
