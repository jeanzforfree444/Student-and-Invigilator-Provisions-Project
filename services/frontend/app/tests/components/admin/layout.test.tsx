import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminLayout } from "@/components/admin/Layout";
import { setAuthSession, clearAuthSession } from "@/utils/api";
import { Provider } from "react-redux";
import { createStoreInstance } from "@/state/store";

describe("Components - AdminLayout", () => {
  const renderWithStore = (ui: React.ReactElement) => {
    const store = createStoreInstance();
    render(
      <Provider store={store}>
        {ui}
      </Provider>
    );
  };

  const renderLayout = (initialPath = "/admin") =>
    renderWithStore(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/admin/*" element={<AdminLayout />}>
            <Route index element={<div>Home Content</div>} />
            <Route path="exams" element={<div>Exams Content</div>} />
            <Route path="venues" element={<div>Venues Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

  afterEach(() => {
    clearAuthSession();
  });

  it ("renders all menu items", () => {
    renderLayout();
    const items = ["Home", "Exams", "Venues", "Calendar", "Invigilators"];
    items.forEach(item => {
      expect(screen.getByText(item)).toBeInTheDocument();
    });
  });

  it ("highlights the active menu item based on the current route", () => {
    renderLayout("/admin/exams");
    const activeLink = screen.getByRole("link", {name: "Exams" });
    expect(activeLink).toBeInTheDocument();
    const inactiveLink = screen.getByRole("link", {name: "Home" });
    expect(inactiveLink).toBeInTheDocument();

    expect(activeLink).toHaveStyle({ backgroundColor: "#e3f2fd" });
    expect(inactiveLink).not.toHaveStyle({ backgroundColor: "#e3f2fd" });
  });

  it ("items link to correct path", () => {
    renderLayout();
    expect(screen.getByText("Home").closest("a")).toHaveAttribute("href", "/admin");
    expect(screen.getByText("Exams").closest("a")).toHaveAttribute("href", "/admin/exams");
    expect(screen.getByText("Venues").closest("a")).toHaveAttribute("href", "/admin/venues");
    expect(screen.getByText("Calendar").closest("a")).toHaveAttribute("href", "/admin/calendar");
    expect(screen.getByText("Invigilators").closest("a")).toHaveAttribute("href", "/admin/invigilators");
    // Avatar button is present to open the account menu.
    expect(screen.getByLabelText(/account menu/i)).toBeInTheDocument();
  });

  it ("renders children in the outlet", () => {
    renderWithStore(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<div data-testid="child-content">Child Component</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Child Component")).toBeInTheDocument();
  });

  it ("renders the app bar", () => {
    renderLayout();
    const banner = screen.getByRole("banner");
    expect(banner).toBeInTheDocument();
  });

  it("shows invigilator link when admin has invigilator profile", async () => {
    setAuthSession("token", { username: "admin", invigilator_id: 12 });
    renderLayout();
    fireEvent.click(screen.getByLabelText(/account menu/i));
    expect(await screen.findByText("View Invigilator Dashboard")).toBeInTheDocument();
  });
});
