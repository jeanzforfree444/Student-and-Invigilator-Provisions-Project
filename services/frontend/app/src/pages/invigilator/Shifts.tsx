import React, { useMemo } from "react";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Grid,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import WorkHistoryIcon from "@mui/icons-material/WorkHistory";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import AssignmentIndOutlinedIcon from "@mui/icons-material/AssignmentIndOutlined";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import { Panel } from "../../components/Panel";
import { PillButton } from "../../components/PillButton";
import { ShiftPickupDialog } from "../../components/invigilator/ShiftPickupDialog";
import { setInvigilatorShiftsUi, useAppDispatch, useAppSelector } from "../../state/store";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { formatDateTime, formatTime } from "../../utils/dates";

type AvailableShift = {
  id: number;
  invigilator?: number | null;
  invigilator_name?: string | null;
  exam_venue?: number | null;
  exam_name?: string | null;
  venue_name?: string | null;
  exam_start?: string | null;
  exam_length?: number | null;
  role?: string | null;
  assigned_start: string;
  assigned_end: string;
  notes?: string | null;
  break_time_minutes?: number | null;
};

const minutesToTime = (minutes: number) =>
  dayjs().startOf("day").add(minutes, "minute").format("HH:mm");

export const InvigilatorShifts: React.FC = () => {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const { snackbar, dialogShiftId } = useAppSelector((state) => state.adminTables.invigilatorShiftsUi);

  const {
    data: shifts = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<AvailableShift[]>({
    queryKey: ["invigilator-available-covers"],
    queryFn: async () => {
      const res = await apiFetch(`${apiBaseUrl}/invigilator-assignments/available-covers/`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to load available shifts");
      }
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Unexpected response shape");
      return data as AvailableShift[];
    },
  });

  const pickupMutation = useMutation({
    mutationFn: async (shiftId: number) => {
      const res = await apiFetch(`${apiBaseUrl}/invigilator-assignments/${shiftId}/pickup/`, {
        method: "POST",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to pick up shift");
      }
      return res.json();
    },
    onSuccess: () => {
      dispatch(
        setInvigilatorShiftsUi({
          snackbar: { open: true, message: "Shift picked up successfully!", severity: "success" },
        })
      );
      refetch();
      queryClient.invalidateQueries({ queryKey: ["invigilator-assignments"] });
      dispatch(setInvigilatorShiftsUi({ dialogShiftId: null }));
    },
    onError: (err: any) => {
      dispatch(
        setInvigilatorShiftsUi({
          snackbar: {
            open: true,
            message: err?.message || "Could not pick up this shift.",
            severity: "error",
          },
          dialogShiftId: null,
        })
      );
    },
  });

  const formattedShifts = useMemo(() => {
    return shifts
      .map((s) => {
        const start = dayjs(s.assigned_start);
        const end = dayjs(s.assigned_end);
        const fallbackStart = s.exam_start ? dayjs(s.exam_start) : null;
        const derivedEnd =
          fallbackStart && s.exam_length != null ? fallbackStart.add(s.exam_length, "minute") : null;
        const startTime = start.isValid() ? start : fallbackStart;
        const endTime = end.isValid() ? end : derivedEnd;
        return {
          ...s,
          start: startTime,
          end: endTime,
        };
      })
      .sort((a, b) => {
        if (!a.start || !b.start) return 0;
        return a.start.valueOf() - b.start.valueOf();
      });
  }, [shifts]);
  const dialogShift = useMemo(
    () => formattedShifts.find((shift) => shift.id === dialogShiftId) ?? null,
    [formattedShifts, dialogShiftId]
  );

  return (
    <Box sx={{ p: 3 }}>
      <Stack spacing={2.5}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
          spacing={1}
        >
          <Stack spacing={0.5}>
            <Typography variant="h4" fontWeight={700}>
              Shifts
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Pick up cancelled invigilation shifts that fit your schedule and help out your colleagues.
            </Typography>
          </Stack>
          <PillButton
            variant="outlined"
            onClick={() => refetch()}
            disabled={isLoading}
            size="small"
          >
            Refresh
          </PillButton>
        </Stack>

        <Panel
          disableDivider
          title={
            <Stack direction="row" spacing={1} alignItems="center">
              <WorkHistoryIcon fontSize="small" />
              <Typography variant="subtitle1" fontWeight={700}>
                Available shifts
              </Typography>
            </Stack>
          }
          sx={{
            mb: 1,
            background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
            borderColor: "#e0e7ff",
            boxShadow: "0 12px 35px rgba(79, 70, 229, 0.08)",
          }}
        >
          <Typography color="text.secondary">
            These shifts were cancelled by other invigilators and have no conflicts with your timetable.
            Review the details and pick one up to add it to your timetable.
          </Typography>
        </Panel>

        <Panel sx={{ p: 3 }}>
          {isLoading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <Stack spacing={1} alignItems="center">
                <CircularProgress />
                <Typography color="text.secondary">Loading shifts...</Typography>
              </Stack>
            </Box>
          )}

          {isError && (
            <Alert severity="error">
              {(error as Error)?.message || "Unable to load available shifts."}
            </Alert>
          )}

          {!isLoading && !isError && formattedShifts.length === 0 && (
            <Alert severity="info">No shifts are available to pick up right now.</Alert>
          )}

          <Grid container spacing={2.5} sx={{ mt: isLoading || isError ? 0 : 1 }}>
            {formattedShifts.map((shift) => {
              const isPicking = pickupMutation.isPending;
              const startLabel = shift.start?.isValid()
                ? formatDateTime(shift.start)
                : "Start time TBC";
              const endLabel = shift.end?.isValid()
                ? formatTime(shift.end)
                : shift.exam_length
                ? minutesToTime(shift.exam_length)
                : "End time TBC";
              const durationMinutes = shift.start && shift.end ? shift.end.diff(shift.start, "minute") : null;
              const invigilatorLabel = shift.invigilator_name || "Unknown";

              return (
                <Grid item xs={12} md={6} key={shift.id}>
                  <Box
                    sx={{
                      p: 2.5,
                      borderRadius: 3,
                      border: "1px solid #e5e7eb",
                      background: "linear-gradient(135deg, #f8fafc, #e3f2fd)",
                      boxShadow: "0 8px 25px rgba(0,0,0,0.04)",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      gap: 1.5,
                    }}
                  >
                    <Stack spacing={0.5}>
                      <Typography variant="h6" fontWeight={700} noWrap title={shift.exam_name || "Exam"}>
                        {shift.exam_name || "Exam"}
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <LocationOnOutlinedIcon fontSize="small" color="action" />
                        <Typography color="text.secondary">
                          {shift.venue_name || "Venue TBC"}
                        </Typography>
                      </Stack>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Chip
                        icon={<AccessTimeIcon fontSize="small" sx={{ color: "#42307d !important" }} />}
                        label={`${startLabel} – ${endLabel}`}
                        size="small"
                        sx={{ bgcolor: "#ede9fe", color: "#42307d", fontWeight: 700 }}
                      />
                      {durationMinutes != null && (
                        <Chip
                          icon={<HourglassEmptyIcon fontSize="small" sx={{ color: "#0d47a1 !important" }} />}
                          label={`${durationMinutes} minutes`}
                          size="small"
                          sx={{ bgcolor: "#e3f2fd", color: "#0d47a1", fontWeight: 700 }}
                        />
                      )}
                      {shift.role && (
                        <Chip
                          icon={
                            <AssignmentIndOutlinedIcon fontSize="small" sx={{ color: "#166534 !important" }} />
                          }
                          label={
                            shift.role === "lead"
                              ? "Lead invigilator"
                              : shift.role === "assistant"
                              ? "Assistant invigilator"
                              : shift.role === "support"
                              ? "Support invigilator"
                              : shift.role
                          }
                          size="small"
                          sx={{
                            bgcolor: "#f0fdf4",
                            color: "#166534",
                            fontWeight: 700,
                            "& .MuiChip-icon": { color: "#166534" },
                          }}
                        />
                      )}

                    </Stack>

                    {shift.notes && (
                      <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                        {shift.notes}
                      </Alert>
                    )}

                    <Box sx={{ mt: "auto" }}>
                      <Tooltip title="Add this shift to your timetable">
                        <span>
                          <PillButton
                            variant="contained"
                            color="primary"
                            fullWidth
                            onClick={() => dispatch(setInvigilatorShiftsUi({ dialogShiftId: shift.id }))}
                            disabled={isPicking}
                          >
                            {isPicking ? "Picking up..." : "Pick up shift"}
                          </PillButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Panel>
      </Stack>

      <ShiftPickupDialog
        open={Boolean(dialogShift)}
        examName={dialogShift?.exam_name}
        venueName={dialogShift?.venue_name}
        durationLabel={
          dialogShift?.start && dialogShift?.end
            ? `${dialogShift.end.diff(dialogShift.start, "minute")} minutes`
            : dialogShift?.exam_length
            ? `${dialogShift.exam_length} minutes`
            : undefined
        }
        roleLabel={
          dialogShift?.role
            ? dialogShift.role === "lead"
              ? "Lead invigilator"
              : dialogShift.role === "assistant"
              ? "Assistant invigilator"
              : dialogShift.role === "support"
              ? "Support invigilator"
              : dialogShift.role
            : undefined
        }
        originalLabel={dialogShift?.invigilator_name || undefined}
        startLabel={
          dialogShift?.start?.isValid() ? formatDateTime(dialogShift.start) : "Start time TBC"
        }
        endLabel={
          dialogShift?.end?.isValid()
            ? formatTime(dialogShift.end)
            : dialogShift?.exam_length
            ? minutesToTime(dialogShift.exam_length)
            : "End time TBC"
        }
        confirming={pickupMutation.isPending}
        onClose={() => dispatch(setInvigilatorShiftsUi({ dialogShiftId: null }))}
        onConfirm={() => dialogShift && pickupMutation.mutate(dialogShift.id)}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => dispatch(setInvigilatorShiftsUi({ snackbar: { ...snackbar, open: false } }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => dispatch(setInvigilatorShiftsUi({ snackbar: { ...snackbar, open: false } }))}
          severity={snackbar.severity}
          variant="filled"
          sx={
            snackbar.severity === "success"
              ? {
                  backgroundColor: "#d4edda",
                  color: "#155724",
                  border: "1px solid #155724",
                  borderRadius: "50px",
                  fontWeight: 500,
                }
              : undefined
          }
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default InvigilatorShifts;


