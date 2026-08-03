// deno-lint-ignore-file no-import-prefix
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { canCallerUseOwner, ownedBoardOrNull, parseSpecPdfBody } from './core.ts';

Deno.test('spec-pdf body parser preserves legacy kinds and accepts board-composition', () => {
  for (
    const body of [
      { kind: 'item', proposalId: 'proposal', itemId: 'item' },
      { kind: 'document', projectId: 'project' },
      { kind: 'board', proposalId: 'proposal', boardId: 'board' },
      { kind: 'board-composition', projectId: 'project', boardId: 'board' },
    ]
  ) {
    assertEquals(parseSpecPdfBody(body).ok, true);
  }
  assertEquals(parseSpecPdfBody({ kind: 'board', proposalId: 'p' }), {
    ok: false,
    error: 'board_id_required',
  });
  assertEquals(
    parseSpecPdfBody({ kind: 'board-composition', proposalId: 'p' }),
    {
      ok: false,
      error: 'board_id_required',
    },
  );
});

Deno.test('authorization regression: both board PDF kinds stay exact-owner-only', () => {
  assertEquals(canCallerUseOwner('board', 'peer', 'owner', true), false);
  assertEquals(
    canCallerUseOwner('board-composition', 'peer', 'owner', true),
    false,
  );
  assertEquals(
    canCallerUseOwner('board-composition', 'peer', 'owner', false),
    false,
  );
  assertEquals(canCallerUseOwner('board', 'owner', 'owner', false), true);
  assertEquals(
    canCallerUseOwner('board-composition', 'owner', 'owner', true),
    true,
  );
});

Deno.test('missing and foreign boards collapse to the identical null result', () => {
  assertEquals(ownedBoardOrNull(null, 'owner', true), null);
  assertEquals(
    ownedBoardOrNull(
      { id: 'foreign', proposal_id: 'someone-else' },
      'owner',
      true,
    ),
    null,
  );
  assertEquals(
    ownedBoardOrNull({ id: 'mine', proposal_id: 'owner' }, 'owner', true),
    { id: 'mine', proposal_id: 'owner' },
  );
});
