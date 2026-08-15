import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { MediaAuthorizationResolver } from '../authorization/media-authorization.resolver';
import { SupabaseBoardAccessService } from './supabase-board-access.service';

const SUBJECT = '11111111-1111-4111-8111-111111111111';
const BOARD_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const DESIGNER_ID = '44444444-4444-4444-8444-444444444444';
const PROPOSAL_ID = '55555555-5555-4555-8555-555555555555';
const STUDIO_ID = '66666666-6666-4666-8666-666666666666';

describe('SupabaseBoardAccessService', () => {
  function harness(results: unknown[], permissions = ['media.manage.own']) {
    const queryRaw = jest.fn();
    for (const result of results) queryRaw.mockResolvedValueOnce(result);
    const transaction = { $queryRaw: queryRaw };
    const authorization = {
      withCurrentAuthorization: jest.fn(async (subject, operation) =>
        operation(transaction, {
          subject,
          roles: ['designer'],
          permissions,
          organizationIds: [],
        }),
      ),
    } as unknown as MediaAuthorizationResolver;
    return {
      service: new SupabaseBoardAccessService(authorization),
      queryRaw,
      authorization,
    };
  }

  const board = {
    board_id: BOARD_ID,
    proposal_id: PROPOSAL_ID,
    project_id: null,
    designer_id: DESIGNER_ID,
    studio_id: STUDIO_ID,
  };

  it('collapses an inaccessible own board to the common 404', async () => {
    const { service } = harness([[]]);
    await expect(service.authorizeBoard(SUBJECT, BOARD_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('uses a current organization-scoped permission and the relational SQL result', async () => {
    const { service, queryRaw } = harness([[board]], ['media.manage.org']);
    await expect(service.authorizeBoard(SUBJECT, BOARD_ID)).resolves.toEqual({
      boardId: BOARD_ID,
      owner: { kind: 'proposal', id: PROPOSAL_ID },
      designerId: DESIGNER_ID,
      studioId: STUDIO_ID,
      quotaOwnerId: STUDIO_ID,
    });
    const query = queryRaw.mock.calls[0][0];
    expect(query.strings.join('')).toContain("membership.status = 'active'");
    expect(query.strings.join('')).toContain("organization.status = 'active'");
    expect(query.strings.join('')).toContain(
      'actor_membership.organization_id = context.studio_id',
    );
    expect(query.strings.join('')).toContain(
      'owner_membership.organization_id = context.studio_id',
    );
    expect(query.values).toContain(SUBJECT);
  });

  it('denies a B-only actor when an A-board designer also shares unrelated studio B', async () => {
    const { service, queryRaw } = harness([[]], ['media.manage.org']);

    await expect(service.authorizeBoard(SUBJECT, BOARD_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const sql = queryRaw.mock.calls[0][0].strings.join('');
    expect(sql).toContain('context.studio_id IS NOT NULL');
    expect(sql).toContain('actor_membership.organization_id = context.studio_id');
    expect(sql).toContain('owner_membership.organization_id = context.studio_id');
    expect(sql).toContain("organization.type = 'design_studio'");
  });

  it('denies on the next request when current membership query returns no board', async () => {
    const first = harness([[board]], ['media.manage.org']);
    await expect(first.service.authorizeBoard(SUBJECT, BOARD_ID)).resolves.toBeDefined();
    const second = harness([[]], ['media.manage.org']);
    await expect(second.service.authorizeBoard(SUBJECT, BOARD_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('authorizes board and item in one current-state transaction and uses normalized image_url', async () => {
    const { service, authorization } = harness([
      [board],
      [
        {
          id: ITEM_ID,
          board_id: BOARD_ID,
          type: 'image',
          image_url: 'https://images.example/current.png',
          media_allowed: true,
        },
      ],
    ]);
    await expect(service.authorizeBoardItem(SUBJECT, BOARD_ID, ITEM_ID)).resolves.toMatchObject({
      item: { sourceUrl: 'https://images.example/current.png' },
    });
    expect(authorization.withCurrentAuthorization).toHaveBeenCalledTimes(1);
  });

  it('never falls back to arbitrary legacy JSON when normalized image_url is absent', async () => {
    const { service } = harness([
      [board],
      [
        {
          id: ITEM_ID,
          board_id: BOARD_ID,
          type: 'image',
          image_url: null,
          media_allowed: true,
        },
      ],
    ]);
    await expect(service.authorizeBoardItem(SUBJECT, BOARD_ID, ITEM_ID)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rejects a reference when canonical ownership coherence fails', async () => {
    const { service } = harness([
      [board],
      [
        {
          id: ITEM_ID,
          board_id: BOARD_ID,
          type: 'image',
          image_url: 'other-studio/boards/private.png',
          media_allowed: false,
        },
      ],
    ]);
    await expect(service.authorizeBoardItem(SUBJECT, BOARD_ID, ITEM_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
