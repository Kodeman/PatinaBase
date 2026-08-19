/**
 * The committed splat fixture (Rendered Room v2, W2).
 *
 * `public/fixtures/splat/room-fixture.ply` is what the dev `?splatUrl=` override
 * points at, and it is the input `splat-canvas.tsx` will be brought up against. A
 * fixture nobody can validate is a liability, so this asserts the two things that
 * make it useful: it is a well-formed 3DGS PLY carrying exactly the properties every
 * splat loader looks for, and it is byte-identical to what its generator produces.
 *
 * The hash below and the one in `public/fixtures/splat/README.md` must agree; if the
 * generator is changed deliberately, both move together in the same commit.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURE = join(process.cwd(), 'public', 'fixtures', 'splat', 'room-fixture.ply');
const SHA256 = '16560222fd86a29ba13ab06404a9bcfa59280922c529005e52f456c695bdf06c';

/** The 3DGS property list, in file order (Kerbl et al.; what Spark's `ply.ts` reads). */
const PROPERTIES = [
  'x', 'y', 'z',
  'nx', 'ny', 'nz',
  'f_dc_0', 'f_dc_1', 'f_dc_2',
  'opacity',
  'scale_0', 'scale_1', 'scale_2',
  'rot_0', 'rot_1', 'rot_2', 'rot_3',
];

const bytes = readFileSync(FIXTURE);
const headerEnd = bytes.indexOf('end_header\n') + 'end_header\n'.length;
const header = bytes.subarray(0, headerEnd).toString('ascii');

describe('room-fixture.ply — header', () => {
  it('is a binary little-endian PLY', () => {
    expect(header.startsWith('ply\n')).toBe(true);
    expect(header).toContain('format binary_little_endian 1.0\n');
  });

  it('declares the full 3DGS property set, in order', () => {
    const declared = [...header.matchAll(/property float (\w+)\n/g)].map((m) => m[1]);
    expect(declared).toEqual(PROPERTIES);
  });

  it('declares a gaussian count small enough to commit and dense enough to read', () => {
    const count = Number(/element vertex (\d+)\n/.exec(header)?.[1]);
    expect(count).toBe(360);
  });
});

describe('room-fixture.ply — body', () => {
  it('carries exactly one float per declared property per gaussian, and no padding', () => {
    const count = Number(/element vertex (\d+)\n/.exec(header)?.[1]);
    expect(bytes.length - headerEnd).toBe(count * PROPERTIES.length * 4);
  });

  it('holds finite floats throughout — no NaN from the logit/log encodings', () => {
    // opacity is stored as a logit and scale as a log; an opacity of exactly 1 or a
    // scale of exactly 0 would silently write ±Infinity and poison a loader.
    for (let offset = headerEnd; offset < bytes.length; offset += 4) {
      expect(Number.isFinite(bytes.readFloatLE(offset))).toBe(true);
    }
  });
});

describe('room-fixture.ply — determinism', () => {
  it('matches the sha256 its generator and README record', () => {
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SHA256);
  });
});
