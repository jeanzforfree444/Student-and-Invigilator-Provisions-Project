import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { InvigilatorLayout } from "@/components/invigilator/Layout";
import { setAuthSession, clearAuthSession } from "@/utils/api";
import { Provider } from "react-redux";
import { createStoreInstance } from "@/state/store";

describe("Components - InvigilatorLayout", () => {
  const renderLayout = (initialPath = "/invigilator") => {
    const store = createStoreInstance();
    return render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/invigilator/*" element={<InvigilatorLayout />}>
              <Route index element={<div>Home Content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>
    );
  };

  afterEach(() => {
    clearAuthSession();
  });

  it("shows view administrator dashboard when user is admin", async () => {
    setAuthSession("token", { username: "admin", is_staff: true, is_superuser: true });
    renderLayout();
    fireEvent.click(screen.getByLabelText(/account menu/i));
    expect(await screen.findByText("View Administrator Dashboard")).toBeInTheDocument();
  });
});
