import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditInvigilatorDialog } from "@/components/admin/EditInvigilatorDialog";
import { Provider } from "react-redux";
import { createStoreInstance } from "@/state/store";

const apiFetchMock = vi.fn();

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

const invigilator = {
  id: 1,
  preferred_name: "Pat",
  full_name: "Pat Invig",
  mobile: "07123",
  mobile_text_only: "",
  alt_phone: "",
  university_email: "pat@example.com",
  personal_email: "pat@example.org",
  notes: "",
  resigned: false,
  diet_contracts: [],
  qualifications: [],
  restrictions: [{ diet: "DEC_2025", restrictions: [], notes: "" }],
  availabilities: [],
};

const diets = [
  { id: 1, code: "DEC_2025", name: "December 2025", start_date: "2025-12-01", end_date: "2025-12-19", is_active: true },
];

const renderDialog = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  const store = createStoreInstance();

  return render(
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <EditInvigilatorDialog open invigilatorId={1} onClose={() => {}} />
      </QueryClientProvider>
    </Provider>
  );
};

describe.skip("EditInvigilatorDialog - diets", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
      const method = (options?.method || "GET").toUpperCase();
      if (method === "GET" && url.endsWith("/diets/")) {
        return Promise.resolve({ ok: true, json: async () => diets, text: async () => "" });
      }
      if (method === "GET" && url.includes("/invigilators/")) {
        return Promise.resolve({ ok: true, json: async () => invigilator, text: async () => "" });
      }
      if (method === "PUT") {
        return Promise.resolve({ ok: true, json: async () => invigilator, text: async () => "" });
      }
      return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
    });
  });

  it("shows diet names in availability chips", async () => {
    renderDialog();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(expect.stringMatching(/diets/), expect.anything()));
    await waitFor(() => expect(screen.getByText("December 2025")).toBeInTheDocument());
  });
});
