import { NextRequest } from "next/server";
import {
  createRouteHandler,
  proxyToBackend,
  apiError,
  type RouteContext,
} from "@patina/api-routes";

const PROJECTS_URL =
  process.env.PROJECTS_SERVICE_URL || "http://localhost:3016";

// GET /api/projects/:projectId/timeline/segment/:segmentId/media - Get segment media gallery
export const GET = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      const projectId = context.custom?.params?.projectId as string;
      const segmentId = context.custom?.params?.segmentId as string;
      return await proxyToBackend(request, context, {
        service: {
          name: "projects",
          baseUrl: PROJECTS_URL,
          path: `/v1/projects/${encodeURIComponent(projectId)}/timeline/segment/${encodeURIComponent(segmentId)}/media`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: "GET" },
);
