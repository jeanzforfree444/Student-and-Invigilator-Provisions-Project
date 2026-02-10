import React from "react";
import { render, screen } from "@testing-library/react";
import { NotificationsPanel, NotificationItem } from "../../../src/components/admin/NotificationsPanel";

const renderPanel = (notifications: NotificationItem[]) =>
  render(<NotificationsPanel notifications={notifications} />);

describe("NotificationsPanel", () => {
  it("renders empty state when there are no notifications", () => {
    renderPanel([]);

    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("0 updates")).toBeInTheDocument();
    expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument();
  });

  it("renders the correct count in the header chip", () => {
    renderPanel([
      {
        id: 1,
        type: "availability",
        invigilator_message: "Availability updated",
        timestamp: "2024-01-01T10:00:00Z",
      },
      {
        id: 2,
        type: "cancellation",
        invigilator_message: "Shift cancelled",
        timestamp: "2024-01-02T11:00:00Z",
      },
    ]);

    expect(screen.getByText("2 updates")).toBeInTheDocument();
  });

  it("renders notification message text", () => {
    const notification: NotificationItem = {
      id: 1,
      type: "examChange",
      invigilator_message: "Exam time has changed",
      timestamp: "2024-02-01T09:30:00Z",
    };

    renderPanel([notification]);

    expect(screen.getByText("Exam Change")).toBeInTheDocument();
    expect(screen.getByText("Exam time has changed")).toBeInTheDocument();
  });

  it("formats and displays the timestamp", () => {
    renderPanel([
      {
        id: 1,
        type: "venueChange",
        invigilator_message: "Venue updated",
        timestamp: "2024-03-15T14:05:00Z",
      },
    ]);

    // Example output: "15 Mar 2024, 14:05"
    expect(
      screen.getByText(/15\/03\/2024 14:05/i)
    ).toBeInTheDocument();
  });

  it("renders multiple notifications", () => {
    renderPanel([
      {
        id: 1,
        type: "shiftPickup",
        invigilator_message: "Shift picked up",
        timestamp: "2024-01-01T10:00:00Z",
      },
      {
        id: 2,
        type: "mailMerge",
        invigilator_message: "Email sent",
        timestamp: "2024-01-01T12:00:00Z",
      },
    ]);

    expect(screen.getByText("Shift Pickup")).toBeInTheDocument();
    expect(screen.getByText("Mail Merge")).toBeInTheDocument();
    expect(screen.getByText("Shift picked up")).toBeInTheDocument();
    expect(screen.getByText("Email sent")).toBeInTheDocument();
  });

  it("falls back to raw timestamp string if date is invalid", () => {
    renderPanel([
      {
        id: 1,
        type: "invigilatorUpdate",
        invigilator_message: "Profile updated",
        timestamp: "not-a-date",
      },
    ]);

    expect(screen.getByText("N/A")).toBeInTheDocument();
  });
});
