import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";

import { AdminVenues } from "../../../src/pages/admin/Venues";
import { createStoreInstance, setVenuesPageUi } from "../../../src/state/store";
import * as api from "../../../src/utils/api";
import { vi } from "vitest";

vi.mock("../../../src/components/admin/DeleteConfirmationDialog", () => ({
  DeleteConfirmationDialog: ({ open, onConfirm }: any) =>
    open ? (
      <button type="button" onClick={onConfirm}>
        Confirm Delete
      </button>
    ) : null,
}));

/* ------------------------------------------------------------------ */
/* Test utilities */
/* ------------------------------------------------------------------ */

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderPage = () => {
  const queryClient = createQueryClient();

  const store = createStoreInstance();
  const utils = render(
    <Provider store={store}>
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AdminVenues />
        </QueryClientProvider>
      </MemoryRouter>
    </Provider>
  );
  return { store, ...utils };
};

/* ------------------------------------------------------------------ */
/* Fixtures */
/* ------------------------------------------------------------------ */

const venuesResponse = [
  {
    venue_name: "Main Hall",
    capacity: 120,
    venuetype: "exam_hall",
    is_accessible: true,
    qualifications: [],
    availability: [],
    provision_capabilities: ["Extra time"],
    exam_venues: [
      {
        exam_name: "Math 101",
        start_time: "2025-01-10T09:00:00Z",
        exam_length: 120,
      },
    ],
  },
  {
    venue_name: "Small Room",
    capacity: 20,
    venuetype: "classroom",
    is_accessible: false,
    qualifications: [],
    availability: [],
    provision_capabilities: [],
    exam_venues: [],
  },
];

/* ------------------------------------------------------------------ */
/* Mocks */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* Tests */
/* ------------------------------------------------------------------ */

describe("AdminVenues", () => {
  beforeAll(() => {
    vi.setConfig({ testTimeout: 15000 });
  });
  it("shows loading state initially", async () => {
    vi.spyOn(api, "apiFetch").mockReturnValue(
      new Promise(() => {}) as any
    );

    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText(/loading venues/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: false,
      text: async () => "Unable to load venues",
    } as any);

    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText(/unable to load venues/i)
    ).toBeInTheDocument();
  });

  it("renders venue table and summary chips", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => venuesResponse,
    } as any);

    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Venues")).toBeInTheDocument();

    expect(screen.getByText("Main Hall")).toBeInTheDocument();
    expect(screen.getByText("Small Room")).toBeInTheDocument();

    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();

    expect(screen.getByText("2 Venues")).toBeInTheDocument();
    expect(screen.getByText("1 Accessible")).toBeInTheDocument();
    expect(screen.getByText("1 Exam slots")).toBeInTheDocument();
  });

  it("filters venues using search input", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => venuesResponse,
    } as any);

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Main Hall");

    const search = screen.getByPlaceholderText(/search venues/i);
    await userEvent.type(search, "small");
    fireEvent.click(screen.getByLabelText(/apply search/i));

    expect(screen.getByText("Small Room")).toBeInTheDocument();
    expect(screen.queryByText("Main Hall")).not.toBeInTheDocument();
  });

  it("expands a row to show exam details", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => venuesResponse,
    } as any);

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Main Hall");

    const mainHallRow = screen.getByText("Main Hall").closest("tr")!;
    const expandButton = within(mainHallRow).getByRole("button");
    await userEvent.click(expandButton);

    expect(
      await screen.findByText(/exams in this venue/i)
    ).toBeInTheDocument();

    expect(screen.getByText("Math 101")).toBeInTheDocument();
    expect(screen.getByText("2h")).toBeInTheDocument();
  });

    it("selects rows and performs bulk delete", async () => {
    const apiSpy = vi.spyOn(api, "apiFetch").mockImplementation((url: string, options?: any) => {
      if (url.endsWith("/venues/")) {
        return Promise.resolve({ ok: true, json: async () => venuesResponse } as any);
      }
      if (url.includes("/venues/bulk-delete/") && options?.method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({}) } as any);
      }
      return Promise.resolve({ ok: true, json: async () => venuesResponse } as any);
    });

    const user = userEvent.setup();
    const { store } = renderPage();

    await screen.findByText("Main Hall");

    act(() => {
      store.dispatch(setVenuesPageUi({ deleteOpen: true, deleteTargets: ["Main Hall"] }));
    });

    await user.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith(
        expect.stringContaining("/venues/bulk-delete/"),
        expect.objectContaining({ method: "POST" })
      );
    }, { timeout: 15000 });
    });


  it("updates venue type successfully", async () => {
    vi.spyOn(api, "apiFetch").mockImplementation((url: string) => {
        if (url.endsWith("/venues/")) {
        return Promise.resolve({
            ok: true,
            json: async () => venuesResponse,
        } as any);
        }
        if (url.includes("/venues/Main%20Hall/")) {
        return Promise.resolve({
            ok: true,
            json: async () => ({}),
        } as any);
        }
        return Promise.resolve({ ok: false, text: async () => "Unknown" } as any);
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Main Hall");

    const select = screen.getAllByRole("combobox")[0];
    await userEvent.click(select);
    await userEvent.click(
      screen.getByRole("option", { name: /purple cluster/i })
    );

    expect(
      await screen.findByText(/updated venue type for main hall/i)
    ).toBeInTheDocument();
  });

  it("opens Add Venue dialog from FAB", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => venuesResponse,
    } as any);

    const user = userEvent.setup();
    renderPage();

    const fab = await screen.findByLabelText(/add venue/i);
    await userEvent.click(fab);

    expect(
      await screen.findByRole("dialog")
    ).toBeInTheDocument();
  });
});
