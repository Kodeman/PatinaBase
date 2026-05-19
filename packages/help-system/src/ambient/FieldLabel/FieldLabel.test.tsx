/**
 * FieldLabel — unit tests
 *
 * Verifies the contract from spec §4.4:
 *   - htmlFor passthrough on the underlying <label>
 *   - children render verbatim (so InfoIcon / StrataInfoIcon can be slotted in later)
 *   - required={true} appends a visual asterisk marker
 *   - optional={true} appends "(optional)" muted marker
 *   - neither flag renders just the label
 *   - className composes through (without stripping our base classes)
 */
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FieldLabel } from './FieldLabel'

describe('FieldLabel', () => {
  // ── 1. Renders a <label> with the children text ─────────────────────────────

  it('renders the children inside a <label> element', () => {
    render(<FieldLabel htmlFor="project-name">Project name</FieldLabel>)

    const label = screen.getByText('Project name')
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveTextContent('Project name')
  })

  // ── 2. htmlFor passthrough ──────────────────────────────────────────────────

  it('passes htmlFor through to the underlying <label htmlFor>', () => {
    render(<FieldLabel htmlFor="project-name">Project name</FieldLabel>)

    const label = screen.getByText('Project name')
    expect(label).toHaveAttribute('for', 'project-name')
  })

  // ── 3. Required marker ──────────────────────────────────────────────────────

  it('renders a visual asterisk marker when required={true}', () => {
    render(
      <FieldLabel htmlFor="project-name" required>
        Project name
      </FieldLabel>,
    )

    // Asterisk is rendered with aria-hidden to keep it visual-only;
    // the parent input owns the aria-required semantics.
    const marker = screen.getByTestId('field-label-required-marker')
    expect(marker).toBeInTheDocument()
    expect(marker).toHaveTextContent('*')
    expect(marker).toHaveAttribute('aria-hidden', 'true')
  })

  // ── 4. Optional marker ──────────────────────────────────────────────────────

  it('renders an "(optional)" marker when optional={true}', () => {
    render(
      <FieldLabel htmlFor="kickoff-notes" optional>
        Kickoff notes
      </FieldLabel>,
    )

    const marker = screen.getByTestId('field-label-optional-marker')
    expect(marker).toBeInTheDocument()
    expect(marker).toHaveTextContent('(optional)')
  })

  // ── 5. Neither flag — bare label ───────────────────────────────────────────

  it('renders neither marker when neither required nor optional is set', () => {
    render(<FieldLabel htmlFor="project-name">Project name</FieldLabel>)

    expect(screen.queryByTestId('field-label-required-marker')).not.toBeInTheDocument()
    expect(screen.queryByTestId('field-label-optional-marker')).not.toBeInTheDocument()
  })

  // ── 6. Composition with trailing slot children (e.g., InfoIcon) ───────────

  it('renders complex children verbatim (composes with trailing icon slots)', () => {
    const InfoIconStub = () => <span data-testid="info-icon-stub">i</span>

    render(
      <FieldLabel htmlFor="aesthete-score">
        Aesthete Score <InfoIconStub />
      </FieldLabel>,
    )

    // Both the literal text and the icon node render inside the same <label>
    const label = screen.getByText(/Aesthete Score/)
    expect(label.tagName).toBe('LABEL')
    expect(screen.getByTestId('info-icon-stub')).toBeInTheDocument()
    // The trailing slot lives inside the label so click/focus targets the input
    expect(label).toContainElement(screen.getByTestId('info-icon-stub'))
  })

  // ── 7. className composes through ──────────────────────────────────────────

  it('merges user-supplied className with the base classes', () => {
    render(
      <FieldLabel htmlFor="project-name" className="custom-class">
        Project name
      </FieldLabel>,
    )

    const label = screen.getByText('Project name')
    expect(label).toHaveClass('custom-class')
    // base font-family token applied so help-system label styling survives
    expect(label.className).toMatch(/help-system-field-label/)
  })

  // ── 8. Required + optional both true — required wins (defensive) ──────────

  it('prefers the required marker when both required and optional are set', () => {
    render(
      <FieldLabel htmlFor="project-name" required optional>
        Project name
      </FieldLabel>,
    )

    expect(screen.getByTestId('field-label-required-marker')).toBeInTheDocument()
    expect(screen.queryByTestId('field-label-optional-marker')).not.toBeInTheDocument()
  })
})
