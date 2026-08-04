import {
  boardRoomHref,
  moodBoardOpenSource,
  recentBoardCommandDescriptor,
  resolveMoodBoardReturnTarget,
  safeMoodBoardReturnPath,
} from './navigation';

describe('mood-board room navigation', () => {
  it('builds a tagged in-app room URL with a validated return path', () => {
    expect(
      boardRoomHref({
        boardId: 'board 1',
        from: '/drafting/proposal-1?facet=boards',
        source: 'drafting_strip',
      }),
    ).toBe(
      '/board/board%201?source=drafting_strip&from=%2Fdrafting%2Fproposal-1%3Ffacet%3Dboards',
    );
  });

  it.each([
    'https://evil.example/desk',
    '//evil.example/desk',
    '/%2F%2Fevil.example/desk',
    '/desk\\evil',
    '/people',
    'desk',
  ])('rejects unsafe or non-allowlisted return target %s', (value) => {
    expect(safeMoodBoardReturnPath(value)).toBeNull();
  });

  it('prefers explicit then same-origin referrer then canonical owner fallbacks', () => {
    expect(
      resolveMoodBoardReturnTarget({
        explicitFrom: '/desk?tab=active',
        referrer: 'https://app.example/doc/project-1',
        currentOrigin: 'https://app.example',
        owner: { kind: 'proposal', id: 'proposal-1' },
      }),
    ).toBe('/desk?tab=active');

    expect(
      resolveMoodBoardReturnTarget({
        referrer: 'https://app.example/doc/project-1?tab=boards',
        currentOrigin: 'https://app.example',
        owner: { kind: 'proposal', id: 'proposal-1' },
      }),
    ).toBe('/doc/project-1?tab=boards');

    expect(
      resolveMoodBoardReturnTarget({
        referrer: 'https://evil.example/doc/project-1',
        currentOrigin: 'https://app.example',
        owner: { kind: 'project', id: 'project-1' },
      }),
    ).toBe('/doc/project-1');
  });

  it('normalizes untrusted source tags to direct_url', () => {
    expect(moodBoardOpenSource('command_bar')).toBe('command_bar');
    expect(moodBoardOpenSource('crafted')).toBe('direct_url');
  });

  it('builds a concrete board command whose match outranks the generic room', () => {
    const command = recentBoardCommandDescriptor(
      {
        id: 'board-1',
        name: 'Warm modern',
        ownerName: 'Hale residence',
        roomName: 'Living room',
      },
      '/desk',
    );
    expect(command).toMatchObject({
      key: 'board:board-1',
      label: 'Board: Warm modern',
      sub: 'Living room · mood board',
    });
    expect(command.match).toContain('board');
    expect(command.match).toContain('moodboard');
    expect(command.href).toBe('/board/board-1?source=command_bar&from=%2Fdesk');
  });
});
