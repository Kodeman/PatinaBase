import { familyLabel, householdName } from '../family-label';

describe('household display copy', () => {
  it.each([
    ['Harper Vale', 'Harper Vale'],
    ['UX Audit — Harper Vale', 'UX Audit — Harper Vale'],
    ['The Reyeses', 'The Reyeses'],
    ['Reyes Family', 'Reyes Family'],
  ])('keeps the deliberate client display name %p verbatim', (input, expected) => {
    expect(householdName(input)).toBe(expected);
    expect(familyLabel(input)).toBe(expected);
  });

  it('uses a neutral fallback only when there is no name', () => {
    expect(familyLabel('  ')).toBe('the client');
  });
});
