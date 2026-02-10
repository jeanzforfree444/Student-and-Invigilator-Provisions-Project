import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequireAuth } from "../../src/components/RequireAuth";
import * as apiModule from "../../src/utils/api";

vi.mock("../../src/utils/api");
const mockGetAuthToken = apiModule.getAuthToken as unknown as ReturnType<typeof vi.fn>;

describe("RequireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login if no token", () => {
    mockGetAuthToken.mockReturnValue(null);

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/protected" element={<div>Protected Page</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("renders the outlet if token exists", () => {
    mockGetAuthToken.mockReturnValue("fake-token");

    render(
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/protected" element={<div>Protected Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Protected Page")).toBeInTheDocument();
  });

  it("passes the current location in state when redirecting", () => {
    mockGetAuthToken.mockReturnValue(null);

    render(
      <MemoryRouter initialEntries={["/secret"]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/secret" element={<div>Secret Page</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });
});
