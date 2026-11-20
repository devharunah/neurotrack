# 08 · Risk assessment

Likelihood / impact: L = low, M = medium, H = high.

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| 1 | **Free3D model licence forbids public use** (likely, per Free3D/TurboSquid terms) | H | H | Do not commit or deploy it; it is git-ignored. Switch to the CC BY 4.0 HRA model. Ask the user to check the listing's licence badge. Confirm it is in no commit or branch |
| 2 | **Attribution obligations of CC BY 4.0 missed** | L | M | `public/models/ATTRIBUTION.md`, an in-app credit line, and the modification notice. Verify the attribution text against the NIH 3D entry at release |
| 3 | **Seams between atlas gyrus meshes stay visible** after joining (largely resolved in Phase A: welding + midline remesh) | L | M | Merge by distance within lobes; recompute normals across the join; if cracks remain, shrink-wrap a thin seam strip or fill with a low-poly backing shell. Review six-view renders before shipping |
| 4 | **Decimation blurs gyri** (atlas cortex is the hero) | M | H | Per-group budgets (cortex gets the most); planar-aware collapse; compare renders before/after; keep the budget at 220k tris if visual quality needs it |
| 5 | **Cerebellum looks too smooth** (atlas has lobules but no folia) | H | L | Optional tiling detail normal map for folia; acceptable as is for MVP |
| 6 | **No separate VTA mesh** | H | M | Show the location within the midbrain tegmentum, explicitly labelled approximate; never present an invented boundary |
| 7 | **Picking is unreliable** on thin or deep structures (NAc is small and inside cortex) | M | M | In Structures mode deep structures are not pickable; in Reward mode the ghost cortex is not pickable. Bvh raycasting; the structure browser is always an alternative |
| 8 | **Transparent ghost cortex sorts badly** | M | M | Fresnel-only ghost with `depthWrite:false`, rendered after opaque deep structures; no per-fragment alpha on folded opaque meshes |
| 9 | **Mobile performance** (≈200k tris, high DPR) | M | H | DPR clamp + `PerformanceMonitor` step-down; demand frameloop when idle; test on a real mid-range Android phone; fallback lower-LOD GLB if needed (pipeline can emit two) |
| 10 | **CSP change** (`'wasm-unsafe-eval'`) weakens policy | L | L | Narrow directive (wasm compile only); security review; quantize-only alternative needs no change |
| 11 | **Auto-rotate and camera tweens fight user input** | M | M | One owner of camera state (CameraRig); any control event cancels tweens and rotation; resume only after 4 s idle with easing |
| 12 | **Touch gestures conflict with page scroll** | M | M | Stage owns full viewport height; `touch-action: none` on the canvas only; sheet handles its own drag |
| 13 | **Scientific content errors** (BrainFacts shipped one) | M | H | Integrity rule: every reference resolved; reviewer checks content diff; anatomical names follow TA98 where possible |
| 14 | **Existing E2E tests break** (list of 6 buttons) | H | L | Update tests deliberately in Phase E; keep testids and the region-page flow |
| 15 | **Scope creep** (pathways, quizzes, slices) | M | M | Explicit MVP in doc 04/07; later phases listed separately |
| 16 | **Two sessions collide** in the repo | L | M | Separate worktree `../nt-brain3d` on its own branch; nothing written to `neurotrack/` |
| 17 | **Blender version drift** changes script behaviour | L | L | Pipeline records the Blender version; source pinned by SHA-256; outputs reviewed by render |
| 18 | **HRA source URL moves** | L | L | Pinned URL + hash; mirrored copy kept outside the repo; NIH 3D entry as secondary source |
