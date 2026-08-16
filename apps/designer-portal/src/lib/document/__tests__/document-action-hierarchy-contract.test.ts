/**
 * Inked Instruments hierarchy contracts (I91).
 *
 * These source-level checks follow the existing Document grammar-contract
 * precedent: the behavior tests exercise the primitive itself, while this file
 * prevents the named surfaces from quietly drifting back to one-off buttons or
 * competing primaries.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', '..');
const COMPONENTS = join(SRC, 'components', 'document');
const DOCUMENT_ROUTES = join(SRC, 'app', '(document)');
const readComponent = (file: string) =>
  readFileSync(join(COMPONENTS, file), 'utf8');
const readRoute = (file: string) =>
  readFileSync(join(DOCUMENT_ROUTES, file), 'utf8');

function actionRegion(
  source: string,
  regionKey: string,
  tag: 'DocumentActionGroup' | 'DocumentActionRow' = 'DocumentActionGroup',
): string {
  const keyAt = source.indexOf(`regionKey="${regionKey}"`);
  expect(keyAt).toBeGreaterThanOrEqual(0);
  const start = source.lastIndexOf(`<${tag}`, keyAt);
  const end = source.indexOf(`</${tag}>`, keyAt);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(keyAt);
  return source.slice(start, end + tag.length + 3);
}

function expectOneStaticPrimary(region: string): void {
  expect(region.match(/variant="primary"/g) ?? []).toHaveLength(1);
}

const desk = readRoute('desk/page.tsx');
const letterhead = readComponent('letterhead-instruments.tsx');
const proposalDraft = readComponent('proposal-instruments.tsx');
const proposalWatch = readComponent('proposal-watch.tsx');
const library = readComponent('rooms/library/library-room.tsx');
const people = readComponent('people/people-room.tsx');
const profileShell = readComponent('people/profile/profile-shell.tsx');
const personProfile = readComponent('people/views/person-profile.tsx');
const makerProfile = readComponent('people/profile/maker-profile.tsx');
const drafting = readComponent('rooms/drafting/drafting-room.tsx');
const work = readComponent('work-block.tsx');
const captureLead = readComponent('overlays/capture-lead-sheet.tsx');
const invoiceComposer = readComponent('accounts/invoice-composer.tsx');

describe('I91 shared action grammar', () => {
  it('retires the typography-only Instrument implementation', () => {
    expect(existsSync(join(COMPONENTS, 'instrument.tsx'))).toBe(false);
    expect(desk).toContain("from '@/components/document/document-action'");
  });

  it('keeps one static primary in each stable page-head and form region', () => {
    [
      actionRegion(desk, 'desk-head'),
      actionRegion(desk, 'desk-error'),
      actionRegion(letterhead, 'letterhead-actions'),
      actionRegion(letterhead, 'letterhead-message', 'DocumentActionRow'),
      actionRegion(proposalDraft, 'proposal-draft-actions'),
      actionRegion(library, 'room-head'),
      actionRegion(people, 'room-head'),
      actionRegion(captureLead, 'capture-lead-sheet'),
      actionRegion(invoiceComposer, 'invoice-draft-error'),
    ].forEach(expectOneStaticPrimary);
  });

  it('keeps proposal-watch leadership mutually exclusive', () => {
    const region = actionRegion(proposalWatch, 'proposal-watch-actions');
    // I140 — one leader per table. The act is still the region's only
    // leadership claim and still gated on `signable`; on the Finalize table the
    // head's derived leader carries the weight, so the variant is a ternary
    // rather than a literal. Spelled out here so a drift back to a second,
    // ungated primary still bites.
    expect(region).toMatch(
      /\{signable && \(\s*<DocumentAction[\s\S]*?variant=\{onFinalizeTable \? 'secondary' : 'primary'\}/,
    );
    expect(region).toContain('actionKey="mark-proposal-signed"');
  });

  it('retires Revise and Send in favor of guidance copy (no new legacy sending)', () => {
    expect(proposalWatch).not.toContain('actionKey="revise-proposal"');
    expect(proposalWatch).not.toContain('ReviseSheet');
    expect(proposalWatch).toContain(
      'Changes now travel as a design services agreement.',
    );
    expect(proposalDraft).not.toContain('actionKey="send-proposal"');
    expect(proposalDraft).not.toContain('SendSheet');
    expect(drafting).not.toContain('actionKey="send-proposal"');
    expect(drafting).not.toContain("actionKey: 'send-proposal'");
    // RoomShell already renders its own way out (I107 — "the way out is a
    // word, not a box") on every breakpoint; the Room threads its label
    // rather than duplicating the act as a second, >1180px-only action.
    expect(drafting).not.toContain('actionKey="exit-drafting-room"');
    expect(drafting).toContain('backLabel={exitLabel}');
  });

  it('keeps task commits primary and retires legacy section sign-off creation', () => {
    expect(work).toContain('actionKey="add-task"');
    expect(work).toMatch(/actionKey="create-task"[\s\S]*?variant="primary"/);
    expect(work).not.toContain('actionKey="request-signoff"');
    expect(work).not.toContain('actionKey="submit-signoff-request"');
    expect(work).not.toContain('actionKey="request-signoff-again"');
  });

  it('adapts People profile actions to one role-led primary', () => {
    expect(profileShell).toContain(
      "variant={tone === 'dark' ? 'primary' : 'secondary'}",
    );
    expect(personProfile.match(/tone="dark"/g) ?? []).toHaveLength(2);
    expect(makerProfile.match(/tone="dark"/g) ?? []).toHaveLength(1);
    expect(profileShell).toContain('regionKey="profile-actions"');
  });

  it('registers Room-head leadership with the mobile shell', () => {
    for (const source of [
      letterhead,
      proposalDraft,
      proposalWatch,
      library,
      people,
      drafting,
    ]) {
      expect(source).toContain('useMobilePrimaryAction');
    }
    expect(drafting).toContain('useMobilePrimaryAction(null);');
  });

  // A9: the Desk deliberately opts out of this contract now — its one
  // on-screen "Capture a lead" is the header primary at every viewport, and
  // the mobile dock falls back to its documented default (the "In hand /
  // Today" glance) instead of a second, duplicate registration.
  it('keeps the Desk out of the mobile-shell primary-action contract (A9)', () => {
    expect(desk).not.toContain('useMobilePrimaryAction');
  });
});

/**
 * The Project, Composed — a region's leadership lives in its ledger's ORDER,
 * not in a variant a caller spells. RegionHead inks index 0 and nothing else,
 * so a region that has adopted it must not carry a hand-written `primary` in
 * its head, nor spell `'inked'` in the ledger it passes.
 *
 * The per-region assertions are conditional on the file having adopted
 * RegionHead — they pass vacuously until a region lane lands, and bite the
 * moment it does.
 */
const PROJECT_REGION_FILES = [
  'approvals/project-approval-document.tsx',
  'schedule/schedule-spine.tsx',
  'ffe-section.tsx',
  'commercial/money-region.tsx',
  'project-mood-boards.tsx',
  'care-band.tsx',
] as const;

/** The `actions={[...]}` / `actions: [...]` ledger literals in a source file. */
function ledgerLiterals(source: string): string[] {
  const found: string[] = [];
  const opener = /actions(?:=\{|:\s*)\[/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source)) !== null) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = start; i < source.length; i += 1) {
      if (source[i] === '[') depth += 1;
      else if (source[i] === ']') {
        depth -= 1;
        if (depth === 0) {
          found.push(source.slice(start, i + 1));
          break;
        }
      }
    }
  }
  return found;
}

describe('Project region ledgers', () => {
  it.each(PROJECT_REGION_FILES)(
    '%s keeps its head free of a hand-spelled leader',
    (file) => {
      const path = join(COMPONENTS, file);
      expect(existsSync(path)).toBe(true);
      const source = readFileSync(path, 'utf8');
      if (!source.includes('region/region-head')) return;
      expect(source).not.toContain('variant="primary"');
      for (const ledger of ledgerLiterals(source)) {
        expect(ledger).not.toContain("'inked'");
        expect(ledger).not.toContain('"inked"');
      }
    },
  );

  it('inks the leading ledger entry and only the leading one', () => {
    const head = readFileSync(
      join(COMPONENTS, 'region', 'region-head.tsx'),
      'utf8',
    );
    expect(head.match(/'inked'/g) ?? []).toHaveLength(2);
    expect(head).toContain("index === 0 ? 'inked'");
    // the second occurrence is the dev guard that catches a caller trying to
    // spell leadership on a later entry — not a second place it is granted.
    expect(head).toContain(
      "(entry.variant as DocumentActionVariant | undefined) === 'inked'",
    );
  });
});
