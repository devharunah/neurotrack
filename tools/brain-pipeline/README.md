# Brain model pipeline

Builds `public/models/brain.<hash>.glb` (plus an unpublished no-WebAssembly variant in `out/`) from the HRA / Allen
reference brain. Background and decisions: `docs/planning/04-3d-model-strategy.md`.

## Rebuild

Needs Python 3, Blender 5.x (headless) and `pnpm install`. From the repo root:

```bash
python tools/brain-pipeline/fetch_source.py          # download + verify SHA-256 → assets-src/hra/
blender -b --factory-startup --python tools/brain-pipeline/build_brain.py -- [--renders <dir>]
pnpm brain:optimize                                  # compress, validate, publish, write manifest
pnpm test src/lib/content/brain-model.test.ts        # node contract
```

`build_brain.py` writes to `tools/brain-pipeline/out/` (git-ignored). `optimize.mjs` writes the
hashed GLBs to `public/models/` and the node table to `src/lib/content/brain-model.json`.
Commit those, plus any change to `structures.json`.

## Files

| File | Purpose |
|---|---|
| `structures.json` | Every source mesh → exported part (or excluded, with a reason). Pinned source URL + hash. Documented source-label problems |
| `fetch_source.py` | Downloads the pinned source and checks its hash |
| `build_brain.py` | Blender: classify, join, weld, remesh (where flagged), decimate, normalise, bake AO, export |
| `optimize.mjs` | gltf-transform: meshopt + quantized outputs, Khronos validation, manifest |
| `inspect_glb.py`, `highlight_meshes.py` | QA renders (whole model; selected meshes in red, in context and x-ray) |
| `inspect_model.py`, `lobe_probe.py` | Stage 1 tools for the unsegmented Free3D OBJ (not shipped; kept as a fallback technique) |

## Conventions

- Output axes: +Y up, +Z anterior, −X left. Longest dimension = 2 units; `metresPerUnit` in
  the manifest converts back.
- Node names are `<lh|rh|mid>_<part>`; node `extras` carry `part`, `side`, `group`, `surface`.
- A new structure needs: an entry in `structures.json`, a rebuild, then content in
  `src/lib/content/`.
