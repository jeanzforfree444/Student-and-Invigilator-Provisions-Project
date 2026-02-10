import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { EditInvigilatorDialog } from "../../../src/components/admin/EditInvigilatorDialog";
import { createStoreInstance, setEditInvigilatorDraft } from "../../../src/state/store";
import * as apiModule from "../../../src/utils/api";

vi.mock("@mui/material/Dialog", async () => {
  const actual = await vi.importActual<any>("@mui/material/Dialog");
  return {
    ...actual,
    default: (props: any) => (
      <actual.default {...props} TransitionComponent={undefined} />
    ),
  };
});


const mockApiFetch = vi.spyOn(apiModule, "apiFetch");

const renderWithClient = (ui: React.ReactElement, storeOverride?: ReturnType<typeof createStoreInstance>) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const store = storeOverride ?? createStoreInstance();
  const utils = render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </Provider>
  );
  return { store, ...utils };
};

const mockInvigilator = {
  id: 1,
  preferred_name: "Sam",
  full_name: "Sam Invigilator",
  mobile: "07123456789",
  mobile_text_only: "",
  janet_txt: "sam123",
  alt_phone: "",
  university_email: "sam@university.ac.uk",
  personal_email: "sam@gmail.com",
  notes: "Some notes",
  resigned: false,
  contracted_hours: 20,
  qualifications: [{ qualification: "AKT_TRAINED" }],
  restrictions: [
    {
      diet: "DEC_2025",
      restrictions: ["accessibility_required"],
    },
  ],
};

const mockDiets = [
  {
    id: 1,
    code: "DEC_2025",
    name: "December 2025",
    start_date: "2025-12-01",
    end_date: "2025-12-19",
    is_active: true,
  },
];

describe("EditInvigilatorDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockApiFetch.mockImplementation((input: { toString: () => any; }) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/invigilators/1/")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockInvigilator,
          text: async () => JSON.stringify(mockInvigilator),
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          redirected: false,
        } as unknown as Response);
      }

      if (url.includes("/diets/")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockDiets,
          text: async () => JSON.stringify(mockDiets),
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          redirected: false,
        } as unknown as Response);
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
        text: async () => "{}",
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        redirected: false,
      } as unknown as Response);
    });
  });

  it("renders loading state initially", async () => {
    renderWithClient(
      <EditInvigilatorDialog open invigilatorId={1} onClose={vi.fn()} />
    );

    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    );
  });

  it("renders fetched invigilator data", async () => {
    renderWithClient(
      <EditInvigilatorDialog open invigilatorId={1} onClose={vi.fn()} />
    );

    const preferredName = await screen.findByRole("textbox", { name: /preferred name/i });
    expect(preferredName).toHaveValue("Sam");
    expect(screen.getByRole("textbox", { name: /full name/i })).toHaveValue("Sam Invigilator");
    expect(screen.getByRole("textbox", { name: /^mobile$/i })).toHaveValue("07123456789");
    expect(screen.getByRole("textbox", { name: /university email/i })).toHaveValue("sam@university.ac.uk");
  });

  it("disables Next button when mandatory fields are missing", async () => {
    renderWithClient(
      <EditInvigilatorDialog open invigilatorId={1} onClose={vi.fn()} />
    );

    await screen.findByRole("textbox", { name: /preferred name/i });

    fireEvent.change(screen.getByRole("textbox", { name: /preferred name/i }), {
      target: { value: "" },
    });

    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("allows navigating through steps", async () => {
    const { store } = renderWithClient(
      <EditInvigilatorDialog open invigilatorId={1} onClose={vi.fn()} />
    );
    await screen.findByRole("textbox", { name: /preferred name/i });

    store.dispatch(setEditInvigilatorDraft({ invigilatorId: 1, draft: { activeStep: 1, initialized: true } }));
    expect(await screen.findByLabelText("Senior Invigilator")).toBeInTheDocument();

    store.dispatch(setEditInvigilatorDraft({ invigilatorId: 1, draft: { activeStep: 2, initialized: true } }));
    expect(await screen.findByLabelText("Accessibility required")).toBeInTheDocument();

    store.dispatch(setEditInvigilatorDraft({ invigilatorId: 1, draft: { activeStep: 3, initialized: true } }));
    const decemberLabels = await screen.findAllByText("December 2025");
    expect(decemberLabels.length).toBeGreaterThan(0);
  });


  it("toggles qualification checkboxes", async () => {
    renderWithClient(
      <EditInvigilatorDialog open invigilatorId={1} onClose={vi.fn()} />
    );

    await screen.findByDisplayValue("Sam");

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    const aktCheckbox = screen.getByLabelText("AKT Trained");
    expect(aktCheckbox).toBeChecked();

    fireEvent.click(aktCheckbox);
    expect(aktCheckbox).not.toBeChecked();
  });

  it("submits updated data and calls API", async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    const store = createStoreInstance();
    store.dispatch(setEditInvigilatorDraft({
      invigilatorId: 1,
      draft: {
        preferredName: "Sam",
        fullName: "Sam Invigilator",
        mobile: "07123456789",
        universityEmail: "sam@university.ac.uk",
        personalEmail: "sam@gmail.com",
        activeStep: 3,
        initialized: true,
      },
    }));

    renderWithClient(
      <EditInvigilatorDialog
        open
        invigilatorId={1}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
      store
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining("/invigilators/1/"),
        expect.objectContaining({ method: "PUT" })
      )
    );
  });

  it("shows error message when fetch fails", async () => {
    mockApiFetch.mockImplementation((input: { toString: () => any; }) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/invigilators/1/")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: "Server Error",
          headers: new Headers(),
          redirected: false,
          text: async () => "Error",
          json: async () => ({ message: "Error" }),
        } as unknown as Response);
      }
      if (url.includes("/diets/")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
          text: async () => "[]",
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          redirected: false,
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
        text: async () => "{}",
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        redirected: false,
      } as unknown as Response);
    });

    renderWithClient(
      <EditInvigilatorDialog open invigilatorId={1} onClose={vi.fn()} />
    );

    expect(
      await screen.findByText(/failed to load invigilator details/i)
    ).toBeInTheDocument();
  });
});
