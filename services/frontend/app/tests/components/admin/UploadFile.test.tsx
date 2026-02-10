import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadFile } from "@/components/admin/UploadFile";
import { apiFetch, apiBaseUrl } from "@/utils/api";
import { Provider } from "react-redux";
import { createStoreInstance } from "@/state/store";

// Mock MUI Select/MenuItem to work in tests
vi.mock("@mui/material", async () => {
  const actual = await vi.importActual<any>("@mui/material");
  return {
    ...actual,
    Select: ({ value, onChange, children }: any) => (
      <select data-testid="upload-type-select" value={value} onChange={onChange}>
        {children}
      </select>
    ),
    MenuItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  };
});

// Mock apiBaseUrl and apiFetch
vi.mock("@/utils/api", () => ({
  apiBaseUrl: "http://test-api",
  apiFetch: vi.fn(),
}));

describe("Components - UploadFile", () => {
  const mockFile = new File(["test"], "test.csv", { type: "text/csv" });
  const renderWithStore = (ui: React.ReactElement) => {
    const store = createStoreInstance();
    return render(<Provider store={store}>{ui}</Provider>);
  };
  const uploadWithFireEvent = (input: HTMLInputElement, file: File) => {
    fireEvent.change(input, { target: { files: [file] } });
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders initial UI", () => {
    renderWithStore(<UploadFile />);

    expect(screen.getByText("Upload data")).toBeInTheDocument();
    expect(screen.getByText(/Select a file type and upload/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload/i })).toBeDisabled();
  });

  it("enables file selection once upload type is chosen", () => {
    renderWithStore(<UploadFile />);
    const chooseFileButton = screen.getByText("Choose File");

    expect(chooseFileButton).toHaveAttribute("aria-disabled", "true");

    fireEvent.change(screen.getByTestId("upload-type-select"), { target: { value: "exam" } });

    expect(chooseFileButton).not.toHaveAttribute("aria-disabled");
  });

  it("shows selected file name after choosing a file", async () => {
    renderWithStore(<UploadFile />);
    fireEvent.change(screen.getByTestId("upload-type-select"), { target: { value: "provisions" } });

    const input = screen.getByTestId("file-upload") as HTMLInputElement;
    uploadWithFireEvent(input, mockFile);

    expect(screen.getByText("test.csv")).toBeInTheDocument();
  });

  it("enables Upload button only after type and file are selected", async () => {
    renderWithStore(<UploadFile />);
    const uploadButton = screen.getByRole("button", { name: /upload/i });
    expect(uploadButton).toBeDisabled();

    fireEvent.change(screen.getByTestId("upload-type-select"), { target: { value: "exam" } });
    expect(uploadButton).toBeDisabled();

    const input = screen.getByTestId("file-upload") as HTMLInputElement;
    uploadWithFireEvent(input, mockFile);
    expect(uploadButton).not.toBeDisabled();
  });

  it("uploads file successfully and shows success message", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ records_created: 5, records_updated: 2, records_deleted: 1 }),
    });

    renderWithStore(<UploadFile />);
    fireEvent.change(screen.getByTestId("upload-type-select"), { target: { value: "exam" } });

    const input = screen.getByTestId("file-upload") as HTMLInputElement;
    uploadWithFireEvent(input, mockFile);

    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    expect(await screen.findByText((content) =>
      content.includes("Upload complete: Exam timetable (test.csv). Added 5, Updated 2, Deleted 1.")
    )).toBeInTheDocument();

    expect(apiFetch).toHaveBeenCalledWith(
      "http://test-api/exams-upload",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows error message when upload fails", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ ok: false });

    renderWithStore(<UploadFile />);
    fireEvent.change(screen.getByTestId("upload-type-select"), { target: { value: "exam" } });

    const input = screen.getByTestId("file-upload") as HTMLInputElement;
    uploadWithFireEvent(input, mockFile);

    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
  });

  it("shows generic error when apiFetch throws", async () => {
    (apiFetch as jest.Mock).mockRejectedValue(new Error("Network error"));

    renderWithStore(<UploadFile />);
    fireEvent.change(screen.getByTestId("upload-type-select"), { target: { value: "exam" } });

    const input = screen.getByTestId("file-upload") as HTMLInputElement;
    uploadWithFireEvent(input, mockFile);

    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    expect(await screen.findByText("Network error")).toBeInTheDocument();
  });

  it("shows spinner while uploading", async () => {
    let resolveFetch!: (value: any) => void;
    (apiFetch as jest.Mock).mockImplementation(
      () => new Promise((res) => (resolveFetch = res))
    );

    renderWithStore(<UploadFile />);
    fireEvent.change(screen.getByTestId("upload-type-select"), { target: { value: "exam" } });

    const input = screen.getByTestId("file-upload") as HTMLInputElement;
    uploadWithFireEvent(input, mockFile);

    const uploadButton = screen.getByRole("button", { name: /upload/i });
    fireEvent.click(uploadButton);

    // Button shows uploading spinner
    expect(screen.getByText("Uploading...")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(uploadButton).toBeDisabled();

    // Resolve fetch
    resolveFetch({ ok: true, json: async () => ({ records_created: 1 }) });

    expect(await screen.findByText((content) =>
      content.includes("Upload complete: Exam timetable (test.csv). Added 1")
    )).toBeInTheDocument();
  });

  it("clears file input after successful upload", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ records_created: 1 }),
    });

    renderWithStore(<UploadFile />);
    fireEvent.change(screen.getByTestId("upload-type-select"), { target: { value: "exam" } });

    const input = screen.getByTestId("file-upload") as HTMLInputElement;
    uploadWithFireEvent(input, mockFile);

    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() => expect(input.value).toBe(""));
  });

  it("handles zero-byte file upload", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ records_created: 0, records_updated: 0, records_deleted: 0 }),
    });

    renderWithStore(<UploadFile />);
    fireEvent.change(screen.getByTestId("upload-type-select"), { target: { value: "exam" } });

    const zeroByteFile = new File([""], "empty.csv", { type: "text/csv" });
    const input = screen.getByTestId("file-upload") as HTMLInputElement;
    uploadWithFireEvent(input, zeroByteFile);

    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    expect(await screen.findByText((content) =>
      content.includes("Upload complete: Exam timetable (empty.csv). Added 0, Updated 0")
    )).toBeInTheDocument();
  });

  it("opens diet suggestion dialog when upload returns suggestion", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        records_created: 1,
        upload_exam_date_range: {
          min_date: "2026-07-01",
          max_date: "2026-07-10",
          row_count: 5,
        },
        diet_suggestion: {
          status: "ok",
          action: "create_new",
          suggested: {
            code: "JUL_26",
            name: "July 2026",
            start_date: "2026-07-01",
            end_date: "2026-07-10",
          },
        },
      }),
    });

    renderWithStore(<UploadFile />);
    fireEvent.change(screen.getByTestId("upload-type-select"), { target: { value: "exam" } });

    const input = screen.getByTestId("file-upload") as HTMLInputElement;
    uploadWithFireEvent(input, mockFile);
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    expect(await screen.findByText("Update diet dates?")).toBeInTheDocument();
    expect(screen.getByText("July 2026")).toBeInTheDocument();
  });

  it("submits create_new diet adjustment on confirm", async () => {
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records_created: 1,
          upload_exam_date_range: {
            min_date: "2026-07-01",
            max_date: "2026-07-10",
            row_count: 5,
          },
          diet_suggestion: {
            status: "ok",
            action: "create_new",
            suggested: {
              code: "JUL_26",
              name: "July 2026",
              start_date: "2026-07-01",
              end_date: "2026-07-10",
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ diet: { name: "July 2026" } }),
      });

    renderWithStore(<UploadFile />);
    fireEvent.change(screen.getByTestId("upload-type-select"), { target: { value: "exam" } });

    const input = screen.getByTestId("file-upload") as HTMLInputElement;
    uploadWithFireEvent(input, mockFile);
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await screen.findByText("Update diet dates?");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "http://test-api/diets/adjust/",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(await screen.findByText(/Diet updated: July 2026/)).toBeInTheDocument();
  });

  it("submits adjust_existing diet adjustment with selection", async () => {
    (apiFetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records_created: 1,
          upload_exam_date_range: {
            min_date: "2026-04-01",
            max_date: "2026-04-20",
            row_count: 5,
          },
          diet_suggestion: {
            status: "ok",
            action: "adjust_existing",
            diet_id: 12,
            diet_code: "APR_26",
            diet_name: "April 2026",
            current: { start_date: "2026-04-05", end_date: "2026-04-25" },
            uploaded: { start_date: "2026-04-01", end_date: "2026-04-20" },
            options: ["extend_start", "contract_end"],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ diet: { name: "April 2026" } }),
      });

    renderWithStore(<UploadFile />);
    fireEvent.change(screen.getByTestId("upload-type-select"), { target: { value: "exam" } });

    const input = screen.getByTestId("file-upload") as HTMLInputElement;
    uploadWithFireEvent(input, mockFile);
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await screen.findByText("Update diet dates?");
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Contract end date/i));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledTimes(2);
    });
    const adjustCall = (apiFetch as jest.Mock).mock.calls[1];
    expect(adjustCall[0]).toBe("http://test-api/diets/adjust/");
    expect(adjustCall[1]).toEqual(
      expect.objectContaining({
        method: "POST",
      })
    );
    const adjustBody = JSON.parse(adjustCall[1].body);
    expect(adjustBody).toEqual(
      expect.objectContaining({
        action: "adjust_existing",
        diet_id: 12,
        start_date: "2026-04-01",
        end_date: "2026-04-25",
      })
    );
  });

  it("skip closes diet dialog without adjust call", async () => {
    (apiFetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        records_created: 1,
        upload_exam_date_range: {
          min_date: "2026-07-01",
          max_date: "2026-07-10",
          row_count: 5,
        },
        diet_suggestion: {
          status: "ok",
          action: "create_new",
          suggested: {
            code: "JUL_26",
            name: "July 2026",
            start_date: "2026-07-01",
            end_date: "2026-07-10",
          },
        },
      }),
    });

    renderWithStore(<UploadFile />);
    fireEvent.change(screen.getByTestId("upload-type-select"), { target: { value: "exam" } });

    const input = screen.getByTestId("file-upload") as HTMLInputElement;
    uploadWithFireEvent(input, mockFile);
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));

    await screen.findByText("Update diet dates?");
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    await waitFor(() => {
      expect(screen.queryByText("Update diet dates?")).not.toBeInTheDocument();
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
