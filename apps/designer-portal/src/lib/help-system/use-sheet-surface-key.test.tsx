/**
 * useSheetSurfaceKey (help-desk Wave 0) — unit test with a mocked provider.
 *
 * The provider mock targets the RESOLVED source path, not the
 * '@patina/help-system' specifier: the package is tsconfig-paths-mapped to
 * `../../packages/help-system/src`, and next/jest's SWC transform rewrites
 * the import specifier to that resolved path at transform time — so
 * `jest.mock('@patina/help-system', …)` silently never applies (the
 * jest-paths-mock gotcha, see stage-select.test.tsx). Mocking the resolved
 * barrel path registers under the key the rewritten import actually
 * requires, and keeps the real barrel (and its @portabletext/react ESM)
 * from ever loading.
 */
import { renderHook } from '@testing-library/react';
import { useSheetSurfaceKey } from './use-sheet-surface-key';
import { DOCUMENT_SURFACE_KEYS } from './document-surface-keys';

const mockSetSurfaceKey = jest.fn();
jest.mock('../../../../../packages/help-system/src/index.ts', () => ({
  useSetSurfaceKey: () => mockSetSurfaceKey,
}));

let mockPathname = '/desk';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

function lastKeySet(): string | undefined {
  return mockSetSurfaceKey.mock.calls.at(-1)?.[0];
}

describe('useSheetSurfaceKey', () => {
  beforeEach(() => {
    mockPathname = '/desk';
  });

  it.each([
    ['orders', DOCUMENT_SURFACE_KEYS.orders],
    ['accounts', DOCUMENT_SURFACE_KEYS.accounts],
    ['hours', DOCUMENT_SURFACE_KEYS.hours],
    ['the-post', DOCUMENT_SURFACE_KEYS.thePost],
  ])('opening the %s ledger sets its surface key', (sheetKey, expected) => {
    renderHook(() => useSheetSurfaceKey(sheetKey));
    expect(lastKeySet()).toBe(expected);
  });

  it('closing a sheet restores the pathname-derived key', () => {
    const { rerender } = renderHook(
      ({ sheet }: { sheet: string | null }) => useSheetSurfaceKey(sheet),
      { initialProps: { sheet: 'orders' as string | null } },
    );
    expect(lastKeySet()).toBe(DOCUMENT_SURFACE_KEYS.orders);

    rerender({ sheet: null });
    expect(lastKeySet()).toBe(DOCUMENT_SURFACE_KEYS.desk);
  });

  it('unmounting while open restores the pathname-derived key', () => {
    mockPathname = '/library/piece-42';
    const { unmount } = renderHook(() => useSheetSurfaceKey('hours'));
    expect(lastKeySet()).toBe(DOCUMENT_SURFACE_KEYS.hours);

    unmount();
    expect(lastKeySet()).toBe(DOCUMENT_SURFACE_KEYS.libraryPiece);
  });

  it('a non-ledger sheet (e.g. feedback) resolves to the surface underneath', () => {
    mockPathname = '/people';
    renderHook(() => useSheetSurfaceKey('feedback'));
    expect(lastKeySet()).toBe(DOCUMENT_SURFACE_KEYS.people);
  });

  it('null (no sheet open) resolves to the surface underneath', () => {
    mockPathname = '/doc/abc-123';
    renderHook(() => useSheetSurfaceKey(null));
    expect(lastKeySet()).toBe(DOCUMENT_SURFACE_KEYS.doc);
  });

  it('switching sheets lands on the new ledger key', () => {
    const { rerender } = renderHook(
      ({ sheet }: { sheet: string | null }) => useSheetSurfaceKey(sheet),
      { initialProps: { sheet: 'orders' as string | null } },
    );
    rerender({ sheet: 'accounts' });
    expect(lastKeySet()).toBe(DOCUMENT_SURFACE_KEYS.accounts);
  });
});
