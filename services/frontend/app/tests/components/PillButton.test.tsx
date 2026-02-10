import { render, screen, fireEvent } from "@testing-library/react";
import { PillButton } from "../../src/components/PillButton";
import React from "react";

describe("PillButton", () => {
  it("renders children", () => {
    render(<PillButton>Click Me</PillButton>);
    expect(screen.getByText("Click Me")).toBeInTheDocument();
  });

  it("fires onClick handler when clicked", () => {
    const onClick = vi.fn();
    render(<PillButton onClick={onClick}>Click Me</PillButton>);
    fireEvent.click(screen.getByText("Click Me"));
    expect(onClick).toHaveBeenCalled();
  });

  it("applies additional sx styles", () => {
    render(<PillButton sx={{ backgroundColor: "red" }}>Styled</PillButton>);
    const button = screen.getByText("Styled");
    expect(button).toHaveStyle("background-color: rgb(255,0,0)");
    expect(button).toHaveStyle("border-radius: 999px");
  });

  it("supports disabled prop", () => {
    render(<PillButton disabled>Disabled</PillButton>);
    const button = screen.getByText("Disabled");
    expect(button).toBeDisabled();
  });
});
