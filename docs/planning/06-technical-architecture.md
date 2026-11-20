# 06 · Technical architecture

## 1. Stack decision

| Technology | Status | Decision | Why |
|---|---|---|---|
| three.js 0.187 | Installed | **Keep** | WebGL renderer, GLTFLoader, MeshoptDecoder (bundled, no CDN) |
| @react-three/fiber 9.8 | Installed | **Keep** | Matches the React 19 app; declarative scene; `useFrame` lets animation bypass React state |
| @react-three/drei 10.7.9 | Installed | **Keep, use more of it** | Verified in `node_modules`: `CameraControls` (wraps `camera-controls` 3.x), `useGLTF`, `Bvh` (three-mesh-bvh raycast acceleration), `PerformanceMonitor`, `AdaptiveDpr`, `useProgress`, `Outlines`, `Html` |
| OrbitControls | In use | **Replace with drei `CameraControls`** | OrbitControls has no animated fit/transition API; camera-controls has `fitToBox`, `setLookAt(..., true)`, smooth damping, configurable touch gestures |
| @react-three/postprocessing | Not installed | **Do not add for MVP** | Outline/bloom passes cost mobile frame time; the highlight is done in the material. Revisit only if acceptance tests show legibility problems |
| GLB + `EXT_meshopt_compression` + quantization | — | **Adopt** | Smallest practical delivery with a fast decoder; Draco rejected (slower decode, and drei's default Draco path is a gstatic CDN that our CSP blocks) |
| @gltf-transform/cli | Not installed | **Add as devDependency** (pinned) | Optimise / validate GLB in a reproducible script |
| Blender 5.3 | Installed on this machine (winget) | **Offline pipeline only** | Headless Python scripts in `tools/brain-pipeline/`; not a runtime dependency |
| zod | Installed | **Use** for the structure content schema | Already the project's validation library |

Net new dependencies: **one dev dependency** (`@gltf-transform/cli`). No runtime additions.

## 2. Component architecture

```
src/app/(app)/neuro/
  page.tsx                      server: metadata, <BrainExplorer/>, <Disclaimer/>
  brain-explorer.tsx            client shell: state store provider, layout, fallbacks (reworked)
  explorer/
    explorer-store.ts           tiny external store (useSyncExternalStore): selection, hover,
                                mode, view, rotation paused. No new state library.
    use-explorer.ts             selectors/hooks over the store
    stage.tsx                   <Canvas> (dynamic, ssr:false), lights, env, Suspense, Bvh
    brain-model.tsx             useGLTF → maps nodes to structures, owns materials, pointer events
    structure-material.ts       shared tissue / highlight / ghost materials (onBeforeCompile
                                fresnel rim + emissive mix), uniforms animated in useFrame
    camera-rig.tsx              CameraControls, presets, focus-on-structure, idle auto-rotate
    selection-label.tsx         leader-line label at the structure's anchor (drei Html)
    control-pill.tsx            reset / pause / zoom / view presets (DOM)
    structure-browser.tsx       searchable grouped list (DOM, keyboard)
    info-panel.tsx              panel + bottom sheet variant (DOM)
    welcome-panel.tsx
    use-deep-link.ts            ?s=slug&view=lateral-left ⇄ store
  use-client-env.ts             (existing) reduced motion + WebGL detection

src/lib/content/
  brain-regions.ts              (existing, extended) reward-circuit regions + references
  brain-structures.ts           NEW: anatomy structures (lobes, cerebellum…) with the same
                                Reference type; zod-validated; slug ↔ mesh-node binding
  brain-structures.test.ts      Jest: schema, unique slugs, every mesh node bound, references
                                well-formed

public/models/
  brain.glb                     pipeline output (≤ 3 MB)
  ATTRIBUTION.md                CC BY 4.0 credits

tools/brain-pipeline/
  fetch_source.py               download HRA GLB by pinned URL + SHA-256
  structures.json               Allen mesh name → structure slug / lobe / group / side
  build_brain.py                Blender: classify → join → seal → clean → decimate → bake → export
  inspect_model.py, inspect_glb.py, lobe_probe.py   (Stage 1 tools)
  optimize.mjs / package script gltf-transform optimise + validate
```

Files stay small and single-purpose (repo rule: 200–400 lines typical).

## 3. Key mechanisms

### Model loading
- `useGLTF("/models/brain.glb", false, true)`: Draco **off** (avoids the gstatic CDN), meshopt
  **on** (decoder bundled with three).
- **CSP change:** add `'wasm-unsafe-eval'` to `script-src` in `src/lib/security/headers.ts`.
  MeshoptDecoder instantiates WebAssembly, which CSP blocks without it. `'wasm-unsafe-eval'`
  permits only WebAssembly compilation, not JS `eval`. **Fallback if this is rejected:**
  ship quantize-only GLB (no wasm) at roughly 2× the size.
- `Suspense` + `useProgress` drives the progress line; `useGLTF.preload` on route hover from
  the NeuroLab nav link.
- Long-lived cache: the GLB file name carries a content hash (`brain.<hash>.glb`) written by
  the pipeline into a small manifest, so it can be cached `immutable`.

### Mesh identification
- Pipeline names nodes with stable ids; `brain-structures.ts` binds each slug to one or more
  node names (`frontal-lobe` → `lh_frontal_lobe`, `rh_frontal_lobe`; selection can be per side
  or bilateral).
- A Jest contract test reads the pipeline's `structures.json` export list and fails if content
  references a node that does not exist, or a node has no content.

### Selection and raycasting
- R3F pointer events on the structure meshes; drei `<Bvh>` wraps the model so raycasts against
  ~200k triangles stay cheap. Hover raycasts are skipped on touch devices and while dragging.
- `onPointerMissed` deselects. Click is distinguished from drag by pointer travel < 5 px.

### Highlight (no post-processing)
- One shared material per visual role, patched with `onBeforeCompile`: base tissue colour +
  baked cavity (vertex colour) + fresnel rim + `uHighlight` and `uDim` uniforms.
- Per-structure uniforms are tweened in `useFrame` (critically damped), so transitions cost no
  React renders.
- Reward mode: cortex switches to a ghost variant (fresnel alpha, `depthWrite:false`, rendered
  after opaque deep structures).

### Camera
- `CameraControls` with `smoothTime ≈ 0.35`, distance limits, polar limits, pan enabled
  (bounded with `setBoundary`).
- **Focus:** per-structure preset (azimuth/polar/distance) if defined in content, else
  `fitToBox(structureBox, true, { padding })`, with padding offset for the panel/bottom sheet.
- **Idle auto-rotate:** in `useFrame`, if idle for ≥ 4 s and not reduced-motion, ramp an
  angular velocity from 0 to target with an ease-in, and add `delta × v` to `azimuthAngle`.
  Any `controlstart` event sets velocity to 0 immediately.
- **Views:** named presets, the same API.

### State management
- A small external store with `useSyncExternalStore` (pattern already used in
  `use-client-env.ts`) holds selection / hover / mode / view / paused. DOM components subscribe
  to slices; the 3D scene reads the store imperatively in `useFrame`, so animation never
  re-renders React.

### Performance
- Budgets: GLB ≤ 3 MB transferred; ≤ 220k triangles; ≤ 40 draw calls (structures sharing
  materials); 60 fps on a 2020 mid-range laptop iGPU, ≥ 30 fps on a mid-range Android phone.
- `dpr={[1, 2]}` + drei `PerformanceMonitor` → step DPR down on sustained frame drops.
- `frameloop="demand"` whenever nothing animates (reduced motion, or paused and idle), with
  `invalidate()` on input and tweens.
- Dispose handled by R3F; model cached by `useGLTF`.

### Failure handling
- Keep `useWebglSupport` + `SceneBoundary`. Add a GLB error state (Retry) and handle
  `webglcontextlost` (show a "3D paused, tap to restore" message, rebuild on restore).

## 4. Content management

- `brain-structures.ts` mirrors the `BrainRegion` shape: `slug, name, abbreviation, group,
  side, location, primaryFunctions[], associatedProcesses, related[], references[], meshNodes[],
  camera?`. Reward-circuit entries keep their existing text and `addictionResearch`.
- Adding a structure = one content entry + its node ids in `structures.json` + rerun the
  pipeline. Tests enforce consistency.
- Every reference follows `.claude/rules/scientific-integrity.md` (resolved DOI/PMID, or a
  visible `TODO(citation)` and no claim).

## 5. Testing strategy (fits the repo's Jest/Playwright split)

- **Jest (pure):** content schema, slug/node contract, camera preset maths, deep-link parsing,
  store reducers.
- **Playwright:** page renders; keyboard selection via browser updates panel and URL; deep
  link opens with selection; WebGL-off fallback (launch flag); reduced-motion behaviour;
  mobile viewport bottom sheet; existing "Read more" flow to `/neuro/regions/[slug]`.
  Canvas picking is tested by selecting through the DOM browser, plus one smoke test that
  clicks the canvas centre and asserts *some* structure was selected.
- **Pipeline:** `gltf-transform validate` + a node-name check in CI-free local script; renders
  for visual review.
- `pnpm verify` must pass before any push.
