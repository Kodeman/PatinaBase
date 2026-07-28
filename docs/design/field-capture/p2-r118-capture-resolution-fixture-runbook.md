# P2 R118 — emitting the capture-resolution raster fixture

Date: 2026-07-28

For the operator who already ran the I92 physical fixture
(`p2-item4a-field-raster-qualification-2026-07-24.md`). This records only what
is **different** this time. Everything not mentioned here — device selection,
signing, `devicectl` install, AirDrop/Files transfer, evidence retention, the
no-replace rule on qualification output directories — is unchanged.

## What changed, in one paragraph

The exporter no longer synthesizes at a hard-coded 640x360. It now requires an
explicit capture profile and emits the fixture at that resolution, so the
qualification is about the profile production actually ships. The profile is
read off the **same** `ARWorldTrackingConfiguration` the Field rig runs, and the
manifest records both the resolution and how it was obtained. There is no
default and no fallback: if the profile cannot be resolved, Generate fails.

Consequences you will see:

| | Before (I92) | Now (R118) |
|---|---|---|
| Native raster | 640x360, 921,600 B | device profile, e.g. 1920x1440 → 11,059,200 B |
| Encoded HEIC | 360x640 | e.g. 1440x1920 |
| `schemaVersion` | 1 | **2** |
| Manifest keys | 10 | 11 — new `captureProfile` |
| Export directory | `Documents/field-core-image-raster-v1/` | `Documents/field-core-image-raster-v1-<W>x<H>/` |
| File names | unchanged | unchanged |

The three artifact file names are deliberately **unchanged**
(`field-core-image-raster-v1.heic`, `-native.bgra`, `.json`) — the raster
*convention* is still v1; only the profile is now declared. The directory name
carries the resolution so two fixture sets can never be confused on disk.

## On the device

Build, install and launch exactly as before. Then, in Settings → Diagnostics:

1. **Read the new `Capture profile` row first.** It shows `<W>x<H>` — the
   landscape native resolution the Field rig's configuration reports on this
   device. On a LiDAR iPhone expect something like `1920x1440`. If it reads
   `unavailable`, you are on a Simulator or a device without world tracking;
   stop, there is nothing to emit.
2. Tap **Generate**, then **Share**, and transfer all three artifacts as before.

Record the `<W>x<H>` you saw. It must equal `captureProfile.nativeWidth` /
`nativeHeight` in the emitted JSON.

## The cross-check that is new and not optional

`Capture profile` is read from `ARWorldTrackingConfiguration.videoFormat`
*before* any session runs. Production's authoritative number is
`frame.camera.imageResolution` on a **running** session after RoomPlan has
attached to it. Apple documents that RoomPlan preserves the AR session's
settings, so these should be the same — but that has never been verified on a
device in this repository, and R118 exists precisely because a fixture profile
was assumed to match production and did not.

So before the fixture is used as qualification evidence, confirm it against a
real capture:

1. Run any short Field site scan on the same device (a few seconds is enough —
   this is a resolution reading, not a scan under test).
2. Pull the bundle and read the first line of
   `keyframes/keyframe_index.ndjson`.
3. Compare:
   - `intrinsics.imageWidth` / `imageHeight` — the **native** resolution. These
     must equal the fixture's `captureProfile.nativeWidth` / `nativeHeight`.
   - `width` / `height` — the **encoded** HEIC size, which is the native pair
     swapped. These must equal the fixture's `encodedRaster.width` / `height`.

```bash
head -1 keyframes/keyframe_index.ndjson \
  | python3 -c 'import json,sys; e=json.load(sys.stdin); i=e["intrinsics"]; \
print("native", i["imageWidth"], "x", i["imageHeight"], "| encoded", e["width"], "x", e["height"])'
```

If either pair disagrees with the manifest, **do not qualify the fixture**. The
disagreement is itself the finding: it means RoomPlan or ARKit re-selects the
video format at session start, and the resolver must be changed to read from a
live frame instead of from the configuration.

## Verify the transfer

Same as before — the JSON hashes the other two files — but the sizes are now
large enough that a truncated AirDrop is a realistic failure:

```bash
shasum -a 256 field-core-image-raster-v1-native.bgra field-core-image-raster-v1.heic
python3 -m json.tool field-core-image-raster-v1.json | head -40
```

Additionally check `nativeRaster.rowBytes == nativeWidth * 4` and that the
`.bgra` file is exactly `nativeWidth * nativeHeight * 4` bytes.

## Before the Linux qualification can run

The qualifier has **not** been generalized yet — that is a separate work
package, and it will refuse this fixture until it lands. As shipped,
`services/scan-pipeline/src/patina_scan_worker/field_raster_qualification.py`
fails a v2 fixture at four independent places, all of which must change:

- `NATIVE_WIDTH` / `NATIVE_HEIGHT` / `NATIVE_ROW_BYTES` (`:43-47`) and the
  `ENCODED_*` values derived from them — must come from the manifest.
- `_validate_manifest` rejects `schemaVersion != 1` and enforces an exact
  top-level key set that does not include `captureProfile`.
- `MARKER_CONTRACTS` (`:108-137`) pins each marker's shape string, native
  `(x, y)` and pixel count at the 640x360 values.
- The `expected_dimensions` comparisons at `:1218`, `:1223`, `:1253` and the
  receipt fields at `:1471`, `:1510-1519`, `:1557`, `:1573`.

It does **not** need a new copy of the drawing logic. Every marker is derived
from the two declared dimensions by exact integer arithmetic, so the qualifier
can recompute the whole expected set and compare it against the manifest rather
than trusting it. The rule, in Python:

```python
def scaled(value, numerator, denominator):        # round-half-up, exact
    return (2 * value * numerator + denominator) // (2 * denominator)

W, H = manifest["captureProfile"]["nativeWidth"], manifest["captureProfile"]["nativeHeight"]
size_num, size_den = min(W * 360, H * 640), 640 * 360

corner_half     = scaled(27, size_num, size_den)
cross_half      = scaled(22, size_num, size_den)
cross_thickness = scaled(6,  size_num, size_den)
diamond_radius  = scaled(21, size_num, size_den)

def clamp(cx, cy, hx, hy):
    return (min(max(cx, hx), W - 1 - hx), min(max(cy, hy), H - 1 - hy))

corners = [(corner_half, corner_half), (W - 1 - corner_half, corner_half),
           (corner_half, H - 1 - corner_half), (W - 1 - corner_half, H - 1 - corner_half)]
cross   = clamp(scaled(173, W, 640), scaled(91,  H, 360), cross_half, cross_half)
diamond = clamp(scaled(487, W, 640), scaled(271, H, 360), diamond_radius, diamond_radius)

shapes = (["square-%d" % (2 * corner_half + 1)] * 4
          + ["cross-%d-thickness-%d" % (2 * cross_half + 1, 2 * cross_thickness + 1),
             "diamond-radius-%d" % diamond_radius])
counts = ([(2 * corner_half + 1) ** 2] * 4
          + [(2 * cross_half + 1) * (2 * cross_thickness + 1) * 2 - (2 * cross_thickness + 1) ** 2,
             2 * diamond_radius ** 2 + 2 * diamond_radius + 1])
```

Marker order is fixed: four corners (TL, TR, BL, BR), then the magenta cross,
then the cyan diamond. Encoded coordinates remain `(x, y) -> (H-1-y, x)`.
Synthetic intrinsics are `fx = 512.5*W/640`, `fy = 509.25*W/640`,
`cx = 301.25*W/640`, `cy = 154.75*H/360`; the qualifier already checks only the
rotation relation `(fy, fx, H-cy, cx)` read from the manifest, so it needs no
change there.

At 640x360 every expression above collapses to the pre-R118 constants, which is
how `FieldRasterEncodingTests` proves the generalization is exact: the reference
profile still emits native SHA-256
`6e9dea45e81d4905a912e8921221fa82b074b834f8efe76cc419ae3e82176690`, the byte
string I92 was taken against.

**Add one new guard while you are in there.** The exporter can still emit the
640x360 reference design (tests need it), and it self-identifies:
`captureProfile.deviceModel == "reference-design"` and `videoFormat == "none"`.
The qualifier should refuse that outright — it is a drawing design, not
something any device captures, and accepting it would recreate exactly the R118
defect.

## Bounds

The exporter refuses a profile that is below 640x360 in either axis, not
landscape (ARKit's `capturedImage` always is), larger than 2^24 pixels, or
missing any provenance string. A refusal surfaces as the error text under the
Generate row.
