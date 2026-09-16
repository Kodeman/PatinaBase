/**
 * The archive door (direction §3.2 R1, §8 P2).
 *
 * Two things this spec insists on: the reason line is VISIBLE whether or not
 * the caller may press the act (direction §5.5's gated-act grammar), and the
 * act is `aria-disabled`, never the `disabled` attribute, so a keyboard reader
 * meets it and the sentence standing beside it.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ArchiveCardDoor, archivedSentence } from "../archive-card-door";

const archiveMutate = jest.fn();
const restoreMutate = jest.fn();

jest.mock("@patina/supabase", () => ({
  STUDIO_CONTACT_ARCHIVE_STANDING_SENTENCE:
    "Only an owner or an admin of the studio may put a card away, or bring one back.",
  useArchiveStudioContact: () => ({
    mutateAsync: archiveMutate,
    isPending: false,
  }),
  useRestoreStudioContact: () => ({
    mutateAsync: restoreMutate,
    isPending: false,
  }),
}));

const props = {
  contactId: "card-dana",
  name: "Dana Kowalski",
  archivedAt: null as string | null,
  canArchive: true,
};

beforeEach(() => {
  archiveMutate.mockReset().mockResolvedValue("2026-09-13T00:00:00Z");
  restoreMutate.mockReset().mockResolvedValue(null);
});

describe("archivedSentence", () => {
  it("dates the putting away, in words", () => {
    expect(archivedSentence("2026-09-13T00:00:00Z")).toBe(
      "This card was put away 13 September 2026. It stays out of the book until it is brought back.",
    );
  });

  it("still states the fact when the date is missing", () => {
    expect(archivedSentence(null)).toBe(
      "This card is put away. It stays out of the book until it is brought back.",
    );
  });
});

describe("ArchiveCardDoor", () => {
  it("puts a live card away", async () => {
    render(<ArchiveCardDoor {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Put this card away" }));
    await waitFor(() =>
      expect(archiveMutate).toHaveBeenCalledWith({ id: "card-dana" }),
    );
  });

  it("brings an archived card back, and says it is away", async () => {
    render(<ArchiveCardDoor {...props} archivedAt="2026-09-13T00:00:00Z" />);
    expect(
      document.querySelector("[data-archived-sentence]")?.textContent,
    ).toMatch(/put away 13 September 2026/);
    fireEvent.click(
      screen.getByRole("button", { name: "Bring this card back" }),
    );
    await waitFor(() =>
      expect(restoreMutate).toHaveBeenCalledWith({ id: "card-dana" }),
    );
  });

  it("holds the act for a plain member, with the reason always visible", () => {
    render(<ArchiveCardDoor {...props} canArchive={false} />);
    const act = screen.getByRole("button", { name: "Put this card away" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act).not.toHaveAttribute("disabled");
    expect(act).toHaveAttribute("aria-describedby", "archive-held-card-dana");
    expect(
      screen.getByText(
        "Only an owner or an admin of the studio may put a card away, or bring one back.",
      ),
    ).toBeInTheDocument();
  });

  it("writes nothing when a held act is pressed", () => {
    render(<ArchiveCardDoor {...props} canArchive={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Put this card away" }));
    expect(archiveMutate).not.toHaveBeenCalled();
  });

  it("tells the room what moved", async () => {
    const onDone = jest.fn();
    render(<ArchiveCardDoor {...props} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Put this card away" }));
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith("Dana Kowalski is put away."),
    );
  });

  it("prints a refusal as an alert", async () => {
    archiveMutate.mockRejectedValue(
      new Error(
        "Only an owner or an admin of the studio may put a card away, or bring one back.",
      ),
    );
    render(<ArchiveCardDoor {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Put this card away" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /owner or an admin/,
    );
  });
});
