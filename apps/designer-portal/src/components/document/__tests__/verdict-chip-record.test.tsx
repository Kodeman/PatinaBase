import { render, screen } from '@testing-library/react';
import { StatusChip } from '../status-chip';
import { verdictChipSpec } from '@/lib/document/verdict-chip';

describe('StatusChip verdict records', () => {
  it('renders Approved with record fill, forest ink and an accessible forest edge', () => {
    render(<StatusChip {...verdictChipSpec('approved')!} />);
    const chip = screen.getByText('Approved');
    expect(chip).toHaveClass('bg-[var(--color-green-record)]', 'text-[var(--color-forest)]', 'border-[var(--color-forest)]');
    expect(chip).not.toHaveClass('text-[var(--text-muted)]');
    expect(chip.querySelector('[aria-hidden]')).toHaveStyle({ background: 'var(--color-forest)' });
  });

  it.each(['rejected', 'comment'] as const)('keeps %s unfilled with the existing dot and muted label', (verdict) => {
    const spec = verdictChipSpec(verdict)!;
    render(<StatusChip {...spec} />);
    const chip = screen.getByText(spec.label);
    expect(chip).toHaveClass('text-[var(--text-muted)]');
    expect(chip).not.toHaveClass('bg-[var(--color-green-record)]', 'border');
    expect(chip.querySelector('[aria-hidden]')).toHaveStyle({ background: spec.color });
  });
});
