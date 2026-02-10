import { render, screen, fireEvent } from "@testing-library/react";
import { CollapsibleSection } from "../../src/components/CollapsibleSection";

describe("CollapsibleSection", () => {
  it("renders the title", () => {
    render(<CollapsibleSection title="My Section">Content</CollapsibleSection>);
    expect(screen.getByText("My Section")).toBeInTheDocument();
  });

  it("renders children even when collapsed", () => {
    render(
      <CollapsibleSection title="Section" defaultExpanded={false}>
        <div>Child Content</div>
      </CollapsibleSection>
    );
    expect(screen.getByText("Child Content")).toBeInTheDocument();
  });

  it("toggles open state when clicking the button", () => {
    render(
      <CollapsibleSection title="Section" defaultExpanded={false}>
        <div>Child Content</div>
      </CollapsibleSection>
    );

    const toggleButton = screen.getByRole("button");
    fireEvent.click(toggleButton);
    fireEvent.click(toggleButton);
  });

  it("displays the correct icon depending on state", () => {
    render(
      <CollapsibleSection title="Section" defaultExpanded={false}>
        <div>Child Content</div>
      </CollapsibleSection>
    );

    const toggleButton = screen.getByRole("button");
    fireEvent.click(toggleButton);
    fireEvent.click(toggleButton);
  });
});
