import { proxyToBackend } from "@patina/api-routes";
import { GET as getImmersive } from "../immersive/route";
import { GET as getCelebrations } from "../celebrations/route";
import {
  GET as getCelebration,
  POST as markCelebrationViewed,
} from "../celebrations/[milestoneId]/route";
import { GET as getSegmentMedia } from "../segment/[segmentId]/media/route";
import { POST as markSegmentMediaOpened } from "../segment/[segmentId]/media/opened/route";
import { GET as getAnalyticsSummary } from "../analytics/summary/route";
import { GET as getAnalyticsHealth } from "../analytics/health/route";
import { POST as recordAnalyticsView } from "../analytics/view/route";

jest.mock("@patina/api-routes", () => ({
  createRouteHandler: (handler: unknown) => handler,
  proxyToBackend: jest.fn(),
  apiError: jest.fn((error: unknown) => {
    throw error;
  }),
}));

const proxy = proxyToBackend as jest.MockedFunction<typeof proxyToBackend>;

function context(params: Record<string, string>) {
  return {
    requestId: "request-1",
    ip: "127.0.0.1",
    validatedData: {},
    startTime: Date.now(),
    custom: { params },
  } as any;
}

describe("retained projects timeline proxies", () => {
  beforeEach(() => {
    proxy.mockResolvedValue({ status: 200 } as Response);
  });

  it.each([
    [
      "immersive",
      getImmersive,
      "/v1/projects/project%2Fone/timeline/immersive",
    ],
    [
      "celebrations",
      getCelebrations,
      "/v1/projects/project%2Fone/timeline/celebrations",
    ],
    [
      "analytics summary",
      getAnalyticsSummary,
      "/v1/projects/project%2Fone/timeline/analytics/summary",
    ],
    [
      "analytics health",
      getAnalyticsHealth,
      "/v1/projects/project%2Fone/timeline/analytics/health",
    ],
    [
      "analytics view",
      recordAnalyticsView,
      "/v1/projects/project%2Fone/timeline/analytics/view",
    ],
  ])(
    "uses trusted route context for %s",
    async (_name, handler, expectedPath) => {
      const request = {
        url: "https://portal.test/api/timeline?limit=7",
      } as Request;

      await (handler as any)(request, context({ projectId: "project/one" }));

      expect(proxy).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          custom: { params: { projectId: "project/one" } },
        }),
        expect.objectContaining({
          requireAuth: true,
          service: expect.objectContaining({ path: expectedPath }),
        }),
      );
    },
  );

  it.each([
    [
      "celebration read",
      getCelebration,
      "/v1/projects/project%2Fone/timeline/celebrations/milestone%2Fone",
    ],
    [
      "celebration viewed",
      markCelebrationViewed,
      "/v1/projects/project%2Fone/timeline/celebrations/milestone%2Fone/viewed",
    ],
    [
      "segment media",
      getSegmentMedia,
      "/v1/projects/project%2Fone/timeline/segment/segment%2Fone/media",
    ],
    [
      "segment media opened",
      markSegmentMediaOpened,
      "/v1/projects/project%2Fone/timeline/segment/segment%2Fone/media/opened",
    ],
  ])(
    "encodes nested identifiers for %s",
    async (_name, handler, expectedPath) => {
      const request = { url: "https://portal.test/api/timeline" } as Request;
      const routeContext = context({
        projectId: "project/one",
        milestoneId: "milestone/one",
        segmentId: "segment/one",
      });

      await (handler as any)(request, routeContext);

      expect(proxy).toHaveBeenCalledWith(
        request,
        routeContext,
        expect.objectContaining({
          requireAuth: true,
          service: expect.objectContaining({ path: expectedPath }),
        }),
      );
    },
  );
});
