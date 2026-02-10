import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DietManager } from "@/components/admin/DietManager";
import { Provider } from "react-redux";
import { createStoreInstance } from "@/state/store";

const apiFetchMock = vi.fn();

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

vi.mock("@mui/material/Dialog", () => ({
  __esModule: true,
  default: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
}));

vi.mock("@/components/admin/DeleteConfirmationDialog", () => ({
  DeleteConfirmationDialog: ({ open, confirmText, onConfirm }: any) =>
    open ? <button type="button" onClick={onConfirm}>{confirmText || "Confirm"}</button> : null,
}));

const diets = [
  {
    id: 1,
    code: "DEC_2025",
    name: "December 2025",
    start_date: "2025-12-01",
    end_date: "2025-12-19",
    restriction_cutoff: "2025-11-15",
    is_active: true,
  },
];

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const store = createStoreInstance();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </Provider>
  );
};

describe("DietManager", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => diets,
      text: async () => "",
    });
  });

  it("renders diets with names and restriction cutoff", async () => {
    renderWithClient(<DietManager />);
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(await screen.findByText("December 2025")).toBeInTheDocument();
    expect(screen.getByText(/Restriction cutoff: 15\/11\/2025/)).toBeInTheDocument();
  });

  it("shows validation error when saving with empty fields", async () => {
    renderWithClient(<DietManager />);
    await screen.findByText("December 2025");

    fireEvent.click(screen.getByRole("button", { name: /add diet/i }));
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByText(/code and name are required/i)).toBeInTheDocument();
  });

  it("creates a new diet", async () => {
    apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
      const method = (options?.method || "GET").toUpperCase();
      if (method === "GET" && url.includes("/diets/")) {
        return Promise.resolve({ ok: true, json: async () => diets, text: async () => "" });
      }
      if (method === "POST" && url.includes("/diets/")) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 2 }), text: async () => "" });
      }
      return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
    });

    renderWithClient(<DietManager />);
    await screen.findByText("December 2025");

    fireEvent.click(screen.getByRole("button", { name: /add diet/i }));
    fireEvent.change(screen.getByLabelText(/code/i), { target: { value: "JAN_2026" } });
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "January 2026" } });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() =>
      expect(apiFetchMock.mock.calls.some((call) =>
        typeof call[0] === "string" &&
        call[0].includes("/diets/") &&
        (call[1] as RequestInit)?.method === "POST"
      )).toBe(true)
    );
  });

  it("deletes a diet", async () => {
    apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
      const method = (options?.method || "GET").toUpperCase();
      if (method === "GET" && url.includes("/diets/")) {
        return Promise.resolve({ ok: true, json: async () => diets, text: async () => "" });
      }
      if (method === "DELETE" && url.includes("/diets/1/")) {
        return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
      }
      return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
    });

    renderWithClient(<DietManager />);
    await screen.findByText("December 2025");

    fireEvent.click(screen.getByRole("button", { name: /delete diet/i }));
    const confirmButton = await screen.findByRole("button", { name: /confirm/i });
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(apiFetchMock.mock.calls.some((call) =>
        typeof call[0] === "string" &&
        call[0].includes("/diets/1/") &&
        (call[1] as RequestInit)?.method === "DELETE"
      )).toBe(true)
    );
  });
});
