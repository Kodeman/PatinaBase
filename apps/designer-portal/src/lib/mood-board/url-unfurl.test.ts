import {
  MoodBoardUrlUnfurlError,
  buildMoodBoardUrlFallbackNote,
  buildMoodBoardUrlPlaceholder,
  buildResolvedMoodBoardUrlItem,
  moodBoardSourceHost,
  normalizeMoodBoardSourceUrl,
  parseMoodBoardUrlUnfurlResult,
  translateMoodBoardUrlUnfurlError,
} from "./url-unfurl";

describe("mood-board URL unfurl helpers", () => {
  it("validates source URLs without rewriting their provenance value", () => {
    expect(
      normalizeMoodBoardSourceUrl("  https://www.example.com/product?q=oak  "),
    ).toBe("https://www.example.com/product?q=oak");
    expect(moodBoardSourceHost("https://www.example.com/product")).toBe(
      "example.com",
    );
    expect(() =>
      normalizeMoodBoardSourceUrl("file:///private/catalog.html"),
    ).toThrow(MoodBoardUrlUnfurlError);
  });

  it("resolves a placeholder in place with provenance and product metadata", () => {
    const placeholder = buildMoodBoardUrlPlaceholder({
      id: "item-1",
      url: "https://shop.example.com/chair",
      x: 120,
      y: 240,
      width: 310,
      height: 360,
      zIndex: 7,
      rotation: 4,
      sectionId: "section-1",
    });
    const result = parseMoodBoardUrlUnfurlResult(
      {
        name: "Oak Chair",
        brand: "Example Studio",
        description: "White oak frame",
        priceRetailCents: 129900,
        images: ["https://cdn.example.com/chair.webp"],
        sourceUrl: "https://shop.example.com/chair?variant=oak",
      },
      "https://shop.example.com/chair",
    );

    const resolved = buildResolvedMoodBoardUrlItem({
      placeholder,
      result,
    });

    expect(resolved).toMatchObject({
      id: "item-1",
      type: "capture",
      x: 120,
      y: 240,
      width: 310,
      height: 360,
      zIndex: 7,
      rotation: 4,
      imageUrl: "https://cdn.example.com/chair.webp",
      data: {
        section_id: "section-1",
        name: "Oak Chair",
        vendor_name: "Example Studio",
        price_cents: 129900,
        image_url: "https://cdn.example.com/chair.webp",
        source_url: "https://shop.example.com/chair?variant=oak",
        unfurl_status: "resolved",
      },
    });
  });

  it("turns a failed placeholder into the same editable note deterministically", () => {
    const placeholder = buildMoodBoardUrlPlaceholder({
      id: "item-failed",
      url: "https://blocked.example/product",
      x: 10,
      y: 20,
      zIndex: 3,
    });
    const input = {
      placeholder,
      url: "https://blocked.example/product",
    };

    const first = buildMoodBoardUrlFallbackNote(input);
    const second = buildMoodBoardUrlFallbackNote(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      id: "item-failed",
      type: "note",
      x: 10,
      y: 20,
      width: 280,
      height: 320,
      zIndex: 3,
      content: "https://blocked.example/product",
      data: {
        source_url: "https://blocked.example/product",
        unfurl_status: "failed",
      },
    });
  });

  it("treats a nominal 200 without product metadata as a readable failure", () => {
    expect(() =>
      parseMoodBoardUrlUnfurlResult(
        { sourceUrl: "https://example.com/empty" },
        "https://example.com/empty",
      ),
    ).toThrow(
      expect.objectContaining({
        code: "unreadable",
        edgeCode: "no_product_metadata",
      }),
    );
  });

  it("preserves structured 429 retry and reset metadata", async () => {
    const resetAt = "2026-08-03T21:15:00.000Z";
    const translated = await translateMoodBoardUrlUnfurlError({
      message: "Edge Function returned a non-2xx status code",
      context: {
        status: 429,
        headers: {
          get: (name: string) => (name === "Retry-After" ? "90" : null),
        },
        json: async () => ({
          error: "url_unfurl_rate_limited",
          code: "url_unfurl_rate_limited",
          rate_limit: {
            reason: "ten_minute_limit",
            limit: 10,
            remaining: 0,
            retry_after_seconds: 75,
            reset_at: resetAt,
          },
        }),
      },
    });

    expect(translated).toMatchObject({
      code: "rate_limited",
      edgeCode: "url_unfurl_rate_limited",
      status: 429,
      retryAfterSeconds: 75,
      resetAt,
      message: `URL import limit reached. Try again after ${resetAt}.`,
    });
  });

  it("turns scraper transport failures into a clear site-blocked message", async () => {
    const translated = await translateMoodBoardUrlUnfurlError({
      context: {
        status: 502,
        json: async () => ({ error: "fetch_failed" }),
      },
    });

    expect(translated).toMatchObject({
      code: "site_unavailable",
      edgeCode: "fetch_failed",
      status: 502,
    });
    expect(translated.message).toContain("blocked");
  });
});
