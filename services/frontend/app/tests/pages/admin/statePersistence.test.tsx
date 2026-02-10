import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, createTheme } from "@mui/material";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLayout } from "../../../src/components/admin/Layout";
import { AdminExams } from "../../../src/pages/admin/Exams";
import { AdminVenues } from "../../../src/pages/admin/Venues";
import { createStoreInstance, setExamsPrefs } from "../../../src/state/store";
import { Provider } from "react-redux";

const sampleExams = [
  {
    exam_id: 1,
    exam_name: "Algebra Exam",
    course_code: "EX-001",
    no_students: 30,
    exam_school: "Math",
    school_contact: "contact@example.com",
    venues: [],
    exam_venues: [
      { examvenue_id: 101, venue_name: "Hall A", start_time: "2025-03-01T09:00:00Z", exam_length: 120, core: true, provision_capabilities: [] },
    ],
  },
  {
    exam_id: 2,
    exam_name: "Biology Exam",
    course_code: "EX-002",
    no_students: 25,
    exam_school: "Science",
    school_contact: "contact@example.com",
    venues: [],
    exam_venues: [
      { examvenue_id: 102, venue_name: "Hall B", start_time: "2025-03-02T10:00:00Z", exam_length: 90, core: true, provision_capabilities: [] },
    ],
  },
  {
    exam_id: 3,
    exam_name: "Chemistry Exam",
    course_code: "EX-003",
    no_students: 28,
    exam_school: "Science",
    school_contact: "contact@example.com",
    venues: [],
    exam_venues: [
      { examvenue_id: 103, venue_name: "Hall C", start_time: "2025-03-03T12:00:00Z", exam_length: 60, core: true, provision_capabilities: [] },
    ],
  },
  {
    exam_id: 4,
    exam_name: "Design Exam",
    course_code: "EX-004",
    no_students: 20,
    exam_school: "Arts",
    school_contact: "contact@example.com",
    venues: [],
    exam_venues: [
      { examvenue_id: 104, venue_name: "Hall D", start_time: "2025-03-04T08:30:00Z", exam_length: 75, core: true, provision_capabilities: [] },
    ],
  },
  {
    exam_id: 5,
    exam_name: "Economics Exam",
    course_code: "EX-005",
    no_students: 35,
    exam_school: "Business",
    school_contact: "contact@example.com",
    venues: [],
    exam_venues: [
      { examvenue_id: 105, venue_name: "Hall E", start_time: "2025-03-05T14:00:00Z", exam_length: 110, core: true, provision_capabilities: [] },
    ],
  },
];

const sampleVenues = [
  {
    venue_name: "Venue A",
    capacity: 120,
    venuetype: "hall",
    is_accessible: true,
    qualifications: [],
    availability: [],
    provision_capabilities: [],
    exam_venues: [],
  },
  {
    venue_name: "Venue B",
    capacity: 80,
    venuetype: "lab",
    is_accessible: false,
    qualifications: [],
    availability: [],
    provision_capabilities: [],
    exam_venues: [],
  },
];

const apiFetchMock = vi.hoisted(() =>
  vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/exams/")) {
      return new Response(JSON.stringify(sampleExams), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.endsWith("/venues/")) {
      return new Response(JSON.stringify(sampleVenues), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  })
);

vi.mock("../../../src/utils/api", () => ({
  apiBaseUrl: "http://localhost/api",
  apiFetch: apiFetchMock,
  apiFetchPublic: apiFetchMock,
  clearAuthSession: vi.fn(),
  setAuthSession: vi.fn(),
  getStoredUser: vi.fn(() => ({ username: "Test Admin" })),
}));

const theme = createTheme({
  palette: {
    primary: { main: "#005399" },
    secondary: { main: "#7bc653" },
  },
});

const renderWithProviders = (initialEntry = "/admin/exams", storeOverride?: ReturnType<typeof createStoreInstance>) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const store = storeOverride ?? createStoreInstance();

  return render(
    <ThemeProvider theme={theme}>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="exams" element={<AdminExams />} />
                <Route path="venues" element={<AdminVenues />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </Provider>
    </ThemeProvider>
  );
};

const getTopExamCodes = (count = 3) =>
  screen
    .getAllByRole("link", { name: /EX-/i })
    .slice(0, count)
    .map((el) => el.textContent?.trim())
    .filter(Boolean);

describe("Admin table preference persistence", () => {
  beforeEach(() => {
    vi.useRealTimers();
    apiFetchMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it(
    "keeps exam sorting and search after visiting venues and returning",
    { timeout: 15000 },
    async () => {
    const store = createStoreInstance();
    store.dispatch(setExamsPrefs({ searchDraft: "Exam", searchQuery: "Exam", orderBy: "subject", order: "asc" }));
    renderWithProviders("/admin/exams", store);

    // Wait for exams to load
    await screen.findByText("Algebra Exam");

    await waitFor(() => expect(getTopExamCodes(3).length).toBeGreaterThanOrEqual(3));
    const initialTopThree = getTopExamCodes(3);

    // Navigate away to Venues
    fireEvent.click(screen.getByRole("link", { name: "Venues" }));
    await screen.findByText("Venue A");

    // Return to Exams
    fireEvent.click(screen.getByRole("link", { name: "Exams" }));
    await screen.findByText("Algebra Exam");

    expect(getTopExamCodes(3)).toEqual(initialTopThree);
    expect(screen.getByPlaceholderText(/search exams/i)).toHaveValue("Exam");
  });
});
