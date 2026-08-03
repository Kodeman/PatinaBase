const mockIsAnalyticsEnabled = jest.fn();

jest.mock("posthog-js", () => ({
  __esModule: true,
  default: { capture: jest.fn() },
}));
jest.mock("../posthog", () => ({
  isAnalyticsEnabled: () => mockIsAnalyticsEnabled(),
}));

import posthog from "posthog-js";
import { MOOD_BOARD_EVENT_NAMES, moodBoardEvents } from "../mood-board-events";

const captureMock = (posthog as unknown as { capture: jest.Mock }).capture;

describe("moodBoardEvents", () => {
  beforeEach(() => {
    captureMock.mockClear();
    mockIsAnalyticsEnabled.mockReset();
    mockIsAnalyticsEnabled.mockReturnValue(true);
  });

  it("covers the complete namespaced Phase 1–3 event taxonomy", () => {
    const calls: Array<() => void> = [
      () =>
        moodBoardEvents.opened({
          source: "command_bar",
          board_id: "board-1",
          item_count: 4,
          owner_kind: "proposal",
        }),
      () =>
        moodBoardEvents.itemAdded({
          type: "capture",
          source: "paste",
          board_id: "board-1",
          count: 1,
        }),
      () =>
        moodBoardEvents.arranged({
          scope: "selection",
          item_count: 3,
          board_id: "board-1",
        }),
      () =>
        moodBoardEvents.done({
          duration_ms: 8000,
          item_count: 4,
          command_count: 6,
          used_undo: true,
          used_multiselect: true,
          used_tidy: false,
          used_handles: true,
          board_id: "board-1",
        }),
      () =>
        moodBoardEvents.presented({
          board_id: "board-1",
          item_count: 4,
          section_count: 2,
          surface: "room",
          duration_ms: 5000,
        }),
      () =>
        moodBoardEvents.shared({
          board_id: "board-1",
          scope: "board",
          has_expiry: true,
          share_id: "share-1",
        }),
      () =>
        moodBoardEvents.shareViewed({
          board_id: "board-1",
          share_id: "share-1",
        }),
      () =>
        moodBoardEvents.verdictGiven({
          verdict: "approved",
          board_id: "board-1",
          board_item_id: "item-1",
          item_type: "product",
          surface: "client_portal",
        }),
      () =>
        moodBoardEvents.projectBoardContinued({
          project_id: "project-1",
          source_board_id: "snapshot-1",
          new_board_id: "board-2",
        }),
      () =>
        moodBoardEvents.exported({
          format: "png",
          board_id: "board-1",
          item_count: 4,
          duration_ms: 1500,
          failed_image_count: 0,
        }),
      () =>
        moodBoardEvents.exportFailed({
          format: "pdf_composition",
          board_id: "board-1",
          reason: "image_timeout",
        }),
      () =>
        moodBoardEvents.backgroundRemoved({
          board_id: "board-1",
          board_item_id: "item-1",
          item_type: "capture",
          duration_ms: 900,
        }),
      () =>
        moodBoardEvents.backgroundRemovalBlocked({
          reason: "budget_exceeded",
          board_id: "board-1",
        }),
      () =>
        moodBoardEvents.templateUsed({
          source: "seeded",
          template_id: "template-1",
          board_id: "board-1",
        }),
      () =>
        moodBoardEvents.templateSaved({
          template_id: "template-2",
          item_count: 4,
          section_count: 2,
        }),
      () =>
        moodBoardEvents.urlUnfurled({
          board_id: "board-1",
          host: "example.com",
          outcome: "resolved",
        }),
    ];

    calls.forEach((call) => call());

    expect(captureMock.mock.calls.map(([event]) => event)).toEqual(
      Object.values(MOOD_BOARD_EVENT_NAMES),
    );
    expect(captureMock).toHaveBeenNthCalledWith(
      16,
      "mood_board_url_unfurled",
      expect.objectContaining({
        board_id: "board-1",
        host: "example.com",
        outcome: "resolved",
      }),
    );
  });

  it("is a safe no-op when PostHog is disabled", () => {
    mockIsAnalyticsEnabled.mockReturnValue(false);

    moodBoardEvents.urlUnfurled({
      board_id: "board-1",
      host: "example.com",
      outcome: "failed",
    });

    expect(captureMock).not.toHaveBeenCalled();
  });
});
