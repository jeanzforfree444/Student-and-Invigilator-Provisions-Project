import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";

import { InvigilatorShifts } from "@/pages/invigilator/Shifts";
import { createStoreInstance } from "@/state/store";

const apiFetchMock = vi.fn();

vi.mock("@mui/material/Dialog", () => ({
  __esModule: true,
  default: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

const sampleShifts = [
  {
    id: 11,
    exam_name: "Monetary Policy",
    venue_name: "Main Hall",
    assigned_start: "2026-08-04T10:00:00",
    assigned_end: "2026-08-04T13:00:00",
    exam_length: 180,
    invigilator_name: "Jack",
    role: "assistant",
  },
];

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const store = createStoreInstance();

  return render(
    <MemoryRouter initialEntries={["/invigilator/shifts"]}>
      <Provider store={store}>
        <QueryClientProvider client={client}>
          <InvigilatorShifts />
        </QueryClientProvider>
      </Provider>
    </MemoryRouter>
  );
};

describe("Page - Invigilator Shifts", () => {
  beforeEach(() => {
    vi.useRealTimers();
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("available-covers")) {
        return Promise.resolve({ ok: true, json: async () => sampleShifts, text: async () => "" });
      }
      if (url.includes("/pickup/")) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 99 }), text: async () => "" });
      }
      return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
    });
  });

  it("renders available shifts and completes pickup flow", async () => {
    renderPage();

    await screen.findByText(/Monetary Policy/i);
    expect(screen.getByText(/Main Hall/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /pick up shift/i }));

    expect(await screen.findByText(/Confirm pickup/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() =>
      expect(
        apiFetchMock.mock.calls.find(
          (call) =>
            typeof call[0] === "string" &&
            call[0].includes("/invigilator-assignments/11/pickup/") &&
            (call[1] as RequestInit)?.method === "POST"
        )
      ).toBeTruthy()
    );

    await screen.findByText(/Shift picked up successfully/i);
  });

  it("shows empty state when no shifts exist", async () => {
    apiFetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: async () => [], text: async () => "" })
    );

    renderPage();

    await screen.findByText(/No shifts are available to pick up right now/i);
  });

  it("renders an error when the fetch fails", async () => {
    apiFetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, json: async () => ({}), text: async () => "Not found" })
    );

    renderPage();

    expect(screen.getByText(/Loading shifts/i)).toBeInTheDocument();
    await screen.findByText(/Not found/i);
  });

  it("opens the dialog with shift details", async () => {
    renderPage();
    await screen.findByText(/Monetary Policy/i);

    fireEvent.click(screen.getByRole("button", { name: /pick up shift/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Monetary Policy/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Main Hall/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Assistant invigilator/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Originally: Jack/i)).toBeInTheDocument();
  });
});
