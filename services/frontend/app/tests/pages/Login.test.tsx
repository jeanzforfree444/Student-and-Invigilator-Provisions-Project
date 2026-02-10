import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock react-router-dom at the top level
const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: null }),
  };
});

// Import the component after mocking
import Login from "../../src/pages/Login";
import * as api from "../../src/utils/api";

/* ------------------------------------------------------------------ */
/* Test utilities */
/* ------------------------------------------------------------------ */
const renderLogin = () =>
  render(
    <Login />
  );

/* ------------------------------------------------------------------ */
/* Mocks */
/* ------------------------------------------------------------------ */
beforeEach(() => {
  vi.restoreAllMocks();
  navigateMock.mockReset();
  vi.spyOn(api, "getAuthToken").mockReturnValue(null);
  vi.spyOn(api, "getStoredRole").mockReturnValue(null);
  vi.spyOn(api, "setAuthSession").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/* Tests */
/* ------------------------------------------------------------------ */
describe("Login component", () => {
  it("renders login form with username, password and submit button", () => {
    renderLogin();

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i, {selector: "input"})).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  it("toggles password visibility when clicking the icon", async () => {
    renderLogin();

    const passwordInput = screen.getByLabelText(/password/i, {selector: "input"});
    const toggleButton = screen.getByLabelText(/show password/i);

    expect(passwordInput).toHaveAttribute("type", "password");

    await userEvent.click(toggleButton);

    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByLabelText(/hide password/i)).toBeInTheDocument();
  });

  it("shows loading indicator when submitting the form", async () => {
    renderLogin();

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i, {selector: "input"});
    const submitBtn = screen.getByRole("button", { name: /log in/i });

    await userEvent.type(usernameInput, "user");
    await userEvent.type(passwordInput, "pass");

    // mock fetch to never resolve to test loading state
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    await userEvent.click(submitBtn);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows error message on failed login", async () => {
    renderLogin();

    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ non_field_errors: ["Invalid credentials"] }),
      })
    ));

    await userEvent.type(screen.getByLabelText(/username/i), "wrong");
    await userEvent.type(screen.getByLabelText(/password/i, {selector: "input"}), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
  });

  it("handles server response with no session/token", async () => {
    renderLogin();

    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ user: { username: "testuser" } }),
      })
    ));

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i, {selector: "input"}), "pass");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/invalid server response/i)).toBeInTheDocument();
  });

  it("calls setAuthSession and navigates on successful login (admin role)", async () => {
    renderLogin();

    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          session: "abc123",
          user: { username: "admin", role: "admin" },
        }),
      })
    ));

    await userEvent.type(screen.getByLabelText(/username/i), "admin");
    await userEvent.type(screen.getByLabelText(/password/i, {selector: "input"}), "password");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(api.setAuthSession).toHaveBeenCalledWith("abc123", { username: "admin", role: "admin" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/admin", { replace: true }));
  });

  it("redirects if token already exists", async () => {
    vi.spyOn(api, "getAuthToken").mockReturnValue("token");
    vi.spyOn(api, "getStoredRole").mockReturnValue("invigilator");

    renderLogin();

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/invigilator", { replace: true }));
  });
});
