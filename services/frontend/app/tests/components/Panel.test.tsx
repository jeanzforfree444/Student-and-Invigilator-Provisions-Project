import { render, screen } from "@testing-library/react";
import { Panel } from "../../src/components/Panel";
import React from "react";

describe("Panel", () => {
  it("renders children", () => {
    render(
      <Panel>
        <div>Child content</div>
      </Panel>
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("renders the title if provided", () => {
    render(<Panel title="My Title" />);
    expect(screen.getByText("My Title")).toBeInTheDocument();
  });

  it("renders actions if provided", () => {
    render(<Panel actions={<button>Action</button>} />);
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("renders both title and actions in header", () => {
    render(<Panel title="Title" actions={<button>Action</button>} />);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
  });

  it("does not render header when title and actions are missing", () => {
    const { container } = render(<Panel />);
    const stackHeader = container.querySelector(".MuiStack-root");
    expect(stackHeader).toBeNull();
  });

  it("does not render divider when disableDivider is true", () => {
    const { container } = render(<Panel title="Title" disableDivider />);
    const divider = container.querySelector(".MuiDivider-root");
    expect(divider).toBeNull();
  });

  it("applies additional Paper props", () => {
    const { container } = render(<Panel elevation={5} data-testid="panel" />);
    const paper = container.querySelector('[data-testid="panel"]');
    expect(paper).toBeInTheDocument();
  });
});
