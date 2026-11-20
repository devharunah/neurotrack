"""QA render: show selected source meshes in red inside the whole brain.

Run:
    blender -b --factory-startup --python tools/brain-pipeline/highlight_meshes.py -- \
        <model.glb> <output_dir> <substring> [<substring> ...]

Every mesh whose name contains one of the substrings is drawn opaque red; the rest of the
brain is drawn grey. Renders a lateral-left, superior, medial-left and inferior view, and an
x-ray pass where the other meshes are hidden. Used to check meshes whose geometry does not
match their name.
"""

import sys
from pathlib import Path

import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :]
SRC, OUT, NEEDLES = Path(ARGS[0]), Path(ARGS[1]), ARGS[2:]
OUT.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SRC))
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
hits = [o for o in meshes if any(n in o.name for n in NEEDLES)]
print("HIGHLIGHT", [o.name for o in hits])
for o in meshes:
    o.color = (0.95, 0.15, 0.15, 1) if o in hits else (0.75, 0.75, 0.75, 1)

pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
centre, size = (lo + hi) / 2, max(hi - lo)

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x, scene.render.resolution_y = 1100, 850
sh = scene.display.shading
sh.light, sh.color_type, sh.show_cavity = "STUDIO", "OBJECT", True
sh.background_type, sh.background_color = "VIEWPORT", (0.08, 0.1, 0.14)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.type, cam.data.ortho_scale = "ORTHO", size * 1.15
scene.collection.objects.link(cam)
scene.camera = cam

# Blender space after glTF import: +Z up, anterior = -Y, left = -X.
views = {
    "lateral_left": Vector((-1, 0, 0)),
    "superior": Vector((0, 0, 1)),
    "inferior": Vector((0, 0, -1)),
}
for xray in (False, True):
    for o in meshes:
        o.hide_render = xray and o not in hits
    for name, d in views.items():
        cam.location = centre + d * size * 3
        if abs(d.z) > 0.99:
            cam.rotation_euler = (0, 0, 0) if d.z > 0 else (3.14159265, 0, 0)
        else:
            cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(OUT / f"{name}_{'xray' if xray else 'context'}.png")
        bpy.ops.render.render(write_still=True)

# Medial view of the left hemisphere: hide the right side and look from +X.
for o in meshes:
    o.hide_render = o.name.endswith("_R") or "_R." in o.name
cam.location = centre + Vector((1, 0, 0)) * size * 3
cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.render.filepath = str(OUT / "medial_left_context.png")
bpy.ops.render.render(write_still=True)
