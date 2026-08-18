/**
 * Splat bundle discipline — a source contract (Rendered Room v2, W2), in the shape
 * `lib/document/__tests__/plan-room-contract.test.ts` uses for the PDF libraries.
 *
 * `@sparkjsdev/spark` is the heaviest thing this portal imports: the library plus the
 * Rust splat-decode WASM it inlines as a `data:application/wasm;base64,…` URI. It must
 * be reachable ONLY from `splat-canvas.tsx`, which is itself reachable only through
 * `dynamic(() => import('./splat-canvas'), { ssr:false })` — so a designer who opens
 * Plan, Orbit, or Mesh and never touches Splat downloads none of it.
 *
 * That is a property of the import graph, and the import graph is what is asserted:
 * a stray `import { SplatMesh } from '@sparkjsdev/spark'` anywhere upstream of the
 * dynamic boundary would pull the whole thing into the main bundle silently, and no
 * render test would notice. This is exactly how `model/` holds the same line for
 * three's GLTF/Draco/KTX2 loaders.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const ROOM_VIEW = join(__dirname, '..', '..');
const SPLAT_DIR = join(ROOM_VIEW, 'splat');

const read = (path: string) => readFileSync(path, 'utf8');

/** Every .ts/.tsx source file under room-view/, tests and READMEs excluded. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe('Spark stays behind the dynamic splat chunk', () => {
  const files = sourceFiles(ROOM_VIEW);

  it('finds the room-view sources at all (guards against a silent empty sweep)', () => {
    expect(files.length).toBeGreaterThan(8);
    expect(files).toContain(join(SPLAT_DIR, 'splat-canvas.tsx'));
    expect(files).toContain(join(SPLAT_DIR, 'splat-stage.tsx'));
  });

  it('is imported by exactly one module — splat-canvas.tsx', () => {
    const importers = files.filter((f) => /from ['"]@sparkjsdev\/spark['"]/.test(read(f)));
    expect(importers).toEqual([join(SPLAT_DIR, 'splat-canvas.tsx')]);
  });

  it('reaches that module only through a dynamic, ssr:false import', () => {
    const stage = read(join(SPLAT_DIR, 'splat-stage.tsx'));
    expect(stage).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\('\.\/splat-canvas'\)/);
    expect(stage).toMatch(/ssr:\s*false/);
    // A static import of the canvas would defeat the whole arrangement.
    expect(stage).not.toMatch(/^import .*['"]\.\/splat-canvas['"]/m);
  });

  it('keeps three out of the stage as well — the stage is chrome, not WebGL', () => {
    const stage = read(join(SPLAT_DIR, 'splat-stage.tsx'));
    expect(stage).not.toMatch(/from ['"]three['"]/);
  });

  it('keeps the pure scene half free of Spark, so jsdom can assert it', () => {
    // splat-scene.ts takes the Spark parts structurally. If it ever imports them
    // for real, the scene tests stop being runnable and this file says why.
    expect(read(join(SPLAT_DIR, 'splat-scene.ts'))).not.toMatch(
      /from ['"]@sparkjsdev\/spark['"]/,
    );
  });

  it('is not reachable from the shell that owns the mode switch', () => {
    expect(read(join(ROOM_VIEW, 'room-view.tsx'))).not.toMatch(/@sparkjsdev\/spark/);
  });
});
