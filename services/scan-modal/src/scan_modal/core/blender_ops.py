"""The bpy seam. `bpy` is imported INSIDE methods, never at module scope.

`renders` is the one stage whose real work is a 300 MB binary Python module that
only exists inside the Modal image. If the job glue talked to `bpy` directly,
none of it could be tested — so the whole Blender surface is these few verbs,
and `jobs/renders_job.py` knows nothing else about Blender. Tests pass a fake
that implements the same verbs and never import bpy.

Two ways to get geometry in. `import_glb` is the original: wipe the scene, import
`scan.glb`, and that IS the room. On real captures that GLB turns out to be
floor-only, so `build_parametric` builds the room from `captured_room.json`
instead (see `core/parametric_scene`) and `merge_glb` lays whatever the GLB does
carry on top of it, without wiping. Both frames are Blender world, Z-up: the
glTF importer converts Y-up on import, and `parametric_scene` applies the same
change of basis by hand.

Materials are a small fixed palette keyed by the spec's material NAMES. Neutral
and fully matte on purpose — a schematic room reads as massing, and a specular
highlight on a box is a lie about a surface nobody measured.

Lighting is deterministic by construction: a fixed key/fill area pair sized off
the bounding box, plus a flat world colour. No HDRI, no IBL file, no sun angle
derived from a timestamp — two runs of the same GLB must render the same pixels,
and an environment texture is one more thing that could differ between image
builds.
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from .cameras import Bbox, CameraShot, RENDER_HEIGHT, RENDER_WIDTH
from .parametric_scene import SceneSpec

__all__ = ["BlenderScene", "BpyScene", "CYCLES_SAMPLES", "PALETTE"]

#: Enough for a clean interior at 1280×960 without paying for a hero frame.
CYCLES_SAMPLES = 96
#: Key light power scales with room area so a big room is not underlit.
KEY_WATTS_PER_SQM = 220.0
FILL_FRACTION = 0.35
WORLD_AMBIENT = 0.05

#: Base colour per `parametric_scene` material name. Openings sit a few steps off
#: the wall so a window reads as an aperture and not as more wall.
PALETTE: dict[str, tuple[float, float, float, float]] = {
    "wall": (0.90, 0.89, 0.86, 1.0),
    "floor": (0.60, 0.56, 0.51, 1.0),
    "window": (0.63, 0.72, 0.78, 1.0),
    "door": (0.52, 0.44, 0.37, 1.0),
    "opening": (0.74, 0.72, 0.68, 1.0),
    "object": (0.70, 0.70, 0.70, 1.0),
}
#: Fully matte: high roughness and no specular lobe at all.
MATTE_ROUGHNESS = 0.92
#: Objects get a small bevel so their silhouettes catch the key light instead of
#: reading as a pile of hard cubes.
OBJECT_BEVEL_M = 0.02


class BlenderScene(Protocol):
    """What `renders_job` is allowed to know about Blender."""

    def import_glb(self, path: Path) -> Bbox: ...

    def build_parametric(self, spec: SceneSpec) -> None: ...

    def merge_glb(self, path: Path) -> Bbox | None: ...

    def setup(self, bbox: Bbox) -> None: ...

    def render(self, shot: CameraShot, output_path: Path) -> Path: ...


class BpyScene:
    """The real implementation. Every method imports bpy locally."""

    def __init__(self, use_gpu: bool = True, samples: int = CYCLES_SAMPLES):
        self.use_gpu = use_gpu
        self.samples = samples

    # ── scene ────────────────────────────────────────────────────────────────

    def import_glb(self, path: Path) -> Bbox:
        import bpy

        # A fresh factory scene each time: the module-level bpy context persists
        # across calls inside one container, so a second job in the same warm
        # container would otherwise import into the first one's scene.
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(path))

        bbox = self._bbox_of(bpy.context.scene.objects)
        if bbox is None:
            raise RuntimeError("imported GLB contains no mesh geometry")
        return bbox

    def build_parametric(self, spec: SceneSpec) -> None:
        import bpy

        bpy.ops.wm.read_factory_settings(use_empty=True)
        materials = {name: self._matte(name, colour) for name, colour in PALETTE.items()}

        for box in spec.boxes:
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=box.center)
            obj = bpy.context.active_object
            obj.name = box.name
            obj.scale = box.size
            obj.rotation_euler = (0.0, 0.0, box.rotation_z)
            obj.data.materials.append(materials.get(box.material, materials["wall"]))
            if box.kind == "object":
                # Bevel width is measured in the object's LOCAL space, so a
                # 3 m × 0.3 m cabinet left unapplied would get a bevel ten times
                # wider along one edge than the other. Applying the scale first
                # is what makes one width mean one width.
                bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
                bevel = obj.modifiers.new("bevel", type="BEVEL")
                bevel.width = OBJECT_BEVEL_M
                bevel.segments = 2

    def merge_glb(self, path: Path) -> Bbox | None:
        import bpy

        # No factory reset — the parametric room is already in this scene and the
        # GLB is an overlay on it. `None` means the GLB had no mesh at all, which
        # is survivable here in a way it is not in `import_glb`.
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(path))
        imported = [o for o in bpy.context.scene.objects if o not in before]
        return self._bbox_of(imported)

    def setup(self, bbox: Bbox) -> None:
        import bpy

        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.samples = self.samples
        scene.render.resolution_x = RENDER_WIDTH
        scene.render.resolution_y = RENDER_HEIGHT
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "JPEG"
        scene.render.image_settings.quality = 90

        if self.use_gpu:
            self._enable_gpu(scene)

        # Flat, weak ambient — no HDRI, so nothing outside the image can change
        # the result between builds.
        world = bpy.data.worlds.new("patina_world")
        world.use_nodes = False
        world.color = (WORLD_AMBIENT, WORLD_AMBIENT, WORLD_AMBIENT)
        scene.world = world

        sx, sy, sz = bbox.size
        cx, cy, _ = bbox.centroid
        area = max(sx, 0.5) * max(sy, 0.5)
        top = bbox.max[2]
        key_watts = KEY_WATTS_PER_SQM * area
        self._add_area_light("key", (cx, cy, top + 1.0), max(sx, sy), key_watts)
        self._add_area_light(
            "fill",
            (cx, cy, bbox.floor_z + max(sz, 1.0) * 0.5),
            max(sx, sy) * 0.75,
            key_watts * FILL_FRACTION,
        )

    def render(self, shot: CameraShot, output_path: Path) -> Path:
        import bpy
        import mathutils

        camera_data = bpy.data.cameras.new(shot.name)
        if shot.kind == "orthographic":
            camera_data.type = "ORTHO"
            camera_data.ortho_scale = float(shot.ortho_scale or 1.0)
        else:
            camera_data.type = "PERSP"
            camera_data.sensor_width = float(shot.sensor_mm or 36.0)
            camera_data.lens = float(shot.focal_mm or 24.0)
        camera = bpy.data.objects.new(shot.name, camera_data)
        bpy.context.scene.collection.objects.link(camera)
        camera.location = shot.location
        direction = mathutils.Vector(shot.look_at) - mathutils.Vector(shot.location)
        # Blender's own convention helper: a camera looks down its local -Z with
        # +Y up, which is exactly the frame `core.cameras` plans against.
        camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

        bpy.context.scene.camera = camera
        bpy.context.scene.render.filepath = str(output_path)
        bpy.ops.render.render(write_still=True)

        bpy.data.objects.remove(camera, do_unlink=True)
        return output_path

    # ── helpers ──────────────────────────────────────────────────────────────

    @staticmethod
    def _bbox_of(objects) -> Bbox | None:
        import mathutils

        lo = [float("inf")] * 3
        hi = [float("-inf")] * 3
        for obj in objects:
            if obj.type != "MESH":
                continue
            for corner in obj.bound_box:
                world = obj.matrix_world @ mathutils.Vector(corner)
                for axis in range(3):
                    lo[axis] = min(lo[axis], world[axis])
                    hi[axis] = max(hi[axis], world[axis])
        if lo[0] == float("inf"):
            return None
        return Bbox.from_points(lo, hi)

    @staticmethod
    def _matte(name: str, colour: tuple[float, float, float, float]):
        import bpy

        material = bpy.data.materials.new(f"patina_{name}")
        material.use_nodes = True
        bsdf = material.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = colour
        bsdf.inputs["Roughness"].default_value = MATTE_ROUGHNESS
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
        return material

    def _add_area_light(self, name: str, location: tuple[float, float, float], size: float, watts: float) -> None:
        import bpy

        data = bpy.data.lights.new(name, type="AREA")
        data.size = max(size, 0.5)
        data.energy = watts
        obj = bpy.data.objects.new(name, data)
        obj.location = location
        bpy.context.scene.collection.objects.link(obj)

    @staticmethod
    def _enable_gpu(scene) -> None:
        import bpy

        prefs = bpy.context.preferences.addons["cycles"].preferences
        # OPTIX first (L40S is Ada, so it has RT cores worth using), CUDA as the
        # fallback. A device type with no visible devices leaves Cycles on CPU
        # silently, so the enumeration below is what actually proves it took.
        for device_type in ("OPTIX", "CUDA"):
            try:
                prefs.compute_device_type = device_type
            except TypeError:
                continue
            prefs.get_devices()
            if any(d.type == device_type for d in prefs.devices):
                for device in prefs.devices:
                    device.use = device.type == device_type
                scene.cycles.device = "GPU"
                return
        scene.cycles.device = "CPU"
