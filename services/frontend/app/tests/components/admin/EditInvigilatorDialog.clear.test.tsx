import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@mui/material/Dialog", () => ({
  __esModule: true,
  default: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
}));

import { EditInvigilatorDialog } from "@/components/admin/EditInvigilatorDialog";
import { createStoreInstance } from "@/state/store";

const apiFetchMock = vi.fn();

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

const renderDialog = () => {
  const store = createStoreInstance();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <EditInvigilatorDialog open invigilatorId={1} onClose={() => undefined} />
      </QueryClientProvider>
    </Provider>
  );
};

describe("EditInvigilatorDialog", () => {
  beforeEach(() => {
    vi.useRealTimers();
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/invigilators/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 1,
            preferred_name: "Alex",
            full_name: "Alex Smith",
            mobile: "123",
            mobile_text_only: "",
            alt_phone: "",
            university_email: "alex@uni.edu",
            personal_email: "alex@example.com",
            notes: "",
            resigned: false,
            diet_contracts: [],
            qualifications: [],
            restrictions: [],
          }),
          text: async () => "",
        });
      }
      if (url.includes("/diets/")) {
        return Promise.resolve({ ok: true, json: async () => [], text: async () => "" });
      }
      return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
    });
  });

  it(
    "resets to original values when Clear is clicked",
    async () => {
    renderDialog();

    const preferredNameInput = await screen.findByLabelText(/preferred name/i);
    expect((preferredNameInput as HTMLInputElement).value).toBe("Alex");

    fireEvent.change(preferredNameInput, { target: { value: "Jordan" } });
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    await waitFor(() => {
      expect((screen.getByLabelText(/preferred name/i) as HTMLInputElement).value).toBe("Alex");
    });
    },
    10000
  );
});
