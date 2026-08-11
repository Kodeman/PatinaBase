import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const read = (relative: string) =>
  fs.readFileSync(path.join(ROOT, relative), 'utf8');

describe('designer Stage-2 cutover source contract', () => {
  it('mounts the project approval document immediately after workflow with projects.client_id', () => {
    const page = read('app/(document)/doc/[id]/page.tsx');
    expect(page).toMatch(
      /<WorkflowStageDocumentMount[\s\S]*?<ProjectApprovalDocumentMount/,
    );
    expect(page.indexOf('<ProjectApprovalDocumentMount')).toBeGreaterThan(
      page.indexOf('<WorkflowStageDocumentMount'),
    );
    expect(page).toContain('project?.client_id ?? null');
    expect(page).not.toMatch(
      /<ProjectApprovalDocumentMount[\s\S]{0,300}clientProfileId=\{row\.client_profile_id/,
    );
  });

  it('retires new legacy section and generic sign-off creation without deleting historical renderers', () => {
    const work = read('components/document/work-block.tsx');
    const composer = read('components/document/coordination/item-composer.tsx');
    const resolver = read(
      'components/document/coordination/item-resolve/resolve-signoff.tsx',
    );
    expect(work).not.toContain('request-signoff');
    expect(work).not.toContain('useRequestSectionGate');
    expect(composer).toContain("kind !== 'signoff'");
    expect(composer).toContain("editItem?.coordination_kind === 'signoff'");
    expect(resolver).toContain('ResolveSignoff');
  });

  it.each([
    'components/document/coordination/coordination-band.tsx',
    'components/document/schedule/schedule-spine.tsx',
  ])('filters Stage-2 from generic coordination presentation in %s', (file) => {
    expect(read(file)).toContain('excludeProjectArtifactApprovals');
  });

  it.each([
    'components/document/margin-rail.tsx',
    'components/document/mobile/mobile-margin-chips.tsx',
    'components/document/mobile/mobile-sheets.tsx',
  ])('filters Stage-2 from generic desktop/mobile margin in %s', (file) => {
    const source = read(file);
    expect(source).toContain('classifyMarginItems');
    expect(source).toContain('MarginDecisionClassificationNotice');
  });

  it('filters Stage-2 drafts before the legacy margin editor can mount', () => {
    const margin = read('components/document/margin-rail.tsx');
    expect(margin).toContain('legacyCoordinationDrafts(coordItems ?? [])');
  });
});
