import { fireEvent, render, screen } from '@testing-library/react';
import type { ReleaseLine } from '@/lib/document/authorization-derivation';

let mockAuthority: { data: unknown } = { data: null };

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  useProjectBillingAuthority: () => mockAuthority,
}));

import { CompositionBar } from '../composition-bar';

const lines: ReleaseLine[] = [
  {
    id: 'a',
    name: 'Walnut bed, king',
    roomId: 'r1',
    roomName: 'Primary bedroom',
    quantity: 1,
    clientLineTotalCents: 1230000,
  },
  {
    id: 'b',
    name: 'Cane lounge chair',
    roomId: 'r1',
    roomName: 'Primary bedroom',
    quantity: 1,
    clientLineTotalCents: 420000,
  },
  {
    id: 'c',
    name: 'Wool rug',
    roomId: 'r2',
    roomName: 'Living',
    quantity: 1,
    clientLineTotalCents: 680000,
  },
];

const renderBar = (over: Partial<Parameters<typeof CompositionBar>[0]> = {}) =>
  render(
    <CompositionBar
      projectId="project-1"
      lines={lines}
      onReview={jest.fn()}
      onPutBack={jest.fn()}
      {...over}
    />,
  );

describe('CompositionBar', () => {
  beforeEach(() => {
    mockAuthority = { data: null };
  });

  it('counts what is held — lines, rooms and money', () => {
    renderBar();
    const bar = screen.getByTestId('composition-bar');
    expect(bar).toHaveTextContent('3 lines · 2 rooms · $23,300');
  });

  it('says nothing about a deposit until the agreement term resolves', () => {
    renderBar();
    expect(screen.getByTestId('composition-bar')).not.toHaveTextContent(
      /deposit/i,
    );
  });

  it('states the deposit once the term is known', () => {
    mockAuthority = { data: { furnishingsDepositPercent: 50 } };
    renderBar();
    expect(screen.getByTestId('composition-bar')).toHaveTextContent(
      'deposit $11,650 at 50%',
    );
  });

  it('reads a singular line and room without pluralising', () => {
    renderBar({ lines: [lines[0]] });
    expect(screen.getByTestId('composition-bar')).toHaveTextContent(
      '1 line · 1 room',
    );
  });

  it('carries the review act and the way back', () => {
    const onReview = jest.fn();
    const onPutBack = jest.fn();
    renderBar({ onReview, onPutBack });
    fireEvent.click(screen.getByRole('button', { name: /review & release/i }));
    fireEvent.click(screen.getByRole('button', { name: /put back/i }));
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(onPutBack).toHaveBeenCalledTimes(1);
  });

  it('will not review an empty composition', () => {
    const onReview = jest.fn();
    renderBar({ lines: [], onReview });
    const review = screen.getByRole('button', { name: /review & release/i });
    expect(review).toBeDisabled();
    fireEvent.click(review);
    expect(onReview).not.toHaveBeenCalled();
  });

  it('rides the body, above the drawer and below the sheets, with no shadow', () => {
    renderBar();
    const bar = screen.getByTestId('composition-bar');
    expect(bar.parentElement).toBe(document.body);
    expect(bar.className).toContain('z-[45]');
    expect(bar.className).toContain('fixed');
    expect(bar.className).toContain('min-[1180px]:bottom-[60px]');
    expect(bar.className).not.toMatch(/shadow/);
  });
});
