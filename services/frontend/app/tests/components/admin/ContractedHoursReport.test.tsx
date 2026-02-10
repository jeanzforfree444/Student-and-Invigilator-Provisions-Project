import { render, screen } from "@testing-library/react";
import { ContractedHoursReport, ContractedHoursData } from "@/components/admin/ContractedHoursReport";

describe ("Components - ContractedHoursReport", () => {
    const renderComponent = (props: {
        report?: ContractedHoursData | null;
        loading?: boolean;
        error?: string | null;
        diets?: { code: string; label: string; is_active?: boolean }[];
        selectedDiet?: string;
    }) => {
        return render(
          <ContractedHoursReport
            report={props.report ?? null}
            loading={props.loading ?? false}
            error={props.error ?? null}
            diets={props.diets}
            selectedDiet={props.selectedDiet}
            onDietChange={() => undefined}
          />
        );
    };
    it ("renders the header", () => {
        renderComponent({});
        expect(screen.getByText("Contracted Hours")).toBeInTheDocument();
    });
    it ("renders the loading spinner when loading", () => {
        renderComponent({loading:true});
        expect(screen.getByRole("progressbar")).toBeInTheDocument();
    });
    it ("hides spinner when not loading", () => {
        renderComponent({loading:false});
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    })
    it("renders the error alert when error exists", () => {
        renderComponent({ error: "Failed to load"});
        expect(screen.getByText("Failed to load")).toBeInTheDocument();
    })
    it ("renders 'no data' info when report is null and not loading or error", () =>{
        renderComponent({report: null, loading:false, error:null});
        expect(screen.getByText("No contracted hours available.")).toBeInTheDocument();
    })
    it ("does not show null or loading error when data is provided", () =>{
        renderComponent({report: {total_hours: 10, contracted_hours:5, remaining_hours:5}});
        expect(screen.queryByText("No contracted hours available")).not.toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    })
    it ("renders the summary when report is provided", () => {
        renderComponent({
        report: {
            total_hours: 40,
            contracted_hours: 30,
            remaining_hours: 10
        }
        });
        expect(screen.getByText("Total Allocated")).toBeInTheDocument();
        expect(screen.getByText("40 hours")).toBeInTheDocument();
        expect(screen.getByText("Contracted")).toBeInTheDocument();
        expect(screen.getByText("30 hours")).toBeInTheDocument();
        expect(screen.getByText("Remaining")).toBeInTheDocument();
        expect(screen.getByText("10 hours")).toBeInTheDocument();
    });
    it ("shows 'Remaining' when remaining_hours >= 0", () => {
        renderComponent({
        report: {
            total_hours: 10,
            contracted_hours: 6,
            remaining_hours: 4
        }
        });
        expect(screen.getByText("Remaining")).toBeInTheDocument();
        expect(screen.getByText("4 hours")).toBeInTheDocument();
    });
  it("shows 'Contract fulfilled' when remaining_hours < 0", () => {
        renderComponent({
        report: {
            total_hours: 10,
            contracted_hours: 12,
            remaining_hours: -2
        }
        });
    expect(screen.getByText("Contract fulfilled")).toBeInTheDocument();
    expect(screen.getByText("2 hours")).toBeInTheDocument();
    });
    it("does not render remaining section when remaining_hours is undefined", () => {
        renderComponent({
        report: {
            total_hours: 12,
            contracted_hours: 6
        }
        });
        expect(screen.queryByText("Remaining")).not.toBeInTheDocument();
    expect(screen.queryByText("Contract fulfilled")).not.toBeInTheDocument();
    });

    it("renders diet selector and active chip when diets are provided", () => {
        renderComponent({
            diets: [
                { code: "JAN_2026", label: "January 2026", is_active: true },
                { code: "FEB_2026", label: "February 2026", is_active: false },
            ],
            selectedDiet: "JAN_2026",
        });
        expect(screen.getByText("January 2026")).toBeInTheDocument();
        expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("shows inactive chip when selected diet is inactive", () => {
        renderComponent({
            diets: [
                { code: "JAN_2026", label: "January 2026", is_active: true },
                { code: "FEB_2026", label: "February 2026", is_active: false },
            ],
            selectedDiet: "FEB_2026",
        });
        expect(screen.getByText("February 2026")).toBeInTheDocument();
        expect(screen.getByText("Inactive")).toBeInTheDocument();
    });
});
