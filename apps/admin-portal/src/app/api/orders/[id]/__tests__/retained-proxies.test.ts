/** @jest-environment node */

import { proxyToBackend } from "@patina/api-routes";
import { GET as getOrder, PATCH as patchOrder } from "../route";
import { POST as cancelOrder } from "../cancel/route";
import { POST as refundOrder } from "../refunds/route";
import {
  POST as createShipment,
  PATCH as patchShipment,
} from "../shipments/route";

jest.mock("@patina/api-routes", () => ({
  createRouteHandler: (handler: unknown) => handler,
  proxyToBackend: jest.fn(),
  apiError: jest.fn((error: unknown) => {
    throw error;
  }),
}));

const proxy = proxyToBackend as jest.MockedFunction<typeof proxyToBackend>;

function context(id: string) {
  return {
    requestId: "request-1",
    ip: "127.0.0.1",
    validatedData: {},
    startTime: Date.now(),
    custom: { params: { id } },
  } as any;
}

describe("retained orders proxies", () => {
  beforeEach(() => {
    proxy.mockResolvedValue({ status: 200 } as Response);
  });

  it.each([
    ["get", getOrder, "/v1/orders/order%2Fone"],
    ["patch", patchOrder, "/v1/orders/order%2Fone"],
    ["cancel", cancelOrder, "/v1/orders/order%2Fone/cancel"],
    ["refund", refundOrder, "/v1/orders/order%2Fone/refunds"],
    ["create shipment", createShipment, "/v1/orders/order%2Fone/shipments"],
    ["patch shipment", patchShipment, "/v1/orders/order%2Fone/shipments"],
  ])(
    "uses trusted route context and authentication for %s",
    async (_name, handler, expectedPath) => {
      const request = {
        url: "https://portal.test/api/orders/order%2Fone",
      } as Request;
      const routeContext = context("order/one");

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
