import { fireEvent, render, screen } from '@testing-library/react';
import type { DeskFolder } from '@/lib/document/desk-derivation';
import { DESK_FOLIO_PREVIEW_LIMIT, NeedsYourHandFolios } from '../folder-card';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

jest.mock('@/components/document/triage-bar', () => ({
  TriageBar: () => null,
}));

function folio(index: number, urgent = false): DeskFolder {
  return {
    row: {
      engagement_id: `folio-${index}`,
      title: `Folio ${index}`,
      client_name: `Client ${index}`,
      active_section: 'project',
      current_phase: 'in_progress',
    },
    need: {
      kind: 'task_due',
      text: `Review folio ${index}`,
      actionLabel: 'Open the task',
      stamp: {
        label: 'Due',
        color: 'var(--color-terracotta)',
      },
      urgent,
    },
  } as unknown as DeskFolder;
}

describe('NeedsYourHandFolios', () => {
  it('keeps exactly four folios in reach, then reveals and refolds the remainder', () => {
    const folders = Array.from({ length: 6 }, (_, index) =>
      folio(index + 1, index === 4),
    );
    render(<NeedsYourHandFolios folders={folders} />);

    expect(DESK_FOLIO_PREVIEW_LIMIT).toBe(4);
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(
      screen.getByText('4 in reach · 2 folded below · 1 time-sensitive'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Folio 5/ }),
    ).not.toBeInTheDocument();

    const reveal = screen.getByRole('button', {
      name: 'Reveal 2 more folios',
    });
    expect(reveal).toHaveAttribute('aria-expanded', 'false');
    expect(reveal).toHaveAttribute('aria-controls', 'needs-your-hand-folios');

    fireEvent.click(reveal);

    expect(screen.getAllByRole('link')).toHaveLength(6);
    expect(screen.getByText('All 6 folios in reach')).toBeInTheDocument();
    const fold = screen.getByRole('button', { name: 'Fold to four' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(fold);

    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(
      screen.queryByRole('link', { name: /Folio 6/ }),
    ).not.toBeInTheDocument();
  });
});
