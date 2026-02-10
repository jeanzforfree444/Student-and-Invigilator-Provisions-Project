import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AssignInvigilatorDialog } from "@/components/admin/AssignInvigilatorDialog";
import { Provider } from "react-redux";
import { createStoreInstance } from "@/state/store";

const renderDialog = (props: Partial<React.ComponentProps<typeof AssignInvigilatorDialog>> = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const store = createStoreInstance();

  const defaultProps: React.ComponentProps<typeof AssignInvigilatorDialog> = {
    open: true,
    onClose: vi.fn(),
    examVenue: {
      examvenue_id: 1,
      venue_name: "Main Hall",
      start_time: "2025-12-01T09:00:00",
      exam_length: 120,
      core: true,
    },
    invigilators: [],
    assignments: [],
  };

  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <AssignInvigilatorDialog {...defaultProps} {...props} />
      </QueryClientProvider>
    </Provider>
  );
};

describe("Components - AssignInvigilatorDialog", () => {
  it("filters out unavailable invigilators when only-available is enabled", () => {
    renderDialog({
      invigilators: [
        {
          id: 1,
          preferred_name: "Alex",
          full_name: "Alex Smith",
          resigned: false,
          availabilities: [{ date: "2025-12-01", slot: "MORNING", available: true }],
        },
        {
          id: 2,
          preferred_name: "Brooke",
          full_name: "Brooke Lee",
          resigned: false,
          availabilities: [{ date: "2025-12-01", slot: "MORNING", available: false }],
        },
      ],
    });

    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.queryByText("Brooke")).not.toBeInTheDocument();
  });

  it("marks invigilators already assigned to the exam venue and allows unassigning", () => {
    renderDialog({
      invigilators: [
        { id: 1, preferred_name: "Alex", full_name: "Alex Smith", resigned: false },
        { id: 2, preferred_name: "Brooke", full_name: "Brooke Lee", resigned: false },
      ],
      assignments: [
        {
          id: 10,
          invigilator: 2,
          exam_venue: 1,
          assigned_start: "2025-12-01T09:00:00",
          assigned_end: "2025-12-01T11:00:00",
        },
      ],
    });

    const brookeCheckbox = screen.getByLabelText(/brooke/i);
    expect(brookeCheckbox).not.toBeDisabled();
    expect(screen.getByText(/assigned to this exam/i)).toBeInTheDocument();
    fireEvent.click(brookeCheckbox);
    expect(screen.getByText(/will be unassigned/i)).toBeInTheDocument();
  });

  it("disables invigilators with overlapping assignments", () => {
    renderDialog({
      invigilators: [
        { id: 1, preferred_name: "Alex", full_name: "Alex Smith", resigned: false },
        { id: 2, preferred_name: "Brooke", full_name: "Brooke Lee", resigned: false },
      ],
      assignments: [
        {
          id: 11,
          invigilator: 1,
          exam_venue: 99,
          assigned_start: "2025-12-01T10:00:00",
          assigned_end: "2025-12-01T12:00:00",
        },
      ],
    });

    fireEvent.click(screen.getByLabelText(/available/i));

    const alexCheckbox = screen.getByLabelText(/alex/i);
    expect(alexCheckbox).toBeDisabled();
    expect(screen.getByText(/conflicts with existing shift/i)).toBeInTheDocument();
  });

  it("clears search when Clear is clicked", () => {
    renderDialog({
      invigilators: [
        { id: 1, preferred_name: "Alex", full_name: "Alex Smith", resigned: false },
      ],
    });

    const searchInput = screen.getByPlaceholderText(/search invigilators/i) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "Alex" } });
    expect(searchInput.value).toBe("Alex");

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(searchInput.value).toBe("");
  });
});
