import type { NextRequest } from 'next/server';
import { createRouteHandler, type RouteContext } from '@patina/api-routes';
import { proxyBackgroundRemoval } from '../../_background-removal-proxy';

export const GET = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    const boardId = context.custom?.params?.boardId as string;
    return proxyBackgroundRemoval(request, context, {
      operation: 'capability',
      servicePath: `/boards/${encodeURIComponent(boardId)}/background-removal-capability`,
    });
  },
  { method: 'GET' },
);
