import { render, screen } from '@testing-library/react';
import { ConfidenceBadge, confidenceBand } from '@/components/mission-control/confidence-badge';

describe('confidenceBand', () => {
  it('returns sage at and above 0.85 (inclusive edge)', () => {
    expect(confidenceBand(0.85)).toBe('sage');
    expect(confidenceBand(0.86)).toBe('sage');
    expect(confidenceBand(1)).toBe('sage');
  });

  it('returns clay in [0.60, 0.85) including the 0.60 edge', () => {
    expect(confidenceBand(0.6)).toBe('clay');
    expect(confidenceBand(0.74)).toBe('clay');
    expect(confidenceBand(0.8499)).toBe('clay');
  });

  it('returns terracotta below 0.60', () => {
    expect(confidenceBand(0.5999)).toBe('terracotta');
    expect(confidenceBand(0.3)).toBe('terracotta');
    expect(confidenceBand(0)).toBe('terracotta');
  });

  it('returns null for null / undefined / NaN', () => {
    expect(confidenceBand(null)).toBeNull();
    expect(confidenceBand(undefined)).toBeNull();
    expect(confidenceBand(NaN)).toBeNull();
  });
});

describe('ConfidenceBadge', () => {
  it('renders an em-dash with band=none when confidence is null', () => {
    render(<ConfidenceBadge confidence={null} />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveAttribute('data-band', 'none');
    expect(badge).toHaveTextContent('—');
  });

  it('renders the numeral and the sage band at 0.85', () => {
    render(<ConfidenceBadge confidence={0.85} />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveAttribute('data-band', 'sage');
    expect(badge).toHaveTextContent('0.85');
  });

  it('renders the clay band at exactly 0.60', () => {
    render(<ConfidenceBadge confidence={0.6} />);
    expect(screen.getByTestId('confidence-badge')).toHaveAttribute('data-band', 'clay');
  });

  it('renders the terracotta band below 0.60', () => {
    render(<ConfidenceBadge confidence={0.4} />);
    expect(screen.getByTestId('confidence-badge')).toHaveAttribute('data-band', 'terracotta');
  });
});
