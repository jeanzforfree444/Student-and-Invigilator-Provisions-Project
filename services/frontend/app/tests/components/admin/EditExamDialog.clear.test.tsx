import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EditExamDialog } from "@/components/admin/EditExamDialog";
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
        <EditExamDialog open onClose={() => undefined} />
      </QueryClientProvider>
    </Provider>
  );
};

describe("EditExamDialog (create mode)", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string) =>
      Promise.resolve({ ok: true, json: async () => [], text: async () => "" })
    );
  });

  it("clears fields when Clear is clicked", () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText(/exam name/i), { target: { value: "Chem 101" } });
    fireEvent.change(screen.getByLabelText(/course code/i), { target: { value: "CHEM101" } });

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect((screen.getByLabelText(/exam name/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/course code/i) as HTMLInputElement).value).toBe("");
  });
});
