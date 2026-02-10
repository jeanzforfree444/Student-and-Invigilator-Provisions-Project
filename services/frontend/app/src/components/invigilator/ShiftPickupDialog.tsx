import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  IconButton,
  Stack,
  CircularProgress,
  Chip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import AssignmentIndOutlinedIcon from "@mui/icons-material/AssignmentIndOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import { PillButton } from "../PillButton";

type ShiftPickupDialogProps = {
  open: boolean;
  examName?: string | null;
  venueName?: string | null;
  startLabel?: string;
  endLabel?: string;
  durationLabel?: string;
  roleLabel?: string;
  originalLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
  confirming?: boolean;
};

export const ShiftPickupDialog: React.FC<ShiftPickupDialogProps> = ({
  open,
  examName,
  venueName,
  startLabel,
  endLabel,
  durationLabel,
  roleLabel,
  originalLabel,
  onClose,
  onConfirm,
  confirming = false,
}) => {
  return (
    <Dialog open={open} onClose={confirming ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Confirm pickup
        <IconButton
          aria-label="close"
          onClick={onClose}
          disabled={confirming}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={1.5}>
          <Stack spacing={0.5}>
            <Typography variant="h6" fontWeight={700} noWrap title={examName || "Exam"}>
              {examName || "Exam"}
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography color="text.secondary">{venueName || "Venue TBC"}</Typography>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip
              icon={<AccessTimeIcon fontSize="small" sx={{ color: "#42307d !important" }} />}
              label={`${startLabel || "Start TBC"} – ${endLabel || "End TBC"}`}
              size="small"
              sx={{ bgcolor: "#ede9fe", color: "#42307d", fontWeight: 700 }}
            />
            {durationLabel && (
              <Chip
                icon={<HourglassEmptyIcon fontSize="small" sx={{ color: "#0d47a1 !important" }} />}
                label={durationLabel}
                size="small"
                sx={{ bgcolor: "#e3f2fd", color: "#0d47a1", fontWeight: 700 }}
              />
            )}
            {roleLabel && (
              <Chip
                icon={
                  <AssignmentIndOutlinedIcon fontSize="small" sx={{ color: "#166534 !important" }} />
                }
                label={roleLabel}
                size="small"
                sx={{
                  bgcolor: "#f0fdf4",
                  color: "#166534",
                  fontWeight: 700,
                  "& .MuiChip-icon": { color: "#166534" },
                }}
              />
            )}
            {originalLabel && (
              <Chip
                icon={<PersonOutlineIcon fontSize="small" sx={{ color: "#b45309 !important" }} />}
                label={`Originally: ${originalLabel}`}
                size="small"
                sx={{
                  bgcolor: "#fff4e5",
                  color: "#b45309",
                  fontWeight: 700,
                  "& .MuiChip-icon": { color: "#b45309" },
                }}
              />
            )}
          </Stack>

          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Please double-check the time and venue before confirming. This will add the shift to your timetable.
          </Typography>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <PillButton
          variant="contained"
          color="primary"
          onClick={onConfirm}
          disabled={confirming}
          startIcon={confirming ? <CircularProgress size={18} /> : undefined}
        >
          {confirming ? "Confirming..." : "Confirm"}
        </PillButton>
      </DialogActions>
    </Dialog>
  );
};

export default ShiftPickupDialog;
