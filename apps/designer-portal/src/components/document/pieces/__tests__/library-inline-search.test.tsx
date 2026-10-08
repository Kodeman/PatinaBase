/**
 * US-21 T-25 — the inline Library search (a6): results print as
 * `name · finish · $N each`, then the door to the whole Library; arrow keys
 * move the selection, Enter chooses; the count is announced in a live region.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  LibraryInlineSearch,
  libraryResultLine,
  type LibraryInlineResult,
} from "../library-inline-search";

type SearchState = { data?: unknown; isLoading?: boolean; isError?: boolean };
let searchState: SearchState = {};
let searchCalls: Array<{ query: string; enabled?: boolean }> = [];

jest.mock("@patina/supabase", () => ({
  useCrossLayerSearch: (opts: { query: string; enabled?: boolean }) => {
    searchCalls.push(opts);
    return {
      data: opts.enabled === false ? undefined : searchState.data,
      isLoading: searchState.isLoading ?? false,
      isError: searchState.isError ?? false,
    };
  },
}));

const row = (
  id: string,
  name: string,
  priceCents: number | null,
  extra: Partial<LibraryInlineResult> = {},
): LibraryInlineResult => ({
  id,
  name,
  brand: null,
  price_retail: priceCents,
  price_trade: null,
  images: null,
  source_url: null,
  status: "active",
  category: "hardware",
  configuration_mode: "standard",
  configuration_summary: null,
  layer: "studio",
  owner_user_id: null,
  studio_id: "studio-1",
  created_at: "2026-10-01T00:00:00Z",
  capture_source: null,
  captured_at: null,
  field_capture_id: null,
  ...extra,
});

const emtek = row("p-emtek", "Emtek Ribbon & Reed knob", 3800, {
  finish: "satin brass",
});
const mission = row("p-mission", "Rejuvenation Mission knob", 2400, {
  layer: "catalog",
});

function results(
  studio: LibraryInlineResult[],
  catalog: LibraryInlineResult[] = [],
) {
  return {
    byLayer: { personal: [], studio, catalog },
    counts: { personal: 0, studio: studio.length, catalog: catalog.length },
    total: studio.length + catalog.length,
  };
}

function renderSearch() {
  const onChoose = jest.fn();
  const onSearchLibrary = jest.fn();
  render(
    <LibraryInlineSearch
      onChoose={onChoose}
      onSearchLibrary={onSearchLibrary}
    />,
  );
  const input = screen.getByRole("combobox", { name: "Search the Library" });
  return { input, onChoose, onSearchLibrary };
}

beforeEach(() => {
  searchState = { data: results([emtek], [mission]) };
  searchCalls = [];
});

describe("libraryResultLine", () => {
  it("prints name · finish · price each, leaving out what the row lacks", () => {
    expect(libraryResultLine(emtek)).toBe(
      "Emtek Ribbon & Reed knob · satin brass · $38 each",
    );
    expect(libraryResultLine(mission)).toBe(
      "Rejuvenation Mission knob · $24 each",
    );
    expect(libraryResultLine(row("p-x", "Unpriced pull", null))).toBe(
      "Unpriced pull",
    );
  });
});

describe("LibraryInlineSearch", () => {
  it('typing "knob" lists the results, then the Library door, with the first row selected', async () => {
    const { input } = renderSearch();
    fireEvent.change(input, { target: { value: "knob" } });

    const listbox = await screen.findByRole("listbox", {
      name: "Library results",
    });
    const options = within(listbox).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Emtek Ribbon & Reed knob · satin brass · $38 each",
      "Rejuvenation Mission knob · $24 each",
      'Search the Library for "knob" →',
    ]);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(searchCalls.at(-1)).toMatchObject({ query: "knob", enabled: true });
  });

  it("announces the result count in a live region", async () => {
    renderSearch();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("");

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "knob" },
    });
    await waitFor(() =>
      expect(status).toHaveTextContent('2 Library results for "knob".'),
    );
  });

  it("announces, and prints, when nothing matches", async () => {
    searchState = { data: results([]) };
    const { input } = renderSearch();
    fireEvent.change(input, { target: { value: "zzz" } });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        'Nothing in the Library matches "zzz".',
      ),
    );
    expect(screen.getByRole("status")).not.toHaveClass("sr-only");
    expect(
      within(screen.getByRole("listbox")).getAllByRole("option"),
    ).toHaveLength(1);
  });

  it("ArrowDown moves the selection and Enter chooses that product", async () => {
    const { input, onChoose, onSearchLibrary } = renderSearch();
    fireEvent.change(input, { target: { value: "knob" } });
    await screen.findByRole("listbox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(input).toHaveAttribute("aria-activedescendant", options[1].id);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(mission);
    expect(onSearchLibrary).not.toHaveBeenCalled();
  });

  it("ArrowUp stops at the first row; Enter on it chooses it", async () => {
    const { input, onChoose } = renderSearch();
    fireEvent.change(input, { target: { value: "knob" } });
    await screen.findByRole("listbox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChoose).toHaveBeenCalledWith(emtek);
  });

  it("the last row searches the whole Library for the query, and the selection stops there", async () => {
    const { input, onChoose, onSearchLibrary } = renderSearch();
    fireEvent.change(input, { target: { value: "knob" } });
    await screen.findByRole("listbox");

    for (let i = 0; i < 5; i += 1)
      fireEvent.keyDown(input, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(options[2]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSearchLibrary).toHaveBeenCalledWith("knob");
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("a click chooses a row", async () => {
    const { input, onChoose } = renderSearch();
    fireEvent.change(input, { target: { value: "knob" } });
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(
      within(listbox).getByText(
        "Emtek Ribbon & Reed knob · satin brass · $38 each",
      ),
    );
    expect(onChoose).toHaveBeenCalledWith(emtek);
  });

  it("does not search on one character", async () => {
    const { input } = renderSearch();
    fireEvent.change(input, { target: { value: "k" } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(searchCalls.every((call) => call.enabled === false)).toBe(true);
  });

  it("Esc clears a typed query and keeps the key from the sheet; on an empty field it passes through", async () => {
    const onSheetKey = jest.fn();
    render(
      <div onKeyDown={(event) => onSheetKey(event.key)}>
        <LibraryInlineSearch onChoose={jest.fn()} onSearchLibrary={jest.fn()} />
      </div>,
    );
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "knob" } });
    await screen.findByRole("listbox");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    expect(onSheetKey).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );

    fireEvent.keyDown(input, { key: "Escape" });
    expect(onSheetKey).toHaveBeenCalledWith("Escape");
  });
});
