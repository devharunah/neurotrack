import { render, screen } from "@testing-library/react";

import Home from "../page";

describe("Home", () => {
  it("renders a top-level heading", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("links the privacy notice and terms from the footer", () => {
    render(<Home />);

    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });
});
