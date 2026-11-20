# 07 · Implementation roadmap

Phases 1–5 of the planning brief (audit, research, model strategy, design, architecture) are
done in docs 01–06. This roadmap covers the build, in recommended execution order. All work
happens on `feat/brain-3d-explorer` in the `../nt-brain3d` worktree, one logical change per
commit, `pnpm verify` green before any push.

**Gate 0 (now): user review of docs 01–09.** Decisions needed are listed at the end.

---

## Phase A · Model pipeline (B′: HRA brain → web GLB)

**Objective:** a reproducible `public/models/brain.<hash>.glb` (≤ 3 MB) with named,
selectable structures and attribution.

| Task | Deliverable |
|---|---|
| A1 Pin source: `fetch_source.py` (URL + SHA-256) | Source GLB in git-ignored `assets-src/` |
| A2 `structures.json`: map all 283 Allen meshes → slug / lobe / group / side (with grouping source noted) | Checked-in mapping |
| A3 `build_brain.py`: classify, join lobes, merge seams, remove fragments, decimate, bake cavity to COLOR_0, name nodes, export | Raw GLB |
| A4 gltf-transform optimise (meshopt, quantize, `--join false`) + validate | Final GLB + manifest |
| A5 Six-view review renders; fix seams and fragments | Renders attached to the PR |
| A6 `ATTRIBUTION.md`; resolve Ding et al. 2016 DOI via Crossref | Licence compliance |

- **Depends on:** Gate 0 (model choice).
- **Risks:** seams don't close cleanly between gyri; decimation blurs folds (→ tune per group).
- **Acceptance:** renders show no cracks or shards at default zoom; ≤ 3 MB; node contract test
  passes; validator clean.

## Phase B · Content model

| Task | Deliverable |
|---|---|
| B1 `brain-structures.ts` + zod schema + `Reference` reuse | Typed content |
| B2 Write Level-1 entries (lobes, insula, cingulate, cerebellum, brainstem, corpus callosum, thalamus) with resolved references | Content |
| B3 Bind existing six reward regions to atlas meshes (VTA as approximate, labelled) | Updated `brain-regions.ts` |
| B4 Jest: schema, slugs, node contract, references | Tests |

- **Depends on:** A2 (node ids). **Can run in parallel with Phase A3–A5.**
- **Risk:** reference resolution takes time → ship entries only when references resolve.
- **Acceptance:** tests pass; every entry has ≥ 1 resolved reference or no factual claims.

## Phase C · 3D viewer

| Task | Deliverable |
|---|---|
| C1 Explorer store + deep-link hook (+ Jest) | State layer |
| C2 Stage: Canvas, lighting, background, Suspense progress, Bvh, PerformanceMonitor | Scene shell |
| C3 BrainModel: load GLB, bind nodes, tissue material with cavity + rim | Rendered brain |
| C4 CameraRig: CameraControls, presets, focus-on-structure, idle auto-rotate with eased resume | Camera |
| C5 Selection: hover, click/drag discrimination, highlight + recede tweens | Interaction |
| C6 Reward-circuit mode: ghost cortex, deep structures | Mode |
| C7 Leader-line label at structure anchor | Label |
| C8 CSP: add `'wasm-unsafe-eval'` (or quantize-only fallback) | Headers change |

- **Depends on:** A (GLB), C1 first. C2–C4 can proceed with the raw GLB before optimisation.
- **Risks:** transparency sorting in ghost mode; fresnel tuning; touch gesture conflicts with
  page scroll on mobile.
- **Acceptance:** scene criteria in [09](09-acceptance-criteria.md) §1–§3.

## Phase D · Interface

| Task | Deliverable |
|---|---|
| D1 Full-bleed stage layout inside the app shell | Layout |
| D2 Info panel (desktop) + bottom sheet (mobile) | Panels |
| D3 Welcome panel + coach mark | Onboarding |
| D4 Control pill (reset, pause, zoom, views) + keyboard shortcuts | Controls |
| D5 Structure browser (search, groups, keyboard) | Browser |
| D6 Loading, model-error, WebGL-fallback, context-lost states | Resilience |
| D7 Disclaimer + attribution footer | Compliance |

- **Depends on:** C1 (store). **D2–D5 can be built in parallel with C2–C7** against the store.
- **Acceptance:** [09](09-acceptance-criteria.md) §4–§6.

## Phase E · Testing and refinement

| Task | Deliverable |
|---|---|
| E1 Update `e2e/neurolab.spec.ts` (structure browser replaces list; same detail-page flow) + new specs (deep link, fallback, mobile, reduced motion) | E2E |
| E2 Performance pass on a laptop iGPU and a mid-range Android phone (fps, load time, memory) | Numbers in PR |
| E3 Visual QA from all presets; accessibility pass (keyboard, screen reader, contrast) | Checklist |
| E4 Independent code review + security review of the CSP change | Review notes |
| E5 PR to `main` with screenshots and before/after | PR |

## Parallelism and dependencies

```
Gate 0 ─► A1 ─► A2 ─┬─► A3 ─► A4 ─► A5 ─► A6
                    └─► B1..B4 (parallel)
          C1 ─┬─► C2 ─► C3 ─► C4 ─► C5 ─► C6 ─► C7     (C3 needs a GLB from A3)
              └─► D1..D7 (parallel with C2..C7)
C8 any time before E1 · E after C + D
```

## Later phases (not in this build)

- Phase 2: animated pathways; guided addiction-cycle chapters; isolate/hide; gyri detail
  level; light stage option.
- Phase 3: micro-quizzes; coronal slice view.

## Decisions needed from you at Gate 0

1. **Model:** approve switching to the HRA / Allen brain (CC BY 4.0) as the shipping asset,
   or supply proof that the Free3D model's licence allows public redistribution.
2. **CSP:** approve adding `'wasm-unsafe-eval'` to `script-src` (smallest model), or prefer the
   quantize-only GLB (no CSP change, ~2× larger download).
3. **Design:** approve the dark stage inside the light app (doc 05).
4. **Scope:** confirm the MVP selectable set (doc 04 Levels 1–2) and that pathways, chapters,
   quizzes and slices wait for later phases.
5. **Git history:** confirm the Free3D OBJ was never committed anywhere (it is untracked in the
   main checkout today; it should stay that way or be deleted).
