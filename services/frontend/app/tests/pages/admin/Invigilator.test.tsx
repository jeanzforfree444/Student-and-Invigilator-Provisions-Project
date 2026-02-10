import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { AdminInvigilatorProfile } from "@/pages/admin/Invigilator";
import { createStoreInstance } from "@/state/store";
import * as api from "@/utils/api";
import { vi } from "vitest";

/* ----------------------------- mocks ----------------------------- */

vi.mock("@/utils/api", async () => {
  const actual = await vi.importActual<any>("@/utils/api");
  return {
    ...actual,
    apiFetch: vi.fn(),
    apiBaseUrl: "http://test-api",
  };
});

vi.mock("@/components/admin/EditInvigilatorDialog", () => ({
  EditInvigilatorDialog: ({ open }: any) =>
    open ? <div>Edit Dialog Open</div> : null,
}));

vi.mock("@/components/admin/DeleteConfirmationDialog", () => ({
  DeleteConfirmationDialog: ({ open, onConfirm }: any) =>
    open ? (
      <div>
        <p>Delete invigilator</p>
        <button onClick={onConfirm}>Confirm Delete</button>
      </div>
    ) : null,
}));

vi.mock("@/components/admin/ContractedHoursReport", () => ({
  ContractedHoursReport: () => <div>Contracted Hours Report</div>,
}));

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});


/* ----------------------------- helpers ----------------------------- */

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const renderPage = (id = "1") => {
  const client = createQueryClient();

  const store = createStoreInstance();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/admin/invigilators/${id}`]}>
          <Routes>
            <Route
              path="/admin/invigilators/:id"
              element={<AdminInvigilatorProfile />}
            />
            <Route
              path="/admin/invigilators"
              element={<div>Invigilators List</div>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
};

/* ----------------------------- fixtures ----------------------------- */

const mockInvigilator = {
  id: 1,
  preferred_name: "Jane",
  full_name: "Jane Smith",
  mobile: "07123456789",
  mobile_text_only: null,
  janet_txt: null,
  alt_phone: null,
  university_email: "jane@uni.ac.uk",
  personal_email: null,
  notes: "Some notes",
  resigned: false,
  contracted_hours: 40,
  qualifications: [{ qualification: "SENIOR_INVIGILATOR" }],
  restrictions: [
    {
      diet: "DEC_2025",
      restrictions: ["accessibility_required"],
      notes: "Wheelchair access",
    },
  ],
  availabilities: [
    { date: "2026-01-10", slot: "MORNING", available: true },
  ],
  assignments: [],
};

/* ----------------------------- tests ----------------------------- */

describe("Admin-Invigilator", () => {
  beforeAll(() => {
    vi.setConfig({ testTimeout: 15000 });
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", async () => {
    vi.spyOn(api, "apiFetch").mockImplementation(
      () => new Promise(() => {}) as any
    );

    renderPage();

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: false,
    } as any);

    renderPage();

    expect(
      await screen.findByText(/unable to load invigilator/i)
    ).toBeInTheDocument();
  });

  it("renders invigilator profile data", async () => {
    vi.spyOn(api, "apiFetch").mockImplementation((url: string) => {
      if (url.includes("/auth/me/")) {
        return Promise.resolve({ ok: true, json: async () => ({ is_senior_admin: true }) } as any);
      }
      if (url.includes("/diets/")) {
        return Promise.resolve({ ok: true, json: async () => [] } as any);
      }
      if (url.includes("/invigilators/")) {
        return Promise.resolve({ ok: true, json: async () => mockInvigilator } as any);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as any);
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: /jane/i })).toBeInTheDocument();
    expect(screen.getByText(/jane smith/i)).toBeInTheDocument();
    expect(screen.getByText("jane@uni.ac.uk")).toBeInTheDocument();
    expect(screen.getByText("Senior Invigilator")).toBeInTheDocument();
    expect(screen.getByText("Availability")).toBeInTheDocument();
    expect(screen.getByText("Contracted Hours Report")).toBeInTheDocument();
  });

  it("opens edit dialog when edit FAB is clicked", async () => {
    vi.spyOn(api, "apiFetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockInvigilator,
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as any);
      
    renderPage();

    const editFab = await screen.findByLabelText(/edit invigilator/i);
    await userEvent.click(editFab);

    expect(screen.getByText("Edit Dialog Open")).toBeInTheDocument();
  });

  it("allows deleting an invigilator and navigates away", async () => {
  const user = userEvent.setup();
  const fetchSpy = vi.spyOn(api, "apiFetch").mockImplementation((url: string, options?: any) => {
    if (url.includes("/auth/me/")) {
      return Promise.resolve({ ok: true, json: async () => ({ is_senior_admin: true }) } as any);
    }
    if (url.includes("/diets/")) {
      return Promise.resolve({ ok: true, json: async () => [] } as any);
    }
    if (url.includes("/invigilators/1/") && options?.method === "DELETE") {
      return Promise.resolve({ ok: true, text: async () => "" } as any);
    }
    if (url.includes("/invigilators/1/")) {
      return Promise.resolve({ ok: true, json: async () => mockInvigilator } as any);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as any);
  });

  renderPage();

  const deleteFab = await screen.findByLabelText(/delete invigilator/i);
  await user.click(deleteFab);

  const confirmButton = await screen.findByRole("button", {
    name: /confirm delete/i,
  });
  await user.click(confirmButton);

  await waitFor(() => {
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://test-api/invigilators/1/",
      { method: "DELETE" }
    );
  });

  await waitFor(() => {
    expect(mockNavigate).toHaveBeenCalledWith("/admin/invigilators");
  });
});


});
