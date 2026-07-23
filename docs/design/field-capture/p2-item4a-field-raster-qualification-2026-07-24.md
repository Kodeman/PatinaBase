# Field Capture P2 Item 4A — physical Field raster qualification

Date: 2026-07-24

Capture device: iPhone 17 Pro Max (`00008150`)

Qualification host: `DeskDev`

Code commit: `df10a1578d00b46f4b5a429341bbbe9ec7a90023`

Scope: physical Field/Core Image HEIC-to-raster convention only

## Verdict

**PASS.** The installed immutable scan-pipeline release qualified the exact
physical iPhone artifact:

```text
/opt/patina/scan-pipeline/.venv.release.5e55c004de1888d5984d0c2b
```

The retained, no-replace qualification output is:

```text
/mnt/ada-data/Patina/.patina-builds/field-raster-qualification-v2-iphone17promax-00008150-20260723-df10a157/
```

Its canonical receipt and materialized raster are:

```text
field-raster-qualification-receipt-v2.json
sha256=930638e3e98aa49d27f6b305d886d45b51b94714aecd49a84452e0800e0feac6

field-core-image-raster-v1-materialized.ppm
sha256=78c68791b59f63fb080080d24c70bf6fdbe2fdcba6b6d798694e92c9a29e6f15
```

The operator independently re-read the receipt, proved canonical JSON byte
equality, and recomputed the whole receipt-file SHA-256 from its retained
bytes. The receipt reports `schemaVersion=2`, qualification
`p2-item4a-field-core-image-raster`, and `status=passed`.

## Physical input evidence

The source fixture was emitted by the debug Patina Field app on the physical
iPhone and transferred without re-encoding. The retained source evidence is:

```text
/mnt/ada-data/Patina/.patina-builds/field-core-image-raster-v1-iphone17promax-00008150-20260723-2314/
```

Input SHA-256 values:

- Core Image BGRA oracle:
  `6e9dea45e81d4905a912e8921221fa82b074b834f8efe76cc419ae3e82176690`
- ImageIO HEIC:
  `89b98d8ff82d1421a973f1a5f7a39f9c3a69f4488b20a3ec1229b4c7abc86379`
- Fixture metadata JSON:
  `009431b5df7ca62ce3053c521892733007d5c939cf35140f1608c02087dceb1f`

The physical writer produced one primary-item-associated identity
`irot` (`rotation_ccw=0`). The iOS regression owns the exact ImageIO
`pitm`/`ipco`/`ipma` association, essential-bit, property-index, and payload
contract. The Linux qualifier deliberately owns the narrower public-libheif
contract: exactly one recognized primary-item semantic identity `irot`, no
recognized primary-item `imir` or `clap`, no metadata, and byte-identical raw
and default libheif decodes. It makes no claim about unknown BMFF properties or
unparsed raw association bytes.

All six color markers matched the physical Core Image BGRA oracle within a
maximum per-channel error of one. Mutated non-identity `irot` and `imir`
fixtures were rejected.

## Installed implementation evidence

The receipt binds the installed source used for the run:

- qualification harness source SHA-256:
  `dedb90a187d16fecf8aaca85c0edccee100ed33e1573e60b457485ab940a7fca`
- libheif helper source SHA-256:
  `4840e0e6d3c98bbebecc4354349bae3963718583fb5c882f9807b0d222bee9c3`

Verification before installation passed 48 focused raster tests. The main
scan-pipeline run passed 752 tests; its six build-tool-only cases, which lacked
`pip`/`build` in the borrowed environment, were rerun in their clean build
environment and all passed. The 13-test `FieldRasterEncodingTests` suite and
Capture lint also passed. Installation then passed worker-wheel provenance,
package integrity, bounded PyCOLMAP CUDA SIFT, and systemd candidate checks
before the physical fixture was rerun from the installed release.

## Preserved failure evidence

The failed v1 console evidence remains retained:

```text
field-raster-qualification-v1-iphone17promax-00008150-20260723-2314.console.log
field-raster-qualification-v1-iphone17promax-00008150-20260723-2314-attempt2.console.log
```

Neither failed attempt has a pass receipt. Candidate and negative-mutation
evidence were also retained rather than reused as the official installed-run
receipt.

## Safety posture and boundary

The qualification made no queue, Strata, or Storage mutation. Final DeskDev
posture was:

```text
patina-scan-worker=inactive
patina-scan-worker-doctor=inactive
STAGES=ingest,solve,drawings
installer-transaction=clean
```

This closes the physical Field/Core Image HEIC-to-raster convention only. It
does **not** qualify or enable:

- a production Field Storage acquirer;
- a packaged, killable, descriptor-safe raster materializer;
- the materializer-to-runner-to-publisher lifetime;
- a killable COLMAP backend under the carried lease deadline;
- local-scratch refinement proof on scan `95266be1`;
- the queue/storage Refine handler;
- Fuse, Splat, mesh-solve, or the four-manifest Present join; or
- production registration or GPU-stage activation.

Refine remains unregistered, and the persistent worker remains on its CPU stage
set.
