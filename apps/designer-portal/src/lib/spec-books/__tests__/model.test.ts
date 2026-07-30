import type { SpecBookWorkItem } from "@patina/supabase";
import {
  audienceAllows,
  hasIssuedDrift,
  resolveSpecValue,
  runSpecBookPreflight,
} from "../model";

function item(overrides: Partial<SpecBookWorkItem> = {}): SpecBookWorkItem {
  return {
    id: "item-1",
    project_id: "project-1",
    project_room_id: "room-1",
    slot_id: null,
    product_id: "product-1",
    name: "Lounge chair",
    document_code: "LR-01",
    item_type: "fixed",
    quantity: 1,
    image_url: "https://images.example/chair.jpg",
    vendor_name: "Maker",
    sku: null,
    finish: null,
    material: null,
    color_fabric: null,
    selected_dimensions: null,
    dimensions: null,
    exact_location: null,
    lead_time: null,
    unit_price_cents: 100_00,
    trade_price_cents: 70_00,
    markup_percent: 30,
    updated_at: "2026-07-01T00:00:00Z",
    custom_fields: { finish: "Studio finish" },
    room: { id: "room-1", name: "Living room" },
    product: {
      finish: "Master finish",
      materials: ["Walnut"],
      updated_at: "2026-06-01T00:00:00Z",
      images: ["https://images.example/chair.jpg"],
    },
    setting: {
      id: "setting-1",
      spec_book_id: "book-1",
      ffe_item_id: "item-1",
      chapter_id: "chapter-1",
      position: 0,
      included: true,
      page_template: "item_sheet",
      review_state: "draft",
      publication_overrides: {},
    },
    spec: {
      id: "spec-1",
      ffe_item_id: "item-1",
      sku: "PROJECT-SKU",
      finish: "Project finish",
      material: null,
      color_fabric: null,
      selected_dimensions: null,
      exact_location: "North wall",
      client_notes: "Approved",
      trade_notes: null,
      install_notes: "Center beneath artwork",
      care_notes: null,
      warranty_notes: null,
      selected_media: [],
      source_verifications: {
        sku: "2026-07-20T00:00:00Z",
        finish: "2026-07-20T00:00:00Z",
      },
      na_declarations: {},
      field_provenance: {},
      readiness_status: "ready",
      row_version: 1,
      updated_at: "2026-07-20T00:00:00Z",
    },
    ...overrides,
  } as SpecBookWorkItem;
}

describe("spec-book model", () => {
  it("resolves project override before line, product, and studio values", () => {
    expect(resolveSpecValue(item(), "finish")).toMatchObject({
      value: "Project finish",
      source: "project_override",
    });
  });

  it("uses product master before studio custom when no project or line value exists", () => {
    const value = item();
    value.spec = { ...value.spec!, finish: null };
    expect(resolveSpecValue(value, "finish")).toMatchObject({
      value: "Master finish",
      source: "product_master",
    });
  });

  it("honors an N/A declaration with its required reason", () => {
    const value = item();
    value.spec = {
      ...value.spec!,
      finish: null,
      na_declarations: { finish: { reason: "Natural unfinished surface" } },
    };
    expect(resolveSpecValue(value, "finish")).toMatchObject({
      source: "declaration",
      na: true,
      naReason: "Natural unfinished surface",
    });
  });

  it("blocks duplicate codes and missing fixed-item facts", () => {
    const second = item({
      id: "item-2",
      document_code: "LR-01",
      project_room_id: null,
      room: null,
      image_url: null,
      product: null,
      custom_fields: {},
      quantity: 0,
      spec: {
        ...item().spec!,
        id: "spec-2",
        ffe_item_id: "item-2",
        sku: null,
        finish: null,
        exact_location: null,
        install_notes: null,
      },
    });
    const result = runSpecBookPreflight(
      [item(), second],
      ["vendor", "installer"],
      new Date("2026-07-30T00:00:00Z"),
    );
    expect(result.ready).toBe(false);
    expect(result.blockers.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "duplicate_document_code",
        "missing_fixed_room",
        "missing_fixed_quantity",
        "missing_fixed_image",
        "missing_fixed_selection",
        "missing_install_location",
        "missing_install_note",
      ]),
    );
  });

  it("detects live selection drift after the last issued revision", () => {
    expect(hasIssuedDrift(item(), "2026-07-10T00:00:00Z")).toBe(true);
    expect(hasIssuedDrift(item(), "2026-07-25T00:00:00Z")).toBe(false);
  });

  it("fails closed for audience-private and unknown preview fields", () => {
    for (const audience of ["client", "vendor", "installer", "care"] as const) {
      expect(audienceAllows(audience, "trade_price")).toBe(false);
      expect(audienceAllows(audience, "markup")).toBe(false);
      expect(audienceAllows(audience, "private_notes")).toBe(false);
      expect(audienceAllows(audience, "vendor_contact")).toBe(false);
    }
    expect(audienceAllows("internal", "trade_price")).toBe(true);
  });
});
