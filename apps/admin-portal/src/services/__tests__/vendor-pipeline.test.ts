import { VendorPipeline } from '@patina/types';

const { computeTriageLevel, RUBRIC_DIMENSIONS, TRIAGE_THRESHOLDS } = VendorPipeline;

describe('vendor-pipeline / computeTriageLevel', () => {
  it('maps 400+ to green', () => {
    expect(computeTriageLevel(500)).toBe('green');
    expect(computeTriageLevel(400)).toBe('green');
  });

  it('maps 300–399 to yellow', () => {
    expect(computeTriageLevel(399)).toBe('yellow');
    expect(computeTriageLevel(300)).toBe('yellow');
  });

  it('maps 200–299 to orange', () => {
    expect(computeTriageLevel(299)).toBe('orange');
    expect(computeTriageLevel(200)).toBe('orange');
  });

  it('maps anything below 200 to red', () => {
    expect(computeTriageLevel(199)).toBe('red');
    expect(computeTriageLevel(0)).toBe('red');
  });
});

describe('vendor-pipeline / RUBRIC_DIMENSIONS', () => {
  it('has 8 dimensions', () => {
    expect(RUBRIC_DIMENSIONS).toHaveLength(8);
  });

  it('sums to 100 weighted, producing a 500-point scale max', () => {
    const totalWeight = RUBRIC_DIMENSIONS.reduce((s, d) => s + d.weight, 0);
    expect(totalWeight).toBe(100);

    const maxScore = RUBRIC_DIMENSIONS.reduce((s, d) => s + d.weight * 5, 0);
    expect(maxScore).toBe(500);
  });

  it('splits 4 dims to Kody and 4 to Leah', () => {
    const kody = RUBRIC_DIMENSIONS.filter((d) => d.owner === 'kody');
    const leah = RUBRIC_DIMENSIONS.filter((d) => d.owner === 'leah');
    expect(kody).toHaveLength(4);
    expect(leah).toHaveLength(4);
  });

  it('exposes threshold constants consistent with computeTriageLevel', () => {
    expect(computeTriageLevel(TRIAGE_THRESHOLDS.green)).toBe('green');
    expect(computeTriageLevel(TRIAGE_THRESHOLDS.yellow)).toBe('yellow');
    expect(computeTriageLevel(TRIAGE_THRESHOLDS.orange)).toBe('orange');
  });
});
