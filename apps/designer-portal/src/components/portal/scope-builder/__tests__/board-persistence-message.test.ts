import {
  BOARD_SAVE_MESSAGES,
  boardPersistenceMessage,
} from '../board-room-controller';

/** A PostgREST rejection: a plain object carrying the RAISE's SQLSTATE. */
function postgrest(code: string, message: string) {
  return { code, message, details: null, hint: null };
}

describe('boardPersistenceMessage', () => {
  it('dispatches on the SQLSTATE the board RPCs raise, not on their wording', () => {
    // Same code, deliberately reworded sentences — the copy must not move.
    expect(boardPersistenceMessage(postgrest('42501', 'board unavailable'))).toBe(
      BOARD_SAVE_MESSAGES.access,
    );
    expect(
      boardPersistenceMessage(postgrest('42501', 'a completely different sentence')),
    ).toBe(BOARD_SAVE_MESSAGES.access);

    expect(
      boardPersistenceMessage(postgrest('54000', 'board item limit exceeded')),
    ).toBe(BOARD_SAVE_MESSAGES.limit);
    expect(boardPersistenceMessage(postgrest('54000', 'reworded ceiling'))).toBe(
      BOARD_SAVE_MESSAGES.limit,
    );

    expect(boardPersistenceMessage(postgrest('23514', 'invalid board item'))).toBe(
      BOARD_SAVE_MESSAGES.layout,
    );
    expect(boardPersistenceMessage(postgrest('23514', 'reworded refusal'))).toBe(
      BOARD_SAVE_MESSAGES.layout,
    );
    expect(
      boardPersistenceMessage(
        postgrest('23000', 'board item id belongs to another board'),
      ),
    ).toBe(BOARD_SAVE_MESSAGES.layout);
  });

  it('classifies by message only when no SQLSTATE is carried', () => {
    expect(boardPersistenceMessage(new Error('project board unavailable'))).toBe(
      BOARD_SAVE_MESSAGES.access,
    );
    expect(
      boardPersistenceMessage(
        new Error('Project board changes require apply_board_room_state'),
      ),
    ).toBe(BOARD_SAVE_MESSAGES.layout);
    expect(boardPersistenceMessage(new Error('board item limit exceeded'))).toBe(
      BOARD_SAVE_MESSAGES.limit,
    );
    for (const message of [
      'Failed to fetch',
      'NetworkError when attempting to fetch',
      'Load failed',
    ]) {
      expect(boardPersistenceMessage(new Error(message))).toBe(
        BOARD_SAVE_MESSAGES.offline,
      );
    }
  });

  it('prefers the SQLSTATE over a message that reads like another class', () => {
    // A privilege refusal whose sentence happens to say "invalid board".
    expect(
      boardPersistenceMessage(postgrest('42501', 'invalid board fields')),
    ).toBe(BOARD_SAVE_MESSAGES.access);
  });

  it('never repeats a backend message or an internal name to the reader', () => {
    const rejections = [
      postgrest('42501', 'board unavailable'),
      postgrest('42501', 'project not found or access denied'),
      postgrest('23514', 'invalid board fields'),
      postgrest('23514', 'invalid board item'),
      postgrest('23514', 'invalid board sections'),
      postgrest('23514', 'board item geometry is out of range'),
      postgrest('23000', 'board item id belongs to another board'),
      postgrest('54000', 'board item limit exceeded'),
      new Error('Project board changes require apply_board_room_state'),
    ];
    for (const rejection of rejections) {
      const copy = boardPersistenceMessage(rejection);
      const backendText =
        rejection instanceof Error ? rejection.message : rejection.message;
      expect(copy).not.toContain(backendText);
      expect(copy).not.toMatch(/apply_board_room_state|jsonb|rpc|errcode|sqlstate/i);
      expect(Object.values(BOARD_SAVE_MESSAGES)).toContain(copy);
    }
  });

  it('falls back to a plain sentence for anything unrecognised', () => {
    expect(boardPersistenceMessage(new Error('kaboom'))).toBe(
      BOARD_SAVE_MESSAGES.unknown,
    );
    expect(boardPersistenceMessage(postgrest('P0001', 'kaboom'))).toBe(
      BOARD_SAVE_MESSAGES.unknown,
    );
    expect(boardPersistenceMessage(undefined)).toBe(BOARD_SAVE_MESSAGES.unknown);
    expect(boardPersistenceMessage('board unavailable')).toBe(
      BOARD_SAVE_MESSAGES.access,
    );
  });

  it('keeps every class distinguishable', () => {
    const values = Object.values(BOARD_SAVE_MESSAGES);
    expect(new Set(values).size).toBe(values.length);
  });
});
