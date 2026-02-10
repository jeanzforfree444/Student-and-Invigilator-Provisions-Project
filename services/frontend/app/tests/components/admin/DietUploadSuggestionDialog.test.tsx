import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DietUploadSuggestionDialog } from "@/components/admin/DietUploadSuggestionDialog";

describe("Components - DietUploadSuggestionDialog", () => {
  const baseProps = {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    dateRange: {
      min_date: "2026-07-01",
      max_date: "2026-07-10",
      row_count: 5,
    },
  };

  it("renders create_new suggestion details", () => {
    render(
      <DietUploadSuggestionDialog
        {...baseProps}
        suggestion={{
          status: "ok",
          action: "create_new",
          suggested: {
            code: "JUL_26",
            name: "July 2026",
            start_date: "2026-07-01",
            end_date: "2026-07-10",
          },
        }}
      />
    );

    expect(screen.getByText("Update diet dates?")).toBeInTheDocument();
    expect(screen.getByText("July 2026")).toBeInTheDocument();
    expect(screen.getByText("Code:")).toBeInTheDocument();
  });

  it("renders adjust_existing options and toggles them", () => {
    render(
      <DietUploadSuggestionDialog
        {...baseProps}
        suggestion={{
          status: "ok",
          action: "adjust_existing",
          diet_id: 1,
          diet_code: "APR_26",
          diet_name: "April 2026",
          current: { start_date: "2026-04-05", end_date: "2026-04-25" },
          uploaded: { start_date: "2026-04-01", end_date: "2026-04-20" },
          options: ["extend_start", "contract_end"],
        }}
      />
    );

    const extendStart = screen.getByLabelText("Extend start date");
    const contractEnd = screen.getByLabelText("Contract end date");
    expect(extendStart).toBeChecked();
    expect(contractEnd).toBeChecked();

    fireEvent.click(contractEnd);
    expect(contractEnd).not.toBeChecked();
  });

  it("disables confirm when no options selected", () => {
    render(
      <DietUploadSuggestionDialog
        {...baseProps}
        suggestion={{
          status: "ok",
          action: "adjust_existing",
          diet_id: 1,
          diet_code: "APR_26",
          diet_name: "April 2026",
          current: { start_date: "2026-04-05", end_date: "2026-04-25" },
          uploaded: { start_date: "2026-04-01", end_date: "2026-04-20" },
          options: ["extend_start"],
        }}
      />
    );

    const checkbox = screen.getByLabelText("Extend start date");
    fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("shows error alert and disables confirm", () => {
    render(
      <DietUploadSuggestionDialog
        {...baseProps}
        suggestion={{
          status: "error",
          message: "Multiple diets overlap.",
        }}
      />
    );

    expect(screen.getByText("Multiple diets overlap.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });
});
