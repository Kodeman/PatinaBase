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
    expect(region).toContain("variant={signable ? 'secondary' : 'primary'}");
    expect(region).toMatch(
      /\{signable && \(\s*<DocumentAction[\s\S]*?variant="primary"/,
    );
    expect(region).toContain('actionKey="mark-proposal-signed"');
  });

  it('keeps work-block commits primary and utilities secondary or tertiary', () => {
    expect(work).toMatch(
      /actionKey="request-signoff"[\s\S]*?variant="primary"[\s\S]*?actionKey="add-task"[\s\S]*?variant="secondary"/,
    );
    expect(work).toMatch(/actionKey="create-task"[\s\S]*?variant="primary"/);
    expect(work).toMatch(
      /actionKey="submit-signoff-request"[\s\S]*?variant="primary"[\s\S]*?actionKey="cancel-signoff-request"[\s\S]*?variant="tertiary"/,
    );
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
      desk,
      letterhead,
      proposalDraft,
      proposalWatch,
      library,
      people,
      drafting,
    ]) {
      expect(source).toContain('useMobilePrimaryAction');
    }
    expect(drafting).toMatch(/pct > 0[\s\S]*?actionKey: 'send-proposal'/);
    expect(drafting).toMatch(/pct > 0 \? \([\s\S]*?variant="primary"/);
  });
});
