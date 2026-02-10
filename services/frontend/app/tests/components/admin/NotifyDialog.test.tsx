import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";

import { NotifyDialog } from "@/components/admin/NotifyDialog";
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

const recipients = [
  { id: 1, name: "Alice", emails: ["alice@test.com"] },
  { id: 2, name: "Bob", emails: ["bob@test.com", "bob2@test.com"] },
];

const renderDialog = (props?: Partial<React.ComponentProps<typeof NotifyDialog>>) => {
  const store = createStoreInstance();
  return render(
    <Provider store={store}>
      <NotifyDialog open recipients={recipients} onClose={vi.fn()} {...props} />
    </Provider>
  );
};

describe("Components - NotifyDialog", () => {
  let originalLocation: Location;

  beforeAll(() => {
    originalLocation = window.location;
  });

  afterAll(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders recipients and count", () => {
    renderDialog();

    expect(screen.getByText("Sending to 2 invigilators")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows empty recipient message when no recipients", () => {
    renderDialog({ recipients: [] });

    expect(screen.getByText(/No recipients selected yet/i)).toBeInTheDocument();
  });

  it("validates missing email addresses", async () => {
    renderDialog({ recipients: [{ id: 1, name: "Charlie", emails: [] }] });

    const sendButton = screen.getByRole("button", { name: /send notification/i });
    fireEvent.click(sendButton);

    expect(await screen.findByText(/no email addresses found/i)).toBeInTheDocument();
  });

  it("validates missing message", async () => {
    renderDialog();

    const sendButton = screen.getByRole("button", { name: /send notification/i });
    fireEvent.click(sendButton);

    expect(await screen.findByText(/message is required/i)).toBeInTheDocument();
  });

  it("clears subject and message when Clear is clicked", () => {
    renderDialog();

    const subject = screen.getByLabelText(/subject/i);
    const message = screen.getByLabelText(/message/i);

    fireEvent.change(subject, { target: { value: "Update" } });
    fireEvent.change(message, { target: { value: "Please review." } });

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(subject).toHaveValue("");
    expect(message).toHaveValue("");
  });

  it("calls apiFetch and opens mail client on success", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true } as Response);

    let hrefValue = "";
    Object.defineProperty(window, "location", {
      value: {
        get href() {
          return hrefValue;
        },
        set href(val) {
          hrefValue = val;
        },
      },
      writable: true,
    });

    renderDialog();

    const dialog = await screen.findByRole("dialog");
    const messageInput = within(dialog).getByLabelText(/message/i, { selector: "textarea" });
    fireEvent.change(messageInput, { target: { value: "Hello!" } });

    const sendButton = within(dialog).getByRole("button", { name: /send notification/i });
    fireEvent.click(sendButton);

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    await waitFor(() => expect(hrefValue).toContain("mailto:"));
  });

  it("still opens mail client if apiFetch fails", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("Network error"));

    let hrefValue = "";
    Object.defineProperty(window, "location", {
      value: {
        get href() {
          return hrefValue;
        },
        set href(val) {
          hrefValue = val;
        },
      },
      writable: true,
    });

    renderDialog();

    const dialog = await screen.findByRole("dialog");
    const messageInput = within(dialog).getByLabelText(/message/i, { selector: "textarea" });
    fireEvent.change(messageInput, { target: { value: "Hello!" } });

    const sendButton = within(dialog).getByRole("button", { name: /send notification/i });
    fireEvent.click(sendButton);

    await waitFor(() => expect(hrefValue).toContain("mailto:"));
  });

  it("closes via close icon", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    const closeButton = screen.getByLabelText("Close dialog");
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });
});
