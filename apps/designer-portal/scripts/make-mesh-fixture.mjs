/**
 * Builds `public/fixtures/mesh/room-fixture.glb` — the Mesh projection's committed,
 * deterministic stand-in for a scan GLB (Rendered Room v2, W2).
 *
 * A sibling of `make-splat-fixture.mjs`, for the same reason: local dev has no scan
 * that carries `model_url_gltf`, so before this file the only way to see whether
 * `ModelStage` actually draws was to wait for a real capture. It is a room-shaped
 * box — 4.8m × 2.6m × 3.6m, floor at y = 0 — written by hand rather than exported,
 * so it depends on no toolchain and cannot drift.
 *
 * Deliberately plain: no Draco, no KTX2, no textures, no materials beyond the glTF
 * default. Those decoders are exercised by real scans; what this fixture is for is
 * proving the loader → scene → camera → renderer path runs, which is exactly the
 * path a three.js version bump puts at risk.
 *
 *   node scripts/make-mesh-fixture.mjs
 *
 * Byte-identical on every run. Re-run it only if the geometry below changes.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'fixtures', 'mesh', 'room-fixture.glb');

// Room-shaped box in metres (a RoomPlan GLB's units), floor on y = 0.
const W = 4.8;
const H = 2.6;
const D = 3.6;

const positions = new Float32Array([
  // 8 corners: floor ring then ceiling ring
  0, 0, 0,   W, 0, 0,   W, 0, D,   0, 0, D,
  0, H, 0,   W, H, 0,   W, H, D,   0, H, D,
]);

// 12 triangles, wound so the room reads solid from outside.
const indices = new Uint16Array([
  0, 2, 1,  0, 3, 2, // floor
  4, 5, 6,  4, 6, 7, // ceiling
  0, 1, 5,  0, 5, 4, // -z wall
  1, 2, 6,  1, 6, 5, // +x wall
  2, 3, 7,  2, 7, 6, // +z wall
  3, 0, 4,  3, 4, 7, // -x wall
]);

const pad4 = (n) => (n + 3) & ~3;

const posBytes = Buffer.from(positions.buffer);
const idxBytes = Buffer.from(indices.buffer);
const posOffset = 0;
const idxOffset = pad4(posBytes.length);
const binLength = idxOffset + idxBytes.length;

const gltf = {
  asset: { version: '2.0', generator: 'patina make-mesh-fixture' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'room' }],
  meshes: [{ name: 'room', primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126, // FLOAT
      count: positions.length / 3,
      type: 'VEC3',
      // Required on a POSITION accessor, and three reads them for bounds.
      min: [0, 0, 0],
      max: [W, H, D],
    },
    {
      bufferView: 1,
      componentType: 5123, // UNSIGNED_SHORT
      count: indices.length,
      type: 'SCALAR',
    },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: posOffset, byteLength: posBytes.length, target: 34962 },
    { buffer: 0, byteOffset: idxOffset, byteLength: idxBytes.length, target: 34963 },
  ],
  buffers: [{ byteLength: binLength }],
};

// ── GLB container ─────────────────────────────────────────────────────────────
// Both chunks are 4-byte aligned; JSON pads with spaces, BIN pads with zeroes.
const jsonRaw = Buffer.from(JSON.stringify(gltf), 'utf8');
const jsonChunk = Buffer.alloc(pad4(jsonRaw.length), 0x20);
jsonRaw.copy(jsonChunk);

const binChunk = Buffer.alloc(pad4(binLength), 0);
posBytes.copy(binChunk, posOffset);
idxBytes.copy(binChunk, idxOffset);

const header = Buffer.alloc(12);
header.write('glTF', 0, 'ascii');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binChunk.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

const glb = Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, glb);
console.log(`wrote ${OUT} — ${glb.length} bytes, ${indices.length / 3} triangles`);
