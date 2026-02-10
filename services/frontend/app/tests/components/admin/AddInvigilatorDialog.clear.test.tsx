import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@mui/material", async () => {
  const actual = await vi.importActual<any>("@mui/material");
  return {
    ...actual,
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div>{children}</div> : null,
  };
});

import { AddInvigilatorDialog } from "@/components/admin/AddInvigilatorDialog";
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
        <AddInvigilatorDialog open onClose={() => undefined} />
      </QueryClientProvider>
    </Provider>
  );
};

describe("AddInvigilatorDialog", () => {
  beforeEach(() => {
    vi.useRealTimers();
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(() =>
      Promise.resolve({ ok: true, json: async () => [], text: async () => "" })
    );
  });

  it(
    "clears draft fields when Clear is clicked",
    () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText(/preferred name/i), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Alex Smith" } });
    fireEvent.change(screen.getByLabelText(/university email/i), { target: { value: "alex@uni.edu" } });
    fireEvent.change(screen.getByLabelText(/personal email/i), { target: { value: "alex@example.com" } });

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect((screen.getByLabelText(/preferred name/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe("");
    },
    10000
  );
});
