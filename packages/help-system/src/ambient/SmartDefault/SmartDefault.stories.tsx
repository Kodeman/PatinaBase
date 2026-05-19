import React, { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { SmartDefault } from './SmartDefault'

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: 'help-system/ambient/SmartDefault',
  component: SmartDefault,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'SmartDefault is a headless wrapper that pre-fills a form field with a sensible default and emits audit telemetry on apply + first override. ' +
          'It renders no chrome of its own around children — the consumer uses a render-prop to wire `defaultValue` and `onChange` to their own field. ' +
          'Telemetry fires via `window.posthog?.capture` to avoid a hard PostHog SDK dependency. ' +
          'See `help.smart_default.applied` and `help.smart_default.overridden` in the PostHog dashboards.',
      },
    },
  },
} satisfies Meta<typeof SmartDefault>

export default meta
type Story = StoryObj<typeof meta>

// ─── Shared layout helpers (story-local, intentionally simple) ────────────────

const fieldRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  width: 320,
  fontFamily: 'var(--font-inter, Inter, sans-serif)',
}

const labelRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  fontSize: '0.5rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--ao, #6b6864)',
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid var(--bg, #d9d6d1)',
  borderRadius: 4,
  fontSize: '0.875rem',
  fontFamily: 'inherit',
}

const statusStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  color: 'var(--ao, #6b6864)',
}

// ─── Stories ──────────────────────────────────────────────────────────────────

/**
 * The default: a numeric "Markup %" field pre-filled with `3` and the
 * sparkle-icon hint that explains why. Override the value to see the
 * `help.smart_default.overridden` event fire in the Actions panel
 * (or browser console with PostHog dev tools).
 */
export const WithTextInput: Story = {
  render: () => (
    <SmartDefault<number>
      fieldName="markup_pct"
      defaultValue={3}
      reason="Industry standard 3%. Adjustable."
      surfaceKey="designer-portal/pipeline/proposal/markup"
    >
      {(api) => {
        const [value, setValue] = useState<number>(api.defaultValue)
        return (
          <div style={fieldRowStyle}>
            <label style={labelRowStyle} htmlFor="markup">
              Markup %{api.hintNode}
            </label>
            <input
              id="markup"
              type="number"
              value={value}
              style={inputStyle}
              onChange={(e) => {
                const next = Number(e.target.value)
                setValue(next)
                api.onChange(next)
              }}
            />
            <span style={statusStyle}>
              {api.isOverridden ? 'User overrode the default.' : 'Showing default.'}
            </span>
          </div>
        )
      }}
    </SmartDefault>
  ),
}

/**
 * The icon hint variant (default). A sparkle glyph appears next to the label;
 * its accessible `title`/`aria-label` carries the rationale. In production,
 * pair the icon with `<Tooltip />` (Stream C) for richer copy.
 */
export const WithIconHint: Story = {
  render: () => (
    <SmartDefault<string>
      fieldName="city"
      defaultValue="Portland"
      reason="Based on your account profile."
      hint="icon"
    >
      {(api) => {
        const [value, setValue] = useState<string>(api.defaultValue)
        return (
          <div style={fieldRowStyle}>
            <label style={labelRowStyle} htmlFor="city">
              City{api.hintNode}
            </label>
            <input
              id="city"
              type="text"
              value={value}
              style={inputStyle}
              onChange={(e) => {
                setValue(e.target.value)
                api.onChange(e.target.value)
              }}
            />
            <span style={statusStyle}>
              {api.isOverridden ? 'User overrode.' : 'Hover the sparkle to see why this default was picked.'}
            </span>
          </div>
        )
      }}
    </SmartDefault>
  ),
}

/**
 * The inline hint variant: a small italic helper directly under the field.
 * Use this when icon density would be distracting (e.g., on dense form rows
 * or in the activation wizard where icons compete with required-asterisks).
 */
export const WithInlineHint: Story = {
  render: () => (
    <SmartDefault<string>
      fieldName="delivery_window"
      defaultValue="2-3 weeks"
      reason="Based on this vendor's recent lead times."
      hint="inline"
    >
      {(api) => {
        const [value, setValue] = useState<string>(api.defaultValue)
        return (
          <div style={fieldRowStyle}>
            <label style={labelRowStyle} htmlFor="delivery">
              Delivery window
            </label>
            <input
              id="delivery"
              type="text"
              value={value}
              style={inputStyle}
              onChange={(e) => {
                setValue(e.target.value)
                api.onChange(e.target.value)
              }}
            />
            {api.hintNode}
            <span style={statusStyle}>
              {api.isOverridden ? 'User overrode.' : 'Note that the inline hint sits beneath the field.'}
            </span>
          </div>
        )
      }}
    </SmartDefault>
  ),
}

/**
 * No hint — the consumer chooses to render nothing in-flow. Telemetry still
 * fires, so this is appropriate when the default is invisible (e.g., a
 * silently-prefilled tax rate where the user wouldn't know it was a default
 * until they audited the dashboard).
 */
export const HintNone: Story = {
  render: () => (
    <SmartDefault<number>
      fieldName="tax_rate"
      defaultValue={9.5}
      reason="Inherited from project location"
      hint="none"
    >
      {(api) => {
        const [value, setValue] = useState<number>(api.defaultValue)
        return (
          <div style={fieldRowStyle}>
            <label style={labelRowStyle} htmlFor="tax">
              Tax rate %
            </label>
            <input
              id="tax"
              type="number"
              step="0.01"
              value={value}
              style={inputStyle}
              onChange={(e) => {
                const next = Number(e.target.value)
                setValue(next)
                api.onChange(next)
              }}
            />
            <span style={statusStyle}>
              No visible hint, but `help.smart_default.applied` still fired on mount.
            </span>
          </div>
        )
      }}
    </SmartDefault>
  ),
}
