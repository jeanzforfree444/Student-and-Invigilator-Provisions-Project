import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import dayjs from "dayjs";

import { InvigilatorTimetable } from "@/pages/invigilator/Timetable";
import { createStoreInstance, setInvigilatorTimetableUi } from "@/state/store";

const apiFetchMock = vi.fn();

vi.mock("@mui/x-date-pickers/LocalizationProvider", () => ({
  LocalizationProvider: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@mui/x-date-pickers/AdapterDayjs", () => ({
  AdapterDayjs: function Adapter() {},
}));

vi.mock("@mui/x-date-pickers", () => ({
  StaticDatePicker: () => <div data-testid="date-picker" />,
}));

vi.mock("@mui/material/Drawer", () => ({
  __esModule: true,
  default: ({ open, children }: any) => (open ? <div>{children}</div> : null),
}));

vi.mock("@/components/Panel", () => ({
  Panel: ({ title, actions, children }: any) => (
    <div>
      {title}
      {actions}
      {children}
    </div>
  ),
}));

vi.mock("@/components/PillButton", () => ({
  PillButton: (props: any) => (
    <button type="button" {...props}>
      {props.children}
    </button>
  ),
}));

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
  getStoredUser: () => ({ invigilator_id: 1 }),
}));

const assignmentDate = dayjs().add(1, "day").hour(9).minute(0).second(0).millisecond(0);

const assignment = {
  id: 1,
  invigilator: 1,
  exam_name: "Biology 101",
  venue_name: "Main Hall",
  assigned_start: assignmentDate.toISOString(),
  assigned_end: assignmentDate.add(2, "hour").toISOString(),
  exam_start: assignmentDate.toISOString(),
  exam_length: 120,
  role: "assistant",
  confirmed: false,
  cancel: false,
  cover_filled: false,
};

const cancelledAssignment = {
  ...assignment,
  id: 2,
  cancel: true,
  confirmed: true,
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const store = createStoreInstance();
  const utils = render(
    <Provider store={store}>
      <QueryClientProvider client={client}>
        <InvigilatorTimetable />
      </QueryClientProvider>
    </Provider>
  );
  return { store, ...utils };
};

describe("InvigilatorTimetable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
      const method = (options?.method || "GET").toUpperCase();
      if (url.includes("/invigilator/assignments/") && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => [assignment] });
      }
      if (url.includes("/request-cancel/") && method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url.includes("/undo-cancel/") && method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it("renders schedule for selected day", async () => {
    const { store } = renderPage();
    store.dispatch(setInvigilatorTimetableUi({ selectedDate: assignmentDate.toISOString(), dateInput: assignmentDate.format("YYYY-MM-DD") }));

    expect(await screen.findByText(/Biology 101/i)).toBeInTheDocument();
    expect(screen.getByText(/Main Hall/i)).toBeInTheDocument();
  });

  it("opens drawer and requests cancellation", async () => {
    const { store } = renderPage();
    store.dispatch(setInvigilatorTimetableUi({ selectedDate: assignmentDate.toISOString(), dateInput: assignmentDate.format("YYYY-MM-DD") }));

    const detailsButton = await screen.findByTestId("view-details-1");
    fireEvent.click(detailsButton);

    await screen.findByText(/Shift details/i);
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Schedule conflict" } });
    fireEvent.click(screen.getByRole("button", { name: /submit request/i }));

    await waitFor(() =>
      expect(apiFetchMock.mock.calls.some((call) =>
        typeof call[0] === "string" &&
        call[0].includes("/request-cancel/") &&
        (call[1] as RequestInit)?.method === "POST"
      )).toBe(true)
    );
    await screen.findByText(/Cancellation requested/i);
  });

  it("withdraws cancellation for a cancelled shift", async () => {
    apiFetchMock.mockImplementationOnce((url: string) =>
      url.includes("/invigilator/assignments/")
        ? Promise.resolve({ ok: true, json: async () => [cancelledAssignment] })
        : Promise.resolve({ ok: true, json: async () => ({}) })
    );

    const { store } = renderPage();
    store.dispatch(setInvigilatorTimetableUi({ selectedDate: assignmentDate.toISOString(), dateInput: assignmentDate.format("YYYY-MM-DD") }));

    const detailsButton = await screen.findByTestId("view-details-2");
    fireEvent.click(detailsButton);

    await screen.findByRole("button", { name: /withdraw cancellation/i });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Back available" } });
    fireEvent.click(screen.getByRole("button", { name: /withdraw cancellation/i }));

    await waitFor(() =>
      expect(apiFetchMock.mock.calls.some((call) =>
        typeof call[0] === "string" &&
        call[0].includes("/undo-cancel/") &&
        (call[1] as RequestInit)?.method === "POST"
      )).toBe(true)
    );
    await screen.findByText(/Cancellation withdrawn/i);
  });

  it("shows empty state when no exams match", async () => {
    apiFetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: async () => [] })
    );

    const { store } = renderPage();
    store.dispatch(setInvigilatorTimetableUi({ selectedDate: assignmentDate.toISOString(), dateInput: assignmentDate.format("YYYY-MM-DD") }));

    await screen.findByText(/No exams on this day/i);
  });
});
