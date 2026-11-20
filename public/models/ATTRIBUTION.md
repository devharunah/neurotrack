# 3D brain model: attribution and licence

`brain.*.glb` in this folder is a **modified** version of the
Human Reference Atlas (HRA) 3D reference organ "Brain, Male", licensed under
[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

- **Source:** HRA reference organ, brain (male), v1.3, HuBMAP Consortium:
  <https://github.com/hubmapconsortium/ccf-releases> (`v1.3/models/Allen_M_Brain.glb`,
  SHA-256 `2b9ad5b53e40e9f0936da74f7be38d2eed15604e26358c3870a0ea13499b9a35`). Also
  published as NIH 3D entry 3DPX-020960: <https://3d.nih.gov/entries/20960>.
- **Attribution (as requested by the NIH 3D entry):** National Institute of Allergy and
  Infectious Diseases.
- **Underlying atlas:** built from the Allen Human Reference Atlas. Ding SL, et al.
  Comprehensive cellular-resolution atlas of the adult human brain. *J Comp Neurol*
  2016;524:3127–3481. doi:[10.1002/cne.24080](https://doi.org/10.1002/cne.24080),
  PMID [27418273](https://pubmed.ncbi.nlm.nih.gov/27418273/) (resolved via Crossref and NCBI
  E-utilities on 2026-11-20).

## Changes made

Produced by `tools/brain-pipeline/` (see `structures.json` for the full mapping):

- Source meshes grouped into anatomical parts (lobes, deep structures); 20 source structures
  (white-matter shells, tracts, ventricles, some small nuclei) not included.
- Two source labels that do not match their geometry were reassigned or excluded, as documented
  in `structures.json` (`source_label_issues`).
- Vertices welded within each part; small surface fragments removed; cerebellum, brainstem
  and corpus callosum voxel-remeshed (0.3 mm) to close gaps between source meshes.
- Decimated to about 214,000 triangles, recentred and rescaled, ambient occlusion baked into
  vertex colours, then quantized and compressed (meshopt).

The modified model is offered under the same licence, CC BY 4.0. These changes are ours; the
original authors do not endorse NeuroTrack. As the licence states, the material is provided
as-is, without warranties of any kind; see the licence text for the full disclaimer.
