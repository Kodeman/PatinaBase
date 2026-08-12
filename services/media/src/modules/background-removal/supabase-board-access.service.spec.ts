import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseBoardAccessService } from './supabase-board-access.service';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const DESIGNER_ID = '33333333-3333-4333-8333-333333333333';
const PROPOSAL_ID = '44444444-4444-4444-8444-444444444444';
const STUDIO_ID = '55555555-5555-4555-8555-555555555555';

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function service(): SupabaseBoardAccessService {
  const values: Record<string, string> = {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-service-role',
  };
  return new SupabaseBoardAccessService({
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService);
}

describe('SupabaseBoardAccessService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('uses the caller JWT for RLS and collapses an invisible board to 404', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse([]));

    await expect(service().authorizeBoard('caller-jwt', BOARD_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toMatchObject({
      headers: {
        apikey: 'server-only-service-role',
        authorization: 'Bearer caller-jwt',
      },
    });
  });

  it('requires an explicit studio co-membership check after the RLS reads', async () => {
    const request = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse([{ id: BOARD_ID, proposal_id: PROPOSAL_ID, project_id: null }]),
      )
      .mockResolvedValueOnce(jsonResponse([{ designer_id: DESIGNER_ID, project_id: null }]))
      .mockResolvedValueOnce(jsonResponse(false));

    await expect(service().authorizeBoard('caller-jwt', BOARD_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(request).toHaveBeenCalledTimes(3);
    expect(String(request.mock.calls[2][0])).toContain('/rest/v1/rpc/is_studio_comember');
    expect(request.mock.calls[2][1]).toMatchObject({
      body: JSON.stringify({ p_owner: DESIGNER_ID }),
    });
  });

  it('prefers the authorized item display column over stale legacy JSON', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse([{ id: BOARD_ID, proposal_id: PROPOSAL_ID, project_id: null }]),
      )
      .mockResolvedValueOnce(jsonResponse([{ designer_id: DESIGNER_ID, project_id: null }]))
      .mockResolvedValueOnce(jsonResponse(true))
      .mockResolvedValueOnce(jsonResponse(STUDIO_ID))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: ITEM_ID,
            board_id: BOARD_ID,
            type: 'image',
            image_url: 'https://images.example/current.png',
            data: { image_url: 'https://images.example/stale-original.png' },
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse(true));

    await expect(
      service().authorizeBoardItem('caller-jwt', BOARD_ID, ITEM_ID),
    ).resolves.toMatchObject({
      studioId: STUDIO_ID,
      quotaOwnerId: STUDIO_ID,
      item: { sourceUrl: 'https://images.example/current.png' },
    });
  });

  it('falls back to the legacy JSON image only when the display column is empty', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse([{ id: BOARD_ID, proposal_id: PROPOSAL_ID, project_id: null }]),
      )
      .mockResolvedValueOnce(jsonResponse([{ designer_id: DESIGNER_ID, project_id: null }]))
      .mockResolvedValueOnce(jsonResponse(true))
      .mockResolvedValueOnce(jsonResponse(STUDIO_ID))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: ITEM_ID,
            board_id: BOARD_ID,
            type: 'image',
            image_url: null,
            data: { image_url: 'https://images.example/legacy.png' },
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse(true));

    await expect(
      service().authorizeBoardItem('caller-jwt', BOARD_ID, ITEM_ID),
    ).resolves.toMatchObject({
      item: { sourceUrl: 'https://images.example/legacy.png' },
    });
  });

  it('rejects an exact item source when database ownership coherence fails', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse([{ id: BOARD_ID, proposal_id: PROPOSAL_ID, project_id: null }]),
      )
      .mockResolvedValueOnce(jsonResponse([{ designer_id: DESIGNER_ID, project_id: null }]))
      .mockResolvedValueOnce(jsonResponse(true))
      .mockResolvedValueOnce(jsonResponse(STUDIO_ID))
      .mockResolvedValueOnce(jsonResponse([{
        id: ITEM_ID,
        board_id: BOARD_ID,
        type: 'image',
        image_url: 'other-studio/boards/other-board/private.png',
        data: {},
      }]))
      .mockResolvedValueOnce(jsonResponse(false));

    await expect(
      service().authorizeBoardItem('caller-jwt', BOARD_ID, ITEM_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
