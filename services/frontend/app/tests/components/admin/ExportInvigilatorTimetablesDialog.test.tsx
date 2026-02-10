import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";

import { ExportInvigilatorTimetablesDialog } from "@/components/admin/ExportInvigilatorTimetablesDialog";
import { createStoreInstance } from "@/state/store";

describe("ExportInvigilatorTimetablesDialog", () => {
  const renderWithStore = (ui: React.ReactElement) => {
    const store = createStoreInstance();
    return render(<Provider store={store}>{ui}</Provider>);
  };

  it("disables export when no invigilators are selected", () => {
    renderWithStore(
      <ExportInvigilatorTimetablesDialog
        open
        invigilators={[]}
        onClose={() => undefined}
        onExport={() => undefined}
      />
    );

    expect(screen.getByRole("button", { name: /export/i })).toBeDisabled();
  });

  it("sends selected options to onExport", () => {
    const onExport = vi.fn();
    renderWithStore(
      <ExportInvigilatorTimetablesDialog
        open
        invigilators={[{ id: 1, name: "Alice Example" }]}
        onClose={() => undefined}
        onExport={onExport}
      />
    );

    fireEvent.click(screen.getByLabelText(/only confirmed shifts/i));
    fireEvent.click(screen.getByLabelText(/include student provisions/i));

    fireEvent.click(screen.getByRole("button", { name: /export/i }));

    expect(onExport).toHaveBeenCalledWith({
      onlyConfirmed: true,
      includeCancelled: false,
      includeProvisions: true,
    });
  });

  it("clears selected options when Clear is clicked", () => {
    renderWithStore(
      <ExportInvigilatorTimetablesDialog
        open
        invigilators={[{ id: 1, name: "Alice Example" }]}
        onClose={() => undefined}
        onExport={() => undefined}
      />
    );

    fireEvent.click(screen.getByLabelText(/only confirmed shifts/i));
    fireEvent.click(screen.getByLabelText(/include cancelled shifts/i));
    fireEvent.click(screen.getByLabelText(/include student provisions/i));

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(screen.getByLabelText(/only confirmed shifts/i)).not.toBeChecked();
    expect(screen.getByLabelText(/include cancelled shifts/i)).not.toBeChecked();
    expect(screen.getByLabelText(/include student provisions/i)).not.toBeChecked();
  });
});
