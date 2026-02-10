import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { InvigilatorAvailabilityModal } from "@/components/admin/InvigilatorAvailabilityModal";
import dayjs from "dayjs";

const renderComponent = (props={}) => {
    const defaultProps = {
    open: true,
    onClose: vi.fn(),
    date: dayjs("2025-01-10"),
    invigilators:[],
    };
    return render(
        <MemoryRouter>
            <InvigilatorAvailabilityModal {...defaultProps}{...props} />
        </MemoryRouter>
    );
};

describe("Components - InvigilatorAvailabilityModal", () => {
    it ("does not render when date is null", () => {
        const { container } = renderComponent({ date: null });
        expect(container.firstChild).toBeNull();
    });
    it ("renders title with formatted date", () => {
        renderComponent();
        expect(screen.getByText("Available on 10/01/2025")).toBeInTheDocument();
    });
    it ("shows message when no invigilators available", () => {
        renderComponent();
        expect(screen.getByText("No invigilators available on 10/01/2025")).toBeInTheDocument();
    });
    it("shows invigilators available on the selected date", () => {
        const invigilators = [
            {
            id: 1,
            preferred_name: "John",
            full_name: "John Smith",
            email: "john@example.com",
            availableDates: ["2025-01-10"],
            availableSlots: ["2025-01-10T09:00"],
            },
        ];

        renderComponent({ invigilators });

        expect(screen.getByText("John")).toBeInTheDocument();
        expect(screen.getByText("(John Smith)")).toBeInTheDocument();
        expect(screen.getByText("john@example.com")).toBeInTheDocument();

        // Flexible matcher for time slot
        expect(
            screen.getByText((content) => content.includes("09:00"))
        ).toBeInTheDocument();
    });

    it ("shows not available chip for invigilators who are unavailable on the selected date", () => {
        const invigilators = [
            {
            id: 1,
            preferred_name: "John",
            availableDates: ["2025-01-09"],
            availableSlots: []
            }
        ];
        renderComponent({
            date: dayjs("2025-01-10"),
            invigilators
        });
        expect(screen.getByText("John")).toBeInTheDocument();
        expect(screen.getByText("Not available")).toBeInTheDocument();
    });
    it ("displays the invigilator email if provided", () => {
        const invigilators = [
            {
            id: 5,
            preferred_name: "Sam",
            email: "sam@example.com",
            availableDates: ["2025-01-10"],
            availableSlots: []
            }
        ];
        renderComponent({ date: dayjs("2025-01-10"), invigilators });
        expect(screen.getByText("sam@example.com")).toBeInTheDocument();
    });
    it ("shows fallback when no availableSlots exist", () => {
        const invigilators = [
            {
                id: 2,
                preferred_name: "Alice",
                full_name: "Alice Brown",
                email: "alice@example.com",
                availableDates: ["2025-01-10"],
                availableSlots: [],
            },
        ];
        renderComponent({ invigilators });
        expect(screen.getByText("Available (no specific time slots recorded)")).toBeInTheDocument();
    });
    it ("uses preferred_name when full_name matches", () => {
        const invigilators = [
            {
                id: 3,
                preferred_name: "Bob",
                full_name: "Bob",
                email: "bob@example.com",
                availableDates: ["2025-01-10"],
                availableSlots: [],
            },
        ];

        renderComponent({ invigilators });
        expect(screen.getAllByText("Bob").length).toBe(1);
    });
    it ("uses 'Invigilator #id' when no names exist", () => {
        const invigilators = [
            {
                id: 4,
                preferred_name: null,
                full_name: null,
                email: "x@example.com",
                availableDates: ["2025-01-10"],
                availableSlots: [],
            },
        ];
        renderComponent({ invigilators });
        expect(screen.getByText("Invigilator #4")).toBeInTheDocument();
    });
    it ("renders initials correctly in Avatar", () => {
        const invigilators = [
            {
                id: 5,
                preferred_name: "Mary Jane",
                full_name: "Jane Mary Watson",
                email: "mj@example.com",
                availableDates: ["2025-01-10"],
                availableSlots: [],
            },
        ];

        renderComponent({ invigilators });
        expect(screen.getByText("MJ")).toBeInTheDocument();
    });
    it ("falls back to initials derived from 'Invigilator #ID' when names missing", () => {
        const invigilators = [
            {
            id: 7,
            preferred_name: null,
            full_name: null,
            availableDates: ["2025-01-10"],
            availableSlots: []
            }
        ];
        renderComponent({ date: dayjs("2025-01-10"), invigilators });
        expect(screen.getByText("I#")).toBeInTheDocument();
    });
    it ("links name to correct profile route", () => {
        const invigilators = [
            {
                id: 6,
                preferred_name: "Sarah",
                full_name: "Sarah Connor",
                email: "sc@example.com",
                availableDates: ["2025-01-10"],
                availableSlots: [],
            },
        ];
        renderComponent({ invigilators });
        const link = screen.getByRole("link", { name: "Sarah" });
        expect(link).toHaveAttribute("href", "/admin/invigilators/6");
    });
    it ("calls onClose when Close button is clicked", async () => {
    const onClose = vi.fn();

    renderComponent({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
