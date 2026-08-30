/**
 * Ruling III contract — the handoff band is dissolved and the margin is the band.
 *
 * Source-level assertions in the dissolve-grammar precedent: the band file is
 * gone, nothing mounts it, the projection behind it is untouched, and the
 * designer-facing register the band carried does not reappear on the item.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', '..');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');
/** These are contracts about the code, not about the prose explaining it. */
const code = (...parts: string[]) =>
  read(...parts)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const marginRail = code('components', 'document', 'margin-rail.tsx');
/** D-B45 — `mobile-margin-chips.tsx` is DELETED, so there is no `chips` source
 *  to read. The path is kept only to assert its absence, below. */
const CHIPS_PATH = join(
  SRC,
  'components',
  'document',
  'mobile',
  'mobile-margin-chips.tsx',
);
const spine = code('components', 'document', 'mobile', 'mobile-sheets.tsx');
const handoffItem = code('components', 'document', 'margin-handoff-item.tsx');
/**
 * D-B30/W5-R1/D-B45: the Margin sheet's derivation (handoff gates included)
 * lives in this one hook — the sheet just calls it — so the "counts" half of
 * the contract reads here and the "lists" half reads on the sheet itself.
 */
const marginSheetHook = code('hooks', 'use-margin-sheet.ts');
/**
 * R1 deleted `workflow-stage-document-mount.tsx` and put
 * `section-stage-line-mount.tsx` at the same mount point; the "nothing mounts
 * the band" contract follows the successor mount.
 */
const mount = code('components', 'document', 'section-stage-line-mount.tsx');
const gate = code('lib', 'document', 'workflow-gate.ts');

describe('the band is dissolved', () => {
  it('deletes the band and its test', () => {
    expect(
      existsSync(
        join(
          SRC,
          'components',
          'document',
          'workflow',
          'contextual-handoff-band.tsx',
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        join(
          SRC,
          'components',
          'document',
          'workflow',
          'contextual-handoff-band.test.tsx',
        ),
      ),
    ).toBe(false);
  });

  it('leaves nothing mounting it', () => {
    expect(mount).not.toContain('ContextualHandoffBand');
    expect(mount).not.toContain('contextual-handoff-band');
    expect(marginRail).not.toContain('ContextualHandoffBand');
  });

  it('gives the band’s titled region no successor', () => {
    // The band's chrome was an eyebrow, an <h2>, and a labelled <section>.
    expect(handoffItem).not.toContain('Responsibility in context');
    expect(handoffItem).not.toMatch(/<h2\b/);
    expect(handoffItem).not.toMatch(/aria-labelledby=/);
    expect(handoffItem).not.toContain('data-contextual-handoff-band');
  });
});

describe('the margin carries the handoffs instead', () => {
  it('mounts them in the rail', () => {
    expect(marginRail).toMatch(/from '\.\/margin-handoff-item'/);
    expect(marginRail).toContain('<MarginHandoffs');
  });

  it('never prints the empty-margin line beneath visible handoffs', () => {
    // The line speaks for the whole margin, so it is gated on the gates too.
    expect(marginRail).toMatch(
      /visibleItems\.length === 0 &&\s*handoffGates\.gates\.length === 0/,
    );
  });

  it('counts them on the mobile surface — the hook', () => {
    // Mobile must not under-report the highest-ranked thing in the margin.
    expect(spine).toContain('useMarginSheet');
    expect(marginSheetHook).toContain('useHandoffGates');
    expect(marginSheetHook).toContain('gates.length');
  });

  it('LISTS them on the mobile surface — the sheet', () => {
    // The sentence is "counts AND lists". `gates.length` is satisfied by a
    // `count:` with no listing anywhere, so the listing needs its own reader:
    // the `'margin'` branch renders a row per gate.
    expect(spine).toContain('gates.map');
  });

  it('has no second mobile margin surface to keep in step (D-B45)', () => {
    // `MobileMarginChips` is deleted. It was mobile-only from the start (its
    // own docstring: "the desktop margin rail owns these above 980px", and
    // `min-[980px]:hidden` since `1b93def1a`), so below 980 the Margin sheet
    // is the whole margin and above 980 the rail is — one surface per width.
    // A file that comes back is a second place for the gates to go missing,
    // so its absence IS the contract.
    expect(existsSync(CHIPS_PATH)).toBe(false);
  });

  it('threads one clock rather than reading its own', () => {
    // A stamp and a guide sentence derived from two `new Date()` calls can
    // disagree across a midnight.
    expect(marginRail).toContain(
      'useHandoffGates({ projectId, clientName, now })',
    );
  });

  it('reads the 00442/00443 projection whole, through its own hook', () => {
    expect(handoffItem).toContain('useProjectContextualHandoffs');
    // The item derives presentation from the projection; it never re-resolves
    // sender, recipient, or owner for itself.
    expect(handoffItem).not.toContain('responsibility.sender');
    expect(handoffItem).not.toContain('responsibility.currentOwner');
  });

  it('keeps every one of the four acts bound 1:1 to its own mutation', () => {
    expect(handoffItem).toContain('useNudgeSiteRequest');
    expect(handoffItem).toContain('useApproveSiteRequestItem');
    expect(handoffItem).toContain('useRequestSiteRequestRedo');
    expect(handoffItem).toContain('useCloseSiteRequest');
    // The approval lane's nudge rides the decision-reminder RPC the decision
    // rail already owns, keyed on the decision the projection reports.
    expect(handoffItem).toContain('useSendDecisionReminder');
  });
});

describe('the designer-facing register the band carried is gone', () => {
  it('never prints a checksum, a phase attribution, or an escalation boolean', () => {
    for (const source of [handoffItem, gate]) {
      expect(source).not.toContain('artifact.checksum');
      expect(source).not.toContain('Exact phase');
      expect(source).not.toContain('Source domain');
      expect(source).not.toContain('stageAttribution');
      expect(source).not.toContain('nudgeSent');
      expect(source).not.toContain('dueReminderSent');
    }
  });

  it('derives stage labels from the canonical vocabulary, never a local map', () => {
    expect(gate).toContain("from '@patina/types'");
    expect(gate).toContain('RESIDENTIAL_WORKFLOW_STAGES');
    expect(handoffItem).not.toContain('STAGE_LABELS');
  });

  it('holds the 12px metadata floor on the item’s own type', () => {
    const sizes = [...handoffItem.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map(
      (match) => Number(match[1]),
    );
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });

  it('adds no shadow (D4)', () => {
    expect(handoffItem).not.toMatch(/box-shadow|drop-shadow|\bshadow-/);
  });
});
