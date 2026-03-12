import { NextRequest, NextResponse } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend,
  apiError,
  apiSuccess,
} from '@patina/api-routes';

const MEDIA_SERVICE_URL =
  process.env.MEDIA_SERVICE_URL || 'http://localhost:3014';

/**
 * GET /api/media/duplicates - Query duplicate detection endpoints
 *
 * Query params:
 *   - action=check&productId=xxx  -> Check duplicates for a specific product
 *   - action=report               -> Get the full duplicate report
 */
export const GET = createRouteHandler(
  async (request: NextRequest) => {
    try {
      const { searchParams } = new URL(request.url);
      const action = searchParams.get('action') || 'report';

      if (action === 'check') {
        const productId = searchParams.get('productId');
        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'productId is required' },
            { status: 400 },
          );
        }

        return await proxyToBackend(request, {}, {
          service: {
            name: 'media',
            baseUrl: MEDIA_SERVICE_URL,
            path: `/v1/media/duplicates/check?productId=${encodeURIComponent(productId)}`,
          },
          requireAuth: true,
          retry: { maxRetries: 2 },
          timeout: { read: 30000 },
        });
      }

      if (action === 'report') {
        return await proxyToBackend(request, {}, {
          service: {
            name: 'media',
            baseUrl: MEDIA_SERVICE_URL,
            path: '/v1/media/duplicates/report',
          },
          requireAuth: true,
          retry: { maxRetries: 2 },
          timeout: { read: 60000 },
        });
      }

      return NextResponse.json(
        { success: false, error: `Unknown action: ${action}` },
        { status: 400 },
      );
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' },
);

/**
 * POST /api/media/duplicates - Mutation endpoints for duplicate management
 *
 * Body: { action: 'scan' | 'dismiss' | 'mark' | 'merge', ...params }
 */
export const POST = createRouteHandler(
  async (request: NextRequest) => {
    try {
      const body = await request.json();
      const { action, ...params } = body;

      if (!action) {
        return NextResponse.json(
          { success: false, error: 'action is required in request body' },
          { status: 400 },
        );
      }

      const actionPaths: Record<string, string> = {
        scan: '/v1/media/duplicates/scan',
        dismiss: '/v1/media/duplicates/dismiss',
        mark: '/v1/media/duplicates/mark',
        merge: '/v1/media/duplicates/merge',
      };

      const path = actionPaths[action];
      if (!path) {
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 },
        );
      }

      // Forward the request to the media service
      const backendUrl = `${MEDIA_SERVICE_URL}${path}`;
      const backendResponse = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': crypto.randomUUID(),
        },
        body: JSON.stringify(params),
      });

      const responseData = await backendResponse.text();

      return new NextResponse(responseData, {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
        headers: {
          'Content-Type':
            backendResponse.headers.get('Content-Type') || 'application/json',
        },
      });
    } catch (error) {
      console.error('[API] Duplicate detection error:', error);
      return apiError(error);
    }
  },
  { method: 'POST' },
);
