import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvigilatorRestrictions } from "@/pages/invigilator/Restrictions";
import dayjs from "dayjs";
import { Provider } from "react-redux";
import { createStoreInstance } from "@/state/store";

const apiFetchMock = vi.fn();

vi.mock("@/utils/api", () => ({
  apiFetch: (...args: any[]) => apiFetchMock(...args),
  apiBaseUrl: "http://api.test",
}));

const sampleResponse = {
  diet: "DEC_2025",
  start_date: "2025-12-01",
  end_date: "2025-12-02",
  diets: [
    { code: "DEC_2025", start_date: "2025-12-01", end_date: "2025-12-19" },
    { code: "APR_MAY_2026", start_date: "2026-04-20", end_date: "2026-05-31" },
  ],
  days: [
    {
      date: "2025-12-01",
      slots: [
        { slot: "MORNING", available: true },
        { slot: "EVENING", available: true },
      ],
    },
    {
      date: "2025-12-02",
      slots: [
        { slot: "MORNING", available: true },
        { slot: "EVENING", available: true },
      ],
    },
  ],
  availabilities: [
    { date: "2025-12-01", slot: "MORNING", available: true },
    { date: "2025-12-01", slot: "EVENING", available: true },
    { date: "2025-12-02", slot: "MORNING", available: true },
    { date: "2025-12-02", slot: "EVENING", available: true },
  ],
};

const renderPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const store = createStoreInstance();
  return render(
    <MemoryRouter initialEntries={["/invigilator/restrictions"]}>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <InvigilatorRestrictions />
        </QueryClientProvider>
      </Provider>
    </MemoryRouter>
  );
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
    const method = (options?.method || "GET").toUpperCase();
    if (method === "GET") {
      return Promise.resolve({
        ok: true,
        json: async () => sampleResponse,
        text: async () => "",
      });
    }
    if (method === "PUT") {
      return Promise.resolve({
        ok: true,
        json: async () => sampleResponse,
        text: async () => "",
      });
    }
    return Promise.resolve({ ok: false, json: async () => ({}), text: async () => "Unexpected" });
  });
});

describe("Page - Invigilator Restrictions", () => {
  it("renders diet selector with available diets and defaults to first", async () => {
    renderPage();
    const dietSelect = await screen.findByRole("combobox");
    await screen.findByText(/DEC 2025/i);
    fireEvent.mouseDown(dietSelect);
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(expect.arrayContaining(["DEC 2025", "APR MAY 2026"]));
  });

  it("renders fetched days and slot buttons", async () => {
    renderPage();

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());

    expect(await screen.findByText(/Mon 01\/12\/2025/i)).toBeInTheDocument();
    expect(await screen.findByText(/Tue 02\/12\/2025/i)).toBeInTheDocument();
    const morningButtons = await screen.findAllByRole("button", { name: /morning/i });
    const eveningButtons = await screen.findAllByRole("button", { name: /evening/i });
    expect(morningButtons.length).toBeGreaterThan(0);
    expect(eveningButtons.length).toBeGreaterThan(0);
  });

  it("sends deselected slots on submit and shows success snackbar", async () => {
    renderPage();
    await screen.findByText(/Mon 01\/12\/2025/i);

    const firstCard = screen.getByText(/Mon 01\/12\/2025/i).closest("[role='region']") || screen.getByText(/Mon 01\/12\/2025/i).parentElement?.parentElement;
    const eveningBtn =
      firstCard && within(firstCard).queryByRole("button", { name: /Evening/i })
        ? within(firstCard).getByRole("button", { name: /Evening/i })
        : (await screen.findAllByRole("button", { name: /Evening/i }))[0];

    fireEvent.click(eveningBtn);
    fireEvent.click(screen.getByRole("button", { name: /submit restrictions/i }));

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2));

    const putCall = apiFetchMock.mock.calls.find(([, options]) => (options as any)?.method === "PUT");
    expect(putCall).toBeTruthy();
    const body = JSON.parse((putCall?.[1] as RequestInit).body as string);
    expect(body.unavailable).toContainEqual({ date: "2025-12-01", slot: "EVENING" });

    await waitFor(() => expect(screen.getByText(/restrictions updated/i)).toBeInTheDocument());
  });

  it("submits empty unavailable list if all slots left available", async () => {
    renderPage();
    await screen.findByText(/Mon 01\/12\/2025/i);
    const submitBtn = await screen.findByRole("button", { name: /submit restrictions/i });
    fireEvent.click(submitBtn);
    await waitFor(() => {
      const call = apiFetchMock.mock.calls.find(([, options]) => (options as any)?.method === "PUT");
      expect(call).toBeTruthy();
    }, { timeout: 3000 });
    const putCall = apiFetchMock.mock.calls.find(([, options]) => (options as any)?.method === "PUT");
    const body = JSON.parse((putCall?.[1] as RequestInit).body as string);
    expect(body.unavailable).toEqual([]);
  });

  it("uses fallback availabilities when days is empty", async () => {
    const fallbackResp = { ...sampleResponse, days: [] };
    apiFetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, json: async () => fallbackResp, text: async () => "" })
    );
    renderPage();
    expect(await screen.findByText(/Mon 01\/12\/2025/i)).toBeInTheDocument();
    expect(await screen.findAllByRole("button", { name: /evening/i })).toHaveLength(2);
  });

  it("shows loading then error state when fetch fails", async () => {
    apiFetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, json: async () => ({}), text: async () => "Unable to load restrictions" })
    );
    renderPage();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Unable to load restrictions/i)).toBeInTheDocument());
  });

  it("disables submission when cutoff reached and shows warning", async () => {
    const cutoffDate = dayjs().subtract(1, "day").format("YYYY-MM-DD");
    const cutoffResp = {
      ...sampleResponse,
      diet: "DEC_2025",
      diet_name: "December 2025",
      restriction_cutoff: cutoffDate,
      diets: [{ code: "DEC_2025", name: "December 2025", start_date: "2025-12-01", end_date: "2025-12-19", restriction_cutoff: cutoffDate }],
    };
    apiFetchMock.mockImplementation((url: string, options?: RequestInit) => {
      const method = (options?.method || "GET").toUpperCase();
      if (method === "GET") {
        return Promise.resolve({ ok: true, json: async () => cutoffResp, text: async () => "" });
      }
      if (method === "PUT") {
        return Promise.resolve({ ok: true, json: async () => cutoffResp, text: async () => "" });
      }
      return Promise.resolve({ ok: false, json: async () => ({}), text: async () => "Unexpected" });
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/Restrictions are closed/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /submit restrictions/i })).toBeDisabled();
    await waitFor(() => {
      const slotButtons = screen.getAllByRole("button", { name: /morning/i });
      expect(slotButtons[0]).toBeDisabled();
    });
  });
  it.skip("shows error snackbar when update fails", async () => {
    apiFetchMock
      .mockImplementationOnce((url: string, options?: RequestInit) => {
        // GET
        return Promise.resolve({
          ok: true,
          json: async () => sampleResponse,
          text: async () => "",
        });
      })
      .mockImplementationOnce((url: string, options?: RequestInit) => {
        // PUT failure
        return Promise.resolve({
          ok: false,
          json: async () => ({}),
          text: async () => "Boom",
        });
      });

    renderPage();
    await screen.findByText(/Mon 01\/12\/2025/i);

    fireEvent.click((await screen.findAllByRole("button", { name: /evening/i }))[0]);
    fireEvent.click(screen.getByRole("button", { name: /submit restrictions/i }));

    expect(await screen.findByText(/Failed to update restrictions/i)).toBeInTheDocument();
  });
});
