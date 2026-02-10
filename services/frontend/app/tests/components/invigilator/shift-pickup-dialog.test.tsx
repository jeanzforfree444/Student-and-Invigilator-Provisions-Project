import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ShiftPickupDialog } from "@/components/invigilator/ShiftPickupDialog";

describe("ShiftPickupDialog", () => {
  it("renders shift details and triggers confirm", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ShiftPickupDialog
        open
        examName="Advanced Economics"
        venueName="Main Hall"
        startLabel="Tue, 4 Aug @ 10:00"
        endLabel="13:00"
        durationLabel="180 minutes"
        roleLabel="Assistant invigilator"
        originalLabel="Alex"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText(/Advanced Economics/i)).toBeInTheDocument();
    expect(screen.getByText(/Main Hall/i)).toBeInTheDocument();
    expect(screen.getByText(/Assistant invigilator/i)).toBeInTheDocument();
    expect(screen.getByText(/Originally: Alex/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("disables confirm and close buttons while confirming", () => {
    render(
      <ShiftPickupDialog
        open
        examName="Exam"
        venueName="Venue"
        startLabel="Today 10:00"
        endLabel="11:00"
        confirming
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    const confirmButton = screen.getByRole("button", { name: /confirming/i });
    expect(confirmButton).toBeDisabled();
    expect(screen.getByLabelText(/close/i)).toBeDisabled();
  });
});
