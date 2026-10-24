import Link from 'next/link';
import { render, screen, within } from '@testing-library/react';
import { BriefAgreementChapter } from '../brief-agreement-chapter';

describe('BriefAgreementChapter phase one', () => {
  it('keeps a direct project history absent without inventing an agreement', () => {
    render(<BriefAgreementChapter brief={null} discovery={null} agreement={null} />);
    expect(screen.getByText('No original brief is linked to this document.')).toBeVisible();
    expect(screen.getByText('No discovery notes are linked to this document.')).toBeVisible();
    expect(screen.getByText('No agreement is linked to this document.')).toBeVisible();
    expect(screen.queryByText(/signed|executed|agreed on/i)).toBeNull();
  });

  it('prints the supplied original notes and legacy agreement without rewriting their identity', () => {
    render(<BriefAgreementChapter
      brief={<blockquote>Keep the piano in the living room.</blockquote>}
      discovery={<p>Original discovery note</p>}
      agreement={<Link href="/doc/old-proposal-id">Legacy proposal version 1</Link>}
    />);
    expect(within(screen.getByRole('region', { name: 'Original brief' })).getByText('Keep the piano in the living room.')).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Discovery notes' })).getByText('Original discovery note')).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Agreement record' })).getByRole('link')).toHaveAttribute('href', '/doc/old-proposal-id');
    expect(screen.queryByText(/No .* linked/)).toBeNull();
  });

  it('leaves native loading and error states intact, not absent or signed', () => {
    render(<BriefAgreementChapter
      brief={<p role="status">Opening the brief</p>}
      discovery={<p role="alert">Discovery could not be read</p>}
      agreement={<p role="status">Opening the agreement</p>}
    />);
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Discovery could not be read');
    expect(screen.queryByText(/No .* linked|signed|executed/i)).toBeNull();
  });

  it('does not own a second chapter heading or duplicate landmark ids', () => {
    render(<><BriefAgreementChapter brief={null} discovery={null} agreement={null} /><BriefAgreementChapter brief={null} discovery={null} agreement={null} /></>);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    const labels = screen.getAllByRole('region').map(region => region.getAttribute('aria-labelledby'));
    expect(new Set(labels).size).toBe(6);
    for (const label of labels) expect(document.getElementById(label!)).not.toBeNull();
  });
});
