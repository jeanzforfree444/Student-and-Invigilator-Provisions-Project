import React from "react";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { AdminDashboard } from "@/pages/admin/Dashboard";
import { createStoreInstance } from "@/state/store";

/* -------------------------------------------------------
 * Mock child components
 * ----------------------------------------------------- */
vi.mock("@/components/admin/UploadFile", () => ({
  __esModule: true,
  UploadFile: () => <div data-testid="mock-upload-file" />,
}));

vi.mock("@/components/admin/NotificationsPanel", () => ({
  __esModule: true,
  NotificationsPanel: ({ notifications }: { notifications: any[] }) => (
    <div data-testid="mock-notifications">
      {notifications.map((n, i) => (
        <div key={i} data-testid={`notification-${i}`}>
          {n.message}
        </div>
      ))}
    </div>
  ),
  notificationTypeStyles: {
    availability: { label: "Availability", color: "#000", bg: "#fff", icon: null },
  },
}));

vi.mock("@/components/PillButton", () => ({
  __esModule: true,
  PillButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

/* -------------------------------------------------------
 * Mock API
 * ----------------------------------------------------- */
const mockExams = [
  {
    exam_id: 1,
    exam_name: "Intro to Programming",
    course_code: "CS101",
    exam_venues: [
      {
        examvenue_id: 1,
        venue_name: "Room 101",
        // Far future so it is always "upcoming"
        start_time: "2099-12-10T09:00",
        exam_length: 120,
        core: true,
        provision_capabilities: [],
      },
    ],
  },
];

const mockInvigilators = [{ id: 1 }, { id: 2 }];
const mockVenues = [{ venue_name: "Room 101" }, { venue_name: "Room 102" }];
const mockNotifications = Array.from({ length: 6 }, (_, i) => ({
  message: `Notification ${i + 1}`,
}));

vi.mock("@/utils/api", () => ({
  __esModule: true,
  apiBaseUrl: "https://mockapi",
  apiFetch: vi.fn((url: string) => {
    if (url.includes("/exams")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockExams) });
    }
    if (url.includes("/invigilators")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockInvigilators) });
    }
    if (url.includes("/venues")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockVenues) });
    }
    if (url.includes("/notifications")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockNotifications) });
    }
    return Promise.resolve({ ok: false });
  }),
}));

/* -------------------------------------------------------
 * Test helper
 * ----------------------------------------------------- */
const renderWithProviders = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  const store = createStoreInstance();

  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <AdminDashboard />
      </QueryClientProvider>
    </Provider>
  );
};

/* -------------------------------------------------------
 * Tests
 * ----------------------------------------------------- */
describe("AdminDashboard", () => {
  it("renders the dashboard title and upload component", async () => {
    renderWithProviders();

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(await screen.findByTestId("mock-upload-file")).toBeInTheDocument();
  });

it("renders statistics panels with correct totals", async () => {
  renderWithProviders();

  const totalExamsLabel = await screen.findByText("Total Exams");
  const totalExamsCard = totalExamsLabel.closest("div")!;
  const totalExamsValue = within(totalExamsCard).getByRole("heading", { level: 5 });

  await waitFor(() => {
    expect(totalExamsValue.textContent).not.toBe("…");
  });

  expect(totalExamsValue).toHaveTextContent("1");

  const invigilatorsLabel = await screen.findByText("Total Invigilators");
  const invigilatorsCard = invigilatorsLabel.closest("div")!;
  const invigilatorsValue = within(invigilatorsCard).getByRole("heading", { level: 5 });

  await waitFor(() => {
    expect(invigilatorsValue.textContent).not.toBe("…");
  });

  expect(invigilatorsValue).toHaveTextContent("2");

  const venuesLabel = await screen.findByText("Active Venues");
  const venuesCard = venuesLabel.closest("div")!;
  const venuesValue = within(venuesCard).getByRole("heading", { level: 5 });

  await waitFor(() => {
    expect(venuesValue.textContent).not.toBe("…");
  });

  expect(venuesValue).toHaveTextContent("2");
});


  it("renders notifications and toggles show more / show less", async () => {
    renderWithProviders();

    // Initial 4
    for (let i = 0; i < 4; i++) {
      expect(await screen.findByTestId(`notification-${i}`)).toBeInTheDocument();
    }

    const showMore = screen.getByRole("button", { name: /show 2 more/i });
    const showLess = screen.getByRole("button", { name: /show less/i });

    expect(showLess).toBeDisabled();

    fireEvent.click(showMore);

    expect(await screen.findByTestId("notification-5")).toBeInTheDocument();
    expect(showMore).toBeDisabled();
    expect(showLess).not.toBeDisabled();

    fireEvent.click(showLess);

    await waitFor(() =>
      expect(screen.queryByTestId("notification-5")).not.toBeInTheDocument()
    );
  });

  it("calculates upcoming exams and unallocated exams correctly", async () => {
    renderWithProviders();

    const upcomingLabel = await screen.findByText("Upcoming Exams");
    const upcomingCard = upcomingLabel.closest("div")!;

    await waitFor(() =>
      expect(within(upcomingCard).getByText("1")).toBeInTheDocument()
    );

    const allocationLabel = await screen.findByText("Exams for Allocation");
    const allocationCard = allocationLabel.closest("div")!;
    expect(within(allocationCard).getByText("0")).toBeInTheDocument();
  });
});
