# Field Companion · Wave 2 — device pass (C5)

Constraint C5: **one device pass per wave; a green `capture-gate.sh` never substitutes.** The gate
is a Simulator compile-and-unit-test signal built with `CODE_SIGNING_ALLOWED=NO`, and
`patina-ios-verification` forbids installing such a build for a walk. Vision classification, the
camera, and the recorder are all Simulator-fallback surfaces.

Claim levels, per `patina-ios-verification`: **compile-green < sim-verified < device-verified.**
A criterion that could not be run is written down as not run. It is never written as passed.

## Hardware available at the wave gate

| Device | Model | LiDAR | Connection | Developer mode | WDA |
|---|---|---|---|---|---|
| Kody's Phone (`00008150-00016C8A21DA401C`) | iPhone 17 Pro Max | yes | **wifi only** | enabled | not installed |
| iPhone (`00008110-001630212231801E`) | iPhone 13 Pro | yes | **wifi only** | enabled | not installed |

Wave 1's device pass was blocked on *"developer disk image could not be mounted"* — the same
wifi-only, no-WDA posture. A `xcrun devicectl list devices` probe during this wave returned
`CoreSimulatorService connection became invalid`, `simdiskimaged crashed or is not responding`,
and `Timed out waiting for CoreDeviceService to fully initialize`.

## The five criteria

| # | Criterion | Why only a device can settle it |
|---|---|---|
| 1 | Photograph four real objects — a chair, a table lamp, a rug, a cabinet pull. Expect **four different categories** on the C3 card, each arriving a beat after the card, each badged as a read. None may be `seating` for all four; none may say `Oak / bouclé` unless the label did. | `VNClassifyImageRequest` yields nothing useful on an empty simulator frame. Only a real camera proves the reader reads. |
| 2 | Photograph a wall defect (damaged baseboard, drywall seam). Expect **no category recorded at all**, and S3 recommending **Inbox**, never Library. | The unplaceable path is the wave's headline safety claim, and `S3DestinationScreen` is app-side SwiftUI — unreachable under C1. |
| 3 | Open the C1 mode row. Expect **four** pills — PHOTO · TAG · MEASURE · SCAN — and **no VOICE pill**. Swipe through; the cycle must never land on a fifth. | Partial simulator evidence exists (the sweep renders C1), but the swipe cycle is a gesture. |
| 4 | Trigger a sync with something queued; confirm the offline-sync Live Activity still starts, updates and ends. | ActivityKit does not run in the Simulator in a way that proves the `ContentState` shape change is safe. |
| 5 | On a device with no LiDAR (or with the LiDAR path unavailable), open Site scan → the reference-capture cover. Confirm it renders and that a `screen` event for `screen.F1.context` reaches PostHog. | Wave 1's build-time analytics key means the event should land from a device install; the Simulator harness cannot prove the ingest hop. |

## Result

**Attempted once, 2026-08-25, at the Wave 2 gate. Blocked. No criterion is device-verified.**

The one attempt was a signed Debug build aimed at Kody's Phone (`00008150-00016C8A21DA401C`),
team `VP22LXHT7L`:

```
xcodebuild -project Capture.xcodeproj -scheme Capture -configuration Debug \
  -destination 'platform=iOS,id=00008150-00016C8A21DA401C' DEVELOPMENT_TEAM=VP22LXHT7L
```

Package resolution succeeded; the destination never became available:

```
xcodebuild: error: Timed out waiting for all destinations matching the provided
destination specifier to become available

	Available destinations for the "Capture" scheme:
		{ platform:iOS, arch:arm64, id:00008150-00016C8A21DA401C, name:Kody's Phone,
		  error:The developer disk image could not be mounted on this device. }
```

That is Wave 1's blocker word for word, from the same posture: both LiDAR phones are paired over
wifi only, with no WDA installed. Nothing was built for a device, nothing was installed, and no
app was launched. Per the brief, the attempt was made once and written down rather than retried.

| # | Criterion | Result | Basis |
|---|---|---|---|
| 1 | Four real objects → four different categories, each badged as a read | **not run** | No device install. There is no simulator substitute: `VNClassifyImageRequest` has no real frame to read. Compile-green only. |
| 2 | Wall defect → no category recorded, S3 recommends Inbox | **not run** | No device install. `S3DestinationScreen` is app-target SwiftUI, unreachable under C1, so no unit test reaches it either. The subtraction half is covered in CaptureKit by `UnconfirmedGuessTests` and `SmartGuessTests` — unit-verified, not device-verified. |
| 3 | C1 mode row shows four pills, no VOICE, and the swipe cycle never lands on a fifth | **not run** | Partial **simulator** evidence only: the sweep's `C1.viewfinder.png` (2,923,883 bytes) renders the mode row. A rendered still is not the swipe cycle, and the sweep is not a device. Sim-verified for the render; not run for the gesture. |
| 4 | Live Activity starts, updates and ends with the widened `ContentState` | **not run** | No device install. ActivityKit does not run in the Simulator in any way that would prove the shape change is safe. Compile-green only. |
| 5 | Reference-capture cover renders on a no-LiDAR path, and `screen.F1.context` reaches PostHog | **not run** | Partial **simulator** evidence for the render half: Task 5's `F1.context.png` (581,327 bytes), read independently by two readers. The PostHog ingest half has no evidence at any level — the sweep harness cannot prove the network hop. |

Claim level reached this wave, on `patina-ios-verification`'s ladder: **compile-green** everywhere,
**sim-verified** for two renders (C1's mode row, F1's context screen), **device-verified nowhere.**

**To unblock the next attempt** — a person, not an agent, has to do this: connect one of the two
phones over **USB**, unlock it, and accept the trust prompt so the developer disk image mounts.
The five criteria above then run unchanged. This is now two waves running that the pass has been
owed; it should be a named line item with Kody rather than a gate-time hope.

