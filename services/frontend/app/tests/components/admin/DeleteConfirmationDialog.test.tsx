import { render, screen, fireEvent } from "@testing-library/react";
import { DeleteConfirmationDialog } from "../../../src/components/admin/DeleteConfirmationDialog";

describe("Components – DeleteConfirmationDialog", () => {
  const renderComponent = (props = {}) =>
    render(
      <DeleteConfirmationDialog
        open
        description="Are you sure you want to delete this item?"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    );

  it("renders dialog with title, description, and confirm button", () => {
    renderComponent();

    expect(screen.getByText("Confirm delete")).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to delete this item?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("renders custom title and button text", () => {
    renderComponent({
      title: "Remove venue",
      confirmText: "Remove",
    });

    expect(screen.getByText("Remove venue")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    renderComponent({ onConfirm });

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when close icon is clicked", () => {
    const onClose = vi.fn();
    renderComponent({ onClose });

    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders confirm button as destructive by default", () => {
    renderComponent();

    const button = screen.getByRole("button", { name: /delete/i });
    expect(button).toHaveClass("MuiButton-containedError");
  });

  it("renders confirm button as non-destructive when destructive is false", () => {
    renderComponent({ destructive: false });

    const button = screen.getByRole("button", { name: /delete/i });
    expect(button).toHaveClass("MuiButton-containedPrimary");
  });

  it("disables confirm button and close icon while loading", () => {
    renderComponent({ loading: true });

    expect(screen.getByRole("button", { name: /delete/i })).toBeDisabled();
    expect(screen.getByLabelText(/close/i)).toBeDisabled();
  });

  it("shows loading spinner inside confirm button when loading", () => {
    renderComponent({ loading: true });

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("prevents dialog close while loading", () => {
    const onClose = vi.fn();
    renderComponent({ loading: true, onClose });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
