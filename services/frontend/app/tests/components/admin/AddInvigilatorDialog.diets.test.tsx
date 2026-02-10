import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AddInvigilatorDialog } from "@/components/admin/AddInvigilatorDialog";
import { Provider } from "react-redux";
import { createStoreInstance, setAddInvigilatorDraft } from "@/state/store";

const apiFetchMock = vi.fn();

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

const diets = [
  { id: 1, code: "DEC_2025", name: "December 2025", start_date: "2025-12-01", end_date: "2025-12-19", is_active: true },
  { id: 2, code: "APR_2026", name: "April 2026", start_date: "2026-04-01", end_date: "2026-04-30", is_active: true },
];

const createClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity, cacheTime: Infinity },
      mutations: { retry: false },
    },
  });

const renderDialogWithStore = (store: ReturnType<typeof createStoreInstance>) => {
  const client = createClient();
  client.setQueryData(["diets"], diets);
  return render(
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <AddInvigilatorDialog open onClose={() => {}} />
      </QueryClientProvider>
    </Provider>
  );
};

const renderDialog = () => renderDialogWithStore(createStoreInstance());

describe("AddInvigilatorDialog - diets", () => {
  beforeEach(() => {
    vi.useRealTimers();
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
      const method = (options?.method || "GET").toUpperCase();
      if (method === "GET" && url.includes("/diets/")) {
        return Promise.resolve({ ok: true, json: async () => diets, text: async () => "" });
      }
      if (method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({ id: 123 }), text: async () => "" });
      }
      return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
    });
  });

  it("shows active diets by name in availability step and submits selection", async () => {
    const store = createStoreInstance();
    store.dispatch(
      setAddInvigilatorDraft({
        activeStep: 4,
        preferredName: "Pat",
        fullName: "Pat Invig",
        mobile: "07123",
        universityEmail: "pat@example.com",
        personalEmail: "pat@example.org",
        loginUsername: "pat",
        tempPassword: "TempPass123!",
        availabilityDiets: ["DEC_2025"],
      })
    );
    renderDialogWithStore(store);

    expect(screen.getAllByText("December 2025").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      const postCall = apiFetchMock.mock.calls.find(([, options]) => (options as any)?.method === "POST");
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall?.[1] as RequestInit).body as string);
      expect(body.restrictions[0].diet).toBe("DEC_2025");
    });
  }, 15000);

  it("keeps username in sync with updated university email until edited", async () => {
    const store = createStoreInstance();
    store.dispatch(
      setAddInvigilatorDraft({
        activeStep: 1,
        preferredName: "Pat",
        fullName: "Pat Invig",
        mobile: "07123",
        universityEmail: "pat@example.com",
        personalEmail: "pat@example.org",
        tempPassword: "TempPass123!",
        loginUsername: "",
      })
    );
    renderDialogWithStore(store);

    await waitFor(() => {
      expect(screen.getByLabelText(/Username/i)).toHaveValue("pat");
    });
  });
});
