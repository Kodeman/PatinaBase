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

Lighting is deterministic by construction and is PLANNED before it is applied:
`plan_lighting` is pure arithmetic over the bounding box and the shot, and
`BpyScene.render` is the only thing that turns a `LightSpec` into a lamp. No
HDRI, no IBL file, no sun angle derived from a timestamp — two runs of the same
room must render the same pixels, and an environment texture is one more thing
that could differ between image builds.

WHY THE RIG WAS REPLACED
────────────────────────
The old rig was one key light at `bbox top + 1.0 m` and a fill at mid-height,
sized at 220 W per square metre of floor. That was written when the model was a
flat slab. Against a real room with 3.3 m walls the key sits about a metre off
the wall tops, and the top-down plate — which looks straight at those wall tops
from directly above — came back burnt to white (W2-EVIDENCE.md §10, open item
2). The same rig lights an interior badly for the mirror-image reason: it is a
single source outside the shell, so once the cameras moved inside
(`core/cameras`) the room is lit from one direction and largely by spill.

What replaces it is two rigs, chosen by shot:

  interior  four area lights, one per ceiling quadrant, hung just under the
            wall tops and facing down — room lighting, near enough — plus a
            weak world term so the void above the (ceiling-less) walls reads as
            a neutral background rather than black.
  top-down  one high, broad key far enough above that its falloff across the
            plan is flat, at a fraction of the interior power, carried by a
            much brighter world dome. A plan plate wants even illumination and
            soft contact shading, not a hero key.

Lights are excluded from camera rays. The interior cameras look out across the
room with a 24 mm lens, whose vertical field reaches well above the light plane,
so a visible lamp would render as a white rectangle floating under the ceiling.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .cameras import Bbox, CameraShot, RENDER_HEIGHT, RENDER_WIDTH, RoomFrame
from .parametric_scene import SceneSpec

#: Degenerate-axis floor, matching `core/cameras`: a flat model must not ask for
#: a zero-watt light over a zero-area room.
_MIN_HALF_EXTENT_M = 0.25

__all__ = [
    "BlenderScene",
    "BpyScene",
    "CYCLES_SAMPLES",
    "PALETTE",
    "LightSpec",
    "LightingPlan",
    "plan_lighting",
]

#: Enough for a clean interior at 1280×960 without paying for a hero frame.
CYCLES_SAMPLES = 96

# ── the interior rig ────────────────────────────────────────────────────────
#: Total emitted power of the four ceiling lights, per square metre of THE
#: ROOM's floor — the area inside its own walls, not the area of its
#: world-aligned bounding box. On the real staging capture those differ by 2.5×
#: (28.3 m² of room inside a 71.9 m² box), so a rig sized off the box makes a
#: room's exposure depend on how it happens to sit relative to the world axes.
#:
#: Blender's own lamp normalisation is not the point-light `P/(4πd²)`: an area
#: light's `energy` is total power spread over the emitter, so irradiance
#: depends on the rectangle's size as well as its distance. That is why
#: `QUADRANT_LIGHT_FRACTION` cannot be changed without re-measuring this.
#:
#: MEASURED against the real staging capture, not derived.
INTERIOR_WATTS_PER_SQM = 5.0
#: How far below the wall tops the ceiling lights hang. Enough to keep them from
#: coplanar-shadowing against the wall caps, small enough to still read as a
#: ceiling fixture.
CEILING_DROP_M = 0.15
#: ...but never below this above the model's floor. A capture with a floor
#: element and no walls is not empty, so `renders` accepts it, and its bbox can
#: be centimetres tall — which would put the whole rig UNDER the slab, where the
#: slab occludes it. Every interior frame would then render on the world term
#: alone and still upload, register and complete the task.
MIN_LIGHT_CLEARANCE_M = 0.15
#: Emitter floor. A rectangle smaller than this is a point light in practice and
#: gives hard, noisy shadows. Applied HERE rather than at the bpy seam so the
#: plan is what Blender actually receives — a clamp downstream of the planner
#: makes every assertion about a `LightSpec` a claim about the wrong number.
MIN_LIGHT_SIZE_M = 0.5
#: Each quadrant light is a rectangle this fraction of its quadrant's footprint.
#: Under 1.0 so the four sources stay distinguishable and the room keeps some
#: falloff across it instead of flattening into one uniform ceiling emitter.
QUADRANT_LIGHT_FRACTION = 0.8
#: The void above the (ceiling-less) walls. Weak: it is a background, and it
#: also fills the upper walls, which the downward ceiling lights barely reach.
INTERIOR_WORLD_AMBIENT = 0.08

# ── the top-down rig ────────────────────────────────────────────────────────
#: The plan key's power, per square metre of floor.
TOP_DOWN_WATTS_PER_SQM = 8.0
#: How far above the wall tops the plan key hangs. High enough that its inverse
#: square falloff is nearly flat across the whole plan — a light just over the
#: wall tops is what burnt them out.
TOP_DOWN_LIGHT_HEIGHT_M = 6.0
#: Plan key size, as a multiple of the room's larger horizontal extent. Broader
#: than the room so its edges do not fall inside the frame.
TOP_DOWN_LIGHT_SPREAD = 1.5
#: A bright dome does most of the work on the plan plate: it reaches into the
#: room evenly, and the soft occlusion it leaves at wall bases and under objects
#: is the shading that makes a plan readable.
TOP_DOWN_WORLD_AMBIENT = 0.35

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


@dataclass(frozen=True)
class LightSpec:
    """One rectangular area light, facing straight down. `watts` is Blender's
    own lamp Power; `size_x`/`size_y` are the rectangle's metres, measured along
    its own axes; `rotation_z` yaws it about world +Z, which leaves it facing
    down and lines an oblong emitter up with an oblong room."""

    name: str
    location: tuple[float, float, float]
    size_x: float
    size_y: float
    watts: float
    rotation_z: float = 0.0


@dataclass(frozen=True)
class LightingPlan:
    """Everything a frame's exposure depends on, as data."""

    lights: tuple[LightSpec, ...]
    world_ambient: float


def _floor_area(bbox: Bbox) -> tuple[float, float, float]:
    """(sx, sy, area) with each horizontal extent floored, so a degenerate model
    cannot ask for a zero-watt light or a zero-sized emitter."""
    sx, sy, _ = bbox.size
    sx, sy = max(sx, 2.0 * _MIN_HALF_EXTENT_M), max(sy, 2.0 * _MIN_HALF_EXTENT_M)
    return sx, sy, sx * sy


def _light(
    name: str,
    location: tuple[float, float, float],
    size_x: float,
    size_y: float,
    watts: float,
    rotation_z: float = 0.0,
) -> LightSpec:
    """A `LightSpec` with the emitter floor already applied, so the plan is what
    Blender receives and an assertion about a spec is an assertion about a lamp."""
    return LightSpec(
        name=name,
        location=location,
        size_x=max(size_x, MIN_LIGHT_SIZE_M),
        size_y=max(size_y, MIN_LIGHT_SIZE_M),
        watts=watts,
        rotation_z=rotation_z,
    )


def plan_lighting(frame: RoomFrame | Bbox, shot: CameraShot) -> LightingPlan:
    """The rig for one shot. Pure: the room frame and the shot in, specs out.

    The plan is per SHOT rather than per scene because the top-down plate and
    the interior frames want opposite things — see the module docstring. It is
    keyed on `shot.kind`, not on the shot's name: "orthographic" IS the plan
    view in this stage, and keying on the name would silently mis-light any
    future ortho shot.

    Which frame each rig uses is the same split `core/cameras` makes, for the
    same reason. The plan plate is a WORLD-aligned shot — an orthographic
    camera looking straight down has world X across its frame — so its key is
    sized and placed off the world box, which is also what keeps the emitter's
    edges out of a frame that shows the whole box. Everything else happens
    INSIDE the room, so it is planned in the room's own frame: on the staging
    capture the world box is 2.5× the room's area and its quadrant centres sit
    up to 1.5 m the far side of a wall, which would emit half the rig's power
    into the void and make a room's exposure depend on its yaw.
    """
    if isinstance(frame, Bbox):
        frame = RoomFrame.from_bbox(frame)
    bbox = frame.bbox
    top = bbox.max[2]

    if shot.kind == "orthographic":
        sx, sy, area = _floor_area(bbox)
        cx, cy, _ = bbox.centroid
        return LightingPlan(
            lights=(
                _light(
                    name="plan_key",
                    location=(cx, cy, top + TOP_DOWN_LIGHT_HEIGHT_M),
                    size_x=sx * TOP_DOWN_LIGHT_SPREAD,
                    size_y=sy * TOP_DOWN_LIGHT_SPREAD,
                    watts=TOP_DOWN_WATTS_PER_SQM * area,
                ),
            ),
            world_ambient=TOP_DOWN_WORLD_AMBIENT,
        )

    hu = max(frame.half_xy[0], _MIN_HALF_EXTENT_M)
    hv = max(frame.half_xy[1], _MIN_HALF_EXTENT_M)
    area = 4.0 * hu * hv
    z = max(top - CEILING_DROP_M, bbox.floor_z + MIN_LIGHT_CLEARANCE_M)
    quadrant_watts = INTERIOR_WATTS_PER_SQM * area / 4.0
    size_u = hu * QUADRANT_LIGHT_FRACTION
    size_v = hv * QUADRANT_LIGHT_FRACTION
    # Fixed order — a lighting plan is as much an artifact input as the camera
    # plan is, and two runs must build the same lamps in the same order.
    quadrants = (
        ("ceiling_ne", 1.0, 1.0),
        ("ceiling_nw", -1.0, 1.0),
        ("ceiling_sw", -1.0, -1.0),
        ("ceiling_se", 1.0, -1.0),
    )
    return LightingPlan(
        lights=tuple(
            _light(
                name=name,
                location=frame.point(sign_u * hu / 2.0, sign_v * hv / 2.0, z),
                size_x=size_u,
                size_y=size_v,
                watts=quadrant_watts,
                rotation_z=frame.yaw,
            )
            for name, sign_u, sign_v in quadrants
        ),
        world_ambient=INTERIOR_WORLD_AMBIENT,
    )


class BlenderScene(Protocol):
    """What `renders_job` is allowed to know about Blender."""

    def import_glb(self, path: Path) -> Bbox: ...

    def build_parametric(self, spec: SceneSpec) -> None: ...

    def merge_glb(self, path: Path) -> Bbox | None: ...

    def setup(self, frame: RoomFrame) -> None: ...

    def render(self, shot: CameraShot, output_path: Path) -> Path: ...


class BpyScene:
    """The real implementation. Every method imports bpy locally."""

    def __init__(self, use_gpu: bool = True, samples: int = CYCLES_SAMPLES):
        self.use_gpu = use_gpu
        self.samples = samples
        #: Held from `setup` so `render` can plan the frame's lighting. The
        #: rig is per shot, and the shot is not known until `render`.
        self._frame: RoomFrame | None = None

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

    def setup(self, frame: RoomFrame) -> None:
        import bpy

        self._frame = frame if isinstance(frame, RoomFrame) else RoomFrame.from_bbox(frame)
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

        # Flat ambient — no HDRI, so nothing outside the image can change the
        # result between builds. The VALUE is per shot and is set in `render`;
        # the world datablock is made once so every frame writes to the same one.
        world = bpy.data.worlds.new("patina_world")
        world.use_nodes = False
        scene.world = world

    def render(self, shot: CameraShot, output_path: Path) -> Path:
        import bpy
        import mathutils

        # Lights are built PER FRAME and torn down with the camera, because the
        # rig differs between the plan plate and the interior shots. Building
        # four lamps costs microseconds against a Cycles frame, and rebuilding
        # is what guarantees no frame inherits the previous one's exposure.
        if self._frame is None:
            # Refused rather than defaulted. Rendering without a rig produces a
            # black frame that still uploads, registers and completes the task —
            # a failure indistinguishable from a very dark room.
            raise RuntimeError("render() called before setup(); no room to light")
        plan = plan_lighting(self._frame, shot)
        ambient = plan.world_ambient
        if bpy.context.scene.world is not None:
            bpy.context.scene.world.color = (ambient, ambient, ambient)
        lights = [self._add_area_light(spec) for spec in plan.lights]

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
        for light in lights:
            # The DATABLOCK too, not just the object. Left behind, 29 frames of
            # `bpy.data.lights.new("ceiling_ne")` return ceiling_ne.001, .002 …
            # and the lamp Blender holds stops being the one the plan names.
            data = light.data
            bpy.data.objects.remove(light, do_unlink=True)
            bpy.data.lights.remove(data)
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

    def _add_area_light(self, spec: LightSpec):
        import bpy

        data = bpy.data.lights.new(spec.name, type="AREA")
        # RECTANGLE, not the default square: a room is rarely square, and a
        # square emitter over an oblong room pools light down its short axis.
        # `shape` first — `size_y` is only honoured for RECTANGLE/ELLIPSE.
        data.shape = "RECTANGLE"
        data.size = spec.size_x
        data.size_y = spec.size_y
        data.energy = spec.watts
        obj = bpy.data.objects.new(spec.name, data)
        obj.location = spec.location
        # A Blender area light emits along its local -Z, and a yaw about world
        # +Z leaves that pointing straight down — so this lines an oblong
        # emitter up with an oblong room without tilting it.
        obj.rotation_euler = (0.0, 0.0, spec.rotation_z)
        #
        # Invisible to camera rays. The interior cameras carry a 24 mm lens
        # whose vertical field reaches metres above the light plane at the far
        # wall, so a lamp left camera-visible renders as a white rectangle
        # hanging in the room. It still lights, shadows and bounces.
        obj.visible_camera = False
        bpy.context.scene.collection.objects.link(obj)
        return obj

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
