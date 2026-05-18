import React, { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { SurfaceKeyProvider, useSurfaceKey, useSetSurfaceKey } from './SurfaceKeyProvider'
import { SurfaceKeys } from '../surfaceKeys'

// ─── Inner display component (reads the current key) ──────────────────────────

function CurrentKeyDisplay() {
  const currentKey = useSurfaceKey()
  return (
    <pre
      style={{
        background: '#f4f4f5',
        border: '1px solid #e4e4e7',
        borderRadius: 6,
        padding: '12px 16px',
        fontFamily: 'monospace',
        fontSize: '0.875rem',
        minWidth: 320,
      }}
    >
      {currentKey === null ? '(null — no surface key set)' : currentKey}
    </pre>
  )
}

// ─── Inner control component (writes the current key) ─────────────────────────

const SAMPLE_KEYS = [
  SurfaceKeys.DesignerPortal.Today.Dashboard,
  SurfaceKeys.DesignerPortal.Pipeline.ProjectList,
  SurfaceKeys.AdminPortal.Dashboard,
] as const

function KeyCycler() {
  const setSurfaceKey = useSetSurfaceKey()
  const [index, setIndex] = useState(0)

  const handleCycle = () => {
    const next = (index + 1) % SAMPLE_KEYS.length
    setIndex(next)
    setSurfaceKey(SAMPLE_KEYS[next])
  }

  const handleClear = () => {
    setSurfaceKey(null)
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <button
        onClick={handleCycle}
        style={{
          padding: '8px 16px',
          borderRadius: 6,
          border: '1px solid #a1a1aa',
          background: '#fff',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: '0.875rem',
        }}
      >
        Cycle surface key ({index + 1} / {SAMPLE_KEYS.length})
      </button>
      <button
        onClick={handleClear}
        style={{
          padding: '8px 16px',
          borderRadius: 6,
          border: '1px solid #fca5a5',
          background: '#fff',
          cursor: 'pointer',
          color: '#dc2626',
          fontFamily: 'inherit',
          fontSize: '0.875rem',
        }}
      >
        Clear (null)
      </button>
    </div>
  )
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'help-system/providers/SurfaceKeyProvider',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'SurfaceKeyProvider mounts at portal layout level and provides the current surface key to any descendant via useSurfaceKey(). ' +
          'Leaf components can override it via useSetSurfaceKey() (e.g., when a wizard step changes). ' +
          'The provider is framework-agnostic — portals derive the key from Next.js usePathname() and pass it as initialSurfaceKey.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * Interactive demo: cycle through 3 sample surface keys and see the current
 * value via useSurfaceKey(). Click "Clear" to reset to null.
 */
export const ProviderDemo: Story = {
  render: () => (
    <SurfaceKeyProvider initialSurfaceKey={SurfaceKeys.DesignerPortal.Today.Dashboard}>
      <div style={{ fontFamily: 'var(--font-inter, Inter, sans-serif)', padding: 24 }}>
        <h3 style={{ marginBottom: 4, fontSize: '1rem', fontWeight: 600 }}>
          Current surface key
        </h3>
        <p style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: 12 }}>
          Rendered by a descendant calling <code>useSurfaceKey()</code>
        </p>
        <CurrentKeyDisplay />
        <KeyCycler />
        <p
          style={{
            marginTop: 16,
            fontSize: '0.75rem',
            color: '#71717a',
            maxWidth: 380,
          }}
        >
          Tip: open the console — setting <code>BAD_KEY_NO_SLASH</code> via{' '}
          <code>useSetSurfaceKey()</code> in a non-production environment will log a warning.
        </p>
      </div>
    </SurfaceKeyProvider>
  ),
}

/**
 * Demonstrates the graceful no-provider fallback: useSurfaceKey() returns null
 * and useSetSurfaceKey() returns a no-op — no crash.
 */
export const NoProviderFallback: Story = {
  render: () => (
    <div style={{ fontFamily: 'var(--font-inter, Inter, sans-serif)', padding: 24 }}>
      <h3 style={{ marginBottom: 4, fontSize: '1rem', fontWeight: 600 }}>
        No provider mounted
      </h3>
      <p style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: 12 }}>
        useSurfaceKey() returns null gracefully — components should not crash.
      </p>
      <CurrentKeyDisplay />
    </div>
  ),
}
