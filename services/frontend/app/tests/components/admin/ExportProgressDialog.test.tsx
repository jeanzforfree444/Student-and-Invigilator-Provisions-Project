import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ExportProgressDialog } from "@/components/admin/ExportProgressDialog";

describe("ExportProgressDialog", () => {
  it("renders progress text when open", () => {
    render(<ExportProgressDialog open />);
    expect(screen.getByText(/Preparing your export/i)).toBeInTheDocument();
    expect(screen.getByText(/Gathering your profile/i)).toBeInTheDocument();
  });
});
