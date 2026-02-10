import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AddExamDialog } from "@/components/admin/AddExamDialog";
import { createStoreInstance } from "@/state/store";

const renderDialog = () => {
  const store = createStoreInstance();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <AddExamDialog open onClose={() => undefined} />
      </QueryClientProvider>
    </Provider>
  );
};

describe("AddExamDialog", () => {
  it("clears fields when Clear is clicked", () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText(/exam name/i), { target: { value: "Stats 101" } });
    fireEvent.change(screen.getByLabelText(/course code/i), { target: { value: "STAT101" } });

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect((screen.getByLabelText(/exam name/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/course code/i) as HTMLInputElement).value).toBe("");
  });
});
