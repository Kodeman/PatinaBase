import {
  imperialToMillimetres,
  isLikelySiteRequestToken,
  measureDefinitions,
  metricToMillimetres,
  photoShotDefinitions,
  type SiteRequestItem,
} from "../site-request-types";

const item = (
  configuration: Record<string, unknown>,
  guidance: string | null = null,
): SiteRequestItem => ({
  id: "item",
  current_version_id: "version",
  sort_order: 0,
  status: "pending",
  redo_note: null,
  deliveries: [],
  version: {
    id: "version",
    version_number: 1,
    kit_code: "K-01",
    title: "Measure",
    guidance,
    configuration,
    room_id: null,
    room_name: null,
  },
});

describe("site request capture types", () => {
  it("converts imperial sixteenths and metric values to canonical integer millimetres", () => {
    expect(imperialToMillimetres(8, 0, 4)).toBe(2445);
    expect(metricToMillimetres(244.5, "cm")).toBe(2445);
    expect(Number.isInteger(imperialToMillimetres(3, 7, 15))).toBe(true);
    expect(() => imperialToMillimetres(0, 12, 0)).toThrow(
      "invalid_imperial_measurement",
    );
  });

  it("accepts opaque base64url/hex links but rejects malformed paths", () => {
    expect(isLikelySiteRequestToken("a".repeat(64))).toBe(true);
    expect(
      isLikelySiteRequestToken("opaque_site_request_token_1234567890abcd"),
    ).toBe(true);
    expect(isLikelySiteRequestToken("../request/token")).toBe(false);
  });

  it("normalizes dimension and photo-kit configuration without trusting its shape", () => {
    expect(
      measureDefinitions(item({ dimensions: [{ id: "a", label: "A · run" }] })),
    ).toEqual([{ id: "a", label: "A · run", guidance: undefined }]);
    expect(
      photoShotDefinitions(
        item({
          shots: [
            {
              id: "wide",
              label: "Wide",
              reference_url: "https://example.test/ref.jpg",
            },
          ],
        }),
      ),
    ).toEqual([
      {
        id: "wide",
        label: "Wide",
        guidance: undefined,
        referenceUrl: "https://example.test/ref.jpg",
      },
    ]);
  });
});
