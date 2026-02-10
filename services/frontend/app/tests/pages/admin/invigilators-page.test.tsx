import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import dayjs from "dayjs";

import { AdminInvigilators } from "@/pages/admin/Invigilators";
import { createStoreInstance, setInvigilatorsPageUi, setInvigilatorsPrefs } from "@/state/store";

const apiFetchMock = vi.fn();

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

vi.mock("@mui/x-date-pickers/LocalizationProvider", () => ({
  LocalizationProvider: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@mui/x-date-pickers/AdapterDayjs", () => ({
  AdapterDayjs: function Adapter() {},
}));

vi.mock("@mui/x-date-pickers", () => ({
  StaticDatePicker: ({ onChange, slotProps }: any) => {
    const date = dayjs("2026-02-10");
    if (slotProps?.day) {
      slotProps.day({ day: date });
    }
    return (
      <button type="button" onClick={() => onChange?.(date)}>
        Pick date
      </button>
    );
  },
}));

vi.mock("@/components/Panel", () => ({
  Panel: ({ title, actions, children }: any) => (
    <div>
      {title}
      {actions}
      {children}
    </div>
  ),
}));

vi.mock("@/components/PillButton", () => ({
  PillButton: (props: any) => (
    <button type="button" {...props}>
      {props.children}
    </button>
  ),
}));

vi.mock("@mui/material/IconButton", () => ({
  __esModule: true,
  default: (props: any) => (
    <button type="button" {...props}>
      {props.children}
    </button>
  ),
}));

vi.mock("@/components/admin/AddInvigilatorDialog", () => ({
  AddInvigilatorDialog: ({ open }: any) => (open ? <div>Add Invigilator Dialog</div> : null),
}));

vi.mock("@/components/admin/NotifyDialog", () => ({
  NotifyDialog: ({ open }: any) => (open ? <div>Notify Dialog</div> : null),
}));

vi.mock("@/components/admin/ExportInvigilatorTimetablesDialog", () => ({
  ExportInvigilatorTimetablesDialog: ({ open, onExport }: any) =>
    open ? <button type="button" onClick={() => onExport({ onlyConfirmed: true, includeCancelled: false, includeProvisions: false })}>Export Now</button> : null,
}));

vi.mock("@/components/admin/InvigilatorAvailabilityModal", () => ({
  InvigilatorAvailabilityModal: ({ open }: any) => (open ? <div>Availability Modal</div> : null),
}));

vi.mock("@/components/admin/DeleteConfirmationDialog", () => ({
  DeleteConfirmationDialog: ({ open, confirmText, onConfirm }: any) =>
    open ? <button type="button" onClick={onConfirm}>{confirmText}</button> : null,
}));

const invigilators = [
  {
    id: 1,
    preferred_name: "Alice",
    full_name: "Alice Smith",
    university_email: "alice@uni.ac.uk",
    personal_email: null,
    mobile: null,
    mobile_text_only: null,
    alt_phone: null,
    notes: null,
    resigned: false,
    availableDates: ["2026-02-10"],
  },
  {
    id: 2,
    preferred_name: "Bob",
    full_name: "Bob Jones",
    university_email: "bob@uni.ac.uk",
    personal_email: null,
    mobile: null,
    mobile_text_only: null,
    alt_phone: null,
    notes: null,
    resigned: false,
    availabilities: [{ date: "2026-02-10", slot: "AM", available: true }],
  },
];

const renderPage = (
  store = createStoreInstance(),
  initialEntries = ["/admin/invigilators?view=list"],
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Provider store={store}>
        <QueryClientProvider client={client}>
          <AdminInvigilators />
        </QueryClientProvider>
      </Provider>
    </MemoryRouter>
  );
};

describe("AdminInvigilators", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
      const method = (options?.method || "GET").toUpperCase();
      if (url.includes("/invigilators/") && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => invigilators, text: async () => "" });
      }
      if (url.includes("/invigilators/bulk-delete/") && method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
      }
      return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
    });
  });

  it("shows loading state", () => {
    apiFetchMock.mockImplementation(() => new Promise(() => {}) as any);
    renderPage();

    expect(screen.getByText(/loading invigilators/i)).toBeInTheDocument();
  });

  it("shows error state", async () => {
    apiFetchMock.mockResolvedValue({ ok: false, text: async () => "Failed to load" } as any);
    renderPage();

    expect(await screen.findByText(/unable to load invigilators/i)).toBeInTheDocument();
  });

  it("renders list view and filters by search", async () => {
    const store = createStoreInstance();
    store.dispatch(setInvigilatorsPrefs({ viewMode: "list" }));
    renderPage(store);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/search invigilators/i), { target: { value: "Alice" } });
    expect(await screen.findByText(/1 invigilators found/i)).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("opens delete confirmation via bulk action", async () => {
    const store = createStoreInstance();
    store.dispatch(setInvigilatorsPrefs({ viewMode: "list" }));
    renderPage(store);

    await screen.findByText("Alice");
    await new Promise((r) => setTimeout(r, 0));
    store.dispatch(setInvigilatorsPageUi({ selectedIds: [1, 2], bulkAction: "delete", deleteOpen: true }));

    await waitFor(() => {
      expect(store.getState().adminTables.invigilatorsPageUi.deleteOpen).toBe(true);
    });
    const deleteButton = screen.queryByRole("button", { name: /delete 2/i });
    expect(deleteButton).toBeInTheDocument();
  });

  it("filters by first and last letter with search", async () => {
    const store = createStoreInstance();
    store.dispatch(setInvigilatorsPrefs({
      viewMode: "list",
      firstLetter: "A",
      lastLetter: "S",
      searchQuery: "ali",
      searchDraft: "ali",
    }));
    renderPage(store);

    expect(await screen.findByText(/1 invigilators found/i)).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("falls back to numbered label when names are missing", async () => {
    apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
      const method = (options?.method || "GET").toUpperCase();
      if (url.includes("/invigilators/") && method === "GET") {
        return Promise.resolve({
          ok: true,
          json: async () => [
            ...invigilators,
            { id: 3, preferred_name: null, full_name: null, university_email: null, personal_email: null },
          ],
          text: async () => "",
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
    });
    const store = createStoreInstance();
    store.dispatch(setInvigilatorsPrefs({ viewMode: "list" }));
    renderPage(store);

    expect(await screen.findByText("Invigilator #3")).toBeInTheDocument();
  });

  it("exports selected invigilators when export action is triggered", async () => {
    if (!URL.createObjectURL) {
      Object.defineProperty(URL, "createObjectURL", {
        value: vi.fn(() => "blob:mock"),
        configurable: true,
      });
    }
    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, "revokeObjectURL", {
        value: vi.fn(),
        configurable: true,
      });
    }
    const urlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
      const method = (options?.method || "GET").toUpperCase();
      if (url.includes("/invigilators/") && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => invigilators, text: async () => "" });
      }
      if (url.includes("/invigilators/timetables/export/") && method === "POST") {
        return Promise.resolve({
          ok: true,
          blob: async () => new Blob(["csv"], { type: "text/csv" }),
          headers: { get: () => "attachment; filename=invigilators.csv" },
          text: async () => "",
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
    });

    const store = createStoreInstance();
    store.dispatch(setInvigilatorsPrefs({ viewMode: "list" }));
    renderPage(store);

    await screen.findByText("Alice");
    store.dispatch(setInvigilatorsPageUi({ selectedIds: [1], bulkAction: "export" }));

    fireEvent.click(await screen.findByTestId("bulk-action-export"));
    fireEvent.click(await screen.findByRole("button", { name: /export now/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/invigilators/timetables/export/"),
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(urlSpy).toHaveBeenCalled();
    revokeSpy.mockRestore();
    urlSpy.mockRestore();
  });

  it("shows select-all label when no invigilators are returned", async () => {
    apiFetchMock.mockResolvedValueOnce({ ok: true, json: async () => [], text: async () => "" } as any);
    const store = createStoreInstance();
    store.dispatch(setInvigilatorsPrefs({ viewMode: "list" }));
    renderPage(store, ["/admin/invigilators?view=list"]);

    expect(await screen.findByText(/0 invigilators found/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deselect all invigilators/i })).toBeInTheDocument();
  });

  it("renders calendar view and opens availability modal", async () => {
    const store = createStoreInstance();
    store.dispatch(setInvigilatorsPrefs({ viewMode: "calendar" }));
    renderPage(store, ["/admin/invigilators?view=calendar"]);

    const pickButtons = await screen.findAllByRole("button", { name: /pick date/i });
    fireEvent.click(pickButtons[0]);
    expect(await screen.findByText("Availability Modal")).toBeInTheDocument();
  });
});
