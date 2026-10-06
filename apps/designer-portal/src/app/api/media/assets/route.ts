import type { NextRequest } from 'next/server';
import {
  ApiErrorCode,
  apiError,
  apiSuccess,
  createApiError,
  createRouteHandler,
  proxyToBackend,
  type RouteContext,
} from '@patina/api-routes';

const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://localhost:3014';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
// The media service's own image ceiling (MediaService.MAX_IMAGE_SIZE).
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

function failure(message: string, status: 400 | 502): Response {
  const code = status === 400 ? ApiErrorCode.BAD_REQUEST : ApiErrorCode.SERVICE_UNAVAILABLE;
  return apiError(createApiError(code, message), status);
}

/** Call the media service through the proxy with a JSON body built here. */
async function mediaCall(
  request: NextRequest,
  context: RouteContext,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: any; response: Response }> {
  const headers = new Headers({ 'content-type': 'application/json' });
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);
  const response = await proxyToBackend(
    new Request(request.url, { method: 'POST', headers, body: JSON.stringify(body) }),
    context,
    {
      service: { name: 'media', baseUrl: MEDIA_SERVICE_URL, path },
      requireAuth: true,
      retry: { maxRetries: 0, shouldRetryMutation: false },
    },
  );
  const payload = await response.clone().json().catch(() => null);
  return { ok: response.ok, status: response.status, data: payload?.data, response };
}

/**
 * POST /api/media/assets — upload one image to the media service from the
 * browser (C-19 desktop receiving photos). multipart/form-data: `file`, and an
 * optional `projectId` so the studio's co-members can read the photo back.
 *
 * The R2 bucket carries no browser CORS grant (edge-api-worker OPERATIONS.md),
 * so the bytes are relayed server-side: intent → signed PUT → confirm.
 * Responds `{ success, data: { assetId } }`.
 */
export const POST = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return failure('Send the photo as multipart form data.', 400);
    }
    const file = form.get('file');
    if (!(file instanceof Blob) || file.size === 0) {
      return failure('Choose a photo to upload.', 400);
    }
    if (!IMAGE_TYPES.has(file.type)) {
      return failure('Photos must be JPEG, PNG, WebP or HEIC.', 400);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return failure('Photos must be 50 MB or smaller.', 400);
    }
    const projectId = form.get('projectId');
    if (projectId !== null && (typeof projectId !== 'string' || !UUID_PATTERN.test(projectId))) {
      return failure('projectId must be a UUID.', 400);
    }
    const filename =
      typeof (file as File).name === 'string' && (file as File).name
        ? (file as File).name
        : 'receiving-photo';

    const intent = await mediaCall(request, context, '/v1/media/upload', {
      kind: 'IMAGE',
      filename,
      fileSize: file.size,
      mimeType: file.type,
      ...(projectId ? { projectId } : {}),
    });
    if (!intent.ok) return intent.response;
    const { assetId, uploadSessionId, parUrl, headers } = intent.data ?? {};
    if (typeof assetId !== 'string' || typeof uploadSessionId !== 'string' || typeof parUrl !== 'string') {
      return failure('The media service returned no upload target.', 502);
    }

    // The signed PUT goes to object storage, not to a Patina service.
    const put = await fetch(parUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type, ...(headers ?? {}) },
      body: await file.arrayBuffer(),
    });
    if (!put.ok) {
      return failure('The photo could not be stored. Try again.', 502);
    }

    const confirm = await mediaCall(
      request,
      context,
      `/v1/media/upload/${encodeURIComponent(uploadSessionId)}/confirm`,
      {},
    );
    if (!confirm.ok) return confirm.response;

    return apiSuccess({ assetId });
  },
  { method: 'POST' },
);
