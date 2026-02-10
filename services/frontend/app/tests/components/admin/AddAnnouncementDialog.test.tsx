import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@mui/material/Dialog", () => ({
  __esModule: true,
  default: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div>{children}</div> : null),
}));

import { AddAnnouncementDialog } from "@/components/admin/AddAnnouncementDialog";
import { createStoreInstance, setAnnouncementDraft } from "@/state/store";

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
        <AddAnnouncementDialog open onClose={() => undefined} />
      </QueryClientProvider>
    </Provider>
  );
};

describe("AddAnnouncementDialog", () => {
  beforeEach(() => {
    vi.useRealTimers();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ title: "Welcome" }),
      text: async () => "",
    });
  });

  it(
    "clears draft fields when Clear is clicked",
    () => {
      renderDialog();

      fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Welcome" } });
      fireEvent.change(screen.getByLabelText(/body/i), { target: { value: "Hello team" } });

      fireEvent.click(screen.getByRole("button", { name: /clear/i }));

      expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe("");
      expect((screen.getByLabelText(/body/i) as HTMLInputElement).value).toBe("");
    },
    10000
  );

  it("disables Post when image is missing", async () => {
    const store = createStoreInstance();
    store.dispatch(setAnnouncementDraft({
      title: "Welcome",
      body: "Hello",
      audience: "all",
      priority: 2,
      imageData: null,
      imageName: "",
      publishedAt: new Date().toISOString().slice(0, 16),
    }));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <AddAnnouncementDialog open onClose={() => undefined} />
        </QueryClientProvider>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /post/i })).toBeDisabled();
    });
  });

  it("submits announcement when fields are valid", async () => {
    const store = createStoreInstance();
    store.dispatch(setAnnouncementDraft({
      title: "Welcome",
      body: "Hello",
      audience: "all",
      priority: 2,
      imageData: "data:image/png;base64,abc",
      imageName: "test.png",
      publishedAt: new Date().toISOString().slice(0, 16),
    }));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <AddAnnouncementDialog open onClose={() => undefined} />
        </QueryClientProvider>
      </Provider>
    );

    fireEvent.click(screen.getByRole("button", { name: /post/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
  });
});
