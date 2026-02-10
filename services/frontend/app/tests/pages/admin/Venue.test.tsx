import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { AdminVenuePage } from "../../../src/pages/admin/Venue";
import { createStoreInstance } from "../../../src/state/store";
import * as api from "../../../src/utils/api";

// -----------------------------
// Router mocks (MUST be top-level)
// -----------------------------
const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ venueId: "Test Venue" }),
  };
});

// -----------------------------
// Child component stubs
// -----------------------------
vi.mock("../../../src/components/admin/EditVenueDialog", () => ({
  EditVenueDialog: ({ open, onClose }: any) =>
    open ? (
      <div>
        <p>Edit Venue Dialog</p>
        <button onClick={onClose}>Close Edit</button>
      </div>
    ) : null,
}));

vi.mock("../../../src/components/admin/ExamDetailsPopup", () => ({
  ExamDetailsPopup: ({ open, onClose }: any) =>
    open ? (
      <div>
        <p>Exam Details Popup</p>
        <button onClick={onClose}>Close Popup</button>
      </div>
    ) : null,
}));

vi.mock("../../../src/components/admin/DeleteConfirmationDialog", () => ({
  DeleteConfirmationDialog: ({ open, onClose, onConfirm, loading }: any) =>
    open ? (
      <div>
        <p>Delete Confirmation</p>
        <button onClick={onClose}>Cancel</button>
        <button onClick={onConfirm} disabled={loading}>
          Confirm Delete
        </button>
      </div>
    ) : null,
}));

// -----------------------------
// Test helpers
// -----------------------------
const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderPage = async () => {
  const client = createQueryClient();

  const store = createStoreInstance();
  render(
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <AdminVenuePage />
      </QueryClientProvider>
    </Provider>
  );
};

// -----------------------------
// Mock data
// -----------------------------
const venueData = {
  venue_name: "Test Venue",
  capacity: 120,
  venuetype: "MAIN_HALL",
  is_accessible: true,
  provision_capabilities: ["extra_time"],
  exam_venues: [
    {
      exam_name: "Math 101",
      venue_name: "Test Venue",
      start_time: "2025-01-10T09:00:00Z",
      exam_length: 120,
    },
  ],
};

// -----------------------------
// Tests
// -----------------------------
describe("AdminVenuePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", async () => {
    vi.spyOn(api, "apiFetch").mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        }) as any
    );

    await renderPage();

    expect(screen.getByText(/loading venue/i)).toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: false,
      text: async () => "Boom",
    } as any);

    await renderPage();

    expect(await screen.findByText(/unable to load venue/i)).toBeInTheDocument();
  });

  it("renders venue details correctly", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => venueData,
    } as any);

    await renderPage();

    expect(await screen.findByText("Test Venue")).toBeInTheDocument();
    expect(screen.getByText(/capacity 120/i)).toBeInTheDocument();
    const venuePanel = screen.getByRole("heading", { name: /venue details/i }).closest(".MuiPaper-root")! as HTMLElement;
    expect(within(venuePanel).getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText(/main hall/i)).toBeInTheDocument();
    expect(screen.getByText(/1 exams/i)).toBeInTheDocument();
  });

  it("renders exam cards and opens exam details popup", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => venueData,
    } as any);

    await renderPage();

    fireEvent.click(await screen.findByText("Math 101"));

    expect(await screen.findByText(/exam details popup/i)).toBeInTheDocument();
  });

  it("opens and closes edit venue dialog", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => venueData,
    } as any);

    await renderPage();

    fireEvent.click(await screen.findByLabelText(/edit venue/i));

    expect(await screen.findByText(/edit venue dialog/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/close edit/i));

    await waitFor(() => {
      expect(
        screen.queryByText(/edit venue dialog/i)
      ).not.toBeInTheDocument();
    });
  });

  it("opens delete confirmation dialog and cancels", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => venueData,
    } as any);

    await renderPage();

    fireEvent.click(await screen.findByLabelText(/delete venue/i));

    expect(
      await screen.findByText(/delete confirmation/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText(/cancel/i));

    await waitFor(() => {
      expect(
        screen.queryByText(/delete confirmation/i)
      ).not.toBeInTheDocument();
    });
  });

  it("successfully deletes venue and navigates away", async () => {
    const fetchMock = vi.spyOn(api, "apiFetch");

    fetchMock
      // initial GET
      .mockResolvedValueOnce({
        ok: true,
        json: async () => venueData,
      } as any)
      // DELETE
      .mockResolvedValueOnce({
        ok: true,
      } as any);

    await renderPage();

    fireEvent.click(await screen.findByLabelText(/delete venue/i));
    fireEvent.click(await screen.findByText(/confirm delete/i));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/venues/Test%20Venue/"),
        expect.objectContaining({ method: "DELETE" })
      );
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/admin/venues");
    });
  });
});
