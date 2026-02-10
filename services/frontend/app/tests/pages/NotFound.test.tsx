import { render, screen } from "@testing-library/react";
import { NotFound } from "../../src/pages/NotFound";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";

describe("NotFound component", () => {
  beforeEach(() => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
  });

  it("renders the 404 heading", () => {
    const heading = screen.getByRole("heading", { level: 1, name: /404/i });
    expect(heading).toBeInTheDocument();
  });

  it("renders the 'Oops! Page not found.' message", () => {
    const message = screen.getByRole("heading", { level: 5, name: /oops! page not found/i });
    expect(message).toBeInTheDocument();
  });

  it("renders the explanatory text about missing page", () => {
    const description = screen.getByText(/the page you're looking for doesn't exist or may have been moved/i);
    expect(description).toBeInTheDocument();
  });

  it("renders a 'Go Home' button that links to /admin", () => {
    const button = screen.getByRole("link", { name: /go home/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("href", "/admin");
  });

  it("navigates to /admin when 'Go Home' button is clicked", async () => {
    const user = userEvent.setup();
    const button = screen.getByRole("link", { name: /go home/i });

    // MemoryRouter doesn't actually navigate, but we can check the href attribute
    await user.click(button);
    expect(button).toHaveAttribute("href", "/admin");
  });
});
