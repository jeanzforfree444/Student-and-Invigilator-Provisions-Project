import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AddVenueDialog } from "@/components/admin/AddVenueDialog";
import { createStoreInstance } from "@/state/store";
import * as api from "@/utils/api";

vi.mock("@/utils/api", async () => {
  const actual = await vi.importActual<any>("@/utils/api");
  return {
    ...actual,
    apiFetch: vi.fn(),
    apiBaseUrl: "http://test-api",
  };
});

const mockedApiFetch = api.apiFetch as unknown as ReturnType<typeof vi.fn>;

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderComponent = (props?: Partial<React.ComponentProps<typeof AddVenueDialog>>) => {
  const store = createStoreInstance();
  const queryClient = createQueryClient();

  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <AddVenueDialog open onClose={vi.fn()} {...props} />
      </QueryClientProvider>
    </Provider>
  );
};

describe("Components - AddVenueDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog title and mandatory fields", () => {
    renderComponent();

    expect(screen.getByText("Add Venue")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /venue name/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /capacity/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /venue type/i })).toBeInTheDocument();
  });

  it("disables Add button until mandatory fields are filled", () => {
    renderComponent();

    const addButton = screen.getByRole("button", { name: /^add$/i });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: /venue name/i }), {
      target: { value: "Main Hall A" },
    });

    fireEvent.change(screen.getByRole("spinbutton", { name: /capacity/i }), {
      target: { value: 200 },
    });

    fireEvent.mouseDown(screen.getByRole("combobox", { name: /venue type/i }));
    fireEvent.click(screen.getByText("Main Hall"));

    expect(addButton).toBeEnabled();
  });

  it("allows toggling provision capabilities", () => {
    renderComponent();

    const chip = screen.getByText("Use of a computer");

    fireEvent.click(chip);
    expect(chip.closest(".MuiChip-root")).toHaveClass("MuiChip-filled");

    fireEvent.click(chip);
    expect(chip.closest(".MuiChip-root")).toHaveClass("MuiChip-outlined");
  });

  it("clears fields when Clear is clicked", () => {
    renderComponent();

    fireEvent.change(screen.getByLabelText(/venue name/i), { target: { value: "Room A" } });
    fireEvent.change(screen.getByLabelText(/capacity/i), { target: { value: "120" } });

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect((screen.getByLabelText(/venue name/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/capacity/i) as HTMLInputElement).value).toBe("");
  });

  it("submits form and calls API with correct payload", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ venue_name: "Main Hall A" }),
    } as Response);

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    renderComponent({ onClose, onSuccess });

    fireEvent.change(screen.getByRole("textbox", { name: /venue name/i }), {
      target: { value: "Main Hall A" },
    });

    fireEvent.change(screen.getByRole("spinbutton", { name: /capacity/i }), {
      target: { value: 300 },
    });

    fireEvent.mouseDown(screen.getByRole("combobox", { name: /venue type/i }));
    fireEvent.click(screen.getByText("Main Hall"));

    fireEvent.click(screen.getByText("Use of a computer"));

    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    });

    const [, fetchOptions] = mockedApiFetch.mock.calls[0];

    expect(JSON.parse(fetchOptions.body)).toMatchObject({
      venue_name: "Main Hall A",
      capacity: 300,
      venuetype: "main_hall",
      is_accessible: true,
      provision_capabilities: ["use_computer"],
    });

    expect(onSuccess).toHaveBeenCalledWith("Main Hall A");
    expect(onClose).toHaveBeenCalled();
  });

  it("disables Add button and shows loading state while submission is pending", async () => {
    mockedApiFetch.mockImplementation(() => new Promise(() => {}));

    renderComponent();

    fireEvent.change(screen.getByRole("textbox", { name: /venue name/i }), {
      target: { value: "Main Hall A" },
    });

    fireEvent.change(screen.getByRole("spinbutton", { name: /capacity/i }), {
      target: { value: 100 },
    });

    fireEvent.mouseDown(screen.getByRole("combobox", { name: /venue type/i }));
    fireEvent.click(screen.getByText("Main Hall"));

    const addButton = screen.getByRole("button", { name: /^add$/i });
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(addButton).toBeDisabled();
    });

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked and not pending", () => {
    const onClose = vi.fn();
    renderComponent({ onClose });

    fireEvent.click(screen.getByLabelText("close"));
    expect(onClose).toHaveBeenCalled();
  });
});
