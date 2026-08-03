import { proxyToBackend, type RouteContext } from '@patina/api-routes';
import {
  normalizeBackgroundRemovalError,
  sanitizeBackgroundRemovalCapability,
  sanitizeBackgroundRemovalResult,
} from '@/lib/mood-board-assets/background-removal-contract';

const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://localhost:3014';

// The media service permits three redirects (four total hops), each with
// separate 10s DNS and transfer deadlines, then allows 30s at the vendor and
// 15s on each of two storage operations. Keep the portal's single,
// non-retried write alive beyond that 140s default budget so it cannot
// manufacture an ambiguous timeout while paid work completes.
const BACKGROUND_REMOVAL_WRITE_TIMEOUT_MS = 180_000;

type BackgroundRemovalOperation = 'capability' | 'mutation';

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

async function parsedJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function successData(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || !('success' in payload)) return null;
  const wrapped = payload as { success?: unknown; data?: unknown };
  return wrapped.success === true ? wrapped.data : null;
}

async function sanitizeProxyResponse(
  response: Response,
  operation: BackgroundRemovalOperation,
): Promise<Response> {
  const payload = await parsedJson(response);
  if (!response.ok) {
    return jsonResponse(
      { success: false, error: normalizeBackgroundRemovalError(payload, response.status) },
      response.status,
    );
  }

  const data = successData(payload);
  const sanitized =
    operation === 'capability'
      ? sanitizeBackgroundRemovalCapability(data)
      : sanitizeBackgroundRemovalResult(data);
  if (!sanitized) {
    return jsonResponse(
      {
        success: false,
        error: {
          code: 'background_removal_failed',
          message: 'Background removal returned an invalid response.',
        },
      },
      502,
    );
  }
  return jsonResponse({ success: true, data: sanitized }, response.status);
}

async function hasRequestBody(request: Request): Promise<boolean> {
  if (!request.body) return false;
  return (await request.clone().arrayBuffer()).byteLength > 0;
}

export async function proxyBackgroundRemoval(
  request: Request,
  context: RouteContext,
  options: {
    operation: BackgroundRemovalOperation;
    servicePath: string;
  },
): Promise<Response> {
  if (options.operation === 'mutation' && (await hasRequestBody(request))) {
    return jsonResponse(
      {
        success: false,
        error: {
          code: 'background_removal_invalid_request',
          message: 'The request body must be empty.',
        },
      },
      400,
    );
  }

  const search = new URL(request.url).search;
  const response = await proxyToBackend(request, context, {
    service: {
      name: 'media',
      baseUrl: MEDIA_SERVICE_URL,
      path: `${options.servicePath}${search}`,
    },
    requireAuth: true,
    ...(options.operation === 'mutation'
      ? {
          forwardHeaders: ['idempotency-key'],
          retry: { maxRetries: 0, shouldRetryMutation: false },
          timeout: { write: BACKGROUND_REMOVAL_WRITE_TIMEOUT_MS },
        }
      : {
          retry: { maxRetries: 2 },
          timeout: { read: 10_000 },
        }),
  });

  return sanitizeProxyResponse(response, options.operation);
}
