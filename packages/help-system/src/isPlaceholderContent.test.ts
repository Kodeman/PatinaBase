/**
 * isPlaceholderContent — unit tests
 *
 * Proves the guard recognizes the exact seed-copy patterns observed live
 * (PLACEHOLDER prefix + "pending Leah review" marker) across both string and
 * Portable-Text bodies, while leaving normal/empty content untouched.
 */
import { describe, it, expect } from 'vitest'
import { isPlaceholderContent } from './isPlaceholderContent'

describe('isPlaceholderContent', () => {
  // ── Placeholder string bodies → true ──────────────────────────────────────

  it.each([
    'PLACEHOLDER pending Leah review — explain overdue decisions.',
    'PLACEHOLDER pending Leah review — explain leads.',
    'PLACEHOLDER — leads',
    'PLACEHOLDER pending Leah review — empty-state copy for designer-portal/today/empty/leads.',
    'PLACEHOLDER pending Leah review — explain active work.',
  ])('flags observed live placeholder copy: %s', (body) => {
    expect(isPlaceholderContent(body)).toBe(true)
  })

  it('is case-insensitive on the PLACEHOLDER prefix', () => {
    expect(isPlaceholderContent('placeholder text here')).toBe(true)
    expect(isPlaceholderContent('Placeholder copy')).toBe(true)
  })

  it('flags "pending Leah review" anywhere in the body (case-insensitive)', () => {
    expect(isPlaceholderContent('Draft copy — Pending Leah Review before launch')).toBe(true)
    expect(isPlaceholderContent('explain leads (pending leah review)')).toBe(true)
  })

  it('tolerates leading whitespace before PLACEHOLDER', () => {
    expect(isPlaceholderContent('   PLACEHOLDER blah')).toBe(true)
    expect(isPlaceholderContent('\n\tPLACEHOLDER blah')).toBe(true)
  })

  // ── Normal bodies → false ─────────────────────────────────────────────────

  it('does NOT flag normal copy', () => {
    expect(
      isPlaceholderContent('Projects in your pipeline are ordered by last activity.'),
    ).toBe(false)
    expect(isPlaceholderContent('No projects yet')).toBe(false)
  })

  it('does NOT flag a body that merely contains the substring "placeholder" mid-word', () => {
    // The prefix guard anchors on a word boundary at the start, so an input
    // field hint that explains "placeholder" text should not be filtered.
    expect(
      isPlaceholderContent('Type a value; the greyed-out text is just a placeholder.'),
    ).toBe(false)
  })

  // ── Empty / absent bodies → false (existing absence behavior preserved) ────

  it('does NOT flag empty, whitespace-only, or non-string bodies', () => {
    expect(isPlaceholderContent('')).toBe(false)
    expect(isPlaceholderContent('   ')).toBe(false)
    expect(isPlaceholderContent(undefined)).toBe(false)
    expect(isPlaceholderContent(null)).toBe(false)
    expect(isPlaceholderContent(42)).toBe(false)
    expect(isPlaceholderContent({})).toBe(false)
  })

  // ── Portable-Text / array bodies ──────────────────────────────────────────

  it('extracts plain text from Portable-Text blocks and flags placeholders', () => {
    const ptBody = [
      {
        _type: 'block',
        children: [
          { _type: 'span', text: 'PLACEHOLDER pending Leah review — ' },
          { _type: 'span', text: 'full article body.' },
        ],
      },
    ]
    expect(isPlaceholderContent(ptBody)).toBe(true)
  })

  it('does NOT flag a normal Portable-Text body', () => {
    const ptBody = [
      {
        _type: 'block',
        children: [{ _type: 'span', text: 'Here is how to share a board with a client.' }],
      },
    ]
    expect(isPlaceholderContent(ptBody)).toBe(false)
  })

  it('detects the review marker spread across multiple Portable-Text spans', () => {
    const ptBody = [
      {
        _type: 'block',
        children: [
          { _type: 'span', text: 'Some draft prose. ' },
          { _type: 'span', text: 'pending Leah review' },
        ],
      },
    ]
    expect(isPlaceholderContent(ptBody)).toBe(true)
  })
})
