import { render, screen, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AdminExamDetails } from "@/pages/admin/Exam";
import { createStoreInstance } from "@/state/store";
import { apiFetch } from "@/utils/api";

// --------------------
// Mocks
// --------------------

vi.mock("@/utils/api", () => ({
  apiBaseUrl: "http://mock",
  apiFetch: vi.fn(),
}));

vi.mock("@/components/admin/EditExamDialog", () => ({
  EditExamDialog: () => <div data-testid="edit-dialog" />,
}));

vi.mock("@/components/admin/DeleteConfirmationDialog", () => ({
  DeleteConfirmationDialog: () => <div data-testid="delete-dialog" />,
}));

// --------------------
// Test data
// --------------------

const mockExam = {
  exam_id: 1,
  exam_name: "Intro to Programming",
  course_code: "CS101",
  exam_type: "ONCM",
  no_students: 120,
  exam_school: "computer_science",
  school_contact: "admin@example.com",
  exam_venues: [
    {
      examvenue_id: 1,
      exam: 1,
      venue_name: "Room 101",
      start_time: "2025-12-10T09:00:00Z",
      exam_length: 120,
      core: true,
      provision_capabilities: [],
    },
    {
      examvenue_id: 2,
      exam: 1,
      venue_name: "Room 102",
      start_time: "2025-12-10T09:00:00Z",
      exam_length: 120,
      core: false,
      provision_capabilities: [],
    },
  ],
};

// --------------------
// Helper
// --------------------

const renderPage = async () => {
  (apiFetch as any).mockResolvedValueOnce({
    ok: true,
    json: async () => mockExam,
  });

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const store = createStoreInstance();
  render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/exams/1"]}>
          <Routes>
            <Route path="/admin/exams/:examId" element={<AdminExamDetails />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
};

// --------------------
// Tests
// --------------------

describe("Pages-Admin-Exam", () => {
  it("renders loading state", () => {
    (apiFetch as any).mockResolvedValueOnce(new Promise(() => {}));

    const store = createStoreInstance();
    render(
      <Provider store={store}>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={["/admin/exams/1"]}>
            <Routes>
              <Route path="/admin/exams/:examId" element={<AdminExamDetails />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </Provider>
    );

    expect(screen.getByText(/loading exam/i)).toBeInTheDocument();
  });

  it("renders error state", async () => {
    (apiFetch as any).mockResolvedValueOnce({ ok: false });

    await renderPage();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("renders exam header and metadata", async () => {
    await renderPage();

    expect(await screen.findByText("Intro to Programming")).toBeInTheDocument();

    const examDetailsHeading = await screen.findByRole("heading", {name: /exam details/i,});
    const examDetailsPanel = examDetailsHeading.closest(".MuiPaper-root") as HTMLElement;

    expect(within(examDetailsPanel).getByText(/CS101/i)).toBeInTheDocument();
    expect(screen.getByText("On campus")).toBeInTheDocument();
    expect(screen.getByText(/Students/i)).toHaveTextContent("120");
    expect(screen.getByText("Computer Science")).toBeInTheDocument();
  });

  it("renders core and additional venues correctly", async () => {
    await renderPage();
    await waitFor(() => {expect(screen.queryByText(/loading exam/i)).not.toBeInTheDocument();});

    const mainVenueHeading = screen.getByRole("heading", {
      name: /main venue/i,
    });
    const mainVenuePanel = mainVenueHeading.closest(".MuiPaper-root") as HTMLElement;
    expect(mainVenuePanel).toBeInTheDocument();

    expect(within(mainVenuePanel!).getByText("Room 101")).toBeInTheDocument();
  });

  it("renders edit and delete actions", async () => {
    await renderPage();

    // Wait for the exam to finish loading
    await screen.findByText(/loading exam/i, {}, { timeout: 0 }).catch(() => {});
    await screen.findByText(/algorithms|intro|exam/i);

    expect(
        screen.getByRole("button", { name: /edit exam/i })
    ).toBeInTheDocument();

    expect(
        screen.getByRole("button", { name: /delete exam/i })
    ).toBeInTheDocument();
  });

});
