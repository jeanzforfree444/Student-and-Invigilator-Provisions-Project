import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

import { InvigilatorDashboard } from "@/pages/invigilator/Dashboard";
import { Provider } from "react-redux";
import { createStoreInstance } from "@/state/store";

const apiFetchMock = vi.fn();

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

const announcements = [
  {
    id: 11,
    title: "Invigilator note",
    body: "First invigilator announcement.",
    image: "https://example.com/img1.jpg",
    published_at: "2026-01-05T00:00:00Z",
  },
  {
    id: 12,
    title: "Invigilator note 2",
    body: "Second invigilator announcement.",
    image: "https://example.com/img2.jpg",
    published_at: "2026-01-06T00:00:00Z",
  },
];

const emptyOk = { ok: true, json: async () => [], text: async () => "" };

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const store = createStoreInstance();
  return render(
    <MemoryRouter initialEntries={["/invigilator"]}>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <InvigilatorDashboard />
        </QueryClientProvider>
      </Provider>
    </MemoryRouter>
  );
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string) => {
    if (url.includes("/announcements/?audience=invigilator&active=true")) {
      return Promise.resolve({ ok: true, json: async () => announcements, text: async () => "" });
    }
    return Promise.resolve(emptyOk);
  });
});

describe("InvigilatorDashboard announcements panel", () => {
  it("loads invigilator announcements", async () => {
    renderPage();

    await screen.findByText("Second invigilator announcement.");

    const sawAnnouncementsCall = apiFetchMock.mock.calls.some(
      (args) => typeof args[0] === "string" && args[0].includes("/announcements/?audience=invigilator&active=true")
    );
    expect(sawAnnouncementsCall).toBe(true);
  });

  it("navigates between announcements", async () => {
    renderPage();
    await screen.findByText("Second invigilator announcement.");

    fireEvent.click(screen.getByLabelText("Next announcement"));

    await waitFor(() => {
      expect(screen.getByText("First invigilator announcement.")).toBeInTheDocument();
    });
  });

  it("wraps to previous from the first announcement", async () => {
    renderPage();
    await screen.findByText("Second invigilator announcement.");

    fireEvent.click(screen.getByLabelText("Next announcement"));
    await screen.findByText("First invigilator announcement.");
    fireEvent.click(screen.getByLabelText("Previous announcement"));

    await waitFor(() => {
      expect(screen.getByText("Second invigilator announcement.")).toBeInTheDocument();
    });
  });

  it("renders placeholder when no announcements exist", async () => {
    apiFetchMock.mockImplementationOnce((url: string) => {
      if (url.includes("/announcements/?audience=invigilator&active=true")) {
        return Promise.resolve({ ok: true, json: async () => [], text: async () => "" });
      }
      return Promise.resolve(emptyOk);
    });

    renderPage();

    await screen.findByText(/The exams team will post important updates here/i);
  });

  it("filters out expired announcements", async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/announcements/?audience=invigilator&active=true")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { ...announcements[0], id: 21, body: "Valid invigilator", expires_at: "2999-01-01T00:00:00Z" },
            { ...announcements[0], id: 22, body: "Expired invigilator", expires_at: "2000-01-01T00:00:00Z" },
          ],
          text: async () => "",
        });
      }
      return Promise.resolve(emptyOk);
    });

    renderPage();

    await screen.findByText("Valid invigilator");
    expect(screen.queryByText("Expired invigilator")).not.toBeInTheDocument();
  });

  it("shows loading overlay while fetching", async () => {
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/announcements/?audience=invigilator&active=true")) {
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
    await screen.findByText("Second invigilator announcement.");
  });

  it("allows dot navigation to a specific announcement", async () => {
    renderPage();
    await screen.findByText("Second invigilator announcement.");

    const dots = screen.getAllByLabelText(/Go to announcement/i);
    fireEvent.click(dots[1]);

    await waitFor(() => {
      expect(screen.getByText("First invigilator announcement.")).toBeInTheDocument();
    });
  });
});
