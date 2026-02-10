import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";

import { AdminStudents } from "@/pages/admin/Students";
import { createStoreInstance, setStudentsPageUi } from "@/state/store";

const apiFetchMock = vi.fn();

vi.mock("@mui/material/Dialog", () => ({
  __esModule: true,
  default: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
}));

vi.mock("@mui/material/Collapse", () => ({
  __esModule: true,
  default: ({ in: inProp, children }: { in: boolean; children: React.ReactNode }) =>
    inProp ? <div>{children}</div> : null,
}));

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

const baseRow = {
  student_id: "S1",
  student_name: "Alice",
  exam_id: 1,
  exam_name: "Chem 101",
  course_code: "CHEM101",
  provisions: ["separate_room_on_own"],
  notes: "",
  exam_venue_id: 11,
  exam_venue_caps: [],
  venue_name: "Hall A",
  venue_type: "hall",
  venue_accessible: false,
  required_capabilities: ["separate_room_on_own"],
  allowed_venue_types: [],
  matches_needs: false,
  allocation_issue: "Venue is missing required provisions",
  manual_allocation_override: false,
  student_exam_id: 101,
};

const manualRow = {
  ...baseRow,
  student_id: "S2",
  student_name: "Bob",
  exam_id: 2,
  exam_name: "Bio 101",
  course_code: "BIO101",
  matches_needs: true,
  allocation_issue: null,
  manual_allocation_override: true,
  student_exam_id: 202,
};

const otherIssueRow = {
  ...baseRow,
  student_id: "S3",
  student_name: "Cara",
  exam_id: 3,
  exam_name: "Stats 101",
  course_code: "STAT101",
  allocation_issue: "Venue type not allowed",
  manual_allocation_override: false,
  student_exam_id: 303,
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(["student-provisions", "unallocated"], [baseRow]);
  queryClient.setQueryData(["student-provisions", "all"], [baseRow, manualRow, otherIssueRow]);
  const store = createStoreInstance();
  const view = render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <AdminStudents />
      </QueryClientProvider>
    </Provider>
  );
  return { view, store };
};

describe("AdminStudents manual allocation", () => {
  beforeEach(() => {
    vi.useRealTimers();
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
      const method = (options?.method || "GET").toUpperCase();
      if (method === "GET" && url.includes("/students/provisions/")) {
        if (url.includes("unallocated=1")) {
          return Promise.resolve({ ok: true, json: async () => [baseRow], text: async () => "" });
        }
        return Promise.resolve({ ok: true, json: async () => [baseRow, manualRow], text: async () => "" });
      }
      if (method === "PATCH" && url.includes("/students/provisions/")) {
        return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
      }
      if (method === "POST" && url.includes("/students/provisions/refresh/")) {
        return Promise.resolve({ ok: true, json: async () => ({ updated: 1, skipped: 0, total_rows: 2 }), text: async () => "" });
      }
      return Promise.resolve({ ok: true, json: async () => ({}), text: async () => "" });
    });
  });

  it("shows confirm allocation and submits confirmation", async () => {
    const { store } = renderPage();

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    store.dispatch(setStudentsPageUi({
      openRows: { [`${baseRow.student_id}::${baseRow.exam_id}`]: true },
      confirmDialog: {
        studentExamId: baseRow.student_exam_id,
        studentName: baseRow.student_name,
        examName: baseRow.exam_name,
      },
    }));

    expect(await screen.findByText("Confirm venue allocation")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("shows unconfirm allocation and submits unconfirm", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(["student-provisions", "unallocated"], [baseRow]);
    queryClient.setQueryData(["student-provisions", "all"], [baseRow, manualRow, otherIssueRow]);
    const store = createStoreInstance();
    store.dispatch(
      setStudentsPageUi({
        openRows: {
          [`${baseRow.student_id}::${baseRow.exam_id}`]: true,
          [`${manualRow.student_id}::${manualRow.exam_id}`]: true,
        },
      })
    );
    render(
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <AdminStudents />
        </QueryClientProvider>
      </Provider>
    );

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Unconfirm allocation")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Unconfirm allocation"));

    expect(await screen.findByText("Unconfirm allocation?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unconfirm" }));

    await waitFor(() => {
      const patchCall = apiFetchMock.mock.calls.find(
        ([url, options]) =>
          typeof url === "string" &&
          url.includes("/students/provisions/") &&
          (options as RequestInit)?.method === "PATCH"
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse((patchCall?.[1] as RequestInit).body as string);
      expect(body.manual_allocation_override).toBe(false);
    });

    expect(await screen.findByText("Allocation unconfirmed.")).toBeInTheDocument();
  });

  it("refreshes allocations and shows snackbar", async () => {
    renderPage();

    await screen.findByText("Students");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      const refreshCall = apiFetchMock.mock.calls.find(
        ([url, options]) =>
          typeof url === "string" &&
          url.includes("/students/provisions/refresh/") &&
          (options as RequestInit)?.method === "POST"
      );
      expect(refreshCall).toBeTruthy();
    });

    expect(await screen.findByText("Refresh complete: 1 updated, 0 skipped.")).toBeInTheDocument();
  });

  it("only shows confirm allocation for missing required provisions", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(["student-provisions", "unallocated"], [baseRow, otherIssueRow]);
    queryClient.setQueryData(["student-provisions", "all"], [baseRow, otherIssueRow]);
    const store = createStoreInstance();
    store.dispatch(
      setStudentsPageUi({
        openRows: {
          [`${baseRow.student_id}::${baseRow.exam_id}`]: true,
          [`${otherIssueRow.student_id}::${otherIssueRow.exam_id}`]: true,
        },
      })
    );
    render(
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <AdminStudents />
        </QueryClientProvider>
      </Provider>
    );

    expect(screen.getAllByText("Confirm allocation")).toHaveLength(1);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Cara")).toBeInTheDocument();
  });

  it("only shows unconfirm allocation when manual override is true", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(["student-provisions", "unallocated"], [baseRow, manualRow]);
    queryClient.setQueryData(["student-provisions", "all"], [baseRow, manualRow]);
    const store = createStoreInstance();
    store.dispatch(
      setStudentsPageUi({
        openRows: {
          [`${baseRow.student_id}::${baseRow.exam_id}`]: true,
          [`${manualRow.student_id}::${manualRow.exam_id}`]: true,
        },
      })
    );
    render(
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <AdminStudents />
        </QueryClientProvider>
      </Provider>
    );

    expect(screen.getAllByText("Unconfirm allocation")).toHaveLength(1);
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows error snackbar when refresh fails", async () => {
    apiFetchMock.mockImplementationOnce((url: string, options?: RequestInit) => {
      const method = (options?.method || "GET").toUpperCase();
      if (method === "POST" && url.includes("/students/provisions/refresh/")) {
        return Promise.resolve({ ok: false, json: async () => ({}), text: async () => "Refresh failed." });
      }
      return Promise.resolve({ ok: true, json: async () => [baseRow, manualRow], text: async () => "" });
    });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const refreshCall = apiFetchMock.mock.calls.find(
      ([url, options]) =>
        typeof url === "string" &&
        url.includes("/students/provisions/refresh/") &&
        (options as RequestInit)?.method === "POST"
    );
    expect(refreshCall).toBeTruthy();
  });
});
