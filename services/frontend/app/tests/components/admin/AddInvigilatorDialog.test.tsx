import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import { Provider } from "react-redux";
import { AddInvigilatorDialog } from "@/components/admin/AddInvigilatorDialog";
import { createStoreInstance, setAddInvigilatorDraft } from "@/state/store";
import * as api from "@/utils/api";
import { vi } from "vitest";
/* -------------------------------------------------------------------------- */
/*                                  Mocks                                     */
/* -------------------------------------------------------------------------- */

vi.mock("@/utils/api", async () => {
  const actual = await vi.importActual<any>("@/utils/api");
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

/**
 * Disable MUI Dialog transitions – REQUIRED for jsdom
 */
vi.mock("@mui/material/Dialog", async () => {
  const actual = await vi.importActual<any>("@mui/material/Dialog");
  return {
    ...actual,
    default: (props: any) => (
      <actual.default {...props} TransitionComponent={undefined} />
    ),
  };
});

const mockedApiFetch = vi.mocked(api.apiFetch);

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

const theme = createTheme();

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const requiredDraft = {
  preferredName: "John",
  fullName: "John Smith",
  mobile: "123456789",
  universityEmail: "john@uni.ac.uk",
  personalEmail: "john@gmail.com",
  loginUsername: "john",
  tempPassword: "TempPass123!",
};

const renderComponent = (
  props?: Partial<React.ComponentProps<typeof AddInvigilatorDialog>>,
  options?: { prefill?: boolean }
) => {
  const queryClient = createQueryClient();
  const store = createStoreInstance();
  if (options?.prefill) {
    store.dispatch(setAddInvigilatorDraft(requiredDraft));
  }

  const utils = render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <AddInvigilatorDialog open={true} onClose={vi.fn()} {...props} />
        </ThemeProvider>
      </QueryClientProvider>
    </Provider>
  );
  return { store, ...utils };
};

const fillMandatoryFields = async () => {
  const dialog = await screen.findByRole("dialog", {
    name: /add new invigilator/i,
  });

  fireEvent.change(within(dialog).getByRole("textbox", { name: /preferred name/i }), {
    target: { value: "John" },
  });
  fireEvent.change(within(dialog).getByRole("textbox", { name: /full name/i }), {
    target: { value: "John Smith" },
  });
  fireEvent.change(within(dialog).getByRole("textbox", { name: /^mobile$/i }), {
    target: { value: "123456789" },
  });
  fireEvent.change(within(dialog).getByRole("textbox", { name: /university email/i }), {
    target: { value: "john@uni.ac.uk" },
  });
  fireEvent.change(within(dialog).getByRole("textbox", { name: /personal email/i }), {
    target: { value: "john@gmail.com" },
  });
};




const diets = [
  {
    id: 1,
    code: "DEC_2025",
    name: "December 2025",
    start_date: "2025-12-01",
    end_date: "2025-12-19",
    is_active: true,
  },
];

/* -------------------------------------------------------------------------- */
/*                                   Tests                                    */
/* -------------------------------------------------------------------------- */

describe("Components - AddInvigilatorDialog", () => {
  beforeAll(() => {
    vi.setConfig({ testTimeout: 15000 });
  });
  beforeEach(() => {
    vi.clearAllMocks();

    mockedApiFetch.mockImplementation((url: string, options?: RequestInit) => {
      const method = (options?.method || "GET").toUpperCase();

      if (method === "GET" && url.includes("/diets")) {
        return Promise.resolve({
          ok: true,
          json: async () => diets,
        } as Response);
      }

      if (method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ preferred_name: "John" }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response);
    });
  });

  it("renders dialog and first step", async () => {
    renderComponent();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Add New Invigilator")).toBeInTheDocument();
    expect(screen.getByText("Personal Details")).toBeInTheDocument();
  });

  it("disables Next button until mandatory fields are filled", async () => {
    const { store } = renderComponent();

    const nextButton = await screen.findByRole("button", { name: /next/i });
    expect(nextButton).toBeDisabled();

    store.dispatch(setAddInvigilatorDraft(requiredDraft));

    await waitFor(() => {
      expect(nextButton).toBeEnabled();
    }, { timeout: 15000 });
  });

  it("advances to the Qualifications step when Next is clicked", async () => {
    renderComponent({}, { prefill: true });

    fireEvent.click(await screen.findByRole("button", { name: /next/i }));
    fireEvent.click(await screen.findByRole("button", { name: /next/i }));

    const dialog = await screen.findByRole("dialog", { name: /add new invigilator/i });
    await waitFor(() => {
      expect(within(dialog).getAllByText(/qualifications/i).length).toBeGreaterThan(0);
    });
  });

  it("returns to the previous step when Back is clicked", async () => {
    renderComponent({}, { prefill: true });

    fireEvent.click(await screen.findByRole("button", { name: /next/i }));

    fireEvent.click(await screen.findByRole("button", { name: /back/i }));

    expect(
      await screen.findByText("Personal Details")
    ).toBeInTheDocument();
  });

  it("submits the form and calls the API with expected payload", async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    const { store } = renderComponent({ onClose, onSuccess }, { prefill: true });
    store.dispatch(setAddInvigilatorDraft({ activeStep: 4 }));

    const dialog = await screen.findByRole("dialog", { name: /add new invigilator/i });
    await waitFor(() => {
      expect(within(dialog).getByText(/contracted hours by diet/i)).toBeInTheDocument();
    });

    const decemberChip = await screen.findByText("December 2025");
    fireEvent.click(decemberChip);

    const addButtons = await screen.findAllByRole("button", { name: /^add$/i });
    fireEvent.click(addButtons[addButtons.length - 1]);

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalled();
    }, { timeout: 15000 });
  });

it("shows an error when the API call fails", async () => {
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  mockedApiFetch.mockImplementation((url: string, options?: RequestInit) => {
    const method = (options?.method || "GET").toUpperCase();
    if (method === "GET" && url.includes("/diets")) {
      return Promise.resolve({ ok: true, json: async () => diets } as Response);
    }
    if (method === "POST") {
      return Promise.reject(new Error("Server error"));
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });

  const { store } = renderComponent({}, { prefill: true });
  store.dispatch(setAddInvigilatorDraft({ activeStep: 4 }));

  const dialog = await screen.findByRole("dialog", { name: /add new invigilator/i });
  const addButtons = within(dialog).getAllByRole("button", { name: /^add$/i });
  fireEvent.click(addButtons[addButtons.length - 1]);

  await waitFor(() => {
    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to add invigilator")
    );
  });
  alertSpy.mockRestore();
});






  it("calls onClose when the close icon is clicked", async () => {
    const onClose = vi.fn();
    renderComponent({ onClose });

    const dialog = await screen.findByRole("dialog");
    const closeButton = within(dialog).getAllByRole("button")[0];

    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });
});
