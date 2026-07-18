import { middleware } from "../middleware";
import { createMiddlewareClient } from "@patina/supabase/client";
import { NextResponse } from "next/server";

jest.mock("@patina/supabase/client", () => ({
  createMiddlewareClient: jest.fn(),
  createAdminClient: jest.fn(),
}));
jest.mock("@/lib/env", () => ({ env: { isProduction: false } }));
jest.mock("next/server", () => ({
  NextResponse: {
    next: jest.fn(() => ({
      headers: new Map(),
      cookies: { getAll: () => [] },
    })),
    redirect: jest.fn(),
  },
}));

describe("client middleware Universal Link exemption", () => {
  beforeEach(() => {
    (NextResponse.next as jest.Mock).mockReturnValue({
      headers: new Map(),
      cookies: { getAll: () => [] },
    });
  });

  it("passes the AASA document through before any auth lookup or redirect", async () => {
    const response = await middleware({
      headers: new Headers(),
      nextUrl: {
        pathname: "/.well-known/apple-app-site-association",
        searchParams: new URLSearchParams(),
      },
    } as never);
    expect(response).toBeDefined();
    expect(createMiddlewareClient).not.toHaveBeenCalled();
  });
});
