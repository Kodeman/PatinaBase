/**
 * W3-T3b — sidemark generator unit tests.
 *
 * Shape contract: `{STUDIO≤3}-{CLIENT-or-PROJECT≤8}-{ROOM≤3}`, uppercase,
 * non-alphanumerics stripped, empty segments omitted (no dangling dashes).
 */

import { generateSidemark } from '../sidemark';

describe('generateSidemark', () => {
  it('produces the canonical STUDIO-CLIENT-ROOM shape', () => {
    expect(
      generateSidemark({
        studioName: 'Middle West Studio',
        clientName: 'Walker',
        roomName: 'Living Room',
      })
    ).toBe('MWS-WALKER-LR');
  });

  it('uses initials for multi-word studio/room names and a prefix for single words', () => {
    expect(
      generateSidemark({
        studioName: 'Patina',
        clientName: 'Walker',
        roomName: 'Foyer',
      })
    ).toBe('PAT-WALKER-FOY');
  });

  it('caps multi-word initials at the segment max', () => {
    expect(
      generateSidemark({
        studioName: 'Big Old Design Works Co',
        clientName: 'Walker',
      })
    ).toBe('BOD-WALKER');
  });

  it('falls back to the project name when no client name is in scope', () => {
    expect(
      generateSidemark({
        studioName: 'Middle West Studio',
        projectName: 'Lake House',
        roomName: 'Great Room',
      })
    ).toBe('MWS-LAKEHOUS-GR');
  });

  it('prefers the client name over the project name when both exist', () => {
    expect(
      generateSidemark({
        clientName: 'Olsen',
        projectName: 'Lake House',
      })
    ).toBe('OLSEN');
  });

  it('strips non-alphanumerics and uppercases', () => {
    expect(
      generateSidemark({
        studioName: 'middle west studio',
        clientName: "O'Brien-Walker, Jr.",
      })
    ).toBe('MWS-OBRIENWA');
  });

  it('omits empty segments without dangling separators', () => {
    expect(generateSidemark({ projectName: 'Lake House' })).toBe('LAKEHOUS');
    expect(
      generateSidemark({ studioName: 'Middle West Studio', roomName: 'Living Room' })
    ).toBe('MWS-LR');
    expect(generateSidemark({ roomName: 'Living Room' })).toBe('LR');
  });

  it('treats whitespace-only / symbol-only inputs as empty', () => {
    expect(
      generateSidemark({
        studioName: '   ',
        clientName: '!!!',
        projectName: 'Lake House',
        roomName: null,
      })
    ).toBe('LAKEHOUS');
  });

  it('returns an empty string when nothing usable is supplied', () => {
    expect(generateSidemark({})).toBe('');
    expect(
      generateSidemark({ studioName: null, clientName: undefined, roomName: '' })
    ).toBe('');
  });

  it('never exceeds the segment caps (worst case is well under 40 chars)', () => {
    const result = generateSidemark({
      studioName: 'Averylongsinglewordstudio',
      clientName: 'Bartholomew-Fitzgerald-Smythe',
      roomName: 'Conservatory',
    });
    expect(result).toBe('AVE-BARTHOLO-CON');
    expect(result.length).toBeLessThanOrEqual(16);
  });
});
