import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvigilatorDashboard } from "@/pages/invigilator/Dashboard";
import { Provider } from "react-redux";
import { createStoreInstance } from "@/state/store";

const apiFetchMock = vi.fn();

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

const statsResponse = {
  total_shifts: 4,
  upcoming_shifts: 2,
  cancelled_shifts: 1,
  hours_assigned: 7,
  hours_upcoming: 4,
  restrictions: 0,
  availability_entries: 0,
  next_assignment: {
    exam_name: "Test Exam",
    venue_name: "Main Hall",
    start: "2026-08-04T09:00:00Z",
    end: "2026-08-04T12:00:00Z",
    role: "assistant",
  },
};

const announcementsResponse: any[] = [];
const notificationsResponse: any[] = [];

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = createStoreInstance();
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <QueryClientProvider client={client}>
          <InvigilatorDashboard />
        </QueryClientProvider>
      </Provider>
    </MemoryRouter>
  );
};

describe("InvigilatorDashboard", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/invigilator/stats/")) {
        return Promise.resolve({ ok: true, json: async () => statsResponse });
      }
      if (url.includes("/invigilator/notifications/")) {
        return Promise.resolve({ ok: true, json: async () => notificationsResponse });
      }
      if (url.includes("/announcements/")) {
        return Promise.resolve({ ok: true, json: async () => announcementsResponse });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it("shows next exam details from stats", async () => {
    renderPage();
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(await screen.findByText(/Test Exam/i)).toBeInTheDocument();
    expect(screen.getByText(/Main Hall/i)).toBeInTheDocument();
  });

  it("renders stats values", async () => {
    renderPage();
    const totalCardLabel = await screen.findByText(/Total shifts/i);
    const totalCard = totalCardLabel.closest("div");
    const upcomingCard = await screen.findByText(/Upcoming shifts/i);
    const cancelledCard = await screen.findByText(/Cancelled shifts/i);

    expect(totalCard && within(totalCard).getByText("4")).toBeInTheDocument();
    expect(upcomingCard && within(upcomingCard.closest("div") as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(cancelledCard && within(cancelledCard.closest("div") as HTMLElement).getByText("1")).toBeInTheDocument();
  });
});
