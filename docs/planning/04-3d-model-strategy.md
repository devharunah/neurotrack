# 04 · 3D model strategy

## Decision summary

**Recommended: Approach B′. Adopt the HRA / Allen reference brain (CC BY 4.0) as the base
model and refine it in a scripted Blender pipeline.** Keep the Free3D OBJ as an internal
reference only, unless its licence is cleared.

This reverses the provisional "upgrade the existing model" direction in the approved plan.
The reason is evidence gathered during Stage 1: the existing model is legally unshippable as
far as we can tell, and it lacks the deep structures the reward-circuit mode needs. The atlas
model has both, and better anatomy.

## Candidates evaluated

| | **A. Existing Free3D OBJ** | **B′. HRA / Allen reference brain** | B″. BodyParts3D | B‴. Brainder (FreeSurfer-derived) | C. Model from scratch in Blender |
|---|---|---|---|---|---|
| Source | User download, Free3D | [NIH 3D 3DPX-020960](https://3d.nih.gov/entries/20960), [HuBMAP ccf-releases](https://github.com/hubmapconsortium/ccf-releases) | [DBCLS archive](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) | [brainder.org](https://brainder.org/brain-for-blender/) | — |
| **Licence** | **Unknown; Free3D terms forbid redistribution of free/royalty-free models** | **CC BY 4.0** [verified on NIH 3D] | CC BY 4.0 (current archive) [agent-verified] | CC BY-SA 3.0 | Ours |
| Anatomical basis | Artist-made | Allen Human Reference Atlas, real donor, expert annotation (Ding et al. 2016) | Visible-Human-derived, FMA-labelled | FreeSurfer average of 12 scans | Artist |
| Accuracy (observed in our renders) | Plausible folds; gyri not atlas-identifiable | Clear central sulcus, pre/postcentral gyri, STG/MTG/ITG; true gyral pattern | Not rendered | Not rendered | Depends on skill; weeks |
| Segmentation | 6 islands; **no lobes, no deep nuclei** | **283 named meshes** (141 per side + optic chiasm): gyri, insula, cingulate, orbital gyri, cerebellum parts, brainstem parts, **nucleus accumbens, amygdaloid complex, hippocampus, caudate, putamen, globus pallidus, substantia nigra, midbrain tegmentum, thalamus, hypothalamus, ventricles** | Many FMA parts | DK/DKT/Destrieux parcellation + subcortical | Manual |
| Mesh | 193k verts, all quads, no normals | 325k verts / 653k tris, triangles, 12 MB GLB | Triangulated, noisy seams [I] | Very high poly | — |
| Visual issues | Open medial shells, faceted callosal ring, cerebellum = 60 % of verts | Hairline seams between gyrus meshes, a few stray fragments, smooth cerebellum (lobules but no folia), some facets | [I] | Heavy | — |
| Lobes | Must be algorithmically split (probe works, needs hand check) | **Deterministic: group gyri by name** | Group parts | Group labels | Manual |
| Effort to ship | Medium + licence risk | Medium | Medium-high | High | Very high |
| Recommendation | Reference only | **Primary** | Fallback for missing parts | Not chosen (ShareAlike, weight) | Not chosen |

Evaluated but not chosen: FreeSurfer fsaverage (ambiguous licence for redistribution), the
SPL/NAC atlas (label volumes, would need meshing), CC-BY Sketchfab models such as
["Lobes of the Cerebrum"](https://sketchfab.com/3d-models/lobes-of-the-cerebrum-2d4eccc2e6624aed8b78c70a075c8ed6)
(lobes only, no deep nuclei), and NC-licensed models (incompatible with an open repository).

## Why not "upgrade the existing model" (Approach A)

The model is technically good raw material: we verified that its quads, folds and parts are
clean and that lobes can be split along sulci. But:

1. **Licence.** Free3D's terms retain ownership of derivatives, and the royalty-free licence
   forbids giving the model away and requires non-importable formats. A GLB on a public site
   and in a public repo breaks both. See [01 §2.3](01-project-audit.md).
2. **No deep structures.** The reward-circuit mode (NeuroLab's reason to exist) would still
   need schematic blobs for the nucleus accumbens, amygdala and others, the exact weakness of
   today's explorer.
3. **Accuracy ceiling.** Its gyral pattern is artist-made, so "precentral gyrus" or "central
   sulcus" cannot be pointed at faithfully. The brief asks us to prioritise accuracy over
   decoration.

If the user produces a licence that permits public redistribution, A becomes a valid
*visual* option (its cerebellum folia are prettier), but B′ would still supply deep structures
and anatomical truth.

## The B′ pipeline (Blender 5.3, headless, scripted, reproducible)

All steps in `tools/brain-pipeline/`, run with `blender -b --factory-startup --python …`.
Source GLB is downloaded by a script (pinned URL + SHA-256), never hand-edited.

1. **Import and classify.** Load the GLB; map each `Allen_*` mesh name to a structure in a
   checked-in mapping table (`structures.json`): lobe, group (cortex / cerebellum / brainstem /
   deep / ventricle), side.
2. **Lobe grouping.** Join gyri into lobe meshes per side using the table (frontal, parietal,
   temporal, occipital, insula, limbic/cingulate). This follows standard anatomical grouping,
   documented in the table with its source.
3. **Seal seams.** Within each lobe, merge vertices by distance (≈ 0.05 mm) and recompute
   normals so the hairline cracks between gyri disappear. Between lobes, keep boundaries but
   align shared borders so no light leaks.
4. **Clean.** Delete fragments under a size threshold (the stray shards seen in renders), and
   fix non-manifold edges.
5. **Rebalance density.** Decimate (collapse, planar-aware) to about 150–220k triangles total:
   cortex gets the budget, ventricles and tiny nuclei get less.
6. **Shading data.** Bake a cavity/AO term into a vertex colour (COLOR_0) so sulci read
   darker without textures. If budget allows, an optional tiling detail normal map adds
   cerebellar folia texture.
7. **Metadata.** Name each node by a stable id (`lh_frontal_lobe`, `nucleus_accumbens_r`…) and
   put `extras` with the structure slug and group.
8. **Export.** GLB, Y-up, normals, COLOR_0, no materials (the app owns materials).
9. **Compress.** `gltf-transform optimize --compress meshopt --join false --simplify false`,
   then quantize. `--join false` keeps each structure pickable. Target ≤ 3 MB on the wire.
10. **Validate.** `gltf-transform validate` + automated renders from 6 views + a node-name
    contract test (`structures.json` ↔ GLB node names) in Jest.

**Licence compliance:** `public/models/ATTRIBUTION.md` plus in-app credit line:
"Brain model: Human Reference Atlas (HuBMAP), built from the Allen Human Reference Atlas
(Ding et al. 2016), CC BY 4.0. Modified: structures grouped, seams merged, decimated." The
Ding et al. DOI is resolved via Crossref before it is printed, as the integrity rules require.

## Anatomical segmentation requirements

**Level 1, default selectable set (per hemisphere where bilateral):**
frontal lobe · parietal lobe · temporal lobe · occipital lobe · insula · cingulate/limbic
cortex · cerebellum · brainstem (midbrain, pons, medulla as sub-parts) · corpus callosum ·
thalamus.

**Level 2, reward-circuit mode:** nucleus accumbens · caudate + putamen (dorsal striatum) ·
globus pallidus · amygdala · hippocampus · substantia nigra · midbrain tegmentum (VTA
location, see caveat) · prefrontal cortex (sub-grouping of frontal gyri: superior/middle
frontal, orbital gyri, anterior cingulate).

**Level 3, later:** individual gyri (already in the data), ventricles.

**VTA caveat.** The atlas has no separate VTA mesh. We will either (a) highlight the ventral
part of the midbrain tegmentum mesh with an on-model label "VTA lies here (approximate)", or
(b) keep a small schematic marker clearly labelled as schematic. Never presented as a measured
boundary. Decision in Phase 2 after seeing it.

## Free3D model: what happens to it

It stays git-ignored in `assets-src/` (local only) as a visual reference. If the user clears its
licence, we re-evaluate swapping in its cerebellum for the folia. Our pipeline already
handles it (`inspect_model.py`, `lobe_probe.py`).
