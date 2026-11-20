"""Build the web brain model from the HRA / Allen reference brain (headless Blender 5.x).

Run from the repo root:
    blender -b --factory-startup --python tools/brain-pipeline/build_brain.py -- \
        [--src assets-src/hra/Allen_M_Brain.glb] [--out tools/brain-pipeline/out] \
        [--renders <dir>] [--no-bake]

Steps (see docs/planning/04-3d-model-strategy.md):
 1. import the GLB, flatten the hierarchy, bake transforms into the meshes
 2. classify every mesh through structures.json; drop the excluded ones
 3. join meshes into one object per (part, side)
 4. seal seams (merge vertices by distance), drop tiny fragments, recompute normals
 5. decimate by group budget
 6. recentre and scale so the longest dimension is 2 units (scale recorded in the manifest)
 7. bake ambient occlusion into a vertex colour (surface parts and deep parts separately)
 8. export brain.raw.glb (+Y up, +Z anterior, -X left) with node extras, and manifest.json
"""

import argparse
import colorsys
import json
import sys
from collections import defaultdict
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

MERGE_DIST_M = 0.00015  # 0.15 mm, in source units (metres)
MIN_FRAGMENT_VERTS = 40
REMESH_VOXEL_M = 0.0003  # 0.3 mm, in source units (metres)
TARGET_SIZE = 2.0
AO_DISTANCE = 0.12  # in output units (brain length = 2)
AO_SAMPLES = 48

# Fraction of triangles kept per group, applied only to meshes above SMALL_MESH_TRIS.
DECIMATE_RATIO = {
    "cortex": 0.38,
    "cerebellum": 0.4,
    "brainstem": 0.6,
    "commissure": 0.5,
    "other": 0.6,
    "diencephalon": 0.6,
    "basal_ganglia": 0.7,
    "limbic_deep": 0.7,
}
SMALL_MESH_TRIS = 1500

SIDE_PREFIX = {"L": "lh", "R": "rh", None: "mid"}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", default=str(ROOT / "assets-src/hra/Allen_M_Brain.glb"))
    parser.add_argument("--out", default=str(HERE / "out"))
    parser.add_argument("--renders", default=None)
    parser.add_argument("--no-bake", action="store_true")
    parser.add_argument("--no-decimate", action="store_true")
    return parser.parse_args(argv)


def load_mapping() -> tuple[dict, dict, dict]:
    spec = json.loads((HERE / "structures.json").read_text())
    mesh_to_part = {}
    for part, info in spec["parts"].items():
        for mesh in info["meshes"]:
            mesh_to_part[mesh] = part
    return spec, mesh_to_part, spec["exclude"]


def split_name(name: str) -> tuple[str, str | None]:
    """'Allen_putamen_L' -> ('putamen', 'L'); 'VH_M_optic_chiasm' -> (same, None)."""
    side = None
    base = name.split(".")[0]
    if base.endswith(("_L", "_R")):
        side, base = base[-1], base[:-2]
    if base.startswith("Allen_"):
        base = base[len("Allen_") :]
    return base, side


def import_and_flatten(src: str) -> list[bpy.types.Object]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.data = obj.data.copy() if obj.data.users > 1 else obj.data
        obj.data.transform(world)
        obj.matrix_world = Matrix.Identity(4)
    for obj in [o for o in bpy.context.scene.objects if o.type != "MESH"]:
        bpy.data.objects.remove(obj)
    return meshes


def classify(meshes, mesh_to_part, exclude, parts) -> dict[tuple[str, str], list]:
    groups: dict[tuple[str, str], list] = defaultdict(list)
    unknown = []
    for obj in meshes:
        base, side = split_name(obj.name)
        if base in exclude:
            bpy.data.objects.remove(obj)
        elif base in mesh_to_part:
            part = mesh_to_part[base]
            prefix = "mid" if parts[part].get("midline") else SIDE_PREFIX[side]
            groups[(part, prefix)].append(obj)
        else:
            unknown.append(obj.name)
    if unknown:
        raise SystemExit(f"Unmapped meshes (update structures.json): {unknown}")
    return groups


def join(objs: list, name: str) -> bpy.types.Object:
    target = objs[0]
    if len(objs) > 1:
        with bpy.context.temp_override(
            active_object=target, selected_objects=objs, selected_editable_objects=objs
        ):
            bpy.ops.object.join()
    target.name = name
    target.data.name = name
    return target


FRAGMENT_GROUPS = {"cortex", "cerebellum"}


def seal_and_clean(obj: bpy.types.Object, drop_fragments: bool) -> dict:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=MERGE_DIST_M)
    merged = before - len(bm.verts)
    # Drop tiny disconnected fragments (stray shards in the source).
    bm.verts.ensure_lookup_table()
    seen, islands = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, island = [v], []
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            island.append(cur)
            for e in cur.link_edges:
                o = e.other_vert(cur)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        islands.append(island)
    largest = max(len(i) for i in islands)
    # Only surface groups carry stray shards; small islands inside deep structures are
    # genuine small nuclei and must be kept.
    tiny = [
        i for i in islands if drop_fragments and len(i) < MIN_FRAGMENT_VERTS and len(i) < largest
    ]
    for island in tiny:
        bmesh.ops.delete(bm, geom=island, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return {"merged_verts": merged, "islands": len(islands), "removed_fragments": len(tiny)}


def tri_count(obj: bpy.types.Object) -> int:
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def remesh(obj: bpy.types.Object) -> None:
    """Rebuild as one closed surface; closes gaps between source meshes that welding cannot."""
    mod = obj.modifiers.new("remesh", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = REMESH_VOXEL_M
    mod.adaptivity = 0.0
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in obj.data.polygons:
        poly.use_smooth = True


def decimate(obj: bpy.types.Object, ratio: float) -> None:
    if ratio >= 1 or tri_count(obj) < SMALL_MESH_TRIS:
        return
    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def normalise(objs: list) -> dict:
    pts = [v.co for o in objs for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre, size = (lo + hi) / 2, hi - lo
    scale = TARGET_SIZE / max(size)
    m = Matrix.Scale(scale, 4) @ Matrix.Translation(-centre)
    for o in objs:
        o.data.transform(m)
    return {"metres_per_unit": 1 / scale, "source_size_m": [round(v, 4) for v in size]}


def bake_ao(objs: list, surface: set) -> None:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = AO_SAMPLES
    scene.render.bake.target = "VERTEX_COLORS"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("world")
    scene.world.light_settings.distance = AO_DISTANCE
    for o in objs:
        attr = o.data.color_attributes.new("ao", "BYTE_COLOR", "POINT")
        o.data.color_attributes.active_color = attr
        if not o.data.materials:
            o.data.materials.append(bpy.data.materials.new("bake"))
    # Bake per (surface/deep, hemisphere). Deep parts are baked without the cortex around them
    # (which would turn them black), and each hemisphere without the other one, so a medial
    # wall stays readable when the opposite hemisphere is hidden in the medial view.
    groups = [
        [o for o in objs if (o.name in surface) == is_surface and o["side"] == side]
        for is_surface in (True, False)
        for side in ("lh", "rh", "mid")
    ]
    for group in groups:
        if not group:
            continue
        for o in objs:
            o.hide_render = o not in group
            o.select_set(o in group)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.bake(type="AO")
    for o in objs:
        o.hide_render = False
        o.data.materials.clear()


def label_anchor(obj: bpy.types.Object, surface: bool) -> list[float]:
    verts = [v.co for v in obj.data.vertices]
    centroid = sum(verts, Vector()) / len(verts)
    if not surface or centroid.length < 1e-6:
        return [round(c, 4) for c in centroid]
    direction = centroid.normalized()
    best = max(verts, key=lambda v: v.dot(direction) - 0.5 * (v - centroid).length)
    return [round(c, 4) for c in best]


def render_parts(objs: list, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    parts = sorted({o["part"] for o in objs})
    hue = {p: (i * 0.618) % 1 for i, p in enumerate(parts)}
    for o in objs:
        o.color = (*colorsys.hsv_to_rgb(hue[o["part"]], 0.55, 0.95), 1)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x, scene.render.resolution_y = 1400, 1050
    sh = scene.display.shading
    sh.light, sh.color_type, sh.show_cavity = "STUDIO", "OBJECT", True
    sh.background_type, sh.background_color = "VIEWPORT", (0.08, 0.1, 0.14)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type, cam.data.ortho_scale = "ORTHO", TARGET_SIZE * 1.15
    scene.collection.objects.link(cam)
    scene.camera = cam
    # Blender space after glTF import: +Z up, anterior = -Y, left = -X.
    views = {
        "lateral_left": Vector((-1, 0, 0)),
        "lateral_right": Vector((1, 0, 0)),
        "anterior": Vector((0, -1, 0)),
        "posterior": Vector((0, 1, 0)),
        "superior": Vector((0, 0, 1)),
        "inferior": Vector((0, 0, -1)),
    }
    for deep_only in (False, True):
        for o in objs:
            o.hide_render = deep_only and o["surface"]
        for name, d in views.items():
            if deep_only and name not in ("lateral_left", "superior"):
                continue
            cam.location = d * 6
            if abs(d.z) > 0.99:
                cam.rotation_euler = (0, 0, 0) if d.z > 0 else (3.14159265, 0, 0)
            else:
                cam.rotation_euler = (-cam.location).to_track_quat("-Z", "Y").to_euler()
            suffix = "deep" if deep_only else "parts"
            scene.render.filepath = str(out_dir / f"{name}_{suffix}.png")
            bpy.ops.render.render(write_still=True)
    for o in objs:
        o.hide_render = False


def main() -> None:
    args = parse_args()
    spec, mesh_to_part, exclude = load_mapping()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    meshes = import_and_flatten(args.src)
    groups = classify(meshes, mesh_to_part, exclude, spec["parts"])

    objs, report = [], {}
    for (part, side), members in sorted(groups.items()):
        name = f"{side}_{part}"
        obj = join(members, name)
        info = spec["parts"][part]
        for key in list(obj.keys()):
            del obj[key]  # drop extras inherited from the source nodes
        obj["part"], obj["side"], obj["group"] = part, side, info["group"]
        obj["surface"] = bool(info["surface"])
        stats = seal_and_clean(obj, info["group"] in FRAGMENT_GROUPS)
        stats["tris_source"] = tri_count(obj)
        # Budget comes from the source triangle count, so a remeshed part (which can come out
        # much denser) is decimated to the same target as it would have been without it.
        target = stats["tris_source"] * DECIMATE_RATIO[info["group"]]
        if info.get("remesh"):
            remesh(obj)
            stats["remeshed"] = True
        if not args.no_decimate:
            decimate(obj, min(1.0, target / max(1, tri_count(obj))))
        stats["tris"] = tri_count(obj)
        report[name] = stats
        objs.append(obj)

    scale_info = normalise(objs)
    surface_names = {o.name for o in objs if o["surface"]}
    if not args.no_bake:
        bake_ao(objs, surface_names)

    manifest = {
        "source": spec["source"],
        "axes": {"up": "+Y", "anterior": "+Z", "left": "-X"},
        **scale_info,
        "total_tris": sum(r["tris"] for r in report.values()),
        "nodes": {
            o.name: {
                "part": o["part"],
                "side": o["side"],
                "group": o["group"],
                "surface": o["surface"],
                "tris": report[o.name]["tris"],
                "anchor": label_anchor(o, o["surface"]),
                **{k: v for k, v in report[o.name].items() if k != "tris"},
            }
            for o in objs
        },
    }

    if args.renders:
        render_parts(objs, Path(args.renders))

    bpy.ops.export_scene.gltf(
        filepath=str(out / "brain.raw.glb"),
        export_format="GLB",
        export_yup=True,
        export_normals=True,
        export_texcoords=False,
        export_materials="NONE",
        export_vertex_color="ACTIVE",
        export_extras=True,
        export_apply=True,
    )
    # Blender's +Z-up, -Y-anterior space becomes glTF +Y-up, +Z-anterior on export, so the
    # anchors are converted the same way: (x, y, z)_blender -> (x, z, -y)_gltf.
    for node in manifest["nodes"].values():
        x, y, z = node["anchor"]
        node["anchor"] = [x, z, -y]
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    print("BUILD total_tris", manifest["total_tris"], "nodes", len(objs))
    for name, stats in sorted(report.items(), key=lambda kv: -kv[1]["tris"]):
        print("NODE", name, json.dumps(stats))


main()
