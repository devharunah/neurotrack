"""Headless Blender inspection of a candidate brain GLB (e.g. the HRA / Allen reference brain).

Run:
    blender -b --factory-startup --python tools/brain-pipeline/inspect_glb.py -- \
        <model.glb> <output_dir>

Prints every mesh object (name, vertices, triangles) and renders lateral, superior and
oblique views with cavity shading: once in a single surface colour, once with a colour per
object. Writes only into <output_dir>.
"""

import colorsys
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :]
SRC, OUT = Path(ARGS[0]), Path(ARGS[1])
MODES = ("VERTEX",) if "--vertex" in ARGS else ("SINGLE", "OBJECT")
OUT.mkdir(parents=True, exist_ok=True)


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SRC))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    rows = []
    for i, o in enumerate(sorted(meshes, key=lambda o: o.name)):
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        rows.append({"name": o.name, "verts": len(o.data.vertices), "tris": tris})
        o.color = (*colorsys.hsv_to_rgb((i * 0.618) % 1, 0.55, 0.95), 1)
        for p in o.data.polygons:
            p.use_smooth = True
    (OUT / "objects.json").write_text(json.dumps(rows, indent=1))
    print("TOTAL objects", len(rows), "verts", sum(r["verts"] for r in rows), "tris", sum(r["tris"] for r in rows))
    for r in rows:
        print("OBJ", r["name"], r["verts"], r["tris"])

    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre, size = (lo + hi) / 2, (hi - lo)
    print("BOUNDS", [round(v, 4) for v in lo], [round(v, 4) for v in hi])

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x, scene.render.resolution_y = 1400, 1050
    sh = scene.display.shading
    sh.light, sh.show_cavity, sh.cavity_type = "STUDIO", True, "BOTH"
    sh.single_color = (0.82, 0.72, 0.72)
    sh.background_type, sh.background_color = "VIEWPORT", (0.08, 0.1, 0.14)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type, cam.data.ortho_scale = "ORTHO", max(size) * 1.1
    scene.collection.objects.link(cam)
    scene.camera = cam
    # Probe all six axis directions; which one is "lateral" depends on the file's convention.
    views = {
        "px": Vector((1, 0, 0)), "nx": Vector((-1, 0, 0)),
        "py": Vector((0, 1, 0)), "ny": Vector((0, -1, 0)),
        "pz": Vector((0, 0, 1)), "nz": Vector((0, 0, -1)),
    }
    for mode in MODES:
        sh.color_type = mode
        for name, d in views.items():
            cam.location = centre + d * max(size) * 3
            if abs(d.z) > 0.99:
                cam.rotation_euler = (0, 0, 0) if d.z > 0 else (3.14159, 0, 0)
            else:
                cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
            scene.render.filepath = str(OUT / f"{name}_{mode.lower()}.png")
            bpy.ops.render.render(write_still=True)


main()
