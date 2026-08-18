import { NextRequest } from "next/server";
import {
  createRouteHandler,
  proxyToBackend,
  apiError,
  type RouteContext,
} from "@patina/api-routes";

const PROJECTS_URL =
  process.env.PROJECTS_SERVICE_URL || "http://localhost:3016";

// POST /api/projects/:projectId/timeline/analytics/view - Record timeline view
export const POST = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      const projectId = context.custom?.params?.projectId as string;
      return await proxyToBackend(request, context, {
        service: {
          name: "projects",
          baseUrl: PROJECTS_URL,
          path: `/v1/projects/${encodeURIComponent(projectId)}/timeline/analytics/view`,
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
