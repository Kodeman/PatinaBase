/**
 * SmartDefault — unit tests
 *
 * Verifies the headless render-prop wrapper:
 *  - fires `help.smart_default.applied` on mount
 *  - fires `help.smart_default.overridden` the first time onChange is called
 *    with a value !== defaultValue
 *  - does NOT fire overridden a second time, even on further overrides
 *  - does NOT fire overridden when the consumer re-emits the default value
 *  - exposes the correct render-prop API
 *  - renders the right hintNode for each variant
 */
import React, { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { SmartDefault } from './SmartDefault'

// ─── Test helpers ─────────────────────────────────────────────────────────────

interface MockPosthog {
  capture: ReturnType<typeof vi.fn>
}

function installMockPosthog(): MockPosthog {
  const mock: MockPosthog = { capture: vi.fn() }
  ;(window as unknown as { posthog: MockPosthog }).posthog = mock
  return mock
}

function uninstallMockPosthog(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).posthog
}

/**
 * A tiny consumer that wires SmartDefault to a controlled <input>. Mirrors
 * how a real form field would integrate.
 */
function TextConsumer<T extends string>(props: {
  fieldName: string
  defaultValue: T
  reason: string
  surfaceKey?: string
  hint?: 'inline' | 'icon' | 'none'
}) {
  const { fieldName, defaultValue, reason, surfaceKey, hint } = props
  return (
    <SmartDefault<T>
      fieldName={fieldName}
      defaultValue={defaultValue}
      reason={reason}
      surfaceKey={surfaceKey}
      hint={hint}
    >
      {(api) => {
        // Mirror the controlled-input pattern that real consumers would use.
        const [value, setValue] = useState<T>(api.defaultValue)
        return (
          <div>
            <input
              data-testid="field"
              value={value}
              onChange={(e) => {
                const next = e.target.value as T
                setValue(next)
                api.onChange(next)
              }}
            />
            <span data-testid="overridden">{String(api.isOverridden)}</span>
            {api.hintNode}
          </div>
        )
      }}
    </SmartDefault>
  )
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('<SmartDefault />', () => {
  let posthog: MockPosthog

  beforeEach(() => {
    vi.useFakeTimers()
    posthog = installMockPosthog()
  })

  afterEach(() => {
    vi.useRealTimers()
    uninstallMockPosthog()
  })

  // ── 1. Applied event on mount ────────────────────────────────────────────

  it('fires help.smart_default.applied on mount', () => {
    render(
      <TextConsumer
        fieldName="markup_pct"
        defaultValue="3"
        reason="Industry standard"
        surfaceKey="designer-portal/today/dashboard"
      />,
    )

    expect(posthog.capture).toHaveBeenCalledWith(
      'help.smart_default.applied',
      expect.objectContaining({
        field_name: 'markup_pct',
        surface_key: 'designer-portal/today/dashboard',
        reason: 'Industry standard',
        applied_at: expect.any(String),
      }),
    )
  })

  it('does not crash when window.posthog is undefined', () => {
    uninstallMockPosthog()
    expect(() => {
      render(<TextConsumer fieldName="x" defaultValue="3" reason="r" />)
    }).not.toThrow()
  })

  it('omits surface_key from the applied payload when not provided', () => {
    render(<TextConsumer fieldName="x" defaultValue="3" reason="r" />)

    const call = posthog.capture.mock.calls.find(
      ([name]) => name === 'help.smart_default.applied',
    )
    expect(call).toBeDefined()
    expect(call![1]).toMatchObject({ field_name: 'x', reason: 'r' })
    expect(call![1].surface_key).toBeUndefined()
  })

  // ── 2. Override event on first different-value change ────────────────────

  it('fires help.smart_default.overridden the first time onChange runs with a different value', () => {
    render(
      <TextConsumer
        fieldName="markup_pct"
        defaultValue="3"
        reason="Industry standard"
        surfaceKey="designer-portal/today/dashboard"
      />,
    )

    posthog.capture.mockClear()

    // Advance fake clock so time_to_override_ms is measurable
    act(() => {
      vi.advanceTimersByTime(1234)
    })

    const input = screen.getByTestId('field') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: '5' } })
    })

    expect(posthog.capture).toHaveBeenCalledWith(
      'help.smart_default.overridden',
      expect.objectContaining({
        field_name: 'markup_pct',
        surface_key: 'designer-portal/today/dashboard',
        reason: 'Industry standard',
        time_to_override_ms: expect.any(Number),
      }),
    )

    const overrideCall = posthog.capture.mock.calls.find(
      ([name]) => name === 'help.smart_default.overridden',
    )
    expect(overrideCall![1].time_to_override_ms).toBeGreaterThanOrEqual(1234)
    expect(screen.getByTestId('overridden').textContent).toBe('true')
  })

  // ── 3. No-op when onChange is called with the same value as default ─────

  it('does NOT fire overridden when onChange is called with the same value as the default', () => {
    render(<TextConsumer fieldName="x" defaultValue="3" reason="r" />)

    posthog.capture.mockClear()

    const input = screen.getByTestId('field') as HTMLInputElement
    act(() => {
      fireEvent.change(input, { target: { value: '3' } })
    })

    expect(posthog.capture).not.toHaveBeenCalledWith(
      'help.smart_default.overridden',
      expect.anything(),
    )
    expect(screen.getByTestId('overridden').textContent).toBe('false')
  })

  // ── 4. Override fires only once, even on subsequent overrides ────────────

  it('fires overridden ONLY ONCE even when onChange runs with new values repeatedly', () => {
    render(<TextConsumer fieldName="x" defaultValue="3" reason="r" />)

    const input = screen.getByTestId('field') as HTMLInputElement

    act(() => {
      fireEvent.change(input, { target: { value: '5' } })
    })

    act(() => {
      fireEvent.change(input, { target: { value: '7' } })
    })

    act(() => {
      fireEvent.change(input, { target: { value: '9' } })
    })

    const overrideCalls = posthog.capture.mock.calls.filter(
      ([name]) => name === 'help.smart_default.overridden',
    )
    expect(overrideCalls).toHaveLength(1)
  })

  // ── 5. Reverting back to default after override does NOT fire again ─────

  it('does not re-fire overridden when the user reverts the value back to the default', () => {
    render(<TextConsumer fieldName="x" defaultValue="3" reason="r" />)

    const input = screen.getByTestId('field') as HTMLInputElement

    // Override
    act(() => {
      fireEvent.change(input, { target: { value: '5' } })
    })

    // Revert
    act(() => {
      fireEvent.change(input, { target: { value: '3' } })
    })

    const overrideCalls = posthog.capture.mock.calls.filter(
      ([name]) => name === 'help.smart_default.overridden',
    )
    expect(overrideCalls).toHaveLength(1)
  })

  // ── 6. Render-prop API exposes correct values on first render ───────────

  it('passes defaultValue and isOverridden=false to the children render-prop on first render', () => {
    let receivedDefault: unknown
    let receivedOverridden: unknown
    let receivedOnChange: unknown
    render(
      <SmartDefault<number>
        fieldName="margin"
        defaultValue={42}
        reason="seeded"
      >
        {(api) => {
          receivedDefault = api.defaultValue
          receivedOverridden = api.isOverridden
          receivedOnChange = api.onChange
          return <span data-testid="receiver" />
        }}
      </SmartDefault>,
    )

    expect(receivedDefault).toBe(42)
    expect(receivedOverridden).toBe(false)
    expect(typeof receivedOnChange).toBe('function')
  })

  // ── 7. Hint variants ─────────────────────────────────────────────────────

  describe('hint variants', () => {
    it('renders an inline italic note when hint="inline"', () => {
      render(
        <TextConsumer
          fieldName="x"
          defaultValue="3"
          reason="Industry standard"
          hint="inline"
        />,
      )

      const hint = screen.getByTestId('smart-default-hint-inline')
      expect(hint).toBeInTheDocument()
      expect(hint).toHaveTextContent('Industry standard')
    })

    it('renders an icon glyph with a title tooltip when hint="icon"', () => {
      render(
        <TextConsumer
          fieldName="x"
          defaultValue="3"
          reason="Industry standard"
          hint="icon"
        />,
      )

      const hint = screen.getByTestId('smart-default-hint-icon')
      expect(hint).toBeInTheDocument()
      // The icon's accessible name MUST mention the reason so screen readers
      // and hover tooltips both surface why the default was chosen.
      expect(hint.getAttribute('aria-label')).toContain('Industry standard')
    })

    it('defaults to hint="icon" when no hint prop is passed', () => {
      render(<TextConsumer fieldName="x" defaultValue="3" reason="seeded" />)
      expect(screen.queryByTestId('smart-default-hint-icon')).toBeInTheDocument()
      expect(screen.queryByTestId('smart-default-hint-inline')).not.toBeInTheDocument()
    })

    it('renders null hintNode when hint="none"', () => {
      render(
        <TextConsumer
          fieldName="x"
          defaultValue="3"
          reason="seeded"
          hint="none"
        />,
      )
      expect(screen.queryByTestId('smart-default-hint-inline')).not.toBeInTheDocument()
      expect(screen.queryByTestId('smart-default-hint-icon')).not.toBeInTheDocument()
    })
  })

  // ── 8. Works with non-string T (generics) ────────────────────────────────

  it('is generic over T — numbers also work', () => {
    function NumberConsumer() {
      return (
        <SmartDefault<number>
          fieldName="count"
          defaultValue={5}
          reason="historical median"
        >
          {(api) => (
            <button
              type="button"
              data-testid="trigger"
              onClick={() => api.onChange(10)}
            >
              {api.isOverridden ? 'overridden' : 'default'}
            </button>
          )}
        </SmartDefault>
      )
    }

    render(<NumberConsumer />)
    expect(screen.getByTestId('trigger').textContent).toBe('default')

    act(() => {
      screen.getByTestId('trigger').click()
    })

    expect(screen.getByTestId('trigger').textContent).toBe('overridden')
    expect(posthog.capture).toHaveBeenCalledWith(
      'help.smart_default.overridden',
      expect.objectContaining({ field_name: 'count' }),
    )
  })

  // ── 9. Works with object T using referential change ──────────────────────

  it('treats a referentially-different object as an override', () => {
    interface Shape {
      label: string
    }
    function ObjectConsumer() {
      return (
        <SmartDefault<Shape>
          fieldName="shape"
          defaultValue={{ label: 'circle' }}
          reason="popular"
        >
          {(api) => (
            <button
              data-testid="trigger"
              onClick={() => api.onChange({ label: 'circle' })}
            >
              {api.isOverridden ? 'yes' : 'no'}
            </button>
          )}
        </SmartDefault>
      )
    }

    render(<ObjectConsumer />)
    posthog.capture.mockClear()

    act(() => {
      screen.getByTestId('trigger').click()
    })

    // A new object reference !== defaultValue, so this counts as an override.
    // Documenting this deliberate v1 choice (Object.is comparison) — see JSDoc.
    expect(posthog.capture).toHaveBeenCalledWith(
      'help.smart_default.overridden',
      expect.anything(),
    )
  })
})
