"""Generate an isolated metric sample asset, GLB, and preview with Blender.

Run with Blender --background --python scripts/blender/create_door_frame.py.
Also works through MCP with __file__ set to this script's absolute path.
The current scene is preserved; each run creates a separate asset scene.
"""

from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/blender/door-frame.blend"
EXPORT = ROOT / "apps/web/public/models/door-frame.glb"
PREVIEW = ROOT / "assets/blender/door-frame.png"
for output in (SOURCE, EXPORT, PREVIEW):
    output.parent.mkdir(parents=True, exist_ok=True)

# Sample dimensions, not measurements of the apartment. Local origin: opening's
# floor center. Blender +Z becomes glTF +Y; Blender -Y becomes glTF +Z.
OPENING_WIDTH = 0.80
OPENING_HEIGHT = 2.10
TRIM_WIDTH = 0.06
DEPTH = 0.14

scene = bpy.data.scenes.new("T3 - Door Frame Sample")
bpy.context.window.scene = scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
scene["t3_sample"] = True
scene["dimensions_are_surveyed"] = False

material = bpy.data.materials.new("T3 - Warm White Paint")
material.diffuse_color = (0.82, 0.78, 0.69, 1.0)
material.use_nodes = True
bsdf = material.node_tree.nodes.get("Principled BSDF")
bsdf.inputs["Base Color"].default_value = material.diffuse_color
bsdf.inputs["Roughness"].default_value = 0.48


def box(name, dimensions, location):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    bevel = obj.modifiers.new("Soft painted edges", "BEVEL")
    bevel.width = 0.003
    bevel.segments = 3
    return obj


parts = []
for side, sign in (("Left", -1), ("Right", 1)):
    parts.append(box(
        f"DoorFrame_{side}",
        (TRIM_WIDTH, DEPTH, OPENING_HEIGHT),
        (sign * (OPENING_WIDTH + TRIM_WIDTH) / 2, 0, OPENING_HEIGHT / 2),
    ))
parts.append(box(
    "DoorFrame_Header",
    (OPENING_WIDTH + 2 * TRIM_WIDTH, DEPTH, TRIM_WIDTH),
    (0, 0, OPENING_HEIGHT + TRIM_WIDTH / 2),
))

bpy.ops.object.select_all(action="DESELECT")
for part in parts:
    part.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.export_scene.gltf(
    filepath=str(EXPORT), export_format="GLB", use_selection=True,
    use_active_scene=True,
    export_yup=True, export_apply=True, export_materials="EXPORT",
    export_cameras=False, export_lights=False,
)

# Studio helpers belong only to the .blend and preview, never the GLB.
world = bpy.data.worlds.new("T3 - Asset Studio")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.25, 0.25, 0.25, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
scene.world = world

camera_data = bpy.data.cameras.new("T3 - Preview Camera")
camera = bpy.data.objects.new(camera_data.name, camera_data)
scene.collection.objects.link(camera)
camera.location = (3.0, -5.0, 2.8)
camera.rotation_euler = (Vector((0, 0, 1.05)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.type = "ORTHO"
camera_data.ortho_scale = 2.9
scene.camera = camera

for name, position, energy, size in (
    ("Key", (2, -3, 4), 450, 4),
    ("Fill", (-3, -1, 2), 250, 3),
):
    data = bpy.data.lights.new(f"T3 - {name}", "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(light)
    light.location = position
    light.rotation_euler = (Vector((0, 0, 1)) - light.location).to_track_quat("-Z", "Y").to_euler()

scene.render.engine = "CYCLES"
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.resolution_x = 700
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = True
scene.render.filepath = "//" + PREVIEW.name
scene.render.use_stamp_filename = False

# Write only this scene and its dependencies; preserve the user's working file.
bpy.data.libraries.write(str(SOURCE), {scene}, fake_user=True, compress=True)
scene.render.filepath = str(PREVIEW)
bpy.ops.render.render(write_still=True)
print(f"T3_ASSET_OK: {EXPORT}")
print(f"Source: {SOURCE}; preview: {PREVIEW}")
