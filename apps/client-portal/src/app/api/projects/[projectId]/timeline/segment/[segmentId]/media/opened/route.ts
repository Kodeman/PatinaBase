import { NextRequest } from "next/server";
import {
  createRouteHandler,
  proxyToBackend,
  apiError,
  type RouteContext,
} from "@patina/api-routes";

const PROJECTS_URL =
  process.env.PROJECTS_SERVICE_URL || "http://localhost:3016";

// POST /api/projects/:projectId/timeline/segment/:segmentId/media/opened - Record media gallery open
export const POST = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      const projectId = context.custom?.params?.projectId as string;
      const segmentId = context.custom?.params?.segmentId as string;
      return await proxyToBackend(request, context, {
        service: {
          name: "projects",
          baseUrl: PROJECTS_URL,
          path: `/v1/projects/${encodeURIComponent(projectId)}/timeline/segment/${encodeURIComponent(segmentId)}/media/opened`,
        },
        requireAuth: true,
        retry: { maxRetries: 1 }, // Single attempt for analytics events
        timeout: { write: 5000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: "POST" },
);
