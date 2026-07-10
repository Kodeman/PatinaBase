/**
 * Parity test (help-desk Wave 0) — the app-side mirror never drifts from the
 * canonical registry.
 *
 * DOCUMENT_SURFACE_KEYS is a hand-kept mirror of
 * `SurfaceKeys.DesignerPortal.Document` (see document-surface-keys.ts for why
 * the mirror exists — the @patina/help-system barrel pulls Layer-4 reference
 * components whose ESM the jest transform can't load). This test imports the
 * canonical registry by RELATIVE PATH into its pure-data source module
 * (surfaceKeys.ts has zero imports — no barrel, no components, jest-safe), so
 * a key added or renamed on either side fails here first.
 *
 * It also pins the Studio Surface Registry's help doorways (registry.tsx
 * `help` fields, added in the same wave): every entry carries one, and every
 * help.surfaceKey is a canonical Document key — so the Contents page / ⌘K
 * help rows can never point the panel at a key Sanity authors can't write to.
 */
import { DOCUMENT_SURFACE_KEYS } from './document-surface-keys';
import { ALL_STUDIO_SURFACES } from '../document/registry';
// Relative import into the package SOURCE (not the dist barrel) — pure data.
import { SurfaceKeys } from '../../../../../packages/help-system/src/surfaceKeys';

/** Flatten the nested const registry into its string-leaf values. */
function flattenKeys(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (node && typeof node === 'object') {
    return Object.values(node as Record<string, unknown>).flatMap(flattenKeys);
  }
  return [];
}

describe('surface-key parity (app mirror ⇄ canonical registry)', () => {
  const canonical = new Set(flattenKeys(SurfaceKeys));

  it('every DOCUMENT_SURFACE_KEYS value exists in the canonical registry', () => {
    const missing = Object.entries(DOCUMENT_SURFACE_KEYS)
      .filter(([, value]) => !canonical.has(value))
      .map(([name, value]) => `${name} → ${value}`);
    expect(missing).toEqual([]);
  });

  it('mirrored keys are unique (no two names share a value)', () => {
    const values = Object.values(DOCUMENT_SURFACE_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });

  describe('Studio Surface Registry help doorways', () => {
    it('every registry entry declares a help doorway', () => {
      const bare = ALL_STUDIO_SURFACES.filter((s) => !s.help).map((s) => s.key);
      expect(bare).toEqual([]);
    });

    it('every help.surfaceKey is a canonical key', () => {
      const rogue = ALL_STUDIO_SURFACES.filter(
        (s) => s.help && !canonical.has(s.help.surfaceKey),
      ).map((s) => `${s.key} → ${s.help?.surfaceKey}`);
      expect(rogue).toEqual([]);
    });

    it('every help blurb is a non-empty single line', () => {
      for (const surface of ALL_STUDIO_SURFACES) {
        expect(surface.help?.blurb.trim().length).toBeGreaterThan(0);
        expect(surface.help?.blurb).not.toContain('\n');
      }
    });
  });
});
