import { boardPersistenceMessage } from '../board-room-controller';

describe('boardPersistenceMessage', () => {
  it('never repeats a backend message to the reader', () => {
    const backendMessages = [
      'Project board changes require apply_board_room_state',
      'invalid board fields',
      'invalid board item',
      'invalid board sections',
      'board item geometry is out of range',
      'board unavailable',
      'project board unavailable',
      'board item limit exceeded',
      'project not found or access denied',
    ];
    for (const message of backendMessages) {
      const copy = boardPersistenceMessage(new Error(message));
      expect(copy).not.toContain(message);
      expect(copy).not.toMatch(/apply_board_room_state|jsonb|rpc|errcode/i);
    }
  });

  it('names the access class when the board is no longer writable', () => {
    for (const message of [
      'board unavailable',
      'project board unavailable',
      'project not found or access denied',
      'proposal not found or not accessible',
      'board selection does not belong to project',
      'authentication required',
    ]) {
      expect(boardPersistenceMessage(new Error(message))).toBe(
        'That change was reverted — this board is no longer open for editing here. Reopen it from the project and try again.',
      );
    }
  });

  it('names the pin ceiling', () => {
    expect(boardPersistenceMessage(new Error('board item limit exceeded'))).toBe(
      'That change was reverted — this board is already holding as many pins as it can.',
    );
  });

  it('folds every validation refusal into one layout sentence', () => {
    for (const message of [
      'invalid board fields',
      'invalid board item',
      'invalid board sections',
      'board item geometry is out of range',
      'Project board changes require apply_board_room_state',
    ]) {
      expect(boardPersistenceMessage(new Error(message))).toBe(
        'That change was reverted — the board could not accept that layout.',
      );
    }
  });

  it('separates a dropped connection from a refusal', () => {
    for (const message of ['Failed to fetch', 'NetworkError when attempting to fetch', 'Load failed']) {
      expect(boardPersistenceMessage(new Error(message))).toBe(
        'That change was reverted — the connection dropped before it could be saved.',
      );
    }
  });

  it('reads a PostgREST rejection, which is a plain object and not an Error', () => {
    expect(
      boardPersistenceMessage({
        code: '23514',
        message: 'invalid board item',
        details: null,
        hint: null,
      }),
    ).toBe('That change was reverted — the board could not accept that layout.');
  });

  it('falls back to a plain sentence for anything unrecognised', () => {
    expect(boardPersistenceMessage(new Error('kaboom'))).toBe(
      'That change was reverted because it could not be saved.',
    );
    expect(boardPersistenceMessage(undefined)).toBe(
      'That change was reverted because it could not be saved.',
    );
  });
});
