import React from "react";
import { Box, Chip, Divider, Stack, Typography } from "@mui/material";
import { AccessTime, EventBusy, CancelOutlined, Update, EditNote, CheckCircleOutline, InfoOutlined, PlaceOutlined, AlternateEmail, AssignmentIndOutlined, CheckCircleOutlined, FactCheckOutlined } from "@mui/icons-material";
import { Panel } from "../Panel";
import { formatDateTime } from "../../utils/dates";

export type NotificationType =
  | "availability"
  | "cancellation"
  | "assignment"
  | "shiftPickup"
  | "examChange"
  | "invigilatorUpdate"
  | "venueChange"
  | "allocation"
  | "mailMerge"
  | "adminMessage";

export interface NotificationItem {
  id: number;
  type: NotificationType;
  invigilator_message?: string;
  admin_message?: string;
  invigilator?: { id: number; name?: string | null } | null;
  timestamp: string;
}

export const notificationTypeStyles: Record<
  NotificationType,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  availability: {
    label: "Restriction",
    color: "#0d47a1",
    bg: "rgba(13,71,161,0.08)",
    icon: <EventBusy fontSize="small" />,
  },
  cancellation: {
    label: "Cancellation",
    color: "#b71c1c",
    bg: "rgba(183,28,28,0.08)",
    icon: <CancelOutlined fontSize="small" />,
  },
  assignment: {
    label: "Assignment",
    color: "#00897b",
    bg: "rgba(0,137,123,0.08)",
    icon: <AssignmentIndOutlined fontSize="small" />,
  },
  shiftPickup: {
    label: "Shift Pickup",
    color: "#1b5e20",
    bg: "rgba(27,94,32,0.08)",
    icon: <CheckCircleOutline fontSize="small" />,
  },
  examChange: {
    label: "Exam Change",
    color: "#e65100",
    bg: "rgba(230,81,0,0.08)",
    icon: <Update fontSize="small" />,
  },
  invigilatorUpdate: {
    label: "Invigilator Update",
    color: "#4a148c",
    bg: "rgba(74,20,140,0.08)",
    icon: <EditNote fontSize="small" />,
  },
  venueChange: {
    label: "Venue Change",
    color: "#f9a825",
    bg: "rgba(249,168,37,0.12)",
    icon: <PlaceOutlined fontSize="small" />,
  },
  allocation: {
    label: "Allocation",
    color: "#4338ca",
    bg: "rgba(67,56,202,0.12)",
    icon: <FactCheckOutlined fontSize="small" />,
  },
  mailMerge: {
    label: "Mail Merge",
    color: "#00695c",
    bg: "rgba(0,105,92,0.08)",
    icon: <AlternateEmail fontSize="small" />,
  },
  adminMessage: {
    label: "Administrator Action",
    color: "#ad1457",
    bg: "rgba(173,20,87,0.08)",
    icon: <InfoOutlined fontSize="small" />,
  },
};

export const NotificationsPanel: React.FC<{
  notifications: NotificationItem[];
  messageKey?: "invigilator_message" | "admin_message";
  showPanel?: boolean;
}> = ({ notifications, messageKey = "invigilator_message", showPanel = true }) => {
  const content = (
    <Stack spacing={1.5}>
      {notifications.length === 0 ? (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: "1px dashed",
            borderColor: "divider",
            backgroundColor: "#f9fafb",
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <InfoOutlined fontSize="small" sx={{ color: "text.secondary" }} />
          <Typography variant="body2" color="text.secondary">
            No notifications yet.
          </Typography>
        </Box>
      ) : (
        notifications.map((n) => {
          const style = notificationTypeStyles[n.type];
          const message =
            (messageKey === "admin_message" ? n.admin_message : n.invigilator_message) ||
            n.invigilator_message ||
            n.admin_message ||
            "";
          return (
            <Box
              key={n.id}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
                backgroundColor: style.bg,
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    icon={style.icon}
                    label={style.label}
                    size="small"
                    sx={{
                      backgroundColor: "#fff",
                      color: style.color,
                      fontWeight: 700,
                      border: `1px solid ${style.color}`,
                      "& .MuiChip-icon": {
                        color: style.color,
                      },
                    }}
                  />
                  <Typography variant="body2" sx={{ color: "text.primary" }}>
                    {message || "No message provided."}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
                  <AccessTime fontSize="small" />
                  <Typography variant="caption">{formatDateTime(n.timestamp)}</Typography>
                </Stack>
              </Stack>
            </Box>
          );
        })
      )}
    </Stack>
  );

  if (!showPanel) return content;

  return (
    <Panel
      title="Notifications"
      actions={
        <Chip
          label={`${notifications.length} updates`}
          size="medium"
          sx={{
            backgroundColor: "#e3f2fd",
            color: "#0d47a1",
            fontWeight: 600,
          }}
        />
      }
    >
      {content}
    </Panel>
  );
};
