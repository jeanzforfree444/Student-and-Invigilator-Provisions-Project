import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";

import { InvigilatorProfile } from "@/pages/invigilator/Profile";
import { createStoreInstance } from "@/state/store";

const apiFetchMock = vi.fn();
const setAuthSessionMock = vi.fn();
const clearAuthSessionMock = vi.fn();

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

vi.mock("@/components/admin/DeleteConfirmationDialog", () => ({
  DeleteConfirmationDialog: ({ open, title, confirmText, onConfirm, onClose }: any) =>
    open ? (
      <div>
        <p>{title}</p>
        <button type="button" onClick={onConfirm}>{confirmText || "Confirm"}</button>
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
  getAuthToken: () => "token",
  setAuthSession: (...args: any[]) => setAuthSessionMock(...args),
  clearAuthSession: () => clearAuthSessionMock(),
}));

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const userResponse = {
  username: "Jamie Invigilator",
  email: "jamie@uni.ac.uk",
  phone: "07123456789",
  avatar: null,
  last_login: "2026-02-01T10:00:00Z",
  is_senior_invigilator: true,
};

const sessionsResponse = [
  {
    key: "A1",
    last_seen: new Date().toISOString(),
    created_at: new Date(Date.now() - 86400000).toISOString(),
    is_current: true,
    is_active: true,
    ip_address: "10.0.0.1",
    user_agent: "Chrome",
  },
  {
    key: "B2",
    last_seen: new Date(Date.now() - 86400000 * 2).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    is_current: false,
    is_active: true,
    ip_address: "10.0.0.2",
    user_agent: "Firefox",
  },
];

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const store = createStoreInstance();
  return render(
    <MemoryRouter initialEntries={["/invigilator/profile"]}>
      <Provider store={store}>
        <QueryClientProvider client={client}>
          <InvigilatorProfile />
        </QueryClientProvider>
      </Provider>
    </MemoryRouter>
  );
};

describe("InvigilatorProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
      const method = (options?.method || "GET").toUpperCase();
      if (url.includes("/auth/me/") && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => userResponse });
      }
      if (url.includes("/auth/sessions/") && method === "GET") {
        return Promise.resolve({ ok: true, json: async () => sessionsResponse });
      }
      if (url.includes("/auth/me/") && method === "PATCH") {
        return Promise.resolve({ ok: true, json: async () => userResponse });
      }
      if (url.includes("/auth/me/") && method === "DELETE") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url.includes("/auth/sessions/revoke-others/") && method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      if (url.includes("/auth/sessions/revoke/") && method === "POST") {
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  });

  it("renders profile details and sessions", async () => {
    renderPage();

    expect(await screen.findByText("Jamie Invigilator")).toBeInTheDocument();
    expect(screen.getByText("Senior Invigilator")).toBeInTheDocument();
    expect(screen.getByText("jamie@uni.ac.uk")).toBeInTheDocument();

    expect(await screen.findByText(/Session A1/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show 1 more/i }));
    expect(await screen.findByText(/Session B2/i)).toBeInTheDocument();
  });

  it("updates profile name and calls PATCH", async () => {
    renderPage();
    const nameInput = await screen.findByDisplayValue("Jamie Invigilator");
    fireEvent.change(nameInput, { target: { value: "Jamie Updated" } });

    const saveButtons = screen.getAllByRole("button", { name: /^save$/i });
    fireEvent.click(saveButtons[0]);

    await waitFor(() =>
      expect(apiFetchMock.mock.calls.some((call) =>
        typeof call[0] === "string" &&
        call[0].includes("/auth/me/") &&
        (call[1] as RequestInit)?.method === "PATCH"
      )).toBe(true)
    );
  });

  it("shows password mismatch message", async () => {
    renderPage();
    const newPassword = await screen.findByLabelText(/^new password$/i);
    const confirmPassword = screen.getByLabelText(/^confirm new password$/i);

    fireEvent.change(newPassword, { target: { value: "Secret123!" } });
    fireEvent.change(confirmPassword, { target: { value: "Secret321!" } });

    fireEvent.click(screen.getByRole("button", { name: /update password/i }));
    await screen.findByText(/new passwords do not match/i);
  });

  it("deletes account and navigates to login", async () => {
    renderPage();
    await screen.findByText("Jamie Invigilator");

    fireEvent.click(screen.getByRole("button", { name: /delete my account/i }));
    const deleteDialog = await screen.findByText(/delete account\?/i);
    const dialog = deleteDialog.closest("div") as HTMLElement;
    fireEvent.click(within(dialog).getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith("/login", { replace: true });
    expect(clearAuthSessionMock).toHaveBeenCalled();
  });

  it("signs out of other sessions", async () => {
    renderPage();
    await screen.findByText("Jamie Invigilator");

    fireEvent.click(screen.getByRole("button", { name: /sign out of other sessions/i }));

    await waitFor(() =>
      expect(apiFetchMock.mock.calls.some((call) =>
        typeof call[0] === "string" &&
        call[0].includes("/auth/sessions/revoke-others/") &&
        (call[1] as RequestInit)?.method === "POST"
      )).toBe(true)
    );
  });
});
