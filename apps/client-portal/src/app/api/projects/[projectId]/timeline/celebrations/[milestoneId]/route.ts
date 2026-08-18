import { NextRequest } from "next/server";
import {
  createRouteHandler,
  proxyToBackend,
  apiError,
  type RouteContext,
} from "@patina/api-routes";

const PROJECTS_URL =
  process.env.PROJECTS_SERVICE_URL || "http://localhost:3016";

// GET /api/projects/:projectId/timeline/celebrations/:milestoneId - Get specific celebration
export const GET = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      const projectId = context.custom?.params?.projectId as string;
      const milestoneId = context.custom?.params?.milestoneId as string;
      return await proxyToBackend(request, context, {
        service: {
          name: "projects",
          baseUrl: PROJECTS_URL,
          path: `/v1/projects/${encodeURIComponent(projectId)}/timeline/celebrations/${encodeURIComponent(milestoneId)}`,
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

// POST /api/projects/:projectId/timeline/celebrations/:milestoneId/viewed - Record view
export const POST = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      const projectId = context.custom?.params?.projectId as string;
      const milestoneId = context.custom?.params?.milestoneId as string;
      return await proxyToBackend(request, context, {
        service: {
          name: "projects",
          baseUrl: PROJECTS_URL,
          path: `/v1/projects/${encodeURIComponent(projectId)}/timeline/celebrations/${encodeURIComponent(milestoneId)}/viewed`,
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 5000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: "POST" },
);
