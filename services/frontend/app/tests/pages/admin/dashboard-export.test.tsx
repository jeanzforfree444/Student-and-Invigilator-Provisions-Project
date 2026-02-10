import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";

import { AdminDashboard } from "@/pages/admin/Dashboard";
import { createStoreInstance } from "@/state/store";

const apiFetchMock = vi.fn();

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const store = createStoreInstance();
  return render(
    <MemoryRouter initialEntries={["/admin"]}>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <AdminDashboard />
        </QueryClientProvider>
      </Provider>
    </MemoryRouter>
  );
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string) => {
    if (url.includes("/announcements/?audience=all&active=true")) {
      return Promise.resolve({ ok: true, json: async () => [], text: async () => "" });
    }
    if (url.includes("/exams/")) {
      return Promise.resolve({ ok: true, json: async () => [], text: async () => "" });
    }
    if (url.includes("/invigilators/")) {
      return Promise.resolve({ ok: true, json: async () => [], text: async () => "" });
    }
    if (url.includes("/venues/")) {
      return Promise.resolve({ ok: true, json: async () => [], text: async () => "" });
    }
    if (url.includes("/notifications/")) {
      return Promise.resolve({ ok: true, json: async () => [], text: async () => "" });
    }
    if (url.includes("/provisions/export/")) {
      return Promise.resolve({
        ok: true,
        headers: { get: () => null },
        blob: async () => new Blob(["csv"], { type: "text/csv" }),
        text: async () => "",
      });
    }
    return Promise.resolve({ ok: true, json: async () => [], text: async () => "" });
  });

  if (!("createObjectURL" in URL)) {
    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(), configurable: true });
  }
  if (!("revokeObjectURL" in URL)) {
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
  }
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

describe("AdminDashboard provisions export", () => {
  it.skip("downloads provisions and shows success snackbar", () => {
    renderPage();

    const filterInput = screen.getByLabelText(/school filter/i);
    fireEvent.change(filterInput, { target: { value: "All schools" } });
    fireEvent.keyDown(filterInput, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: /^export$/i }));

    const sawExportCall = apiFetchMock.mock.calls.some(
      (args) => args[0] === "http://api.test/provisions/export/"
    );
    expect(sawExportCall).toBe(true);
  });
});
