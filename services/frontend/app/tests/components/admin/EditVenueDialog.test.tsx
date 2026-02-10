import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EditVenueDialog } from "@/components/admin/EditVenueDialog";
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

const renderComponent = (props?: Partial<React.ComponentProps<typeof EditVenueDialog>>) => {
  const store = createStoreInstance();
  const queryClient = createQueryClient();

  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <EditVenueDialog open venueId="1" onClose={vi.fn()} {...props} />
      </QueryClientProvider>
    </Provider>
  );
};

const mockVenue = {
  venue_name: "Main Hall",
  capacity: 120,
  venuetype: "main_hall",
  is_accessible: true,
  provision_capabilities: ["use_computer"],
};

describe("Components - EditVenueDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedApiFetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
          ? input.url
          : input.toString();

      if (init?.method === "PUT") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ venue_name: "Main Hall" }),
          text: async () => JSON.stringify({ venue_name: "Main Hall" }),
        } as Response);
      }

      if (url.includes("/venues/") && !url.endsWith("/venues/")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockVenue,
          text: async () => JSON.stringify(mockVenue),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
        text: async () => "{}",
      } as Response);
    });
  });

  it("shows loading state while fetching venue", async () => {
    renderComponent();

    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    );
  });

  it("renders fetched venue data", async () => {
    renderComponent();

    expect(await screen.findByRole("textbox", { name: /venue name/i })).toHaveValue(
      "Main Hall"
    );

    expect(screen.getByRole("spinbutton", { name: /capacity/i })).toHaveValue(120);

    expect(screen.getByRole("combobox", { name: /venue type/i })).toHaveTextContent(
      /main hall/i
    );

    expect(screen.getByRole("checkbox", { name: /accessible/i })).toBeChecked();
  });

  it("toggles provision capabilities when chips are clicked", async () => {
    renderComponent();

    const chip = await screen.findByText(/use of a computer/i);

    fireEvent.click(chip);
    fireEvent.click(chip);

    expect(chip).toBeInTheDocument();
  });

  it("disables Save button when mandatory fields are missing", async () => {
    renderComponent();

    const venueName = await screen.findByRole("textbox", { name: /venue name/i });

    fireEvent.change(venueName, { target: { value: "" } });

    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("submits updated venue and calls API", async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    renderComponent({ onClose, onSuccess });

    await screen.findByRole("textbox", { name: /venue name/i });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        expect.stringContaining("/venues/1/"),
        expect.objectContaining({ method: "PUT" })
      )
    );

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSuccess).toHaveBeenCalledWith("Main Hall");
  });

  it("resets to original values when Clear is clicked", async () => {
    renderComponent();

    const nameInput = await screen.findByLabelText(/venue name/i);
    expect((nameInput as HTMLInputElement).value).toBe("Main Hall");

    fireEvent.change(nameInput, { target: { value: "Room B" } });
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    await waitFor(() => {
      expect((screen.getByLabelText(/venue name/i) as HTMLInputElement).value).toBe(
        "Main Hall"
      );
    });
  });

  it("displays error when venue fetch fails", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
      text: async () => "Error",
      json: async () => ({ message: "Error" }),
    } as Response);

    renderComponent();

    expect(await screen.findByText(/failed to load venue details/i)).toBeInTheDocument();
  });
});
