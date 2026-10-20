/**
 * US-41 C: the Spec pane's Lead time row. Choosing a bucket saves the
 * designer's override (`leadTimeWeeks`); USE SUGGESTED clears it back to what
 * the line already knows; the suggestion prints with its source word; nothing
 * known says what the client will see; a released or ordered line takes no act.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";

const mockBuildFields = jest.fn();
const mutation = (fn: jest.Mock) => ({ mutateAsync: fn, isPending: false });

jest.mock("@patina/supabase", () => {
  const { useRef, useState } = jest.requireActual("react");
  return {
    useUpdateProjectFfeSpec: () => mutation(jest.fn()),
    useSetFfeLineCommercials: () => mutation(jest.fn()),
    // Like useMutation's observer: isPending follows the LATEST call only, so
    // a second call that settles first reads not-pending while the first is
    // still out.
    useSetFfeLineBuildFields: () => {
      const [isPending, setPending] = useState(false);
      const latest = useRef(0);
      return {
        isPending,
        mutateAsync: (input: unknown) => {
          const call = ++latest.current;
          setPending(true);
          return Promise.resolve(mockBuildFields(input)).finally(() => {
            if (call === latest.current) setPending(false);
          });
        },
      };
    },
    usePlaceProductInProjectV2: () => mutation(jest.fn()),
  };
});
jest.mock("../../line-unfold/the-buy-cell", () => ({
  MakerSearch: () => null,
  MakerMatchLine: () => null,
  useAddMaker: () => ({
    add: jest.fn(),
    match: null,
    clearMatch: jest.fn(),
    isPending: false,
  }),
}));
jest.mock("../item-label", () => ({
  ItemLabelField: () => null,
  ItemLabelPrefix: () => null,
}));
jest.mock("../library-inline-search", () => ({
  LibraryInlineSearch: () => null,
}));
jest.mock("../placement-chips", () => ({
  ...jest.requireActual("../placement-chips"),
  PlacementChips: () => null,
}));
jest.mock("../labor-act", () => ({ LaborAct: () => null }));
jest.mock("../com-toggle", () => ({ ComToggle: () => null }));
jest.mock("@/components/portal/proposals/product-picker-modal", () => ({
  ProductPickerModal: () => null,
}));

import {
  LEAD_TIME_UNSET_SENTENCE,
  SpecFieldsPane,
  type SpecLensLine,
} from "../spec-fields-pane";

const base = {
  id: "l1",
  name: "Sofa",
  quantity: 1,
  unit: "each",
  product_id: null,
  vendor_id: null,
  vendor_name: null,
  item_type: "fixed",
  unit_price_cents: 0,
  budget_max_cents: null,
  ffe_line_authorization: null,
  line_kind: "goods",
  parent_ffe_item_id: null,
  link_kind: null,
  project_room_id: "living",
  assignment_scope: "room",
  design_disposition: "candidate",
  role_identity: "default",
  purchase_order_id: null,
  trade_scope_document_id: null,
  rough_cents: null,
  status: "specified",
  product: null,
  lead_time_weeks: null,
  suggested_lead_time_weeks: null,
  suggested_lead_time_source: null,
};

const onAnnounce = jest.fn();

const renderPane = (fields: Record<string, unknown> = {}) =>
  render(
    <SpecFieldsPane
      projectId="p1"
      canSeeMoney
      line={{ ...base, ...fields } as unknown as SpecLensLine}
      spec={null}
      needLabel="Sofa"
      piece={null}
      laborLines={[]}
      placements={[]}
      rooms={[]}
      onSpecSaved={jest.fn()}
      onAnnounce={onAnnounce}
    />,
  );

const deferred = () => {
  let resolve: (value: unknown) => void = () => {};
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const leadTimeCalls = () =>
  mockBuildFields.mock.calls.filter(([input]) => "leadTimeWeeks" in input);

const leadTime = () => screen.getByRole("group", { name: "Lead time" });
const picker = () =>
  within(leadTime()).getByRole("combobox", { name: "Lead time" });
const note = () => within(leadTime()).getByTestId("spec-lead-time-note");
const useSuggested = () =>
  within(leadTime()).queryByRole("button", { name: "USE SUGGESTED" });

beforeEach(() => {
  jest.clearAllMocks();
  mockBuildFields.mockResolvedValue({});
});

describe("the Lead time row", () => {
  it("shows the suggestion when no override is set, and choosing a bucket saves it", async () => {
    renderPane({
      suggested_lead_time_weeks: 12,
      suggested_lead_time_source: "quote",
    });
    expect(picker()).toHaveValue("");
    expect(note()).toHaveTextContent("Suggested · 9–12 wks · from quote");
    expect(useSuggested()).toBeNull();

    await act(async () => {
      fireEvent.change(picker(), { target: { value: "16" } });
    });

    expect(mockBuildFields).toHaveBeenCalledTimes(1);
    expect(mockBuildFields).toHaveBeenCalledWith({
      projectId: "p1",
      itemId: "l1",
      leadTimeWeeks: 16,
    });
  });

  it.each([
    ["quote", 12, "Suggested · 9–12 wks · from quote"],
    ["configuration", 8, "Suggested · 7–8 wks · from option"],
    ["catalog", 0, "Suggested · In stock · from catalog"],
    ["proposal", 5, "Suggested · 5 wks · from proposal"],
  ])("prints a %s suggestion with its source word", (source, weeks, text) => {
    renderPane({
      suggested_lead_time_weeks: weeks,
      suggested_lead_time_source: source,
    });
    expect(note()).toHaveTextContent(text);
  });

  it("USE SUGGESTED clears the override to null and returns focus to the picker", async () => {
    renderPane({
      lead_time_weeks: 8,
      suggested_lead_time_weeks: 12,
      suggested_lead_time_source: "catalog",
    });
    expect(picker()).toHaveValue("8");
    expect(note()).toHaveTextContent("Suggested · 9–12 wks · from catalog");

    await act(async () => {
      fireEvent.click(useSuggested()!);
    });

    expect(mockBuildFields).toHaveBeenCalledWith({
      projectId: "p1",
      itemId: "l1",
      leadTimeWeeks: null,
    });
    expect(picker()).toHaveFocus();
  });

  it("offers USE SUGGESTED only when an override and a suggestion both exist", () => {
    renderPane({ lead_time_weeks: 8 });
    expect(picker()).toHaveValue("8");
    expect(useSuggested()).toBeNull();
    expect(within(leadTime()).queryByTestId("spec-lead-time-note")).toBeNull();
  });

  it("says what the client will see when nothing is known", () => {
    renderPane();
    expect(picker()).toHaveValue("");
    expect(note()).toHaveTextContent(LEAD_TIME_UNSET_SENTENCE);
    expect(LEAD_TIME_UNSET_SENTENCE).toBe(
      "Not set — the client will see ‘Lead time to be confirmed’",
    );
  });

  it("prints a refused save in the pane's alert", async () => {
    mockBuildFields.mockRejectedValue(new Error("Lead time must be 0 to 104 weeks."));
    renderPane();

    await act(async () => {
      fireEvent.change(picker(), { target: { value: "4" } });
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Lead time must be 0 to 104 weeks.",
    );
  });

  it.each([
    [
      "a permission refusal",
      { code: "42501", message: "permission denied for function set_project_ffe_line_build_fields" },
      "This studio's book is not yours to write. Ask an owner or admin.",
    ],
    [
      "a schema diagnostic",
      {
        code: "23503",
        message:
          'insert or update on table "project_ffe_items" violates foreign key constraint "project_ffe_items_vendor_id_fkey"',
      },
      "The lead time was not saved.",
    ],
  ])("never prints %s from a plain PostgREST error", async (_kind, err, shown) => {
    mockBuildFields.mockRejectedValue({ details: null, hint: null, ...err });
    renderPane();

    await act(async () => {
      fireEvent.change(picker(), { target: { value: "4" } });
    });

    expect(screen.getByRole("alert")).toHaveTextContent(shown);
    expect(screen.getByRole("alert")).not.toHaveTextContent(err.message);
  });

  it("prints the RPC's own words from a plain PostgREST error", async () => {
    mockBuildFields.mockRejectedValue({
      code: "23514",
      message: "leadTimeWeeks must be a whole number of weeks, 0 to 104",
      details: null,
      hint: null,
    });
    renderPane();

    await act(async () => {
      fireEvent.change(picker(), { target: { value: "4" } });
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "leadTimeWeeks must be a whole number of weeks, 0 to 104",
    );
  });

  it("holds the picker and USE SUGGESTED while a save is pending, so a second choice cannot race it", async () => {
    let finish: (value: unknown) => void = () => {};
    mockBuildFields.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderPane({
      lead_time_weeks: 8,
      suggested_lead_time_weeks: 12,
      suggested_lead_time_source: "quote",
    });
    picker().focus();

    await act(async () => {
      fireEvent.change(picker(), { target: { value: "16" } });
    });

    expect(mockBuildFields).toHaveBeenCalledTimes(1);
    expect(picker()).toBeDisabled();
    const act_ = useSuggested()!;
    expect(act_).toHaveAttribute("aria-disabled", "true");
    expect(act_).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      fireEvent.change(picker(), { target: { value: "4" } });
      fireEvent.click(act_);
    });
    expect(mockBuildFields).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish({});
    });

    expect(picker()).toBeEnabled();
    expect(picker()).toHaveFocus();
    expect(useSuggested()).not.toHaveAttribute("aria-disabled");
  });

  it("keeps the picker held when a Unit change settles first, until its own save does", async () => {
    const a = deferred();
    const b = deferred();
    mockBuildFields
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise);
    renderPane();

    await act(async () => {
      fireEvent.change(picker(), { target: { value: "16" } });
    });
    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: "Unit" }), {
        target: { value: "box" },
      });
    });
    expect(mockBuildFields).toHaveBeenCalledTimes(2);
    expect(mockBuildFields.mock.calls[1][0]).toEqual({
      projectId: "p1",
      itemId: "l1",
      unit: "box",
    });

    await act(async () => {
      b.resolve({});
    });

    expect(picker()).toBeDisabled();
    await act(async () => {
      fireEvent.change(picker(), { target: { value: "4" } });
    });
    expect(leadTimeCalls()).toHaveLength(1);

    await act(async () => {
      a.resolve({});
    });

    expect(picker()).toBeEnabled();
    await act(async () => {
      fireEvent.change(picker(), { target: { value: "4" } });
    });
    expect(leadTimeCalls()).toHaveLength(2);
    expect(leadTimeCalls()[1][0]).toEqual({
      projectId: "p1",
      itemId: "l1",
      leadTimeWeeks: 4,
    });
  });

  it("announces the save in the lens's status, even on a first choice with nothing suggested", async () => {
    const a = deferred();
    mockBuildFields.mockReturnValueOnce(a.promise);
    renderPane();
    expect(useSuggested()).toBeNull();

    await act(async () => {
      fireEvent.change(picker(), { target: { value: "8" } });
    });
    expect(onAnnounce).toHaveBeenLastCalledWith("Saving the lead time…");

    await act(async () => {
      a.resolve({});
    });
    expect(onAnnounce).toHaveBeenLastCalledWith("Lead time saved.");
  });

  it("leaves focus where the designer moved it during a slow USE SUGGESTED", async () => {
    const a = deferred();
    mockBuildFields.mockReturnValueOnce(a.promise);
    renderPane({
      lead_time_weeks: 8,
      suggested_lead_time_weeks: 12,
      suggested_lead_time_source: "quote",
    });
    const act_ = useSuggested()!;
    act_.focus();

    await act(async () => {
      fireEvent.click(act_);
    });
    const unit = screen.getByRole("combobox", { name: "Unit" });
    unit.focus();

    await act(async () => {
      a.resolve({});
    });

    expect(picker()).toBeEnabled();
    expect(unit).toHaveFocus();
    expect(picker()).not.toHaveFocus();
  });

  it.each([
    ["released", { ffe_line_authorization: "sent" },"Released lines change through Record a change."],
    ["on an order", { purchase_order_id: "po-1" }, "Released lines change through Record a change."],
  ])("takes no act on a %s line", async (_kind, fields, reason) => {
    renderPane({
      ...fields,
      lead_time_weeks: 8,
      suggested_lead_time_weeks: 12,
      suggested_lead_time_source: "quote",
    });

    expect(picker()).toBeDisabled();
    const act_ = useSuggested()!;
    expect(act_).toHaveAttribute("aria-disabled", "true");
    expect(act_).toHaveAccessibleDescription(reason);

    await act(async () => {
      fireEvent.click(act_);
      fireEvent.change(picker(), { target: { value: "16" } });
    });
    expect(mockBuildFields).not.toHaveBeenCalled();
  });
});
