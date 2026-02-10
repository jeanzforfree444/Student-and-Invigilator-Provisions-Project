import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Provider } from "react-redux";

import { AdminDashboard } from "@/pages/admin/Dashboard";
import { createStoreInstance } from "@/state/store";

const apiFetchMock = vi.fn();

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

const announcements = [
  {
    id: 1,
    title: "Ops update",
    body: "First admin announcement.",
    image: "https://example.com/img1.jpg",
    published_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 2,
    title: "Second note",
    body: "Second admin announcement.",
    image: "https://example.com/img2.jpg",
    published_at: "2026-01-02T00:00:00Z",
  },
];

const emptyOk = { ok: true, json: async () => [], text: async () => "" };

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
      return Promise.resolve({ ok: true, json: async () => announcements, text: async () => "" });
    }
    return Promise.resolve(emptyOk);
  });
});

describe("AdminDashboard announcements panel", () => {
  it("loads 'all' audience announcements and renders the carousel", async () => {
    renderPage();

    await screen.findByText("Second admin announcement.");

    const sawAnnouncementsCall = apiFetchMock.mock.calls.some(
      (args) => typeof args[0] === "string" && args[0].includes("/announcements/?audience=all&active=true")
    );
    expect(sawAnnouncementsCall).toBe(true);
  });

  it("cycles to the next announcement", async () => {
    renderPage();
    await screen.findByText("Second admin announcement.");

    fireEvent.click(screen.getByLabelText("Next announcement"));

    await waitFor(() => {
      expect(screen.getByText("First admin announcement.")).toBeInTheDocument();
    });
  });

  it("wraps to the previous announcement from the first item", async () => {
    renderPage();
    await screen.findByText("Second admin announcement.");

    fireEvent.click(screen.getByLabelText("Next announcement"));
    await screen.findByText("First admin announcement.");
    fireEvent.click(screen.getByLabelText("Previous announcement"));

    await waitFor(() => {
      expect(screen.getByText("Second admin announcement.")).toBeInTheDocument();
    });
  });

  it("shows placeholder content when no announcements are returned", async () => {
    apiFetchMock.mockImplementationOnce((url: string) => {
      if (url.includes("/announcements/?audience=all&active=true")) {
        return Promise.resolve({ ok: true, json: async () => [], text: async () => "" });
      }
      return Promise.resolve(emptyOk);
    });

    renderPage();

    await screen.findByText(/Announcements for staff will appear here/i);
  });

  it("filters out expired announcements", async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/announcements/?audience=all&active=true")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { ...announcements[0], id: 3, body: "Valid", expires_at: "2999-01-01T00:00:00Z" },
            { ...announcements[0], id: 4, body: "Expired", expires_at: "2000-01-01T00:00:00Z" },
          ],
          text: async () => "",
        });
      }
      return Promise.resolve(emptyOk);
    });

    renderPage();

    await screen.findByText("Valid");
    expect(screen.queryByText("Expired")).not.toBeInTheDocument();
  });

  it("shows loading overlay while fetching", async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/announcements/?audience=all&active=true")) {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ ok: true, json: async () => announcements, text: async () => "" });
          }, 20);
        });
      }
      return Promise.resolve(emptyOk);
    });

    renderPage();

    expect(screen.getByText(/Loading announcements/i)).toBeInTheDocument();
    await screen.findByText("Second admin announcement.");
  });

  it("allows dot navigation to a specific announcement", async () => {
    renderPage();
    await screen.findByText("Second admin announcement.");

    const dots = screen.getAllByLabelText(/Go to announcement/i);
    fireEvent.click(dots[1]);

    await waitFor(() => {
      expect(screen.getByText("First admin announcement.")).toBeInTheDocument();
    });
  });
});
