/**
 * SurfaceKeyProvider — unit tests
 *
 * Verifies provider state, graceful no-provider fallback, setSurfaceKey
 * propagation, initialSurfaceKey change tracking, and dev-mode warnings.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { SurfaceKeyProvider, useSurfaceKey, useSetSurfaceKey } from './SurfaceKeyProvider'
import type { SurfaceKeyProviderProps } from './SurfaceKeyProvider'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper(props: Omit<SurfaceKeyProviderProps, 'children'> = {}) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <SurfaceKeyProvider {...props}>{children}</SurfaceKeyProvider>
  )
  return Wrapper
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SurfaceKeyProvider + useSurfaceKey + useSetSurfaceKey', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
  })

  // ── 1. Default provider state ───────────────────────────────────────────────

  it('returns null from useSurfaceKey when no initialSurfaceKey is passed', () => {
    const { result } = renderHook(() => useSurfaceKey(), { wrapper: makeWrapper() })
    expect(result.current).toBeNull()
  })

  // ── 2. Initial value flows through ─────────────────────────────────────────

  it('returns the initialSurfaceKey passed to the provider', () => {
    const { result } = renderHook(() => useSurfaceKey(), {
      wrapper: makeWrapper({ initialSurfaceKey: 'designer-portal/today/dashboard' }),
    })
    expect(result.current).toBe('designer-portal/today/dashboard')
  })

  // ── 3. setSurfaceKey updates value ─────────────────────────────────────────

  it('updates useSurfaceKey when useSetSurfaceKey is called', () => {
    // Render both hooks in the same renderHook call so they share a single
    // React tree and the same context instance.
    const { result } = renderHook(
      () => ({ key: useSurfaceKey(), set: useSetSurfaceKey() }),
      { wrapper: makeWrapper({ initialSurfaceKey: 'designer-portal/today/dashboard' }) },
    )

    expect(result.current.key).toBe('designer-portal/today/dashboard')

    act(() => {
      result.current.set('admin-portal/dashboard')
    })

    expect(result.current.key).toBe('admin-portal/dashboard')
  })

  // ── 4. initialSurfaceKey change propagates ─────────────────────────────────

  it('follows initialSurfaceKey when the parent re-renders with a different value', () => {
    let initialSurfaceKey: string | null = 'designer-portal/today/dashboard'

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <SurfaceKeyProvider initialSurfaceKey={initialSurfaceKey}>{children}</SurfaceKeyProvider>
    )

    const { result, rerender } = renderHook(() => useSurfaceKey(), { wrapper: Wrapper })

    expect(result.current).toBe('designer-portal/today/dashboard')

    // Simulate a route change by changing initialSurfaceKey and re-rendering
    initialSurfaceKey = 'designer-portal/pipeline/project-list'
    rerender()

    expect(result.current).toBe('designer-portal/pipeline/project-list')
  })

  // ── 5. No-provider graceful fallback (useSurfaceKey) ──────────────────────

  it('returns null from useSurfaceKey when no provider is mounted (no crash)', () => {
    // Render without any SurfaceKeyProvider wrapper
    const { result } = renderHook(() => useSurfaceKey())
    expect(result.current).toBeNull()
  })

  // ── 6. No-provider setter graceful fallback (useSetSurfaceKey) ─────────────

  it('returns a no-op setter from useSetSurfaceKey when no provider is mounted (no crash)', () => {
    const { result } = renderHook(() => useSetSurfaceKey())
    // Calling the no-op setter should not throw
    expect(() => {
      act(() => {
        result.current('designer-portal/today/dashboard')
      })
    }).not.toThrow()
  })

  // ── 7. Dev warning for malformed keys ──────────────────────────────────────

  it('emits a console.warn in non-production env when a malformed key is set', () => {
    // Vitest sets NODE_ENV to 'test', which is !== 'production', so the
    // dev-warning branch in the provider runs without any env manipulation.
    const { result } = renderHook(
      () => ({ set: useSetSurfaceKey() }),
      { wrapper: makeWrapper() },
    )

    act(() => {
      result.current.set('BAD_KEY_NO_SLASH')
    })

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[help-system] currentSurfaceKey="BAD_KEY_NO_SLASH"'),
    )
  })

  // ── Bonus: null is accepted without warning ─────────────────────────────────

  it('does not warn when currentSurfaceKey is null', () => {
    const { result } = renderHook(() => useSetSurfaceKey(), { wrapper: makeWrapper() })

    act(() => {
      result.current(null)
    })

    expect(consoleWarnSpy).not.toHaveBeenCalled()
  })

  // ── Bonus: valid registered key does not warn ──────────────────────────────

  it('does not warn when a valid registered surface key is set', () => {
    const { result } = renderHook(() => useSetSurfaceKey(), { wrapper: makeWrapper() })

    act(() => {
      result.current('client-portal/home')
    })

    expect(consoleWarnSpy).not.toHaveBeenCalled()
  })
})
