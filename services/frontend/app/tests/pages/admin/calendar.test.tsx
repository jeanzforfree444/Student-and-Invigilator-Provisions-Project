import React from "react";
import { BrowserRouter } from "react-router-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminCalendar } from "@/pages/admin/Calendar";
import { vi } from "vitest";

vi.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/admin/ExamDetailsPopup", () => ({
  __esModule: true,
  ExamDetailsPopup: ({ open }: { open: boolean }) => (open ? <div data-testid="mock-popup" /> : null),
}));

const mockExamData = [
  {
    id: 1,
    code: "CS101",
    subject: "Intro to Programming",
    department: "CS",
    mainVenue: "James Watt South - J15",
    mainStartTime: "2025-12-10T09:00",
    mainEndTime: "2025-12-10T11:00",
    venues: [
      { venue: "James Watt South - J15", startTime: "2025-12-10T09:00", endTime: "2025-12-10T11:00" },
      { venue: "Boyd Orr - LT1", startTime: "2025-12-10T09:00", endTime: "2025-12-10T11:00" },
    ],
  },
  {
    id: 2,
    code: "MATH201",
    subject: "Linear Algebra",
    department: "Math",
    mainVenue: "Boyd Orr - LT2",
    mainStartTime: "2025-12-10T14:00",
    mainEndTime: "2025-12-10T16:30",
    venues: [{ venue: "Boyd Orr - LT2", startTime: "2025-12-10T14:00", endTime: "2025-12-10T16:30" }],
  },
  {
    id: 3,
    code: "PHY301",
    subject: "Quantum Physics",
    department: "Physics",
    mainVenue: "Kelvin Building - LT",
    mainStartTime: "2025-12-11T09:00",
    mainEndTime: "2025-12-11T12:00",
    venues: [{ venue: "Kelvin Building - LT", startTime: "2025-12-11T09:00", endTime: "2025-12-11T12:00" }],
  },
];

const renderWithProviders = (ui: React.ReactNode) => {
  const queryClient = new QueryClient();
  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </BrowserRouter>
  );
};

const renderCalendar = () =>
  renderWithProviders(<AdminCalendar initialExams={mockExamData} fetchEnabled={false} />);

const getVisibleExam = (id: number) =>
  screen
    .queryAllByTestId(`exam-${id}`)
    .filter((el) => !el.hasAttribute("data-mui-internal-clone-element"));

describe("AdminCalendar", () => {
  beforeAll(() => {
    vi.setConfig({ testTimeout: 15000 });
  });
  beforeEach(() => vi.useFakeTimers({ now: new Date("2025-12-10T09:00:00") }));
  afterEach(() => vi.useRealTimers());

  it("renders title and initial date", () => {
    renderCalendar();
    expect(screen.getByText("Exams Calendar")).toBeInTheDocument();
    expect(screen.getByTestId("date-header")).toHaveTextContent(/Wednesday/);
    expect(screen.getByTestId("date-header")).toHaveTextContent(/10/);
    expect(screen.getByTestId("date-header")).toHaveTextContent(/December/);
    expect(screen.getByTestId("date-header")).toHaveTextContent(/2025/);
  });

  it("shows only exams scheduled for the current day", () => {
    renderCalendar();
    expect(screen.getByTestId("exam-1")).toBeInTheDocument();
    expect(screen.getByTestId("exam-2")).toBeInTheDocument();
    expect(screen.queryByTestId("exam-3")).not.toBeInTheDocument();
  });

  it("shows empty state for days without exams", () => {
    renderCalendar();
    const prevButton = screen.getByRole("button", { name: /Previous/i });
    fireEvent.click(prevButton); // 9th Dec
    expect(screen.getByText(/No exams scheduled today/i)).toBeInTheDocument();
  });

  it("navigates to next and previous days correctly", () => {
    renderCalendar();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(screen.getByTestId("date-header")).toHaveTextContent(/11/);

    fireEvent.click(screen.getByRole("button", { name: /Previous/i }));
    fireEvent.click(screen.getByRole("button", { name: /Previous/i }));
    expect(screen.getByTestId("date-header")).toHaveTextContent(/9/);
  });

  it("resets to today when 'Today' button is clicked", () => {
    renderCalendar();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    fireEvent.click(screen.getByRole("button", { name: /Today/i }));
    expect(screen.getByTestId("date-header")).toHaveTextContent(/10/);
  });

  it("filters exams by search query", () => {
    renderCalendar();
    const input = screen.getByPlaceholderText("Search exams...");
    fireEvent.change(input, { target: { value: "linear" } });
    fireEvent.click(screen.getByLabelText(/apply search/i));

    expect(screen.getByText("MATH201")).toBeInTheDocument();
    expect(screen.queryByText("CS101")).not.toBeInTheDocument();
  });

  it("opens popup when an exam is clicked", () => {
    renderCalendar();
    fireEvent.click(screen.getByTestId("exam-1"));
    expect(screen.getByTestId("mock-popup")).toBeInTheDocument();
  });

  it("toggles timeline view and renders bars", () => {
    renderCalendar();
    const timelineBtn = screen.getByTestId("timeline-btn");
    fireEvent.click(timelineBtn);

    const examBar = screen.getByTestId("exam-1");
    expect(examBar).toBeInTheDocument();
    const style = window.getComputedStyle(examBar);
    expect(style.backgroundColor).toBe("rgb(76, 175, 80)"); // CS department
  });

  it("renders grid pagination when more exams than page size", () => {
    const manyExams = Array.from({ length: 12 }, (_, i) => ({
      id: 100 + i,
      code: `CS${i}`,
      subject: `Subject ${i}`,
      department: "CS",
      mainVenue: "Venue",
      mainStartTime: "2025-12-10T10:00",
      mainEndTime: "2025-12-10T11:00",
      venues: [{ venue: "Venue", startTime: "2025-12-10T10:00", endTime: "2025-12-10T11:00" }],
    }));
    renderWithProviders(
      <AdminCalendar initialExams={[...mockExamData, ...manyExams]} fetchEnabled={false} />
    );
    const pagination = screen.getByRole("navigation");
    expect(pagination).toBeInTheDocument();
    // Should show first page exams
    expect(screen.getByTestId("exam-1")).toBeInTheDocument();
  });

  it("does not render exams with missing start time", () => {
    const badExam = {
      id: 999,
      code: "BAD101",
      subject: "Bad Exam",
      department: "CS",
      mainVenue: "Nowhere",
      mainStartTime: "",
      mainEndTime: "",
      venues: [],
    };
    renderWithProviders(<AdminCalendar initialExams={[badExam]} fetchEnabled={false} />);
    expect(screen.queryByTestId("exam-999")).not.toBeInTheDocument();
  });

  it("renders timeline half-hour ruler correctly", () => {
    renderCalendar();

    // Switch to timeline view
    fireEvent.click(screen.getByTestId("timeline-btn"));

    const rulerLabels = screen.getAllByText(/[0-2]?\d:00|[0-2]?\d:30/);
    expect(rulerLabels.length).toBeGreaterThan(0);


    // Optional: verify first label is less than or equal to earliest exam
    const firstLabelText = rulerLabels[0].textContent!;
    const firstLabelMinutes = firstLabelText.split(":").reduce((acc, val, i) => acc + Number(val) * (i === 0 ? 60 : 1), 0);

    const earliestExamMinutes = mockExamData.reduce((min, exam) => {
      const start = new Date(exam.mainStartTime);
      const total = start.getHours() * 60 + start.getMinutes();
      return Math.min(min, total);
    }, 24 * 60);

    expect(firstLabelMinutes).toBeLessThanOrEqual(earliestExamMinutes);
  });
});
