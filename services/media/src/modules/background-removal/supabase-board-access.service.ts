import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthorizedBoardContext, AuthorizedBoardItemContext } from './background-removal.types';

interface BoardRow {
  id: string;
  proposal_id: string | null;
  project_id: string | null;
}

interface ProposalRow {
  designer_id: string;
  project_id: string | null;
}

interface ProjectRow {
  designer_id: string | null;
  studio_id: string | null;
}

interface BoardItemRow {
  id: string;
  board_id: string;
  type: string;
  image_url: string | null;
  data: unknown;
}

const REMOVABLE_ITEM_TYPES = new Set(['image', 'product', 'capture']);

@Injectable()
export class SupabaseBoardAccessService {
  private readonly supabaseUrl: string | null;
  private readonly serviceRoleKey: string | null;

  constructor(config: ConfigService) {
    this.supabaseUrl = config.get<string>('SUPABASE_URL')?.replace(/\/$/, '') || null;
    this.serviceRoleKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim() || null;
  }

  async authorizeBoard(userJwt: string, boardId: string): Promise<AuthorizedBoardContext> {
    const board = await this.one<BoardRow>(
      userJwt,
      'proposal_boards',
      'id,proposal_id,project_id',
      { id: boardId },
    );
    if (!board) throw this.notFound();

    let owner: AuthorizedBoardContext['owner'];
    let designerId: string | null = null;
    let studioId: string | null = null;

    if (board.proposal_id && !board.project_id) {
      owner = { kind: 'proposal', id: board.proposal_id };
      const proposal = await this.one<ProposalRow>(userJwt, 'proposals', 'designer_id,project_id', {
        id: board.proposal_id,
      });
      if (!proposal) throw this.notFound();
      designerId = proposal.designer_id;
      if (proposal.project_id) {
        const project = await this.one<ProjectRow>(userJwt, 'projects', 'designer_id,studio_id', {
          id: proposal.project_id,
        });
        studioId = project?.studio_id ?? null;
      }
    } else if (board.project_id && !board.proposal_id) {
      owner = { kind: 'project', id: board.project_id };
      const project = await this.one<ProjectRow>(userJwt, 'projects', 'designer_id,studio_id', {
        id: board.project_id,
      });
      if (!project?.designer_id) throw this.notFound();
      designerId = project.designer_id;
      studioId = project.studio_id;
    } else {
      throw this.notFound();
    }

    const isStudioMember = await this.rpc<boolean>(userJwt, 'is_studio_comember', {
      p_owner: designerId,
    });
    if (isStudioMember !== true) throw this.notFound();

    if (!studioId) {
      studioId = await this.rpc<string | null>(userJwt, '_primary_studio_for', {
        p_user: designerId,
      });
    }

    return {
      boardId: board.id,
      owner,
      designerId,
      studioId,
      // Legacy solo designers without an organization still get an isolated
      // monthly budget instead of falling into a shared null bucket.
      quotaOwnerId: studioId ?? designerId,
    };
  }

  async authorizeBoardItem(
    userJwt: string,
    boardId: string,
    itemId: string,
  ): Promise<AuthorizedBoardItemContext> {
    const board = await this.authorizeBoard(userJwt, boardId);
    const item = await this.one<BoardItemRow>(
      userJwt,
      'proposal_board_items',
      'id,board_id,type,image_url,data',
      { id: itemId, board_id: boardId },
    );
    if (!item || item.board_id !== boardId) throw this.notFound();
    if (!REMOVABLE_ITEM_TYPES.has(item.type)) {
      throw new UnprocessableEntityException({
        code: 'background_removal_source_unavailable',
        message: 'This board item cannot be processed.',
      });
    }

    const data =
      item.data && typeof item.data === 'object' && !Array.isArray(item.data)
        ? (item.data as Record<string, unknown>)
        : {};
    const dataImage = typeof data.image_url === 'string' ? data.image_url.trim() : '';
    // The normalized column is the persisted current display image. The JSON
    // value exists only for legacy rows and may still point at a stale original.
    const sourceUrl = item.image_url?.trim() || dataImage;
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
  }

  private async one<T>(
    jwt: string,
    table: string,
    select: string,
    filters: Record<string, string>,
  ): Promise<T | null> {
    const base = this.configuredUrl(`/rest/v1/${table}`);
    base.searchParams.set('select', select);
    base.searchParams.set('limit', '1');
    for (const [field, value] of Object.entries(filters)) {
      base.searchParams.set(field, `eq.${value}`);
    }
    const response = await this.userRequest(base, jwt, { method: 'GET' });
    const rows = (await response.json()) as T[];
    return rows[0] ?? null;
  }

  private async rpc<T>(jwt: string, name: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.userRequest(this.configuredUrl(`/rest/v1/rpc/${name}`), jwt, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await response.json()) as T;
  }

  private configuredUrl(path: string): URL {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new ServiceUnavailableException({
        code: 'background_removal_unavailable',
        message: 'Background removal is unavailable.',
      });
    }
    return new URL(path, `${this.supabaseUrl}/`);
  }

  private async userRequest(url: URL, jwt: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          apikey: this.serviceRoleKey!,
          authorization: `Bearer ${jwt}`,
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'background_removal_unavailable',
        message: 'Background removal is unavailable.',
      });
    }
    if (!response.ok) {
      throw new ServiceUnavailableException({
        code: 'background_removal_unavailable',
        message: 'Background removal is unavailable.',
      });
    }
    return response;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: 'board_item_not_found',
      message: 'Board item not found.',
    });
  }
}
