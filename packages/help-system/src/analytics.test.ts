/**
 * Tests for the analytics taxonomy of record (help-desk Wave 1, Task L6).
 *
 * Covers:
 *  • HELP_EVENTS carries GLOSSARY_OPENED and SHORTCUTS_OPENED (L5's "The
 *    words" / "The keys" doorways) with the correct `help.*` names.
 *  • safeCapture routes through `window.posthog.capture` and never throws.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HELP_EVENTS, safeCapture } from './analytics'

describe('HELP_EVENTS', () => {
  it('names GLOSSARY_OPENED and SHORTCUTS_OPENED under the help.* namespace', () => {
    expect(HELP_EVENTS.GLOSSARY_OPENED).toBe('help.glossary.opened')
    expect(HELP_EVENTS.SHORTCUTS_OPENED).toBe('help.shortcuts.opened')
  })

  it('keeps every event name dot-namespaced and lowercase', () => {
    for (const name of Object.values(HELP_EVENTS)) {
      expect(name).toMatch(/^help\.[a-z0-9_.]+$/)
    }
  })
})

describe('safeCapture', () => {
  const originalWindow = globalThis.window

  afterEach(() => {
    globalThis.window = originalWindow
  })

  beforeEach(() => {
    // vitest's default environment already defines window; each test starts
    // from a clean posthog-less window.
    globalThis.window = { ...originalWindow }
  })

  it('calls window.posthog.capture with the event and props', () => {
    const capture = vi.fn()
    // @ts-expect-error — test double, not the real PostHog client.
    globalThis.window.posthog = { capture }

    safeCapture(HELP_EVENTS.GLOSSARY_OPENED, { source: 'palette', term: 'engagement' })

    expect(capture).toHaveBeenCalledWith(HELP_EVENTS.GLOSSARY_OPENED, {
      source: 'palette',
      term: 'engagement',
    })
  })

  it('never throws when posthog is missing', () => {
    // @ts-expect-error — simulating an ad-blocker / pre-init environment.
    globalThis.window.posthog = undefined
    expect(() => safeCapture(HELP_EVENTS.SHORTCUTS_OPENED, { source: 'key' })).not.toThrow()
  })

  it('never throws when posthog.capture itself throws', () => {
    // @ts-expect-error — test double whose capture is hostile.
    globalThis.window.posthog = {
      capture: () => {
        throw new Error('boom')
      },
    }
    expect(() => safeCapture(HELP_EVENTS.SHORTCUTS_OPENED, { source: 'key' })).not.toThrow()
  })
})
