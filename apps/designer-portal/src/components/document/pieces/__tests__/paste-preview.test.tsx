/**
 * US-21 T-25 — the paste preview (S1, D13): N pasted names preview as N
 * lines, confirm through ONE batch call, and cancel without writing; the
 * count is announced in a live region.
 */
import type { ComponentProps } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  PASTE_BATCH_MAX,
  PastePreview,
  parsePastedLines,
} from "../paste-preview";

const mutateAsync = jest.fn();
let isPending = false;

jest.mock("@patina/supabase", () => ({
  useBatchCreateNamedProjectNeeds: () => ({ mutateAsync, isPending }),
}));

const PASTE =
  "Custom cabinet\r\nCountertop for custom cabinets\n\n  Hardware, 2 knobs for custom cabinet  \nHardware, 4 pulls for custom cabinet\n";
const NAMES = [
  "Custom cabinet",
  "Countertop for custom cabinets",
  "Hardware, 2 knobs for custom cabinet",
  "Hardware, 4 pulls for custom cabinet",
];

function renderPreview(
  overrides: Partial<ComponentProps<typeof PastePreview>> = {},
) {
  const onAdded = jest.fn();
  const onCancel = jest.fn();
  render(
    <PastePreview
      projectId="project-1"
      roomId="room-living"
      roomName="Living Room"
      text={PASTE}
      onAdded={onAdded}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onAdded, onCancel };
}

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({ selectionIds: ["s1", "s2", "s3", "s4"] });
  isPending = false;
});

describe("parsePastedLines", () => {
  it("splits on any newline, trims, and drops blank lines", () => {
    expect(parsePastedLines(PASTE)).toEqual(NAMES);
    expect(parsePastedLines("\n \r\n")).toEqual([]);
  });
});

describe("PastePreview", () => {
  it("previews the N pasted names as N placeholder lines, with the confirm act focused", () => {
    renderPreview();
    const list = screen.getByRole("list", { name: "Pasted lines" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items.map((item) => item.firstChild?.textContent)).toEqual(NAMES);
    expect(within(items[0]).getByText("Placeholder")).toHaveClass(
      "stamp",
      "stamp--placeholder",
    );
    expect(
      screen.getByRole("heading", { name: "Pasted · 4 lines for Living Room" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 4 lines" })).toHaveFocus();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("announces the count in a live region", async () => {
    renderPreview();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    await waitFor(() =>
      expect(status).toHaveTextContent("4 lines ready to add to Living Room."),
    );
  });

  it("confirms all N lines through one batch call into the room", async () => {
    const { onAdded, onCancel } = renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "Add 4 lines" }));

    await waitFor(() =>
      expect(onAdded).toHaveBeenCalledWith(["s1", "s2", "s3", "s4"]),
    );
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const request = mutateAsync.mock.calls[0][0];
    expect(request).toEqual({
      projectId: "project-1",
      roomId: "room-living",
      assignmentScope: "room",
      lines: NAMES.map((name) => ({ name })),
      idempotencyKey: expect.any(String),
    });
    expect(request.idempotencyKey.length).toBeGreaterThan(0);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("pasted under Not in a room yet, the batch sends no room and the unassigned scope", async () => {
    const { onAdded } = renderPreview({
      roomId: null,
      roomName: "Not in a room yet",
      text: "Rug\nLamp",
    });
    fireEvent.click(screen.getByRole("button", { name: "Add 2 lines" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: null,
        assignmentScope: "unassigned",
        lines: [{ name: "Rug" }, { name: "Lamp" }],
      }),
    );
  });

  it("Cancel writes nothing", () => {
    const { onCancel, onAdded } = renderPreview();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("Esc cancels and keeps the key from the sheet", () => {
    const onSheetKey = jest.fn();
    const onCancel = jest.fn();
    render(
      <div onKeyDown={(event) => onSheetKey(event.key)}>
        <PastePreview
          projectId="project-1"
          roomId="room-living"
          roomName="Living Room"
          text={PASTE}
          onAdded={jest.fn()}
          onCancel={onCancel}
        />
      </div>,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "Add 4 lines" }), {
      key: "Escape",
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSheetKey).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("a failed batch keeps the preview open, says why, and a retry reuses the same key", async () => {
    mutateAsync.mockRejectedValueOnce(
      new Error("project not found or access denied"),
    );
    const { onAdded } = renderPreview();
    const confirm = screen.getByRole("button", { name: "Add 4 lines" });

    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "project not found or access denied",
    );
    expect(onAdded).not.toHaveBeenCalled();

    fireEvent.click(confirm);
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync.mock.calls[1][0].idempotencyKey).toBe(
      mutateAsync.mock.calls[0][0].idempotencyKey,
    );
  });

  it(`over ${PASTE_BATCH_MAX} lines the confirm is gated with its reason, never disabled`, () => {
    const text = Array.from(
      { length: PASTE_BATCH_MAX + 1 },
      (_, i) => `Line ${i + 1}`,
    ).join("\n");
    renderPreview({ text });
    const confirm = screen.getByRole("button", {
      name: `Add ${PASTE_BATCH_MAX + 1} lines`,
    });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(confirm).not.toBeDisabled();
    expect(confirm).toHaveAccessibleDescription(
      `A paste adds at most ${PASTE_BATCH_MAX} lines at a time. This one has ${PASTE_BATCH_MAX + 1}.`,
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.click(confirm);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("while the batch is in flight, a second press sends nothing", () => {
    isPending = true;
    renderPreview();
    const confirm = screen.getByRole("button", { name: "Adding…" });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(confirm);
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
