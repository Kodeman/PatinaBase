import type { NextRequest } from 'next/server';
import { createRouteHandler, type RouteContext } from '@patina/api-routes';
import { proxyBackgroundRemoval } from '../../../../_background-removal-proxy';

export const POST = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    const boardId = context.custom?.params?.boardId as string;
    const itemId = context.custom?.params?.itemId as string;
    return proxyBackgroundRemoval(request, context, {
      operation: 'mutation',
      servicePath: `/boards/${encodeURIComponent(boardId)}/items/${encodeURIComponent(itemId)}/remove-background`,
    });
  },
  { method: 'POST' },
);
