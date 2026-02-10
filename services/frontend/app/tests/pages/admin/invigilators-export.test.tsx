import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AdminInvigilators } from "@/pages/admin/Invigilators";

vi.mock("@mui/material", async () => {
  const actual = await vi.importActual<any>("@mui/material");
  return {
    ...actual,
    Select: ({ value, onChange, children, ...props }: any) => (
      <select value={value} onChange={onChange} {...props}>
        {children}
      </select>
    ),
    MenuItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  };
});

vi.mock("@mui/x-date-pickers", () => ({
  StaticDatePicker: () => <div data-testid="date-picker" />,
}));

vi.mock("@mui/x-date-pickers/LocalizationProvider", () => ({
  LocalizationProvider: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@mui/x-date-pickers/AdapterDayjs", () => ({
  AdapterDayjs: class {},
}));
const apiFetchMock = vi.fn();

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

const invigilators = [
  {
    id: 1,
    preferred_name: "Alice",
    full_name: "Alice Example",
    resigned: false,
  },
  {
    id: 2,
    preferred_name: "Bob",
    full_name: "Bob Example",
    resigned: false,
  },
];

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={["/admin/invigilators"]}>
      <QueryClientProvider client={queryClient}>
        <AdminInvigilators />
      </QueryClientProvider>
    </MemoryRouter>
  );
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
    const method = (options?.method || "GET").toUpperCase();
    if (method === "GET" && url.includes("/invigilators/")) {
      return Promise.resolve({ ok: true, json: async () => invigilators, text: async () => "" });
    }
    if (method === "POST" && url.includes("/invigilators/timetables/export/")) {
      return Promise.resolve({
        ok: true,
        blob: async () => new Blob(["export"], { type: "application/zip" }),
        text: async () => "",
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "content-disposition"
              ? 'attachment; filename="invigilators_timetables.zip"'
              : null,
        },
      });
    }
    return Promise.resolve({ ok: true, json: async () => [], text: async () => "" });
  });

  if (!("createObjectURL" in URL)) {
    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(), configurable: true });
  }
  if (!("revokeObjectURL" in URL)) {
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
  }
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

describe.skip("AdminInvigilators export flow", () => {
  it("opens the export dialog and posts selected options", async () => {
    console.log("TEST: render page");
    renderPage();

    console.log("TEST: wait for invigilators to render");
    await screen.findByText("Alice");

    console.log("TEST: select all");
    fireEvent.click(screen.getByRole("button", { name: /select all 2 invigilators/i }));
    console.log("TEST: choose export action");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "export" } });

    console.log("TEST: open export dialog");
    fireEvent.click(await screen.findByTestId("bulk-action-export"));
    await screen.findByText(/export timetables/i);

    console.log("TEST: toggle provisions");
    fireEvent.click(screen.getByLabelText(/include student provisions/i));
    console.log("TEST: click export");
    fireEvent.click(screen.getByRole("button", { name: /^export$/i }));

    console.log("TEST: wait for export call");
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "http://api.test/invigilators/timetables/export/",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            invigilator_ids: [1, 2],
            only_confirmed: false,
            include_cancelled: false,
            include_provisions: true,
          }),
        })
      )
    );

    console.log("TEST: done");
    await waitFor(() =>
      expect(apiFetchMock.mock.calls.some((args) => args[0].includes("/invigilators/timetables/export/"))).toBe(true)
    );
  });
});
