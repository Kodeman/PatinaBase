import { describe, it, expect } from 'vitest'
import { SurfaceKeys, SURFACE_KEY_REGEX, isSurfaceKey } from './surfaceKeys'

// ---------------------------------------------------------------------------
// Internal recursive helper — collects every string leaf in a nested object.
// NOT exported from the module; lives only in this test file.
// ---------------------------------------------------------------------------
function collectLeaves(node: unknown, acc: string[] = []): string[] {
  if (typeof node === 'string') {
    acc.push(node)
  } else if (typeof node === 'object' && node !== null) {
    for (const val of Object.values(node as Record<string, unknown>)) {
      collectLeaves(val, acc)
    }
  }
  return acc
}

// ---------------------------------------------------------------------------
// Collect all leaf values once so every test works from the same set.
// ---------------------------------------------------------------------------
const allKeys = collectLeaves(SurfaceKeys)

// ---------------------------------------------------------------------------
// Section 1: SURFACE_KEY_REGEX — every defined key must match
// ---------------------------------------------------------------------------
describe('SurfaceKeys — regex conformance', () => {
  it('has at least one key defined', () => {
    expect(allKeys.length).toBeGreaterThan(0)
  })

  it.each(allKeys)('"%s" matches SURFACE_KEY_REGEX', (key) => {
    expect(SURFACE_KEY_REGEX.test(key)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Section 2: uniqueness — no two keys may share the same string value
// ---------------------------------------------------------------------------
describe('SurfaceKeys — uniqueness', () => {
  it('has no duplicate key values', () => {
    const unique = new Set(allKeys)
    if (unique.size !== allKeys.length) {
      const seen = new Set<string>()
      const duplicates: string[] = []
      for (const key of allKeys) {
        if (seen.has(key)) {
          duplicates.push(key)
        }
        seen.add(key)
      }
      throw new Error(`Duplicate surface keys found: ${duplicates.join(', ')}`)
    }
    expect(unique.size).toBe(allKeys.length)
  })
})

// ---------------------------------------------------------------------------
// Section 3: isSurfaceKey — positive cases (known good values)
// ---------------------------------------------------------------------------
describe('isSurfaceKey — positive cases', () => {
  it('accepts designer-portal/today/dashboard', () => {
    expect(isSurfaceKey('designer-portal/today/dashboard')).toBe(true)
  })

  it('accepts designer-portal/pipeline/project-list', () => {
    expect(isSurfaceKey('designer-portal/pipeline/project-list')).toBe(true)
  })

  it('accepts designer-portal/pipeline/project-list/empty-leads', () => {
    expect(isSurfaceKey('designer-portal/pipeline/project-list/empty-leads')).toBe(true)
  })

  it('accepts designer-portal/aesthete/score-meaning', () => {
    expect(isSurfaceKey('designer-portal/aesthete/score-meaning')).toBe(true)
  })

  it('accepts admin-portal/dashboard', () => {
    expect(isSurfaceKey('admin-portal/dashboard')).toBe(true)
  })

  it('accepts client-portal/home', () => {
    expect(isSurfaceKey('client-portal/home')).toBe(true)
  })

  it('accepts a deeply-nested 4-segment key', () => {
    expect(isSurfaceKey('designer-portal/pipeline/stage/leads')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Section 4: isSurfaceKey — negative cases (must be rejected)
// ---------------------------------------------------------------------------
describe('isSurfaceKey — negative cases', () => {
  it('rejects uppercase characters', () => {
    expect(isSurfaceKey('Designer-Portal/today/dashboard')).toBe(false)
  })

  it('rejects a string with spaces', () => {
    expect(isSurfaceKey('designer portal/today/dashboard')).toBe(false)
  })

  it('rejects a trailing slash', () => {
    expect(isSurfaceKey('designer-portal/today/dashboard/')).toBe(false)
  })

  it('rejects a single segment (no slash)', () => {
    expect(isSurfaceKey('designer-portal')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isSurfaceKey('')).toBe(false)
  })

  it('rejects a non-string value (number)', () => {
    expect(isSurfaceKey(42)).toBe(false)
  })

  it('rejects a non-string value (null)', () => {
    expect(isSurfaceKey(null)).toBe(false)
  })

  it('rejects a key with special characters', () => {
    expect(isSurfaceKey('designer-portal/today/dash_board')).toBe(false)
  })

  it('rejects a leading slash', () => {
    expect(isSurfaceKey('/designer-portal/today/dashboard')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Section 5: spot-checks that known constants match expected string literals
// ---------------------------------------------------------------------------
describe('SurfaceKeys — spot-check constant values', () => {
  it('DesignerPortal.Today.Dashboard is the correct literal', () => {
    expect(SurfaceKeys.DesignerPortal.Today.Dashboard).toBe('designer-portal/today/dashboard')
  })

  it('DesignerPortal.Pipeline.ProjectListEmpty.Leads is the correct literal', () => {
    expect(SurfaceKeys.DesignerPortal.Pipeline.ProjectListEmpty.Leads).toBe(
      'designer-portal/pipeline/project-list/empty-leads',
    )
  })

  it('DesignerPortal.Aesthete.EngineOverview is the correct literal', () => {
    expect(SurfaceKeys.DesignerPortal.Aesthete.EngineOverview).toBe(
      'designer-portal/aesthete/engine-overview',
    )
  })

  it('AdminPortal.Dashboard is the correct literal', () => {
    expect(SurfaceKeys.AdminPortal.Dashboard).toBe('admin-portal/dashboard')
  })

  it('ClientPortal.Home.Root is the correct literal', () => {
    // Sprint 1 shipped `ClientPortal.Home = 'client-portal/home'` as a leaf
    // string. F3 (Sprint 3) restructured Home into a namespace; the original
    // literal lives on as `Home.Root` to preserve any seeded Sanity docs
    // keyed on `client-portal/home` and the C6 pathname mapper.
    expect(SurfaceKeys.ClientPortal.Home.Root).toBe('client-portal/home')
  })

  // IOSApp parity spot-checks — these literals MUST match the Swift
  // constants in `apps/mobile/Patina/Patina/Features/Help/SurfaceKeys.swift`.
  // See the iOS `SurfaceKeysParityTests` for the full reciprocal pinning.
  it('IOSApp.Home.Root is the correct literal', () => {
    expect(SurfaceKeys.IOSApp.Home.Root).toBe('ios-app/home')
  })

  it('IOSApp.Home.DailyProductCard is the correct literal', () => {
    expect(SurfaceKeys.IOSApp.Home.DailyProductCard).toBe('ios-app/home/daily-product-card')
  })

  it('IOSApp.ProductDetail.Root is the correct literal', () => {
    expect(SurfaceKeys.IOSApp.ProductDetail.Root).toBe('ios-app/product-detail')
  })

  it('IOSApp.ProductDetail.ArAction is the correct literal', () => {
    expect(SurfaceKeys.IOSApp.ProductDetail.ArAction).toBe('ios-app/product-detail/ar-action')
  })

  // G10 spot-checks — Sprint 3 iOS Features sweep. Same parity contract as
  // the Home + ProductDetail keys above: every literal here MUST match the
  // Swift constant under `SurfaceKeys.IOSApp.*` in iOS.
  it('IOSApp.Designer.Root is the correct literal', () => {
    expect(SurfaceKeys.IOSApp.Designer.Root).toBe('ios-app/designer')
  })

  it('IOSApp.Designer.StudioToday is the correct literal', () => {
    expect(SurfaceKeys.IOSApp.Designer.StudioToday).toBe('ios-app/designer/studio-today')
  })

  it('IOSApp.QRAuth.Root is the correct literal', () => {
    expect(SurfaceKeys.IOSApp.QRAuth.Root).toBe('ios-app/qr-auth')
  })

  it('IOSApp.QRAuth.Biometric is the correct literal', () => {
    expect(SurfaceKeys.IOSApp.QRAuth.Biometric).toBe('ios-app/qr-auth/biometric')
  })

  it('IOSApp.Companion.WhatNext is the correct literal', () => {
    expect(SurfaceKeys.IOSApp.Companion.WhatNext).toBe('ios-app/companion/what-next')
  })

  it('IOSApp.Rooms.WholeHome is the correct literal', () => {
    expect(SurfaceKeys.IOSApp.Rooms.WholeHome).toBe('ios-app/rooms/whole-home')
  })

  it('IOSApp.Profile.MatchPercentage is the correct literal', () => {
    expect(SurfaceKeys.IOSApp.Profile.MatchPercentage).toBe('ios-app/profile/match-percentage')
  })

  // ── Desk-era Document additions (help-desk Wave 0) ────────────────────────
  it('DesignerPortal.Document.Orders is the correct literal', () => {
    expect(SurfaceKeys.DesignerPortal.Document.Orders).toBe('designer-portal/document/orders')
  })

  it('DesignerPortal.Document.ThePost is the correct literal', () => {
    expect(SurfaceKeys.DesignerPortal.Document.ThePost).toBe('designer-portal/document/the-post')
  })

  it('DesignerPortal.Document.OrdersReceiving is the correct literal', () => {
    expect(SurfaceKeys.DesignerPortal.Document.OrdersReceiving).toBe(
      'designer-portal/document/orders/receiving',
    )
  })

  it('DesignerPortal.Document.CommandBar is the correct literal', () => {
    expect(SurfaceKeys.DesignerPortal.Document.CommandBar).toBe('designer-portal/document/command-bar')
  })

  it('DesignerPortal.Document.Welcome is the correct literal', () => {
    expect(SurfaceKeys.DesignerPortal.Document.Welcome).toBe('designer-portal/document/welcome')
  })

  it('DesignerPortal.Document.LibraryPiece is the correct literal', () => {
    expect(SurfaceKeys.DesignerPortal.Document.LibraryPiece).toBe(
      'designer-portal/document/library/piece',
    )
  })

  // ── The Desk Walkthrough tour (R97) ───────────────────────────────────────
  it('DesignerPortal.Tours.DeskWalkthrough.Root is the correct literal', () => {
    expect(SurfaceKeys.DesignerPortal.Tours.DeskWalkthrough.Root).toBe(
      'designer-portal/tours/desk-walkthrough',
    )
  })

  it('DesignerPortal.Tours.DeskWalkthrough.Step1TheDesk is the correct literal', () => {
    expect(SurfaceKeys.DesignerPortal.Tours.DeskWalkthrough.Step1TheDesk).toBe(
      'designer-portal/tours/desk-walkthrough/step-1-the-desk',
    )
  })

  it('DesignerPortal.Tours.DeskWalkthrough.Step6Begin is the correct literal', () => {
    expect(SurfaceKeys.DesignerPortal.Tours.DeskWalkthrough.Step6Begin).toBe(
      'designer-portal/tours/desk-walkthrough/step-6-begin',
    )
  })

  // ── Light client-portal pass ──────────────────────────────────────────────
  it('ClientPortal.Proposals.Welcome is the correct literal', () => {
    expect(SurfaceKeys.ClientPortal.Proposals.Welcome).toBe('client-portal/proposals/welcome')
  })

  it('ClientPortal.Proposals.Detail.Sign is the correct literal', () => {
    expect(SurfaceKeys.ClientPortal.Proposals.Detail.Sign).toBe(
      'client-portal/proposals/detail/sign',
    )
  })

  it('ClientPortal.Decisions.Empty.None is the correct literal', () => {
    expect(SurfaceKeys.ClientPortal.Decisions.Empty.None).toBe('client-portal/decisions/empty/none')
  })

  it('ClientPortal.Invoices.ListIntro is the correct literal', () => {
    expect(SurfaceKeys.ClientPortal.Invoices.ListIntro).toBe('client-portal/invoices/list-intro')
  })

  it('ClientPortal.Pulse.Intro is the correct literal', () => {
    expect(SurfaceKeys.ClientPortal.Pulse.Intro).toBe('client-portal/pulse/intro')
  })

  it('ClientPortal.Budget.Intro is the correct literal', () => {
    expect(SurfaceKeys.ClientPortal.Budget.Intro).toBe('client-portal/budget/intro')
  })
})
