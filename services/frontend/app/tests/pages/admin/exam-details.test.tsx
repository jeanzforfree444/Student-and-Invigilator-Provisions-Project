import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminExamDetails } from "@/pages/admin/Exam";
import { Provider } from "react-redux";
import { createStoreInstance } from "@/state/store";

vi.mock("@mui/material", async () => {
  const actual = await vi.importActual<typeof import("@mui/material")>("@mui/material");
  return {
    ...actual,
    Tooltip: ({ title, children }: { title: React.ReactNode; children: React.ReactNode }) => (
      <div>
        {children}
        <div data-testid="tooltip">{title}</div>
      </div>
    ),
  };
});

const apiFetchMock = vi.fn();

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

const examResponse = {
  exam_id: 101,
  exam_name: "Test Exam",
  course_code: "TEST101",
  exam_type: "ONCM",
  no_students: 158,
  exam_school: "CS",
  school_contact: "test@example.com",
  exam_venues: [
    {
      examvenue_id: 1,
      exam: 101,
      venue_name: "Venue A",
      start_time: "2025-01-01T09:00:00Z",
      exam_length: 120,
      core: true,
      provision_capabilities: [],
      students_count: 103,
    },
    {
      examvenue_id: 2,
      exam: 101,
      venue_name: "Venue B",
      start_time: "2025-01-01T09:00:00Z",
      exam_length: 120,
      core: false,
      provision_capabilities: [],
      students_count: 52,
    },
    {
      examvenue_id: 3,
      exam: 101,
      venue_name: "Venue C",
      start_time: "2025-01-01T09:00:00Z",
      exam_length: 120,
      core: false,
      provision_capabilities: [],
      students_count: 3,
    },
  ],
};

const invigilatorsResponse = [
  { id: 1, preferred_name: "Inv A", full_name: "Invigilator A", resigned: false },
];

const assignmentsResponse = [
  { id: 1, invigilator: 1, exam_venue: 1, assigned_start: "2025-01-01T08:30:00Z", assigned_end: "2025-01-01T11:30:00Z" },
  { id: 2, invigilator: 1, exam_venue: 1, assigned_start: "2025-01-01T08:30:00Z", assigned_end: "2025-01-01T11:30:00Z" },
  { id: 3, invigilator: 1, exam_venue: 1, assigned_start: "2025-01-01T08:30:00Z", assigned_end: "2025-01-01T11:30:00Z" },
  { id: 4, invigilator: 1, exam_venue: 2, assigned_start: "2025-01-01T08:30:00Z", assigned_end: "2025-01-01T11:30:00Z" },
  { id: 5, invigilator: 1, exam_venue: 2, assigned_start: "2025-01-01T08:30:00Z", assigned_end: "2025-01-01T11:30:00Z" },
  { id: 6, invigilator: 1, exam_venue: 3, assigned_start: "2025-01-01T08:30:00Z", assigned_end: "2025-01-01T11:30:00Z" },
];

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = createStoreInstance();
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/admin/exams/101"]}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route path="/admin/exams/:examId" element={<AdminExamDetails />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    </Provider>
  );
};

describe("AdminExamDetails invigilator ratio", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/exams/101/")) {
        return Promise.resolve({ ok: true, json: async () => examResponse });
      }
      if (url.includes("/invigilators/")) {
        return Promise.resolve({ ok: true, json: async () => invigilatorsResponse });
      }
      if (url.includes("/invigilator-assignments/")) {
        return Promise.resolve({ ok: true, json: async () => assignmentsResponse });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it("calculates required invigilators per venue and shows ratio tooltips", async () => {
    renderPage();
    expect(await screen.findByText("Invigilators: 3 / 3")).toBeInTheDocument();
    expect(screen.getByText("Invigilators: 2 / 2")).toBeInTheDocument();
    expect(screen.getByText("Invigilators: 1 / 1")).toBeInTheDocument();

    const tooltips = await screen.findAllByTestId("tooltip");
    const tooltipHas = (text: string) => tooltips.some((node) => node.textContent?.includes(text));
    expect(tooltipHas("Target ratio: 1:50")).toBe(true);
    expect(tooltipHas("3/3 (103 students)")).toBe(true);
    expect(tooltipHas("2/2 (52 students)")).toBe(true);
    expect(tooltipHas("1/1 (3 students)")).toBe(true);
  });
});
