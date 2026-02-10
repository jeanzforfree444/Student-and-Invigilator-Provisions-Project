import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { RequireRole } from "@/components/RequireRole";
import * as api from "@/utils/api";

vi.mock("@/utils/api", async () => {
  const actual = await vi.importActual<any>("@/utils/api");
  return {
    ...actual,
    getAuthToken: vi.fn(),
    getStoredRole: vi.fn(),
  };
});

const mockGetAuthToken = api.getAuthToken as unknown as ReturnType<typeof vi.fn>;
const mockGetStoredRole = api.getStoredRole as unknown as ReturnType<typeof vi.fn>;

describe("Components - RequireRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login if no token", () => {
    mockGetAuthToken.mockReturnValue(null);
    mockGetStoredRole.mockReturnValue("admin");

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route element={<RequireRole role="admin" />}>
            <Route path="/admin" element={<div>Admin Page</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("redirects to /login if no stored role", () => {
    mockGetAuthToken.mockReturnValue("token");
    mockGetStoredRole.mockReturnValue(null);

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route element={<RequireRole role="admin" />}>
            <Route path="/admin" element={<div>Admin Page</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("allows admins into invigilator routes", () => {
    mockGetAuthToken.mockReturnValue("token");
    mockGetStoredRole.mockReturnValue("admin");

    render(
      <MemoryRouter initialEntries={["/invigilator"]}>
        <Routes>
          <Route element={<RequireRole role="invigilator" />}>
            <Route path="/invigilator" element={<div>Invigilator Page</div>} />
          </Route>
          <Route path="/admin" element={<div>Admin Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Invigilator Page")).toBeInTheDocument();
  });

  it("redirects to /invigilator if stored role is invigilator but route requires admin", () => {
    mockGetAuthToken.mockReturnValue("token");
    mockGetStoredRole.mockReturnValue("invigilator");

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route element={<RequireRole role="admin" />}>
            <Route path="/admin" element={<div>Admin Page</div>} />
          </Route>
          <Route path="/invigilator" element={<div>Invigilator Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Invigilator Page")).toBeInTheDocument();
  });

  it("renders the outlet if stored role matches required role", () => {
    mockGetAuthToken.mockReturnValue("token");
    mockGetStoredRole.mockReturnValue("admin");

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route element={<RequireRole role="admin" />}>
            <Route path="/admin" element={<div>Admin Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Admin Page")).toBeInTheDocument();
  });
});
