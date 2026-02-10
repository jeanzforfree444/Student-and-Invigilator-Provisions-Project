import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Avatar,
  Typography,
  Chip,
  Box,
  Link as MUILink,
  IconButton,
  Stack,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { Dayjs } from "dayjs";
import { Close } from "@mui/icons-material";
import { formatDate } from "../../utils/dates";
import { Panel } from "../Panel";

interface Invigilator {
  id: number;
  preferred_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  avatar?: string | null;
  availableDates?: string[];
  availableSlots?: string[];
  availabilities?: { date: string; slot: string; available: boolean }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  date: Dayjs | null;
  invigilators: Invigilator[];
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

const displayPreferredAndFull = (i: Invigilator) => {
  if (i.preferred_name && i.full_name && i.preferred_name !== i.full_name) {
    return { main: i.preferred_name, sub: i.full_name };
  }
  return {
    main: i.preferred_name || i.full_name || `Invigilator #${i.id}`,
    sub: "",
  };
};

export const InvigilatorAvailabilityModal: React.FC<Props> = ({
  open,
  onClose,
  date,
  invigilators
}) => {
  if (!date) return null;

  const dateStr = date.format("YYYY-MM-DD");

  const allowedSlots = new Set(["MORNING", "EVENING"]);

  const slotLabel = (slot: string) => {
    switch (slot) {
      case "MORNING":
        return "Morning";
      case "EVENING":
        return "Evening";
      default:
        return slot;
    }
  };

  const available = invigilators;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Available on {formatDate(date)}
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: "absolute", right: 12, top: 10 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {available.length === 0 ? (
          <Typography color="text.secondary" align="center" py={4}>
            No invigilators available on {formatDate(date)}
          </Typography>
        ) : (
          <Stack spacing={2}>
            {available.map((i) => {
              const daySlots = i.availabilities?.filter((a) => a.date === dateStr && allowedSlots.has(a.slot)) || [];
              const availableSlots = daySlots.filter((a) => a.available).map((a) => slotLabel(a.slot));
              const unavailableSlots = daySlots.filter((a) => !a.available).map((a) => slotLabel(a.slot));

              const hasAvailableFromLegacy = i.availableDates?.includes(dateStr) || false;
              const legacySlots =
                i.availableSlots
                  ?.filter((slot) => slot.startsWith(dateStr))
                  .map((slot) => slot.split("T")[1]?.slice(0, 5))
                  .filter(Boolean)
                  .map((time) => `Available (${time})`) ||
                [];
              const showLegacySlots = availableSlots.length === 0 && unavailableSlots.length === 0 && legacySlots.length > 0;

              const availableCount = availableSlots.length + (hasAvailableFromLegacy ? 2 : 0);
              const availabilityLabel =
                availableCount >= 2
                  ? { label: "Fully available", bg: "#e8f5e9", fg: "#1b5e20" }
                  : availableCount === 1
                  ? { label: "Partially available", bg: "#fff4e5", fg: "#b45309" }
                  : { label: "Not available", bg: "#ffebee", fg: "#b71c1c" };

              const names = displayPreferredAndFull(i);
              const initials = getInitials(names.main);

              return (
                <Panel key={i.id} sx={{ mb: 0, p: 2.5, position: "relative" }}>
                  <Chip
                    size="small"
                    label={availabilityLabel.label}
                    sx={{
                      position: "absolute",
                      top: 16,
                      right: 16,
                      bgcolor: availabilityLabel.bg,
                      color: availabilityLabel.fg,
                      fontWeight: 700,
                    }}
                  />
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Avatar
                      src={i.avatar || undefined}
                      sx={{ bgcolor: "primary.main", alignSelf: "center" }}
                    >
                      {initials}
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Box>
                        <MUILink
                          component={RouterLink}
                          to={`/admin/invigilators/${i.id}`}
                          color="primary"
                          underline="none"
                          sx={{ fontWeight: 600, mr: 1 }}
                        >
                          {names.main}
                        </MUILink>
                        {names.sub && (
                          <Typography component="span" variant="body2" color="text.secondary">
                            ({names.sub})
                          </Typography>
                        )}
                      </Box>

                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {i.email}
                      </Typography>

                      {availableSlots.length > 0 || unavailableSlots.length > 0 ? (
                        <Box sx={{ mt: 1 }}>
                          <Stack direction="row" spacing={1.5} flexWrap="wrap">
                            {availableSlots.map((slot, idx) => (
                              <Chip
                                key={`available-${idx}`}
                                label={slot}
                                size="medium"
                                sx={{
                                  borderRadius: 999,
                                  border: "1.5px solid transparent",
                                  boxSizing: "border-box",
                                  minWidth: 120,
                                  minHeight: 36,
                                  bgcolor: "success.main",
                                  color: "#fff",
                                  fontWeight: 600,
                                  mt: 0.5,
                                }}
                              />
                            ))}
                            {unavailableSlots.map((slot, idx) => (
                              <Chip
                                key={`unavailable-${idx}`}
                                label={slot}
                                size="medium"
                                sx={{
                                  borderRadius: 999,
                                  border: "1.5px solid transparent",
                                  boxSizing: "border-box",
                                  minWidth: 120,
                                  minHeight: 36,
                                  bgcolor: "#d4edda",
                                  color: "#155724",
                                  fontWeight: 600,
                                  mt: 0.5,
                                }}
                              />
                            ))}
                          </Stack>
                        </Box>
                      ) : showLegacySlots ? (
                        <Box sx={{ mt: 1 }}>
                          <Stack direction="row" spacing={1.5} flexWrap="wrap">
                            {legacySlots.map((slot, idx) => (
                              <Chip
                                key={`legacy-${idx}`}
                                label={slot}
                                size="medium"
                                sx={{
                                  borderRadius: 999,
                                  border: "1.5px solid transparent",
                                  boxSizing: "border-box",
                                  minWidth: 120,
                                  minHeight: 36,
                                  bgcolor: "success.main",
                                  color: "#fff",
                                  fontWeight: 600,
                                  mt: 0.5,
                                }}
                              />
                            ))}
                          </Stack>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          Available (no specific time slots recorded)
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </Panel>
              );
            })}
          </Stack>
        )}
      </DialogContent>

      <Box sx={{ height: 8 }} />
    </Dialog>
  );
};
