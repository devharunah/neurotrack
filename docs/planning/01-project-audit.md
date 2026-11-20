# 01 · Existing project audit

Status: planning (Stage 1). Branch `feat/brain-3d-explorer`, worktree `../nt-brain3d`.
Audited on 2026-11-20 against `main` @ `24a7350`.

Everything in this document was **verified** by reading the code or by analysing the model file
directly, unless it is marked *assumption*.

## 1. Where the 3D brain lives today

NeuroLab's landing page (`/neuro`) is the only 3D surface in the app.

| File | Role | Verdict |
|---|---|---|
| `src/app/(app)/neuro/page.tsx` | Server page: heading, `<BrainExplorer/>`, `<Disclaimer/>` | Keep, restyle |
| `src/app/(app)/neuro/brain-explorer.tsx` | Client shell: `next/dynamic` (`ssr:false`) canvas, `SceneBoundary` error boundary, `WebglNotice` fallback, keyboard `RegionList`, `RegionPanel` (`aria-live`) | **Reuse the patterns**, replace the layout |
| `src/app/(app)/neuro/brain-canvas.tsx` | R3F scene: two translucent ellipsoids, a sphere cerebellum, a cylinder brainstem, six glowing spheres for regions, drei `OrbitControls` (auto-rotate, no pan), drei `Html` labels | **Replace** (the scene). Keep its accessibility attributes and cursor feedback |
| `src/app/(app)/neuro/use-client-env.ts` | `usePrefersReducedMotion`, `useWebglSupport` via `useSyncExternalStore` | **Reuse as is** |
| `src/app/(app)/neuro/regions/[slug]/page.tsx` | Static detail page per region with references | Keep; extend to new regions |
| `src/lib/content/brain-regions.ts` | Six reward-circuit regions (PFC, amygdala, NAc, dorsal striatum, hippocampus, VTA) with anatomy, functions, reward role, addiction findings, **resolved DOIs + PMIDs**, and schematic `explorer` positions | **Reuse and extend** (add region kind + mesh binding) |
| `e2e/neurolab.spec.ts` | Asserts nav "Brain regions" with **6** buttons, `brain-canvas`/`webgl-fallback`, `region-panel`, "Read more" → `/neuro/regions/nucleus-accumbens` | Update deliberately when the list changes |

Stack facts that constrain the design: Next 16.4.6 (App Router), React 19.2.8, `three` ^0.187,
`@react-three/fiber` ^9.8, `@react-three/drei` ^10.7, Tailwind v4 tokens in `src/app/globals.css`
(light app: `paper #f6f7f9`, `ink #0f1b2d`, NeuroLab accent `neuro #be185d`). The signed-in
app shell (`src/app/(app)/layout.tsx`) has a 240 px left sidebar on desktop.

The security headers (`src/lib/security/headers.ts`) matter for 3D delivery:
`script-src 'self' 'unsafe-inline'` with **no `'wasm-unsafe-eval'`**, so a WebAssembly mesh
decoder (meshopt or Draco) is blocked until the policy changes. `worker-src 'self' blob:` and
`img-src blob: data:` are already there for three.js.

### What is good and should survive

- Accessibility thinking: keyboard-equivalent region list, `aria-live` panel, `role="img"` +
  `aria-label` on the canvas, reduced-motion handling (no auto-rotate, demand frameloop).
- Graceful failure: WebGL detection, error boundary around the scene, list-only fallback.
- Content discipline: every reference resolved through Crossref / NCBI and dated.

### What is weak

- No real anatomy: the brain is two ellipsoids; the page itself says "schematic".
- Regions are floating spheres, not surfaces; selection is "click a dot", not "click the brain".
- The canvas is a 560 px card inside a dashboard column, not the centre of the experience.
- No camera transitions, preset views, reset, pan or zoom buttons; auto-rotate does not resume
  after interaction.

## 2. The source model: `3D-BrainModel/Brain_Model.obj`

Added by the user to the main checkout on 2026-11-20 (untracked). Copied into this worktree at
`assets-src/brain/Brain_Model.obj`, which is **git-ignored** because the licence is unverified
(see [04-3d-model-strategy.md](04-3d-model-strategy.md) and [08-risk-assessment.md](08-risk-assessment.md)).

### Measured facts (parsed in Python and Blender, 2026-11-20)

| Property | Value |
|---|---|
| Format | Wavefront OBJ, ASCII, 20.2 MB, header "uses centimeters" |
| Vertices / faces | 192,791 / 192,502 |
| Face type | **100 % quads** (subdivision-ready topology) |
| UVs | Yes (194,775 `vt`) |
| Normals | **None** (no `vn`; shading must be computed) |
| Objects / groups / materials | **None** (no `o`, `g`, `usemtl`, no `.mtl`), only `s` smoothing groups |
| Textures | None supplied |
| Extents | 1.06 (x) × 1.12 (y) × 1.32 (z) model units; Y up, +Z anterior |

Although the file has no object structure, the geometry is **six disconnected surfaces**
(union-find on face connectivity):

| # | Verts | Faces | Centre (x, y, z) | Size (x, y, z) | Identification |
|---|---|---|---|---|---|
| 0 | 115,076 | 115,104 | (−0.02, 0.33, −0.27) | 0.86 × 0.37 × 0.46 | Cerebellum (dense folia) |
| 1 | 27,635 | 27,576 | (−0.01, 0.41, 0.04) | 0.67 × 0.81 × 0.55 | Brainstem with diencephalic/inner structures |
| 2 | 19,213 | 19,111 | (+0.26, 0.71, 0.00) | 0.54 × 0.84 × 1.32 | Right cerebral hemisphere |
| 3 | 19,213 | 19,111 | (−0.26, 0.71, 0.00) | 0.54 × 0.84 × 1.32 | Left cerebral hemisphere (exact mirror) |
| 4 | 9,769 | 9,736 | (−0.02, 0.72, 0.01) | 0.08 × 0.24 × 0.37 | Corpus callosum (thin, midline) |
| 5 | 1,885 | 1,864 | (−0.01, 0.37, 0.14) | 0.15 × 0.09 × 0.10 | Small anterior-inferior midline piece |

### 2.1 Visual inspection (Blender 5.3 Workbench renders, cavity shading)

Rendered with `tools/brain-pipeline/inspect_model.py` (lateral, medial, superior, inferior,
anterior, posterior, oblique; per-part colours and single surface colour). Renders are kept
out of the repo because they are derivatives of an unlicensed asset.

Observed:

- **Lateral surface reads convincingly as a brain.** The lateral (Sylvian) fissure, the temporal
  lobe and a central-sulcus region are recognisable; gyri are rounded and smooth with no
  artefacts. The folding is artist-made: plausible, but it does not match an atlas gyrus for gyrus
  (for example, precentral/postcentral gyri are not cleanly identifiable).
- **Medial surface** shows a cingulate-like gyrus and a calcarine-like sulcus. Each hemisphere is
  an **open shell**: around the corpus callosum there is a hole with a visibly faceted, stair-
  stepped ring of quads. Invisible in the assembled brain, ugly if a hemisphere is isolated.
- **Inferior view** confirms part 1 = brainstem (pons/medulla, cut off below the medulla) and
  part 5 = an oval midline body anterior to the brainstem (pituitary-like; treat as
  "unidentified" until checked against an atlas).
- **Cerebellum** has stylised concentric folia: attractive, but it carries 60 % of all vertices.

### 2.2 Lobe segmentation feasibility probe

`tools/brain-pipeline/lobe_probe.py` grew four regions on the left hemisphere from anatomical
seed points, with a Dijkstra cost that rises inside sulci (sulcal depth = distance below a
heavily smoothed copy of the surface). Result: the temporal boundary followed the Sylvian
fissure cleanly and the frontal/parietal boundary landed in a sulcus near the central region;
the temporal/occipital boundary was arbitrary (as it is anatomically). **Conclusion:** scripted
lobe splitting is feasible for an unsegmented model, but it needs a manual check and would only
ever be as accurate as the artist's gyral pattern.

### 2.3 Licence status (blocking)

The user downloaded the OBJ from Free3D and does not know its licence. Automated access to
free3d.com returns HTTP 403, so the listing could not be checked. Free3D's terms
([Terms & Conditions](https://intercom.help/free3d-787715/en/articles/9937612-terms-conditions))
retain ownership of "derivative and intermediary files", and the TurboSquid Royalty Free License
used for Free3D assets says "giving away the 3D model file itself is not allowed" and requires
models in apps to be in formats that "cannot be opened or imported"
([TurboSquid licence](https://blog.turbosquid.com/royalty-free-license/)). A GLB served by a
public web app and stored in a public repo fails both. Personal-use models are narrower still.
**Until the user shows the listing's licence permits public redistribution, this model must not
be committed or deployed.**

### Assessment against the brief

| Question from the brief | Answer |
|---|---|
| Format | OBJ (convert to GLB for the web) |
| Separate anatomical meshes? | Partly: 6 separable surfaces (2 hemispheres, cerebellum, brainstem, corpus callosum, 1 small piece). **No lobes.** |
| Can regions be selected independently? | Hemispheres, cerebellum, brainstem, corpus callosum: yes, after splitting. Lobes: **only after segmentation work** |
| Can the geometry be modified? | Yes. Clean quads, no n-gons; subdivides and decimates predictably |
| Anatomical detail | Gyri and sulci are modelled and readable; the pattern is artist-made, so it is anatomically *plausible* rather than atlas-exact. Hemispheres are light (19k verts each) vs. a very heavy cerebellum (115k) |
| Materials / textures customisable? | Fully: there are none, so we author them |
| Suitable for the web? | Yes after processing: rebalance density, weld, quantise, compress (target ≤ 3 MB GLB) |

**Conclusion:** technically, the model is upgradeable: clean topology, recognisable folds, and
its gaps (lobes, normals, materials, compression) are all pipeline work. But it **cannot be the
shipping asset** unless its licence is cleared, and even then it has no deep structures (no
nucleus accumbens, amygdala, hippocampus, striatum), which the NeuroLab reward circuit needs.
An openly licensed, atlas-derived model (HRA / Allen reference brain, CC BY 4.0, 283 named
meshes) beats it on accuracy, segmentation and licence. Full comparison in
[04-3d-model-strategy.md](04-3d-model-strategy.md).

What we keep from the Free3D work regardless: the Blender pipeline scripts, the inspection
method, and the lobe-splitting technique, which stays a fallback for any unsegmented model.
