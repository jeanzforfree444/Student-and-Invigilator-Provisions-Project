import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
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

const diets = [
  {
    id: 1,
    code: "JAN_2026",
    name: "January 2026",
    start_date: "2026-01-01",
    end_date: "2026-01-31",
    is_active: true,
  },
  {
    id: 2,
    code: "FEB_2026",
    name: "February 2026",
    start_date: "2026-02-01",
    end_date: "2026-02-28",
    is_active: false,
  },
];

const exams = [
  {
    exam_id: 1,
    exam_name: "Diet Exam A",
    course_code: "DEA101",
    exam_school: "Test",
    no_students: 100,
    exam_venues: [
      {
        examvenue_id: 10,
        venue_name: "Hall A",
        start_time: "2026-01-10T09:00:00Z",
        exam_length: 120,
        core: true,
        provision_capabilities: [],
      },
    ],
  },
  {
    exam_id: 2,
    exam_name: "Diet Exam B",
    course_code: "DEB201",
    exam_school: "Test",
    no_students: 40,
    exam_venues: [
      {
        examvenue_id: 11,
        venue_name: "Hall B",
        start_time: "2026-02-05T09:00:00Z",
        exam_length: 60,
        core: true,
        provision_capabilities: [],
      },
    ],
  },
];

const invigilators = [
  {
    id: 1,
    diet_contracts: [{ diet: "JAN_2026", contracted_hours: 2 }],
    assignments: [
      {
        exam_venue: 10,
        assigned_start: "2026-01-10T09:00:00Z",
        assigned_end: "2026-01-10T11:00:00Z",
        break_time_minutes: 0,
        cancel: false,
      },
    ],
  },
  {
    id: 2,
    diet_contracts: [{ diet: "FEB_2026", contracted_hours: 2 }],
    assignments: [
      {
        exam_venue: 11,
        assigned_start: "2026-02-05T09:00:00Z",
        assigned_end: "2026-02-05T10:00:00Z",
        break_time_minutes: 0,
        cancel: false,
      },
    ],
  },
];

const venues = [{ venue_name: "Hall A" }, { venue_name: "Hall B" }];

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = createStoreInstance();
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <AdminDashboard />
        </QueryClientProvider>
      </MemoryRouter>
    </Provider>
  );
};

describe("AdminDashboard diet filtered stats", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    localStorage.clear();
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/exams/")) {
        return Promise.resolve({ ok: true, json: async () => exams });
      }
      if (url.includes("/invigilators/")) {
        return Promise.resolve({ ok: true, json: async () => invigilators });
      }
      if (url.includes("/venues/")) {
        return Promise.resolve({ ok: true, json: async () => venues });
      }
      if (url.includes("/invigilator-assignments/")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes("/students/provisions/")) {
        if (url.includes("diet=JAN_2026")) {
          return Promise.resolve({ ok: true, json: async () => [{ id: 1, exam_id: 1 }] });
        }
        if (url.includes("diet=FEB_2026")) {
          return Promise.resolve({ ok: true, json: async () => [{ id: 2, exam_id: 2 }] });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes("/diets/")) {
        return Promise.resolve({ ok: true, json: async () => diets });
      }
      if (url.includes("/notifications/")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      if (url.includes("/announcements/")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it("uses saved diet selection and filters stats to that diet", async () => {
    localStorage.setItem("adminDashboardDiet", "FEB_2026");
    renderPage();

    const label = await screen.findByText("Total Exams");
    const card = label.parentElement as HTMLElement;
    await waitFor(() => {
      expect(within(card).getByRole("heading", { level: 5 }).textContent).toBe("1");
    });
    expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);
  });

  it("filters contracts fulfilled by selected diet", async () => {
    localStorage.setItem("adminDashboardDiet", "JAN_2026");
    renderPage();

    const label = await screen.findByText("Contracts Fulfilled");
    const card = label.parentElement as HTMLElement;
    await waitFor(() => {
      expect(within(card).getByRole("heading", { level: 5 }).textContent).toBe("1");
    });
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });
});
