import { render, screen, fireEvent } from "@testing-library/react";
import { ExamDetailsPopup, ExamDetails } from "@/components/admin/ExamDetailsPopup";

describe("Components - ExamDetailsPopup", () => {
    const baseExam: ExamDetails = {
    code: "MATH101",
    subject: "Calculus I",
    department: "Math",
    mainVenue: "Main Hall",
    mainStartTime: "2025-01-01T09:00:00",
    mainEndTime: "2025-01-01T12:00:00",
    venues: [
      {
        venue: "Room 101",
        startTime: "2025-01-01T09:00:00",
        endTime: "2025-01-01T12:00:00",
        students: 25,
        invigilators: 2
      },
      {
        venue: "Room 102",
        startTime: "2025-01-01T09:00:00",
        endTime: "2025-01-01T12:00:00",
        students: 20,
        invigilators: 1
      }
    ]
    };
    const renderComponent = (props?: Partial<React.ComponentProps<typeof ExamDetailsPopup>>) => {
        return render(
        <ExamDetailsPopup
            open={props?.open ?? true}
            onClose={props?.onClose ?? (() => {})}
            exam={props?.exam ?? baseExam}
            departmentColors={props?.departmentColors ?? { Math: "#006fcb" }}
        />
        );
    };


    it("does not render when exam is null", () => {
        const { container } = render(<ExamDetailsPopup open={true} onClose={vi.fn()} exam={null} />);
        expect(container.firstChild).toBeNull();
    });
    it ("renders exam title with subject and code", () => {
        renderComponent();
        expect(screen.getByText("MATH101 - Calculus I")).toBeInTheDocument();
    });
    it ("renders main venue block when mainVenue and times exist", () => {
        renderComponent();

        expect(screen.getByText("Main Exam Location")).toBeInTheDocument();
        expect(screen.getByText("Venue: Main Hall")).toBeInTheDocument();

        const times = screen.getAllByText(/09:00.*12:00/);
        expect(times.length).toBeGreaterThan(0);
    });
    it ("does not render main location block when missing mainVenue", () => {
        const exam = { ...baseExam, mainVenue: undefined };
        renderComponent({ exam });

        expect(screen.queryByText("Main Exam Location")).not.toBeInTheDocument();
    }); 
    it("does not render main exam location section if any main location field is missing", () => {
        const exam = {
            code: "EX123",
            subject: "Math",
            mainVenue: "Hall A",
            mainEndTime: "2023-01-01T12:00:00Z",
            venues: []
        };
        render(<ExamDetailsPopup open={true} onClose={vi.fn()} exam={exam} />);
        expect(screen.queryByText("Main Exam Location")).not.toBeInTheDocument();
    });
    it("renders no venue cards when venues array is empty", () => {
        const exam = {
            code: "EX123",
            subject: "Math",
            venues: []
        };

        render(<ExamDetailsPopup open={true} onClose={vi.fn()} exam={exam} />);
        expect(screen.getByText("All Venues")).toBeInTheDocument();
        expect(screen.queryByText("Students:")).not.toBeInTheDocument();
    });
    it ("renders all venues from exam.venues", () => {
        renderComponent();

        expect(screen.getByText("All Venues")).toBeInTheDocument();
        expect(screen.getByText("Room 101")).toBeInTheDocument();
        expect(screen.getByText("Room 102")).toBeInTheDocument();
        expect(screen.getByText("Students: 25")).toBeInTheDocument();
        expect(screen.getByText("Invigilators: 2")).toBeInTheDocument();
        expect(screen.getByText("Students: 20")).toBeInTheDocument();
        expect(screen.getByText("Invigilators: 1")).toBeInTheDocument();
    });
    it ("renders start/end times for each venue", () => {
        renderComponent();

        const startTimes = screen.getAllByText(/09:00/);
        const endTimes = screen.getAllByText(/12:00/);
        expect(startTimes).toHaveLength(3);
        expect(endTimes).toHaveLength(3);
        expect(screen.getAllByText("Start")).toHaveLength(2);
        expect(screen.getAllByText("End")).toHaveLength(2);
    });
    it("renders correctly when students or invigilators are zero", () => {
        const exam = {
            code: "EX123",
            subject: "Math",
            venues: [{ venue: "A1", startTime: "2023-01-01T08:00:00Z", endTime: "2023-01-01T10:00:00Z", students: 0, invigilators: 0 }]
        };

        render(<ExamDetailsPopup open={true} onClose={vi.fn()} exam={exam} />);
        expect(screen.getByText("Students: 0")).toBeInTheDocument();
        expect(screen.getByText("Invigilators: 0")).toBeInTheDocument();
    });
    it("renders even if start/end times are invalid", () => {
        const exam = {
            code: "EX123",
            subject: "Math",
            venues: [{ venue: "A1", startTime: "foo", endTime: "bar", students: 10, invigilators: 2 }]
        };
        render(<ExamDetailsPopup open={true} onClose={vi.fn()} exam={exam} />);
        expect(screen.getByText("A1")).toBeInTheDocument();
    });

    it ("calls onClose when Close button is clicked", () => {
        const onClose = vi.fn();
        renderComponent({ onClose });

        const button = screen.getByLabelText("Close");
        fireEvent.click(button);

        expect(onClose).toHaveBeenCalled();
    });
});
