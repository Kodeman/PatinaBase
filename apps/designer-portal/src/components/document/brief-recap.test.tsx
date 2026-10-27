import * as React from 'react';
import { readFileSync } from 'fs';
import path from 'path';
import ts from 'typescript';
import { BriefAgreementChapter } from './paper/chapters/brief-agreement-chapter';
import { SectionLoadingLine } from './section-loading-line';
import { render, screen, cleanup } from '@testing-library/react';
import { useClient, useDesignerClientForClientUser } from '@patina/supabase';
import { BriefRecap } from './brief-recap';

jest.mock('@patina/supabase', () => ({
  useClient: jest.fn(),
  useDesignerClientForClientUser: jest.fn(),
}));
jest.mock('./brief-section', () => ({
  BriefSection: ({ leadId }: { leadId: string }) => <p>Original notes for {leadId}</p>,
}));
const client = jest.mocked(useClient);
const byProfile = jest.mocked(useDesignerClientForClientUser);

beforeEach(() => {
  jest.clearAllMocks();
  client.mockImplementation((id) => ({
    data: id ? { id, lead_id: id === 'relationship-a' ? 'lead-a' : id === 'relationship-b' ? 'lead-b' : null } : null,
    isLoading: false, isError: false,
  }) as ReturnType<typeof useClient>);
  // The defective lookup picks the newest relationship for this shared profile.
  byProfile.mockImplementation((id) => ({ data: id ? { lead_id: 'lead-b' } : null, isLoading: false }) as ReturnType<typeof useDesignerClientForClientUser>);
});

it('keeps two engagements for the same profile bound to their own original leads', () => {
  const { rerender } = render(<BriefRecap clientProfileId="same-profile" designerClientId="relationship-a" leadId={null} />);
  expect(screen.getByText('Original notes for lead-a')).toBeInTheDocument();
  expect(screen.queryByText('Original notes for lead-b')).not.toBeInTheDocument();
  rerender(<BriefRecap clientProfileId="same-profile" designerClientId="relationship-b" leadId={null} />);
  expect(screen.getByText('Original notes for lead-b')).toBeInTheDocument();
  expect(screen.queryByText('Original notes for lead-a')).not.toBeInTheDocument();
  expect(byProfile).not.toHaveBeenCalled();
});

it('resolves a no-login client through the canonical relationship', () => {
  render(<BriefRecap clientProfileId={null} designerClientId="relationship-a" leadId={null} />);
  expect(screen.getByText('Original notes for lead-a')).toBeInTheDocument();
});

it('shows missing history for a relationship without a lead, never another profile engagement', () => {
  render(<BriefRecap clientProfileId="same-profile" designerClientId="without-lead" leadId={null} />);
  expect(screen.getByText('No original brief is linked to this document.')).toBeInTheDocument();
  expect(screen.queryByText(/Original notes for/)).not.toBeInTheDocument();
});

it('keeps the explicit lead path ahead of the relationship', () => {
  render(<BriefRecap designerClientId="relationship-b" leadId="explicit-lead" />);
  expect(screen.getByText('Original notes for explicit-lead')).toBeInTheDocument();
});

it('does not infer history from a profile without a relationship or lead', () => {
  render(<BriefRecap clientProfileId="same-profile" designerClientId={null} leadId={null} />);
  expect(screen.getByText('No original brief is linked to this document.')).toBeInTheDocument();
  expect(byProfile).not.toHaveBeenCalled();
});

it('keeps relationship loading and failed reads distinct from missing history', () => {
  client.mockReturnValue({ data: null, isLoading: true, isError: false } as ReturnType<typeof useClient>);
  render(<BriefRecap designerClientId="relationship-a" leadId={null} />);
  expect(screen.getByText(/Opening the brief/)).toBeInTheDocument();
  expect(screen.queryByText(/No original brief/)).not.toBeInTheDocument();
  cleanup();
  client.mockReturnValue({ data: { lead_id: 'stale-lead' }, isLoading: false, isError: true } as ReturnType<typeof useClient>);
  render(<BriefRecap designerClientId="relationship-a" leadId={null} />);
  expect(screen.getByRole('alert')).toHaveTextContent('The original brief could not be read.');
  expect(screen.queryByText(/Original notes for/)).not.toBeInTheDocument();
});


// Isolate the page's native lineage slot expression; all three readers still
// render into the real chapter, without the page's unrelated domain hooks.
function renderProjectLineage(projectIsLoading: boolean, projectIsError: boolean, linked = false) {
  const page = readFileSync(path.join(process.cwd(), 'src/app/(document)/doc/[id]/page.tsx'), 'utf8');
  const start = page.indexOf('brief: {', page.indexOf('const round8Pieces')) + 'brief: '.length;
  const end = page.indexOf('        design:', start);
  const expression = page.slice(start, end).trim().replace(/,$/, '');
  const compiled = ts.transpile('return (' + expression + ');', { jsx: ts.JsxEmit.React });
  const makeSlots = new Function('React', 'BriefRecap', 'SectionLoadingLine', 'DiscoveryRecap', 'ProposalBlocksReadOnly', 'projectIsLoading', 'projectIsError', 'designerClientId', 'row', 'unfoldProposalId', compiled);
  const slots = makeSlots(React, BriefRecap, SectionLoadingLine, () => <p>Linked discovery</p>, () => <p>Linked agreement</p>, projectIsLoading, projectIsError, linked ? 'relationship-a' : null, { lead_id: null }, linked ? 'proposal-a' : null);
  return render(<BriefAgreementChapter {...slots} />);
}

it.each([
  [true, false, 'loading'],
  [false, true, 'failed'],
])('keeps all project lineage slots truthful while project read is %s/%s (%s)', (loading, error) => {
  renderProjectLineage(loading as boolean, error as boolean);
  expect(screen.queryAllByText(/No original brief|No discovery notes|No agreement/)).toHaveLength(0);
  if (error) expect(screen.getAllByRole('alert')).toHaveLength(3);
  else expect(screen.getAllByText(/Opening/)).toHaveLength(3);
});

it('does not print stale lineage on a failed project read', () => {
  renderProjectLineage(false, true, true);
  expect(screen.queryAllByText(/Original notes for|Linked discovery|Linked agreement/)).toHaveLength(0);
  expect(screen.getAllByRole('alert')).toHaveLength(3);
});

it('prints absent lineage only after a successful genuinely empty project read', () => {
  renderProjectLineage(false, false);
  expect(screen.getByText('No original brief is linked to this document.')).toBeInTheDocument();
  expect(screen.getByText('No discovery notes are linked to this document.')).toBeInTheDocument();
  expect(screen.getByText('No agreement is linked to this document.')).toBeInTheDocument();
});
