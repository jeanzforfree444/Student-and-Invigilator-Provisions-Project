import { render, screen, fireEvent } from "@testing-library/react";
import { BooleanCheckboxRow } from "../../src/components/BooleanCheckboxRow";

describe("BooleanCheckboxRow", () => {
  it("renders label and checkbox with correct initial state", () => {
    const onChange = vi.fn();
    render(<BooleanCheckboxRow label="Active?" value={true} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    expect(screen.getByText("Active?")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("calls onChange when checkbox is clicked and toggles text", () => {
    let value = false;
    const onChange = (v: boolean) => (value = v);
    render(<BooleanCheckboxRow label="Active?" value={value} onChange={onChange} />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText("No")).toBeInTheDocument();

    fireEvent.click(checkbox);

    expect(value).toBe(true);
  });

  it("renders custom yes/no labels", () => {
    render(
      <BooleanCheckboxRow
        label="Active?"
        value={true}
        onChange={vi.fn()}
        yesLabel="Enabled"
        noLabel="Disabled"
      />
    );
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });
});
