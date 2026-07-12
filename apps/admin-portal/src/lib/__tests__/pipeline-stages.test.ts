import {
  daysInStage,
  designerProspectColumns,
  DESIGNER_PROSPECT_ACTIVE_STAGES,
  DESIGNER_PROSPECT_STAGES,
  formatAgeInStage,
  formatVendorScore,
  isAgeStale,
  isDesignerProspectStage,
  isVendorStage,
  vendorColumns,
  VENDOR_ACTIVE_STAGES,
  VENDOR_STAGES,
  AGE_STALE_THRESHOLD_DAYS,
} from '@/lib/pipeline-stages';

const NOW = new Date('2026-07-12T12:00:00Z');

describe('designerProspectColumns / vendorColumns', () => {
  it('hides archived stages by default', () => {
    expect(designerProspectColumns(false)).toEqual(DESIGNER_PROSPECT_ACTIVE_STAGES);
    expect(designerProspectColumns(false)).not.toContain('passed');
  });

  it('shows every stage, in order, when archived is toggled on', () => {
    expect(designerProspectColumns(true)).toEqual(DESIGNER_PROSPECT_STAGES);
    expect(designerProspectColumns(true)[designerProspectColumns(true).length - 1]).toBe('passed');
  });

  it('vendor board hides paused/rejected by default', () => {
    const cols = vendorColumns(false);
    expect(cols).toEqual(VENDOR_ACTIVE_STAGES);
    expect(cols).not.toContain('paused');
    expect(cols).not.toContain('rejected');
  });

  it('vendor board shows all 8 stages, in the CHECK-constraint order, when archived', () => {
    expect(vendorColumns(true)).toEqual(VENDOR_STAGES);
    expect(vendorColumns(true)).toHaveLength(8);
  });
});

describe('isDesignerProspectStage / isVendorStage', () => {
  it('accepts only the real CHECK values', () => {
    expect(isDesignerProspectStage('sourced')).toBe(true);
    expect(isDesignerProspectStage('discovery')).toBe(false);
    expect(isVendorStage('discovery')).toBe(true);
    expect(isVendorStage('sourced')).toBe(false);
  });
});

describe('daysInStage', () => {
  it('returns 0 for missing or invalid input', () => {
    expect(daysInStage(null, NOW)).toBe(0);
    expect(daysInStage(undefined, NOW)).toBe(0);
    expect(daysInStage('not-a-date', NOW)).toBe(0);
  });

  it('computes fractional days from stageEnteredAt to now', () => {
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysInStage(twoDaysAgo, NOW)).toBeCloseTo(2, 5);
  });

  it('clamps negative durations (future stamp) to 0', () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString();
    expect(daysInStage(future, NOW)).toBe(0);
  });
});

describe('formatAgeInStage', () => {
  it('renders an em-dash for missing/invalid input', () => {
    expect(formatAgeInStage(null, NOW)).toBe('—');
    expect(formatAgeInStage('garbage', NOW)).toBe('—');
  });

  it('renders "<1h" under an hour', () => {
    const thirtyMinAgo = new Date(NOW.getTime() - 30 * 60 * 1000).toISOString();
    expect(formatAgeInStage(thirtyMinAgo, NOW)).toBe('<1h');
  });

  it('renders whole hours under a day', () => {
    const sixHoursAgo = new Date(NOW.getTime() - 6 * 60 * 60 * 1000).toISOString();
    expect(formatAgeInStage(sixHoursAgo, NOW)).toBe('6h');
  });

  it('renders whole days at 24h+', () => {
    const twelveDaysAgo = new Date(NOW.getTime() - 12 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatAgeInStage(twelveDaysAgo, NOW)).toBe('12d');
  });
});

describe('isAgeStale', () => {
  it('is false at and under the threshold', () => {
    const exactly14 = new Date(
      NOW.getTime() - AGE_STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isAgeStale(exactly14, NOW)).toBe(false);
  });

  it('is true just past the threshold', () => {
    const justOver14 = new Date(
      NOW.getTime() - (AGE_STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000 + 1),
    ).toISOString();
    expect(isAgeStale(justOver14, NOW)).toBe(true);
  });

  it('is false for a prospect with no stage_entered_at', () => {
    expect(isAgeStale(null, NOW)).toBe(false);
  });
});

describe('formatVendorScore', () => {
  it('formats a numeric score as "NNN/500"', () => {
    expect(formatVendorScore(347)).toBe('347/500');
    expect(formatVendorScore(0)).toBe('0/500');
  });

  it('returns null when unscored', () => {
    expect(formatVendorScore(null)).toBeNull();
    expect(formatVendorScore(undefined)).toBeNull();
  });
});
