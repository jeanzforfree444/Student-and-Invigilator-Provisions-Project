import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import * as api from "../../../src/utils/api";
import React from "react";

import { AdminProfile } from "../../../src/pages/admin/Profile";
import { createStoreInstance, setAdminProfileUi } from "../../../src/state/store";

/* ------------------------------------------------------------------ */
/* Test Utilities */
/* ------------------------------------------------------------------ */

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const store = createStoreInstance();
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminProfile />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Test Data */
/* ------------------------------------------------------------------ */

const mockUser = {
  username: "admin",
  email: "admin@example.com",
  phone: "123456789",
  avatar: null,
  last_login: "2024-01-01T10:00:00Z",
};

const mockSessions: any[] = [];

/* ------------------------------------------------------------------ */
/* Tests */
/* ------------------------------------------------------------------ */

describe("AdminProfile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(api, "apiFetch").mockImplementation(
      async (url: string, options?: any) => {
        if (url.endsWith("/auth/me/") && !options) {
          return {
            ok: true,
            json: async () => mockUser,
          } as Response;
        }

        if (url.endsWith("/auth/sessions/")) {
          return {
            ok: true,
            json: async () => mockSessions,
          } as Response;
        }

        if (url.endsWith("/auth/me/") && options?.method === "PATCH") {
          return {
            ok: true,
            json: async () => ({
              ...mockUser,
              ...JSON.parse(options.body),
            }),
          } as Response;
        }

        throw new Error("Unhandled apiFetch call");
      }
    );

    vi.spyOn(api, "getAuthToken").mockReturnValue("token");
    vi.spyOn(api, "setAuthSession").mockImplementation(() => {});
  });

  it("shows loading state initially", () => {
    renderWithProviders();

    expect(
      screen.getByText(/loading profile/i)
    ).toBeInTheDocument();
  });

  it("renders user profile data", async () => {
    renderWithProviders();

    await waitFor(() =>
      expect(screen.getByText("admin")).toBeInTheDocument()
    );

    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText(/personal information/i)).toBeInTheDocument();
    expect(screen.getByText(/password & security/i)).toBeInTheDocument();
  });

  it("updates display name and saves profile", async () => {
    renderWithProviders();

    const nameInput = await screen.findByDisplayValue("admin");

    fireEvent.change(nameInput, {
      target: { value: "new-admin" },
    });

    fireEvent.click(
      screen.getAllByText("Save")[0]
    );

    await waitFor(() =>
      expect(api.apiFetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/me/"),
        expect.objectContaining({ method: "PATCH" })
      )
    );

    expect(
      await screen.findByText(/profile updated/i)
    ).toBeInTheDocument();
  });

  it("shows validation error when passwords do not match", async () => {
    renderWithProviders();

    await screen.findByText(/password & security/i);

    fireEvent.change(
      screen.getByLabelText(/^new password$/i),
      { target: { value: "Password123!" } }
    );

    fireEvent.change(
      screen.getByLabelText(/confirm new password/i),
      { target: { value: "Mismatch" } }
    );

    fireEvent.click(
      screen.getByText(/update password/i)
    );

    expect(
      await screen.findByText(/do not match/i)
    ).toBeInTheDocument();
  });

  it("renders empty sessions state", async () => {
    renderWithProviders();

    expect(
      await screen.findByText(/no active sessions\./i)
    ).toBeInTheDocument();
  });

  it("shows older sessions when extra sessions are visible", async () => {
    const sessions = [
      {
        key: "s1",
        is_current: true,
        is_active: true,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        ip_address: "127.0.0.1",
        user_agent: "Chrome",
      },
      {
        key: "s2",
        is_current: false,
        is_active: true,
        last_seen: "2024-01-01T10:00:00Z",
        created_at: "2024-01-01T09:00:00Z",
        ip_address: "10.0.0.2",
        user_agent: "Firefox",
      },
    ];

    vi.spyOn(api, "apiFetch").mockImplementation(
      async (url: string, options?: any) => {
        if (url.endsWith("/auth/me/") && !options) {
          return { ok: true, json: async () => mockUser } as Response;
        }
        if (url.endsWith("/auth/sessions/")) {
          return { ok: true, json: async () => sessions } as Response;
        }
        if (url.endsWith("/auth/me/") && options?.method === "PATCH") {
          return {
            ok: true,
            json: async () => ({
              ...mockUser,
              ...JSON.parse(options.body),
            }),
          } as Response;
        }
        throw new Error("Unhandled apiFetch call");
      }
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const store = createStoreInstance();
    render(
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AdminProfile />
          </MemoryRouter>
        </QueryClientProvider>
      </Provider>
    );

    expect(await screen.findByText(/active sessions/i)).toBeInTheDocument();
    store.dispatch(setAdminProfileUi({ extraSessionsToShow: 3 }));
    expect(await screen.findByText(/Firefox/i)).toBeInTheDocument();
  });

  it("signs out of other sessions", async () => {
    vi.spyOn(api, "apiFetch").mockImplementation(
      async (url: string, options?: any) => {
        if (url.endsWith("/auth/me/") && !options) {
          return { ok: true, json: async () => mockUser } as Response;
        }
        if (url.endsWith("/auth/sessions/")) {
          return { ok: true, json: async () => [] } as Response;
        }
        if (url.endsWith("/auth/sessions/revoke-others/") && options?.method === "POST") {
          return { ok: true, json: async () => ({}) } as Response;
        }
        if (url.endsWith("/auth/me/") && options?.method === "PATCH") {
          return {
            ok: true,
            json: async () => ({
              ...mockUser,
              ...JSON.parse(options.body),
            }),
          } as Response;
        }
        throw new Error("Unhandled apiFetch call");
      }
    );

    renderWithProviders();

    fireEvent.click(await screen.findByRole("button", { name: /sign out of other sessions/i }));
    expect(await screen.findByText(/signed out of other sessions/i)).toBeInTheDocument();
  });

  it("opens delete account confirmation dialog", async () => {
    renderWithProviders();

    const deleteButton = await screen.findByRole("button", {
        name: /delete my account/i,
    });

    fireEvent.click(deleteButton);

    expect(
        screen.getByText(/delete account\?/i)
    ).toBeInTheDocument();

  });
});
