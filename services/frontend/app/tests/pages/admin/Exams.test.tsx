import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";

import { AdminExams } from "../../../src/pages/admin/Exams";
import { createStoreInstance, setExamsPageUi } from "../../../src/state/store";
import * as api from "../../../src/utils/api";

// --------------------
// Mocks
// --------------------

vi.mock("../../utils/api", async () => {
  const actual = await vi.importActual<any>("../../utils/api");
  return {
    ...actual,
  };
});


vi.mock("../../components/PillButton", () => ({
  PillButton: (props: any) => (
    <button type="button" {...props}>
      {props.children}
    </button>
  ),
}));

vi.mock("../../components/Panel", () => ({
  Panel: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("../../components/admin/DeleteConfirmationDialog", () => ({
  DeleteConfirmationDialog: ({ open, confirmText, onConfirm }: any) =>
    open ? (
      <button type="button" onClick={onConfirm}>
        {confirmText}
      </button>
    ) : null,
}));

vi.mock("../../components/admin/AddExamDialog", () => ({
  AddExamDialog: ({ open }: any) => (open ? <div>Add Exam Dialog</div> : null),
}));

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

// --------------------
// Test data
// --------------------

const mockExams = [
  {
    exam_id: 1,
    exam_name: "Computer Science 101",
    course_code: "CS101",
    no_students: 120,
    exam_school: "Engineering",
    school_contact: "cs@school.edu",
    venues: [],
    exam_venues: [
      {
        examvenue_id: 10,
        venue_name: "Main Hall",
        start_time: "2030-06-01T09:00:00.000Z",
        exam_length: 120,
        core: true,
        provision_capabilities: [],
      },
    ],
  },
];

// --------------------
// Helpers
// --------------------

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const store = createStoreInstance();
  const utils = render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminExams />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
  return { store, ...utils };
}

// --------------------
// Tests
// --------------------

describe("AdminExams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders exams from API", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => mockExams,
    });

    renderPage();

    expect(await screen.findByText("CS101")).toBeInTheDocument();
    expect(screen.getByText("Computer Science 101")).toBeInTheDocument();
  });

  it("allows selecting a row and shows edit/delete actions", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => mockExams,
    });

    const { store } = renderPage();

    await screen.findByText("CS101");

    store.dispatch(setExamsPageUi({ selectedIds: [1] }));

    await waitFor(() =>
      expect(screen.getByText(/1 selected/i)).toBeInTheDocument()
    );

    expect(
      await screen.findByRole("button", { name: /edit/i })
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: /delete/i })
    ).toBeInTheDocument();
  });

  it("hides Edit button when multiple rows are selected", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => [
        ...mockExams,
        {
          ...mockExams[0],
          exam_id: 2,
          course_code: "CS102",
        },
      ],
    });

    const { store } = renderPage();

    await screen.findByText("CS101");
    await screen.findByText("CS102");

    store.dispatch(setExamsPageUi({ selectedIds: [1, 2] }));

    expect(await screen.findByText(/2 selected/i)).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /edit/i })
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /delete/i })
    ).toBeInTheDocument();
  });

  it("shows loading state", () => {
    (api.apiFetch as any).mockImplementation(
      () => new Promise(() => {})
    );

    renderPage();

    expect(screen.getByText(/loading exams/i)).toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: false,
      text: async () => "API error",
    });

    renderPage();

    expect(
      await screen.findByText(/unable to load exams/i)
    ).toBeInTheDocument();
  });

  it("filters exams using the search input", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => [
        ...mockExams,
        {
          ...mockExams[0],
          exam_id: 2,
          course_code: "MATH200",
          exam_name: "Applied Maths",
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("CS101")).toBeInTheDocument();
    expect(screen.getByText("MATH200")).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/search exams/i);
    fireEvent.change(input, { target: { value: "MATH" } });
    fireEvent.click(screen.getByLabelText(/apply search/i));

    expect(await screen.findByText("MATH200")).toBeInTheDocument();
    expect(screen.queryByText("CS101")).not.toBeInTheDocument();
  });

  it("expands a row to show other venues", async () => {
    vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => [
        {
          ...mockExams[0],
          exam_venues: [
            mockExams[0].exam_venues[0],
            {
              examvenue_id: 11,
              venue_name: "Side Room",
              start_time: "2030-06-01T10:00:00.000Z",
              exam_length: 90,
              core: false,
              provision_capabilities: [],
            },
          ],
        },
      ],
    });

    renderPage();
    await screen.findByText("CS101");

    screen.getByLabelText(/expand exam venues/i).click();
    expect(await screen.findByText(/other venues for this exam/i)).toBeInTheDocument();
    expect(screen.getByText("Side Room")).toBeInTheDocument();
  });

  it("opens delete dialog and submits bulk delete", async () => {
    const fetchSpy = vi.spyOn(api, "apiFetch").mockResolvedValue({
      ok: true,
      json: async () => mockExams,
      text: async () => "",
    });

    renderPage();
    await screen.findByText("CS101");

    const rowHeader = screen.getByRole("rowheader", { name: "CS101" });
    const row = rowHeader.closest("tr");
    if (!row) throw new Error("Row not found");
    const checkbox = within(row).getByRole("checkbox");
    fireEvent.click(checkbox);

    await screen.findByText(/1 selected/i);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    const deleteButtons = await screen.findAllByRole("button", { name: /delete/i });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/exams/bulk-delete/"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
