"""Headless Blender inspection of the source brain OBJ.

Run:
    blender -b --factory-startup --python tools/brain-pipeline/inspect_model.py -- \
        <path/to/Brain_Model.obj> <output_dir>

Imports the OBJ, splits it into its loose parts, labels each part with a provisional name
(largest first), prints per-part stats and renders six orthographic Workbench views with
cavity shading so the parts and the gyral pattern can be judged by eye. Writes nothing
except PNGs (and a stats JSON) into <output_dir>; the source file is never modified.
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :]
SRC = Path(ARGS[0])
OUT = Path(ARGS[1])
OUT.mkdir(parents=True, exist_ok=True)

# Distinct, colour-blind-friendly-ish colours per part (largest part first).
PALETTE = [
    (0.35, 0.70, 0.90, 1),
    (0.95, 0.60, 0.25, 1),
    (0.55, 0.80, 0.40, 1),
    (0.90, 0.45, 0.65, 1),
    (0.95, 0.85, 0.30, 1),
    (0.65, 0.55, 0.95, 1),
    (0.6, 0.6, 0.6, 1),
]


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_and_split() -> list[bpy.types.Object]:
    bpy.ops.wm.obj_import(filepath=str(SRC), forward_axis="NEGATIVE_Z", up_axis="Y")
    obj = bpy.context.selected_objects[0]
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    parts.sort(key=lambda o: len(o.data.vertices), reverse=True)
    return parts


def part_stats(o: bpy.types.Object) -> dict:
    coords = [o.matrix_world @ v.co for v in o.data.vertices]
    lo = Vector((min(c.x for c in coords), min(c.y for c in coords), min(c.z for c in coords)))
    hi = Vector((max(c.x for c in coords), max(c.y for c in coords), max(c.z for c in coords)))
    return {
        "name": o.name,
        "verts": len(o.data.vertices),
        "faces": len(o.data.polygons),
        "centre": [round(v, 3) for v in (lo + hi) / 2],
        "size": [round(v, 3) for v in hi - lo],
        "area": round(sum(p.area for p in o.data.polygons), 4),
    }


def scene_bounds(parts: list[bpy.types.Object]) -> tuple[Vector, float]:
    pts = [o.matrix_world @ Vector(c) for o in parts for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return (lo + hi) / 2, (hi - lo).length


def setup_render(colour_by_part: bool) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1050
    scene.render.film_transparent = False
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "OBJECT" if colour_by_part else "SINGLE"
    shading.single_color = (0.82, 0.72, 0.72)
    shading.show_cavity = True
    shading.cavity_type = "BOTH"
    shading.show_shadows = False
    shading.background_type = "VIEWPORT"
    shading.background_color = (0.08, 0.1, 0.14)
    scene.display.render_aa = "16"


def add_camera(centre: Vector, size: float) -> bpy.types.Object:
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = size * 0.95
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def look_from(cam: bpy.types.Object, centre: Vector, direction: Vector, dist: float) -> None:
    cam.location = centre + direction.normalized() * dist
    if abs(direction.normalized().z) > 0.99:
        # Straight up/down: keep anterior (-Y) at the top of the frame.
        cam.rotation_euler = (0.0, 0.0, 0.0) if direction.z > 0 else (math.pi, 0.0, 0.0)
        return
    # Camera looks down its local -Z with local +Y as screen-up; align +Y with world +Z.
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()


def main() -> None:
    reset_scene()
    parts = import_and_split()
    stats = []
    for i, o in enumerate(parts):
        o.name = f"part_{i}"
        o.color = PALETTE[min(i, len(PALETTE) - 1)]
        for p in o.data.polygons:
            p.use_smooth = True
        stats.append(part_stats(o))
    (OUT / "parts.json").write_text(json.dumps(stats, indent=2))
    for s in stats:
        print("PART", json.dumps(s))

    centre, size = scene_bounds(parts)
    cam = add_camera(centre, size)
    dist = size * 3
    # Blender: after import with up=Y forward=-Z, model Y-up becomes Blender Z-up and the
    # anterior (+Z in the OBJ) becomes Blender -Y.
    views = {
        "left_lateral": Vector((-1, 0, 0)),
        "right_lateral": Vector((1, 0, 0)),
        "anterior": Vector((0, -1, 0)),
        "posterior": Vector((0, 1, 0)),
        "superior": Vector((0, 0, 1)),
        "inferior": Vector((0, 0, -1)),
        "oblique": Vector((-1, -0.8, 0.6)),
    }
    for colour_by_part in (True, False):
        setup_render(colour_by_part)
        suffix = "parts" if colour_by_part else "surface"
        for name, d in views.items():
            look_from(cam, centre, d, dist)
            bpy.context.scene.render.filepath = str(OUT / f"{name}_{suffix}.png")
            bpy.ops.render.render(write_still=True)

    # Medial view of the right hemisphere alone (largest hemisphere-shaped part on +x).
    hemis = [o for o in parts if 18000 < len(o.data.vertices) < 21000]
    right = max(hemis, key=lambda o: sum((o.matrix_world @ v.co).x for v in o.data.vertices[:500]))
    for o in parts:
        o.hide_render = o is not right
    setup_render(False)
    look_from(cam, centre, Vector((-1, 0, 0)), dist)
    bpy.context.scene.render.filepath = str(OUT / "right_hemisphere_medial.png")
    bpy.ops.render.render(write_still=True)


main()
