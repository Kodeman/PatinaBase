import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { RequestAuthorization } from '@patina/auth';
import { MediaAuthorizationResolver } from '../authorization/media-authorization.resolver';
import { AuthorizedBoardContext, AuthorizedBoardItemContext } from './background-removal.types';

interface BoardContextRow {
  board_id: string;
  proposal_id: string | null;
  project_id: string | null;
  designer_id: string;
  studio_id: string | null;
}

interface BoardItemRow {
  id: string;
  board_id: string;
  type: string;
  image_url: string | null;
  media_allowed: boolean;
}

const REMOVABLE_ITEM_TYPES = new Set(['image', 'product', 'capture']);

@Injectable()
export class SupabaseBoardAccessService {
  constructor(private readonly authorization: MediaAuthorizationResolver) {}

  async authorizeBoard(subject: string, boardId: string): Promise<AuthorizedBoardContext> {
    return this.authorization.withCurrentAuthorization(subject, (transaction, current) =>
      this.loadBoard(transaction, current, subject, boardId),
    );
  }

  async authorizeBoardItem(
    subject: string,
    boardId: string,
    itemId: string,
  ): Promise<AuthorizedBoardItemContext> {
    return this.authorization.withCurrentAuthorization(subject, async (transaction, current) => {
      const board = await this.loadBoard(transaction, current, subject, boardId);
      const rows = await transaction.$queryRaw<BoardItemRow[]>(Prisma.sql`
          SELECT
            item.id::text,
            item.board_id::text,
            item.type,
            item.image_url,
            public.board_media_reference_is_allowed(
              item.image_url,
              ${board.designerId}::uuid,
              ${board.studioId}::uuid
            ) AS media_allowed
          FROM public.proposal_board_items AS item
          WHERE item.id = ${itemId}::uuid
            AND item.board_id = ${boardId}::uuid
        `);
      const item = rows[0];
      if (!item || item.media_allowed !== true) throw this.notFound();
      if (!REMOVABLE_ITEM_TYPES.has(item.type)) {
        throw new UnprocessableEntityException({
          code: 'background_removal_source_unavailable',
          message: 'This board item cannot be processed.',
        });
      }
      const sourceUrl = item.image_url?.trim();
      if (!sourceUrl) {
        throw new UnprocessableEntityException({
          code: 'background_removal_source_unavailable',
          message: 'This board item has no processable image.',
        });
      }
      return {
        ...board,
        item: {
          id: item.id,
          boardId: item.board_id,
          type: item.type as AuthorizedBoardItemContext['item']['type'],
          sourceUrl,
        },
      };
    });
  }

  private async loadBoard(
    transaction: Prisma.TransactionClient,
    current: RequestAuthorization,
    subject: string,
    boardId: string,
  ): Promise<AuthorizedBoardContext> {
    const permissions = new Set(current.permissions);
    const admin = permissions.has('media.admin.all');
    const allowOwn = admin || permissions.has('media.manage.own');
    const allowOrganization = admin || permissions.has('media.manage.org');
    const rows = await transaction.$queryRaw<BoardContextRow[]>(Prisma.sql`
          WITH board_context AS (
            SELECT
              board.id AS board_id,
              board.proposal_id,
              board.project_id,
              COALESCE(proposal.designer_id, project.designer_id) AS designer_id,
              project.studio_id AS studio_id
            FROM public.proposal_boards AS board
            LEFT JOIN public.proposals AS proposal
              ON proposal.id = board.proposal_id
            LEFT JOIN public.projects AS project
              ON project.id = COALESCE(board.project_id, proposal.project_id)
            WHERE board.id = ${boardId}::uuid
              AND num_nonnulls(board.proposal_id, board.project_id) = 1
          )
          SELECT
            context.board_id::text,
            context.proposal_id::text,
            context.project_id::text,
            context.designer_id::text,
            context.studio_id::text
          FROM board_context AS context
          WHERE context.designer_id IS NOT NULL
            AND (
              ${admin}
              OR (${allowOwn} AND context.designer_id = ${subject}::uuid)
              OR (
                ${allowOrganization}
                AND EXISTS (
                  SELECT 1
                  FROM public.organization_members AS actor_membership
                  JOIN public.organization_members AS owner_membership
                    ON owner_membership.organization_id = actor_membership.organization_id
                  JOIN public.organizations AS organization
                    ON organization.id = actor_membership.organization_id
                   AND organization.status = 'active'
                   AND organization.type = 'design_studio'
                  WHERE actor_membership.user_id = ${subject}::uuid
                    AND context.studio_id IS NOT NULL
                    AND actor_membership.organization_id = context.studio_id
                    AND actor_membership.status = 'active'
                    AND actor_membership.role <> 'guest'
                    AND owner_membership.user_id = context.designer_id
                    AND owner_membership.organization_id = context.studio_id
                    AND owner_membership.status = 'active'
                    AND owner_membership.role <> 'guest'
                )
              )
            )
    `);
    const row = rows[0];
    if (!row) throw this.notFound();
    const owner = row.proposal_id
      ? ({ kind: 'proposal', id: row.proposal_id } as const)
      : ({ kind: 'project', id: row.project_id as string } as const);
    return {
      boardId: row.board_id,
      owner,
      designerId: row.designer_id,
      studioId: row.studio_id,
      quotaOwnerId: row.studio_id ?? row.designer_id,
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'board_item_not_found',
      message: 'Board item not found.',
    });
  }
}
