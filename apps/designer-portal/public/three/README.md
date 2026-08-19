# three.js decoder assets (served locally — never from a CDN)

`ModelStage` (`src/components/document/rooms/room-view/model/`) loads scan GLBs with a
`GLTFLoader` carrying a `DRACOLoader` and a `KTX2Loader`. Both of those fetch their
decoder/transcoder binaries at runtime. three.js' own examples point them at a CDN; we
serve them from this directory instead, so the portal has no third-party runtime
dependency and works behind a locked-down network.

## Provenance

Copied verbatim (no edits) from the `three` package installed in this app:

| Served path | Source | Version |
|---|---|---|
| `/three/draco/draco_decoder.js` | `three/examples/jsm/libs/draco/gltf/draco_decoder.js` | three 0.180.0 |
| `/three/draco/draco_decoder.wasm` | `three/examples/jsm/libs/draco/gltf/draco_decoder.wasm` | three 0.180.0 |
| `/three/draco/draco_wasm_wrapper.js` | `three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js` | three 0.180.0 |
| `/three/basis/basis_transcoder.js` | `three/examples/jsm/libs/basis/basis_transcoder.js` | three 0.180.0 |
| `/three/basis/basis_transcoder.wasm` | `three/examples/jsm/libs/basis/basis_transcoder.wasm` | three 0.180.0 |

The Draco files come from the `draco/gltf/` subdirectory — the decoder-only build glTF
uses — not the parent `draco/` directory, which also ships the (unneeded, ~1 MB) encoder.

sha256 at copy time (re-vendored for the three 0.180.0 bump, Rendered Room v2 W2 —
the three Draco files came across byte-identical to the 0.159 ones, so only the two
basis hashes moved):

```
8625489da79a805f4f2a7d511c3e52d8b4085608a9d2a4d5f4f9de5db0aea04f  draco/draco_decoder.js
a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac  draco/draco_decoder.wasm
8bb2952d2ba7d67e1414f8df819410cb0434a666be53f671fff75f68843d76f6  draco/draco_wasm_wrapper.js
8478b5b6d6b74e7d3082b89f6417321d8d1dc0307f2b30d4484bb11b441696a1  basis/basis_transcoder.js
6cf17dc889352c42e9acf8897107978d127005fe3386c36a0e3845e27967630a  basis/basis_transcoder.wasm
```

## Refreshing after a three.js upgrade

These binaries are version-matched to the loaders that call them — a `three` bump means
re-copying them in the same change:

```bash
cd apps/designer-portal
SRC=node_modules/three/examples/jsm/libs
cp $SRC/draco/gltf/draco_decoder.js  $SRC/draco/gltf/draco_decoder.wasm \
   $SRC/draco/gltf/draco_wasm_wrapper.js  public/three/draco/
cp $SRC/basis/basis_transcoder.js $SRC/basis/basis_transcoder.wasm public/three/basis/
```

Then update the version column and the hashes above.

The paths are wired in `model-canvas.tsx` (`DRACO_DECODER_PATH`, `KTX2_TRANSCODER_PATH`).
