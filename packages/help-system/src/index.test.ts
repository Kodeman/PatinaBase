import { describe, it, expect } from 'vitest'
import { HELP_SYSTEM_VERSION } from './index'

describe('@patina/help-system', () => {
  it('exports HELP_SYSTEM_VERSION', () => {
    expect(HELP_SYSTEM_VERSION).toBeDefined()
  })

  it('HELP_SYSTEM_VERSION is a string', () => {
    expect(typeof HELP_SYSTEM_VERSION).toBe('string')
  })

  it('HELP_SYSTEM_VERSION matches package version', () => {
    expect(HELP_SYSTEM_VERSION).toBe('0.1.0')
  })
})
