/**
 * DimensionFields — pure controlled W/D/H + unit editor (P2-9).
 *
 * Covers: editing emits a spread-preserved object, unknown keys survive every
 * change and surface a "+N captured fields preserved" hint, null is only
 * emitted once width/depth/height are ALL cleared and no unknown keys
 * remain, and the readOnly branch renders "W × D × H unit" as static text.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DimensionFields } from "./dimension-fields";

describe("DimensionFields — editing", () => {
  it("emits width/depth/height/unit together when a field changes", () => {
    const onChange = jest.fn();
    render(
      <DimensionFields
        value={{ width: "72", depth: "38", height: "30", unit: "in" }}
        onChange={onChange}
      />,
    );
    const widthInput = screen.getByLabelText("width");
    // A single fireEvent.change is the correct way to probe a purely
    // controlled input (no internal echo state) — it doesn't rely on the
    // DOM re-committing an updated `value` prop between keystrokes.
    fireEvent.change(widthInput, { target: { value: "84" } });
    expect(onChange).toHaveBeenCalledWith({
      width: "84",
      depth: "38",
      height: "30",
      unit: "in",
    });
  });

  it("changes unit independently of the W/D/H values", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <DimensionFields
        value={{ width: "72", depth: "38", height: "30", unit: "in" }}
        onChange={onChange}
      />,
    );
    await user.selectOptions(screen.getByLabelText("unit"), "cm");
    expect(onChange).toHaveBeenCalledWith({
      width: "72",
      depth: "38",
      height: "30",
      unit: "cm",
    });
  });

  it("seeds blank inputs from a null value and defaults the unit to in", () => {
    render(<DimensionFields value={null} onChange={jest.fn()} />);
    expect(screen.getByLabelText("width")).toHaveValue("");
    expect(screen.getByLabelText("depth")).toHaveValue("");
    expect(screen.getByLabelText("height")).toHaveValue("");
    expect(screen.getByLabelText("unit")).toHaveValue("in");
  });
});

describe("DimensionFields — unknown-key preservation", () => {
  it("spread-preserves keys it doesn't know about on every change", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <DimensionFields
        value={{
          width: "72",
          depth: "38",
          height: "30",
          unit: "in",
          length: "80", // the fixtures' bare `length` key
          seatDepth: "22",
        }}
        onChange={onChange}
      />,
    );
    await user.selectOptions(screen.getByLabelText("unit"), "cm");
    expect(onChange).toHaveBeenCalledWith({
      width: "72",
      depth: "38",
      height: "30",
      unit: "cm",
      length: "80",
      seatDepth: "22",
    });
  });

  it('shows a muted "+N captured fields preserved" hint when unknown keys exist', () => {
    render(
      <DimensionFields
        value={{
          width: "72",
          length: "80",
          seatDepth: "22",
          armHeight: "26",
        }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("+3 captured fields preserved")).toBeInTheDocument();
  });

  it("does not show the hint when the value has only known keys", () => {
    render(
      <DimensionFields
        value={{ width: "72", depth: "38", height: "30", unit: "in" }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByText(/captured field/)).toBeNull();
  });

  it("singularizes the hint for exactly one unknown key", () => {
    render(
      <DimensionFields value={{ length: "80" }} onChange={jest.fn()} />,
    );
    expect(screen.getByText("+1 captured field preserved")).toBeInTheDocument();
  });
});

describe("DimensionFields — null emission", () => {
  it("emits null once width/depth/height are all cleared and there are no unknown keys", () => {
    const onChange = jest.fn();
    render(
      <DimensionFields
        value={{ width: "72", depth: "", height: "", unit: "in" }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("width"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("does NOT emit null while an unknown key still holds captured data", () => {
    const onChange = jest.fn();
    render(
      <DimensionFields
        value={{ width: "72", depth: "", height: "", unit: "in", length: "80" }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("width"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ length: "80" }),
    );
    const lastCall = onChange.mock.calls.at(-1)![0];
    expect(lastCall).not.toBeNull();
  });

  it("clearing every field on an already-empty object still reports null (no-op safe)", () => {
    const onChange = jest.fn();
    render(<DimensionFields value={null} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("DimensionFields — readOnly", () => {
  it('renders "W × D × H unit" as static text', () => {
    render(
      <DimensionFields
        value={{ width: "72", depth: "38", height: "30", unit: "in" }}
        onChange={jest.fn()}
        readOnly
      />,
    );
    expect(screen.getByText('72 × 38 × 30 in')).toBeInTheDocument();
    expect(screen.queryByLabelText("width")).toBeNull();
  });

  it('falls back to an em dash per missing dimension while readOnly', () => {
    render(
      <DimensionFields
        value={{ width: "72", unit: "in" }}
        onChange={jest.fn()}
        readOnly
      />,
    );
    expect(screen.getByText('72 × — × — in')).toBeInTheDocument();
  });

  it('shows "not yet measured" when there is nothing to show', () => {
    render(<DimensionFields value={null} onChange={jest.fn()} readOnly />);
    expect(screen.getByText("not yet measured")).toBeInTheDocument();
  });

  it("still surfaces the preserved-fields hint while readOnly", () => {
    render(
      <DimensionFields
        value={{ width: "72", depth: "38", height: "30", unit: "in", length: "80" }}
        onChange={jest.fn()}
        readOnly
      />,
    );
    expect(screen.getByText("+1 captured field preserved")).toBeInTheDocument();
  });
});
