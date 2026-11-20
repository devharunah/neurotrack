"""Feasibility probe: sulcus-following lobe segmentation of one hemisphere.

Run:
    blender -b --factory-startup --python tools/brain-pipeline/lobe_probe.py -- \
        <path/to/Brain_Model.obj> <output_dir>

Method (a prototype, not the final pipeline):
1. Sulcal-depth proxy: Laplacian-smooth a copy of the hemisphere heavily; a vertex's depth is
   how far it lies *below* that smooth envelope along its normal. Deep values = sulci/fissures.
2. Multi-source Dijkstra from anatomical seed points (one set per lobe), where an edge costs
   its length times (1 + ALPHA * depth). Fronts slow down inside sulci, so the place where two
   lobes' fronts meet tends to settle inside a sulcus rather than across a gyrus.
3. Render lateral, medial, superior and inferior views coloured by lobe.

Seeds are given in normalised hemisphere coordinates: a = anterior fraction (0 posterior pole,
1 frontal pole), h = height fraction (0 lowest, 1 highest), lat = lateral (1) or medial (0).
"""

import heapq
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :]
SRC, OUT = Path(ARGS[0]), Path(ARGS[1])
OUT.mkdir(parents=True, exist_ok=True)

ALPHA = 60.0
SMOOTH_ITERS = 120

LOBES = {
    "frontal": ((0.95, 0.55, 1), (0.75, 0.97, 1), (0.85, 0.3, 1), (0.8, 0.8, 0)),
    "parietal": ((0.32, 0.97, 1), (0.3, 0.75, 1), (0.3, 0.85, 0)),
    "temporal": ((0.7, 0.12, 1), (0.45, 0.1, 1), (0.3, 0.2, 1)),
    "occipital": ((0.02, 0.45, 1), (0.08, 0.3, 0), (0.06, 0.7, 1)),
}
COLOURS = {
    "frontal": (0.30, 0.62, 0.95, 1),
    "parietal": (0.98, 0.72, 0.25, 1),
    "temporal": (0.45, 0.82, 0.45, 1),
    "occipital": (0.88, 0.40, 0.62, 1),
}


def load_left_hemisphere() -> bpy.types.Object:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=str(SRC), forward_axis="NEGATIVE_Z", up_axis="Y")
    obj = bpy.context.selected_objects[0]
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    hemis = [
        o for o in bpy.context.scene.objects if o.type == "MESH" and 18000 < len(o.data.vertices) < 21000
    ]
    left = min(hemis, key=lambda o: np.mean([v.co.x for v in o.data.vertices]))
    for o in list(bpy.context.scene.objects):
        if o is not left:
            bpy.data.objects.remove(o)
    return left


def adjacency(obj: bpy.types.Object) -> tuple[np.ndarray, np.ndarray]:
    edges = np.array([e.vertices[:] for e in obj.data.edges], dtype=np.int64)
    return edges[:, 0], edges[:, 1]


def sulcal_depth(co: np.ndarray, normals: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    n = len(co)
    deg = np.bincount(a, minlength=n) + np.bincount(b, minlength=n)
    smooth = co.copy()
    for _ in range(SMOOTH_ITERS):
        acc = np.zeros_like(smooth)
        np.add.at(acc, a, smooth[b])
        np.add.at(acc, b, smooth[a])
        smooth = 0.5 * smooth + 0.5 * acc / deg[:, None]
    depth = -np.einsum("ij,ij->i", co - smooth, normals)
    depth = np.clip(depth, 0, None)
    return depth / (np.percentile(depth, 98) + 1e-9)


def seed_vertices(co: np.ndarray, normals: np.ndarray) -> dict[str, list[int]]:
    lo, hi = co.min(0), co.max(0)
    # Mesh-local axes keep the OBJ convention (the importer puts the axis change on the
    # object transform): anterior = +Z, up = +Y, left hemisphere lateral = -X.
    ant = (co[:, 2] - lo[2]) / (hi[2] - lo[2])
    up = (co[:, 1] - lo[1]) / (hi[1] - lo[1])
    lateral_facing = normals[:, 0] < -0.2
    medial_facing = normals[:, 0] > 0.2
    seeds: dict[str, list[int]] = {}
    for lobe, pts in LOBES.items():
        ids = []
        for a_t, h_t, lat in pts:
            mask = lateral_facing if lat else medial_facing
            d = (ant - a_t) ** 2 + (up - h_t) ** 2 + np.where(mask, 0, 10)
            ids.append(int(np.argmin(d)))
        seeds[lobe] = ids
    return seeds


def grow(co: np.ndarray, depth: np.ndarray, a: np.ndarray, b: np.ndarray, seeds: dict) -> np.ndarray:
    n = len(co)
    nbrs: list[list[tuple[int, float]]] = [[] for _ in range(n)]
    lengths = np.linalg.norm(co[a] - co[b], axis=1)
    cost = lengths * (1 + ALPHA * 0.5 * (depth[a] + depth[b]))
    for i, j, c in zip(a.tolist(), b.tolist(), cost.tolist()):
        nbrs[i].append((j, c))
        nbrs[j].append((i, c))
    names = list(seeds)
    label = np.full(n, -1)
    dist = np.full(n, np.inf)
    heap = []
    for k, name in enumerate(names):
        for s in seeds[name]:
            dist[s] = 0
            heapq.heappush(heap, (0.0, s, k))
    while heap:
        d, v, k = heapq.heappop(heap)
        if label[v] != -1:
            continue
        label[v] = k
        for w, c in nbrs[v]:
            nd = d + c
            if label[w] == -1 and nd < dist[w]:
                dist[w] = nd
                heapq.heappush(heap, (nd, w, k))
    return label


def paint(obj: bpy.types.Object, label: np.ndarray, names: list[str]) -> None:
    attr = obj.data.color_attributes.new("lobe", "FLOAT_COLOR", "POINT")
    for i, k in enumerate(label.tolist()):
        attr.data[i].color = COLOURS[names[k]]
    for p in obj.data.polygons:
        p.use_smooth = True


def render(obj: bpy.types.Object) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x, scene.render.resolution_y = 1200, 900
    sh = scene.display.shading
    sh.light, sh.color_type, sh.show_cavity = "STUDIO", "VERTEX", True
    sh.background_type, sh.background_color = "VIEWPORT", (0.08, 0.1, 0.14)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type, cam.data.ortho_scale = "ORTHO", 1.45
    scene.collection.objects.link(cam)
    scene.camera = cam
    c = sum((obj.matrix_world @ Vector(v) for v in obj.bound_box), Vector()) / 8
    for name, d in {"lateral": (-1, 0, 0), "medial": (1, 0, 0), "superior": (0, 0, 1)}.items():
        d = Vector(d)
        cam.location = c + d * 3
        if abs(d.z) > 0.99:
            cam.rotation_euler = (0, 0, 0)
        else:
            cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(OUT / f"lobes_{name}.png")
        bpy.ops.render.render(write_still=True)


def main() -> None:
    obj = load_left_hemisphere()
    co = np.array([v.co[:] for v in obj.data.vertices])
    normals = np.array([v.normal[:] for v in obj.data.vertices])
    a, b = adjacency(obj)
    depth = sulcal_depth(co, normals, a, b)
    seeds = seed_vertices(co, normals)
    label = grow(co, depth, a, b, seeds)
    names = list(seeds)
    for k, name in enumerate(names):
        m = label == k
        print("LOBE", name, int(m.sum()), "verts centroid", np.round(co[m].mean(0), 3).tolist())
    print("AXES y-range", co[:, 1].min(), co[:, 1].max(), "seed coords",
          {n: [np.round(co[i], 2).tolist() for i in ids] for n, ids in seeds.items()})
    paint(obj, label, names)
    render(obj)


main()
