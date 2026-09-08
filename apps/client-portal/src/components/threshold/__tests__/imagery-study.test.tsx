import { fireEvent, render, screen, within } from "@testing-library/react";
import { ImageryStudy } from "../imagery-study";

describe("ImageryStudy", () => {
  it("identifies conceptual imagery without purchase or approval controls", () => {
    render(<ImageryStudy />);
    expect(
      screen.getByText(/Generated imagery, not your actual rooms/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Generated living-room/ }),
    ).toHaveAttribute("src", "/design-review/imagery/living.jpg");
    expect(
      screen.queryByRole("button", { name: /approve|pay|order/i }),
    ).toBeNull();
  });

  it("switches images, captions and selected state together", () => {
    render(<ImageryStudy />);
    const views = screen.getByRole("group", { name: "Choose a concept view" });
    fireEvent.click(within(views).getByRole("button", { name: /Dining/ }));
    expect(
      within(views).getByRole("button", { name: /Dining/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("heading", { name: "Made for gathering." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Generated dining-room/ }),
    ).toHaveAttribute("src", "/design-review/imagery/dining.jpg");
    fireEvent.click(within(views).getByRole("button", { name: /Materials/ }));
    expect(
      screen.getByRole("img", { name: /Generated material-board/ }),
    ).toBeInTheDocument();
  });

  it("keeps failed images recoverable through another view", () => {
    render(<ImageryStudy />);
    fireEvent.error(screen.getByRole("img", { name: /Generated living-room/ }));
    expect(screen.getByText(/could not load/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Retry it/);
    fireEvent.click(screen.getByRole("button", { name: "Retry image" }));
    expect(
      screen.getByRole("img", { name: /Generated living-room/ }),
    ).toBeInTheDocument();
    fireEvent.error(screen.getByRole("img", { name: /Generated living-room/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dining/ }));
    expect(
      screen.getByRole("img", { name: /Generated dining-room/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/could not load/)).toBeNull();
  });
});
