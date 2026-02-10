import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminInvigilatorProfile } from "@/pages/admin/Invigilator";
import { Provider } from "react-redux";
import { createStoreInstance } from "@/state/store";

vi.mock("@mui/material/Tooltip", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@mui/x-date-pickers/LocalizationProvider", () => ({
  __esModule: true,
  LocalizationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@mui/x-date-pickers/StaticDatePicker", () => ({
  __esModule: true,
  StaticDatePicker: () => <div data-testid="static-date-picker" />,
}));

const apiFetchMock = vi.fn();
let currentUserIsSenior = false;
let invigilatorIsSuperuser = false;

vi.mock("../../../src/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

const invigilatorResponse = {
  id: 1,
  user_id: 5,
  user_is_staff: false,
  user_is_superuser: false,
  user_is_senior_admin: false,
  preferred_name: "Morgan",
  full_name: "Morgan Example",
  mobile: null,
  mobile_text_only: null,
  janet_txt: null,
  alt_phone: null,
  university_email: null,
  personal_email: null,
  notes: null,
  resigned: false,
  diet_contracts: [],
  qualifications: [],
  restrictions: [],
  availabilities: [],
  assignments: [],
};

const renderPage = (opts: { isSeniorAdmin?: boolean; seedMeCache?: boolean; seedInvigilatorCache?: boolean } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const shouldSeed = opts.seedMeCache ?? Boolean(opts.isSeniorAdmin);
  const shouldSeedInvigilator = opts.seedInvigilatorCache ?? true;
  if (shouldSeed && opts.isSeniorAdmin) {
    client.setQueryData(["me"], { is_senior_admin: true });
  }
  if (shouldSeedInvigilator) {
    client.setQueryData(["invigilator", "1"], invigilatorIsSuperuser
      ? { ...invigilatorResponse, user_is_staff: true, user_is_superuser: true }
      : invigilatorResponse);
    client.setQueryData(["diets"], []);
  }
  currentUserIsSenior = Boolean(opts.isSeniorAdmin);
  const store = createStoreInstance();
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/admin/invigilators/1"]}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route path="/admin/invigilators/:id" element={<AdminInvigilatorProfile />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    </Provider>
  );
};

describe("AdminInvigilatorProfile", () => {
  beforeEach(() => {
    vi.useRealTimers();
    apiFetchMock.mockReset();
    currentUserIsSenior = false;
    invigilatorIsSuperuser = false;
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/auth/me/")) {
        return Promise.resolve({ ok: true, json: async () => ({ is_senior_admin: currentUserIsSenior }) });
      }
      if (url.includes("/invigilators/1/")) {
        return Promise.resolve({
          ok: true,
          json: async () =>
            invigilatorIsSuperuser
              ? { ...invigilatorResponse, user_is_staff: true, user_is_superuser: true }
              : invigilatorResponse,
        });
      }
      if (url.includes("/diets/")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it("opens confirmation dialog before promoting", async () => {
    renderPage({ isSeniorAdmin: true });
    const trigger = screen.getByText("Administrator").closest("button");
    if (!trigger) throw new Error("Administrator button not found");
    fireEvent.click(trigger);
    expect(await screen.findByText("Grant administrator privileges?")).toBeInTheDocument();
  });

  it("shows admin promotion button when senior admin info loads without cache", async () => {
    renderPage({ isSeniorAdmin: true, seedMeCache: false });
    expect(await screen.findByText("Administrator")).toBeInTheDocument();
  });

  it("hides admin promotion button for junior admins", async () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "Administrator" })).not.toBeInTheDocument();
  });

  it("shows senior admin promotion dialog for senior admins", async () => {
    invigilatorIsSuperuser = true;
    renderPage({ isSeniorAdmin: true });
    const trigger = await screen.findByRole("switch", { name: "Senior" });
    fireEvent.click(trigger);
    expect(await screen.findByText("Grant senior administrator privileges?")).toBeInTheDocument();
  });

  it("opens senior demote dialog when senior admin toggles off", async () => {
    invigilatorIsSuperuser = true;
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/auth/me/")) {
        return Promise.resolve({ ok: true, json: async () => ({ is_senior_admin: true }) });
      }
      if (url.includes("/invigilators/1/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...invigilatorResponse,
            user_is_staff: true,
            user_is_superuser: true,
            user_is_senior_admin: true,
          }),
        });
      }
      if (url.includes("/diets/")) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderPage({ isSeniorAdmin: true, seedInvigilatorCache: false });
    const trigger = await screen.findByRole("switch", { name: "Senior" });
    fireEvent.click(trigger);
    expect(await screen.findByText("Remove senior administrator privileges?")).toBeInTheDocument();
  });

  it("hides senior admin promotion button for junior admins", async () => {
    invigilatorIsSuperuser = true;
    renderPage();
    expect(screen.queryByLabelText("Senior")).not.toBeInTheDocument();
  });

  it("uses saved availability diet selection to filter availability list", async () => {
    localStorage.setItem("adminInvigilatorAvailabilityDiet", "FEB_2026");
    apiFetchMock.mockImplementation((url: string) => {
      if (url.includes("/auth/me/")) {
        return Promise.resolve({ ok: true, json: async () => ({ is_senior_admin: false }) });
      }
      if (url.includes("/invigilators/1/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...invigilatorResponse,
            availabilities: [
              { date: "2026-01-10", slot: "MORNING", available: true },
              { date: "2026-02-05", slot: "EVENING", available: true },
            ],
          }),
        });
      }
      if (url.includes("/diets/")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              id: 1,
              code: "JAN_2026",
              name: "January 2026",
              start_date: "2026-01-01",
              end_date: "2026-01-31",
              is_active: true,
            },
            {
              id: 2,
              code: "FEB_2026",
              name: "February 2026",
              start_date: "2026-02-01",
              end_date: "2026-02-28",
              is_active: false,
            },
          ],
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderPage({ seedInvigilatorCache: false });

    expect(await screen.findByText("Availability")).toBeInTheDocument();
    expect(screen.queryByText(/10\/01\/2026/)).not.toBeInTheDocument();
    expect(screen.getByText(/05\/02\/2026/)).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });
});
