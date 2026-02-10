import { screen, fireEvent, waitFor } from "@testing-library/react";
import * as api from "../../../src/utils/api";
import { AdminStudents } from "../../../src/pages/admin/Students";
import { createStoreInstance } from "../../../src/state/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { render } from "@testing-library/react";

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const store = createStoreInstance();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={client}>
        {ui}
      </QueryClientProvider>
    </Provider>
  );
}

const mockStudents = [
  {
    student_id: "S001",
    student_name: "Alice Brown",
    exam_id: 1,
    exam_name: "Final Exam",
    course_code: "CS101",
    provisions: ["extra_time"],
    notes: null,
    exam_venue_id: null,
    exam_venue_caps: [],
    venue_name: null,
    venue_type: null,
    venue_accessible: null,
    required_capabilities: ["extra_time"],
    allowed_venue_types: [],
    matches_needs: false,
    allocation_issue: "Needs allocation",
    student_exam_id: 10,
  },
];

const mockVenues = {
  exam_id: 1,
  exam_name: "Final Exam",
  course_code: "CS101",
  exam_venues: [
    {
      examvenue_id: 5,
      exam: 1,
      venue_name: "Main Hall",
      start_time: "2024-01-01T10:00:00Z",
      exam_length: 120,
      core: true,
      provision_capabilities: ["extra_time"],
      venue_type: "hall",
      venue_accessible: true,
    },
  ],
};

describe("AdminStudents", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders students and counters", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockStudents,
    } as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockStudents,
    } as any);

    renderWithQueryClient(<AdminStudents />);

    expect(await screen.findByText("Students")).toBeInTheDocument();
    expect(await screen.findByText("Alice Brown")).toBeInTheDocument();
    expect(screen.getByText(/1 Needs allocation/i)).toBeInTheDocument();
    expect(screen.getByText(/1 With provisions/i)).toBeInTheDocument();
  });

  it("expands student row and shows details", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => mockStudents,
    } as any);

    renderWithQueryClient(<AdminStudents />);

    fireEvent.click(
      await screen.findByLabelText(/expand details/i)
    );

    expect(
        await screen.findByText(/required capabilities:\s*extra time/i)
    ).toBeInTheDocument();


    expect(
      screen.getByRole("button", { name: /change venue/i })
    ).toBeEnabled();
  });

  it("opens change venue dialog and saves", async () => {
    const fetchSpy = vi.spyOn(api, "apiFetch");

    // students
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStudents,
    } as any);

    // all students
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockStudents,
    } as any);

    // exam venues
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => mockVenues,
    } as any);

    // save mutation
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...mockStudents[0],
        exam_venue_id: 5,
        venue_name: "Main Hall",
        matches_needs: true,
      }),
    } as any);

    renderWithQueryClient(<AdminStudents />);

    fireEvent.click(await screen.findByLabelText(/expand details/i));
    fireEvent.click(await screen.findByRole("button", { name: /change venue/i }));

    expect(await screen.findByText(/change venue for alice brown/i)).toBeInTheDocument();

    fireEvent.click(await screen.findByText(/main hall/i));
    fireEvent.click(screen.getByText(/save/i));

    await waitFor(() =>
      expect(screen.queryByText(/change venue for/i)).not.toBeInTheDocument()
    );
  });

  it("shows empty state when no students match search", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => mockStudents,
    } as any);

    renderWithQueryClient(<AdminStudents />);

    fireEvent.change(
      await screen.findByPlaceholderText(/search students/i),
      { target: { value: "zzz" } }
    );

    fireEvent.click(screen.getByLabelText(/apply search/i));

    expect(
      await screen.findByText(/no student provision records found/i)
    ).toBeInTheDocument();
  });
});
