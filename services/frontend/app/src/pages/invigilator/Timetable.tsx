import React, { useEffect, useMemo, useRef } from "react";
import dayjs, { Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/en-gb";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { StaticDatePicker } from "@mui/x-date-pickers";
import {
  Box,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography,
  Tooltip,
  Drawer,
  IconButton,
  TextField,
  Alert,
  Snackbar,
} from "@mui/material";
import { useQuery, useMutation } from "@tanstack/react-query";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ArrowForward from "@mui/icons-material/ArrowForward";
import Today from "@mui/icons-material/Today";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import AvTimerIcon from "@mui/icons-material/AvTimer";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CheckIcon from "@mui/icons-material/Check";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import CloseIcon from "@mui/icons-material/Close";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import { Panel } from "../../components/Panel";
import { PillButton } from "../../components/PillButton";
import { sharedInputSx } from "../../components/sharedInputSx";
import { apiBaseUrl, apiFetch, getStoredUser } from "../../utils/api";
import { formatDateWithWeekday, formatDateTime, formatTime } from "../../utils/dates";
import { setInvigilatorTimetableUi, useAppDispatch, useAppSelector } from "../../state/store";

dayjs.extend(customParseFormat);

interface Exam {
  id: string;
  title: string;
  location: string;
  start: string;
  end: string;
  assignedStart: string;
  assignedEnd: string;
  date: string;
  confirmed?: boolean;
  cancel?: boolean;
}

interface InvigilatorAssignment {
  id: number;
  exam_name?: string | null;
  venue_name?: string | null;
  provision_capabilities?: string[] | null;
  student_provisions?: string[] | null;
  student_provision_notes?: string[] | null;
  assigned_start: string;
  assigned_end: string;
  exam_start?: string | null;
  exam_length?: number | null;
  role?: string | null;
  break_time_minutes?: number | null;
  notes?: string | null;
  confirmed?: boolean | null;
  cancel?: boolean | null;
  cover?: boolean | null;
  cancel_cause?: string | null;
  cover_filled?: boolean | null;
}

const timeToMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
};

const minutesToTime = (minutes: number) =>
  dayjs().startOf("day").add(minutes, "minute").format("HH:mm");

const formatProvisionLabel = (value: string) => {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export const InvigilatorTimetable: React.FC = () => {
  const dispatch = useAppDispatch();
  const today = dayjs();
  const {
    selectedDate: selectedDateIso,
    dateInput,
    month: monthIso,
    drawerOpen,
    drawerAssignmentId,
    cancelNote,
    drawerMode,
    snackbar,
  } = useAppSelector((state) => state.adminTables.invigilatorTimetableUi);
  const selectedDate = selectedDateIso ? dayjs(selectedDateIso) : today;
  const month = monthIso ? dayjs(monthIso) : dayjs().startOf("month");
  const lastSyncedDateRef = useRef<string | null>(null);

  const {
    data: assignments = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<InvigilatorAssignment[]>({
    queryKey: ["invigilator-assignments"],
    queryFn: async () => {
      const url = `${apiBaseUrl}/invigilator/assignments/`;
      const res = await apiFetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to load assignments");
      }
      const data = await res.json();
      if (Array.isArray(data)) return data as InvigilatorAssignment[];
      if (Array.isArray(data?.results)) return data.results as InvigilatorAssignment[];
      if (Array.isArray(data?.assignments)) return data.assignments as InvigilatorAssignment[];
      throw new Error("Assignments data missing");
    },
  });

  const currentInvigilatorId = getStoredUser()?.invigilator_id ?? null;
  const visibleAssignments = useMemo(() => {
    if (!currentInvigilatorId) return assignments || [];
    return (assignments || []).filter((a) => (a as any).invigilator === currentInvigilatorId);
  }, [assignments, currentInvigilatorId]);

  const examEvents: Exam[] = useMemo(
    () =>
      visibleAssignments.map((a) => {
        const assignedStart = a.assigned_start ? dayjs(a.assigned_start) : null;
        const assignedEnd = a.assigned_end ? dayjs(a.assigned_end) : null;

        const examStart = a.exam_start ? dayjs(a.exam_start) : null;
        const examEnd =
          examStart && a.exam_length != null
            ? examStart.add(a.exam_length, "minute")
            : null;

        const start = examStart && examStart.isValid() ? examStart : assignedStart;
        const end = examEnd && examEnd.isValid() ? examEnd : assignedEnd;
        const assignedStartValue = assignedStart && assignedStart.isValid() ? assignedStart : null;
        const assignedEndValue = assignedEnd && assignedEnd.isValid() ? assignedEnd : null;
        return {
          id: String(a.id),
          title: a.exam_name || "Exam",
          location: a.venue_name || "Venue TBC",
          start: start && start.isValid() ? start.format("HH:mm") : "",
          end: end && end.isValid() ? end.format("HH:mm") : "",
          assignedStart: assignedStartValue ? assignedStartValue.format("HH:mm") : "",
          assignedEnd: assignedEndValue ? assignedEndValue.format("HH:mm") : "",
          date: start && start.isValid() ? start.format("YYYY-MM-DD") : "",
          confirmed: Boolean(a.confirmed),
          cancel: Boolean(a.cancel),
        };
      }),
    [visibleAssignments]
  );

  const drawerAssignment =
    drawerAssignmentId != null
      ? visibleAssignments.find((a) => a.id === drawerAssignmentId) || null
      : null;

  const requestCancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const res = await apiFetch(`${apiBaseUrl}/invigilator-assignments/${id}/request-cancel/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to request cancellation");
      }
      return res.json();
    },
    onSuccess: () => {
      refetch();
      dispatch(
        setInvigilatorTimetableUi({
          drawerOpen: false,
          cancelNote: "",
          snackbar: { open: true, message: "Cancellation requested.", severity: "success" },
        })
      );
    },
  });

  const undoCancelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const res = await apiFetch(`${apiBaseUrl}/invigilator-assignments/${id}/undo-cancel/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to undo cancellation");
      }
      return res.json();
    },
    onSuccess: () => {
      refetch();
      dispatch(
        setInvigilatorTimetableUi({
          drawerOpen: false,
          cancelNote: "",
          snackbar: { open: true, message: "Cancellation withdrawn.", severity: "success" },
        })
      );
    },
  });

  const selectedDayKey = selectedDate?.format("YYYY-MM-DD");

  const examsForSelectedDay = selectedDayKey
    ? examEvents
        .filter((e) => e.date === selectedDayKey)
        .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
    : [];

  const examDates = useMemo(() => examEvents.map((e) => e.date), [examEvents]);

  const goToMonth = (newMonth: Dayjs) => {
    const nextMonth = newMonth.startOf("month");
    if (newMonth.isSame(today, "month")) {
      dispatch(setInvigilatorTimetableUi({ month: nextMonth.toISOString(), selectedDate: today.toISOString() }));
    } else {
      dispatch(setInvigilatorTimetableUi({ month: nextMonth.toISOString(), selectedDate: null }));
    }
  };

  const setDay = (dayValue: Dayjs | null) => {
    if (!dayValue) {
      dispatch(setInvigilatorTimetableUi({ selectedDate: null }));
      return;
    }
    dispatch(
      setInvigilatorTimetableUi({
        selectedDate: dayValue.toISOString(),
        month: dayValue.startOf("month").toISOString(),
      })
    );
  };

  useEffect(() => {
    const nextInput = selectedDate ? selectedDate.format("YYYY-MM-DD") : "";
    if (lastSyncedDateRef.current !== nextInput) {
      lastSyncedDateRef.current = nextInput;
      dispatch(setInvigilatorTimetableUi({ dateInput: nextInput }));
    }
  }, [dispatch, selectedDate]);

  const handleToday = () => setDay(today);
  const handlePrevDay = () =>
    setDay((selectedDate || today).subtract(1, "day"));
  const handleNextDay = () => setDay((selectedDate || today).add(1, "day"));

  const friendlyDate = selectedDate
    ? formatDateWithWeekday(selectedDate)
    : "Pick a day to see exams";
  const headerDate = formatDateWithWeekday(selectedDate ?? month);

  const openDrawer = (assignment: InvigilatorAssignment, mode: "request" | "undo" = "request") => {
    dispatch(
      setInvigilatorTimetableUi({
        drawerAssignmentId: assignment.id,
        cancelNote: "",
        drawerMode: mode,
        drawerOpen: true,
      })
    );
  };

  const closeDrawer = () => {
    dispatch(setInvigilatorTimetableUi({ drawerOpen: false, cancelNote: "" }));
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
      <Box sx={{ p: 3 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
          spacing={1}
          sx={{ mb: 2 }}
        >
          <Stack spacing={0.5}>
            <Typography variant="h4" fontWeight={700}>
              Timetable
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Browse your upcoming exams, jump between days, and quickly pick any
              date from the calendar.
            </Typography>
          </Stack>
          <Typography variant="h6" color="text.secondary">
            {headerDate}
          </Typography>
        </Stack>

        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", md: "center" }}
          justifyContent="space-between"
          sx={{ mb: 2.5 }}
        >
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Tooltip title="Go to the previous day">
              <Box>
                <PillButton
                  variant="outlined"
                  size="medium"
                  startIcon={<ArrowBack />}
                  onClick={handlePrevDay}
                >
                  Previous
                </PillButton>
              </Box>
            </Tooltip>
            <Tooltip title="Jump back to today">
              <Box>
                <PillButton
                  variant="contained"
                  size="medium"
                  color="primary"
                  startIcon={<Today />}
                  onClick={handleToday}
                >
                  Today
                </PillButton>
              </Box>
            </Tooltip>
            <Tooltip title="Skip forward to the next day">
              <Box>
                <PillButton
                  variant="outlined"
                  size="medium"
                  endIcon={<ArrowForward />}
                  onClick={handleNextDay}
                >
                  Next
                </PillButton>
              </Box>
            </Tooltip>
            <Tooltip title="Pick a specific date">
              <Box>
                <TextField
                  label="Select a date"
                  type="date"
                  size="small"
                  value={dateInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    dispatch(setInvigilatorTimetableUi({ dateInput: value }));
                    if (!value) {
                      setDay(null);
                      return;
                    }
                    const parsed = dayjs(value, "YYYY-MM-DD", true);
                    if (parsed.isValid()) {
                      setDay(parsed);
                    }
                  }}
                  InputLabelProps={{ shrink: true }}
                  sx={[sharedInputSx, { minWidth: 220 }]}
                />
              </Box>
            </Tooltip>
          </Stack>
        </Stack>

        <Panel
          disableDivider
          title={
            <Stack direction="row" spacing={1} alignItems="center">
              <CalendarTodayOutlinedIcon fontSize="small" />
              <Typography variant="subtitle1" fontWeight={700}>
                Schedule at a glance
              </Typography>
            </Stack>
          }
          sx={{
            mb: 3,
            background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
            borderColor: "#e0e7ff",
            boxShadow: "0 12px 35px rgba(79, 70, 229, 0.08)",
          }}
        >
          <Typography color="text.secondary">
            Select a day from the calendar or use the navigation buttons to get started.
            <br />
            Each exam shows your assigned arrival and departure times, plus location and status.
          </Typography>
        </Panel>

        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={2.5}
          alignItems="stretch"
        >
          <Box sx={{ flexShrink: 0, width: { xs: "100%", lg: 350 } }}>
            <Panel
              title="Calendar"
              sx={{
                height: 375,
                maxHeight: 375,
                overflow: "visible",
              }}
            >
              <StaticDatePicker
                value={selectedDate}
                onChange={(newValue) => setDay(newValue)}
                onMonthChange={(newMonth) => {
                  goToMonth(newMonth);
                }}
                referenceDate={month}
                slots={{
                  toolbar: () => null,
                  calendarHeader: () => null,
                  layout: (props) => <>{props.children}</>,
                }}
                slotProps={{
                  day: (ownerState) => ({
                    sx: examDates.includes(
                      (ownerState.day as Dayjs).format("YYYY-MM-DD")
                    )
                      ? {
                          "&::after": {
                            content: '""',
                            position: "absolute",
                            bottom: 6,
                            right: 6,
                            width: 10,
                            height: 10,
                            bgcolor: "success.main",
                            borderRadius: "50%",
                            border: "2px solid white",
                          },
                        }
                      : {},
                  }),
                }}
                views={["day"]}
                showDaysOutsideCurrentMonth
                sx={{
                  "--DateCalendar-daySize": "68px",
                  "--DateCalendar-slideTransitionHeight": "420px",
                  width: "100%",
                  "& .MuiDateCalendar-root": {
                    width: "100%",
                    maxWidth: "none",
                    minWidth: 900,
                    mx: "auto",
                    transform: "scale(1.4)",
                    transformOrigin: "top center",
                  },
                  "& .MuiDayCalendar-monthContainer": {
                    px: 4,
                    pb: 3.5,
                  },
                  "& .MuiPickersDay-root": {
                    width: 74,
                    height: 74,
                    fontSize: "1.15rem",
                  },
                  "& .MuiDayCalendar-weekContainer": {
                    justifyContent: "space-between",
                    px: 1.5,
                  },
                  "& .MuiPickersSlideTransition-root": {
                    minHeight: 440,
                  },
                  "& .MuiPickersDay-dayOutsideMonth": {
                    opacity: 0.55,
                  },
                  "& .MuiPickersDay-today": {
                    borderColor: "primary.main",
                  },
                }}
              />
            </Panel>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Panel
              title="Schedule"
              actions={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    label={`${examsForSelectedDay.length} exam${
                      examsForSelectedDay.length === 1 ? "" : "s"
                    }`}
                    size="medium"
                    sx={{
                      backgroundColor: "#e3f2fd",
                      color: "#0d47a1",
                      fontWeight: 600,
                    }}
                  />
                </Stack>
              }
              sx={{
                height: 375,
                width: "100%",
                overflow: "visible",
              }}
            >
              {isLoading && (
                <Box sx={{ textAlign: "center", py: 4 }}>
                  <Typography color="text.secondary">Loading assignments...</Typography>
                </Box>
              )}
              {isError && (
                <Box sx={{ textAlign: "center", py: 4 }}>
                  <Typography color="error">
                    {error?.message || "Failed to load assignments."}
                  </Typography>
                </Box>
              )}
              {!isLoading && !isError && (
                examsForSelectedDay.length === 0 ? (
                  <Box
                    sx={{
                      textAlign: "center",
                      py: 6,
                      color: "text.secondary",
                      border: "1px dashed #e5e7eb",
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="h6" fontWeight={700} gutterBottom>
                      No exams on this day
                    </Typography>
                    <Typography>
                      Select a day with a green dot to view the schedule.
                    </Typography>
                  </Box>
                ) : (
                  <Grid container spacing={2.5}>
                    {examsForSelectedDay.map((event) => {
                      const examStartMinutes = timeToMinutes(event.start);
                      const examEndMinutes = timeToMinutes(event.end);
                      const assignedStartMinutes = timeToMinutes(event.assignedStart);
                      const assignedEndMinutes = timeToMinutes(event.assignedEnd);
                      const hasAssignedTimes = Boolean(event.assignedStart) && Boolean(event.assignedEnd);
                      const hasExamTimes = Boolean(event.start) && Boolean(event.end);
                      const duration = hasAssignedTimes
                        ? Math.max(0, assignedEndMinutes - assignedStartMinutes)
                        : hasExamTimes
                        ? Math.max(0, examEndMinutes - examStartMinutes)
                        : null;
                      const arrivalTime = event.assignedStart || "TBC";
                      const departureTime = event.assignedEnd || "TBC";
                      const isConfirmed = event.confirmed === true;
                      const isCancelled = event.cancel === true;
                      const statusChip = (() => {
                        if (isCancelled) {
                          return {
                            label: isConfirmed ? "Cancelled" : "Cancellation requested",
                            bg: "#ffebee",
                            fg: "#b71c1c",
                            icon: (
                              <CloseIcon
                                fontSize="small"
                                sx={{ color: "#b71c1c !important" }}
                              />
                            ),
                          };
                        }
                        if (isConfirmed) {
                          return {
                            label: "Confirmed",
                            bg: "#e8f5e9",
                            fg: "#1b5e20",
                            icon: (
                              <CheckIcon
                                fontSize="small"
                                sx={{ color: "#1b5e20 !important" }}
                              />
                            ),
                          };
                        }
                        return {
                          label: "Pending confirmation",
                          bg: "#fff4e5",
                          fg: "#b45309",
                          icon: (
                            <HourglassEmptyIcon
                              fontSize="small"
                              sx={{ color: "#b45309 !important" }}
                            />
                          ),
                        };
                      })();
                      const correspondingAssignment = visibleAssignments.find((a) => String(a.id) === event.id) || null;
                      const coverFilled = correspondingAssignment?.cover_filled === true;
                      const canRequestCancel =
                        !isCancelled &&
                        correspondingAssignment?.assigned_start &&
                        dayjs(correspondingAssignment.assigned_start).isAfter(dayjs());
                      const canUndoCancel = isCancelled && !coverFilled;

                      return (
                        <Grid item xs={12} sm={6} key={event.id}>
                          <Box
                            sx={{
                              display: "grid",
                              gridTemplateColumns: { xs: "1fr", sm: "150px 1fr" },
                              gap: 2.5,
                              p: 2.5,
                              borderRadius: 3,
                              border: "1px solid #e5e7eb",
                              background:
                                "linear-gradient(135deg, #f8fafc, #e3f2fd)",
                              boxShadow: "0 8px 25px rgba(0,0,0,0.04)",
                              minHeight: 260,
                              height: "100%",
                              alignItems: "center",
                            }}
                          >
                            <Stack
                              spacing={1.2}
                              alignItems="flex-start"
                              sx={{ minWidth: 130, justifySelf: "center" }}
                            >
                              <Typography variant="body2" color="text.secondary">
                                Start
                              </Typography>
                              <Typography fontWeight={700} fontSize="1.15rem">
                                {event.start || "TBC"}
                              </Typography>
                              <Divider sx={{ width: "100%", my: 0.5 }} />
                              <Typography variant="body2" color="text.secondary">
                                End
                              </Typography>
                              <Typography fontWeight={700} fontSize="1.15rem">
                                {event.end || "TBC"}
                              </Typography>
                            </Stack>

                            <Stack spacing={1.2} justifyContent="center">
                              <Typography
                                variant="h6"
                                fontWeight={700}
                                sx={{
                                  maxWidth: 240,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={event.title}
                              >
                                {event.title}
                              </Typography>
                              <Stack
                                direction="row"
                                spacing={1.2}
                                alignItems="center"
                              >
                                <LocationOnOutlinedIcon
                                  fontSize="small"
                                  color="action"
                                />
                                <Typography
                                  variant="body1"
                                  color="text.secondary"
                                >
                                  {event.location}
                                </Typography>
                              </Stack>
                              <Divider sx={{ width: "100%", my: 0.5 }} />
                              <Stack direction="column" spacing={0.8} alignItems="flex-start">
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Tooltip
                                    title={
                                      isCancelled
                                        ? statusChip.label
                                        : isConfirmed
                                        ? "This shift is confirmed"
                                        : "Awaiting confirmation"
                                    }
                                  >
                                    <Chip
                                      size="small"
                                      label={statusChip.label}
                                      icon={statusChip.icon}
                                      sx={{
                                        bgcolor: statusChip.bg,
                                        color: statusChip.fg,
                                        fontWeight: 700,
                                        "& .MuiChip-icon": { color: statusChip.fg },
                                      }}
                                    />
                                  </Tooltip>
                                  {correspondingAssignment && (
                                    <Tooltip title="View shift details">
                                      <span>
                                        <IconButton
                                          size="small"
                                          color="primary"
                                          aria-label="View shift details"
                                          data-testid={`view-details-${event.id}`}
                                          onClick={() =>
                                            openDrawer(
                                              correspondingAssignment,
                                              correspondingAssignment.cancel ? "undo" : "request"
                                            )
                                          }
                                        >
                                          <InfoOutlinedIcon fontSize="small" />
                                        </IconButton>
                                      </span>
                                    </Tooltip>
                                  )}
                                </Stack>
                                <Tooltip title="Total scheduled duration">
                                  <Chip
                                    size="small"
                                    label={
                                      duration != null
                                        ? `${duration} minutes`
                                        : "Duration TBC"
                                    }
                                    icon={<AccessTimeIcon fontSize="small" sx={{ color: "#42307d !important" }} />}
                                    sx={{
                                      bgcolor: "#ede9fe",
                                      color: "#42307d",
                                      fontWeight: 700,
                                      "& .MuiChip-icon": { color: "#42307d" },
                                    }}
                                  />
                                </Tooltip>
                                <Tooltip title="Arrival time">
                                  <Chip
                                    icon={<AvTimerIcon fontSize="small" sx={{ color: "#1b5e20 !important" }} />}
                                    label={`Arrive by ${arrivalTime}`}
                                    size="small"
                                    sx={{
                                      bgcolor: "#e8f5e9",
                                      color: "#1b5e20",
                                      fontWeight: 700,
                                      "& .MuiChip-icon": { color: "#1b5e20" },
                                    }}
                                  />
                                </Tooltip>
                                <Tooltip title="Departure time">
                                  <Chip
                                    icon={<AvTimerIcon fontSize="small" sx={{ color: "#b45309 !important", transform: "scaleX(-1)" }} />}
                                    label={`Depart at ${departureTime}`}
                                    size="small"
                                    sx={{
                                      bgcolor: "#fff4e5",
                                      color: "#b45309",
                                      fontWeight: 700,
                                      "& .MuiChip-icon": { color: "#b45309" },
                                    }}
                                  />
                                </Tooltip>
                              </Stack>
                            </Stack>
                          </Box>
                        </Grid>
                      );
                    })}
                  </Grid>
                )
              )}
            </Panel>
          </Box>
        </Stack>
      </Box>
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={closeDrawer}
        PaperProps={{ sx: { width: { xs: "100%", sm: 420 }, p: 3 } }}
      >
        {drawerAssignment ? (
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" fontWeight={700}>
                {drawerMode === "undo" ? "Withdraw cancellation" : "Shift details"}
              </Typography>
              <IconButton onClick={closeDrawer} aria-label="Close">
                <CloseIcon />
              </IconButton>
            </Stack>

            <Stack spacing={0.5}>
              <Typography fontWeight={700}>{drawerAssignment.exam_name || "Exam"}</Typography>
              <Typography color="text.secondary">
                {formatDateTime(drawerAssignment.assigned_start)} - {formatTime(drawerAssignment.assigned_end)}
              </Typography>
              <Typography color="text.secondary">
                {drawerAssignment.venue_name || "Venue TBC"}
              </Typography>
            </Stack>

            {(() => {
              const now = dayjs();
              const windowStart = dayjs(drawerAssignment.assigned_start);
              const windowEnd = dayjs(drawerAssignment.assigned_end);
              const withinWindow = windowStart.isValid()
                && windowEnd.isValid()
                && (now.isAfter(windowStart) || now.isSame(windowStart))
                && (now.isBefore(windowEnd) || now.isSame(windowEnd));

              if (!withinWindow) {
                return (
                  <Alert severity="info">
                    Provisions & notes are available during your assigned shift.
                  </Alert>
                );
              }

              const hasProvisions = Boolean(drawerAssignment.student_provisions?.length);
              const notes = (drawerAssignment.student_provision_notes || []).map((note) => note.trim()).filter(Boolean);
              return (
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} mb={1}>
                    Provisions & notes
                  </Typography>
                  {hasProvisions ? (
                    <Stack direction="row" flexWrap="wrap" sx={{ columnGap: 1, rowGap: 1 }}>
                      {drawerAssignment.student_provisions?.map((cap) => (
                        <Chip
                          key={cap}
                          label={formatProvisionLabel(cap)}
                          size="small"
                          sx={{ bgcolor: "#eef2ff", color: "#1e3a8a", fontWeight: 600 }}
                        />
                      ))}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No provisions listed.
                    </Typography>
                  )}
                  {notes.length > 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {notes.join(" • ")}
                    </Typography>
                  )}
                </Box>
              );
            })()}

            {(() => {
              const canRequestCancel =
                !drawerAssignment.cancel &&
                drawerAssignment.assigned_start &&
                dayjs(drawerAssignment.assigned_start).isAfter(dayjs());
              const canUndoCancel = Boolean(drawerAssignment.cancel) && !drawerAssignment.cover_filled;
              if (!canRequestCancel && !canUndoCancel) {
                return (
                  <Alert severity="info">
                    Cancellation requests are not available for this shift.
                  </Alert>
                );
              }
              return (
                <>
                  <TextField
                    label="Reason"
                    required
                    multiline
                    minRows={3}
                    value={cancelNote}
                    onChange={(e) => dispatch(setInvigilatorTimetableUi({ cancelNote: e.target.value }))}
                    sx={[
                      sharedInputSx,
                      {
                        height: "auto",
                        "& .MuiInputBase-root": { minHeight: 96 },
                        "& .MuiInputBase-input": { py: 1 },
                      },
                    ]}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                    {!cancelNote.trim() ? "Please provide a brief reason for your request." : " "}
                  </Typography>

                  {(drawerMode === "request" ? requestCancelMutation.isError : undoCancelMutation.isError) && (
                    <Alert severity="error">
                      {((drawerMode === "request" ? requestCancelMutation.error : undoCancelMutation.error) as Error)
                        ?.message || "Unable to submit request."}
                    </Alert>
                  )}

                  <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
                    <PillButton
                      variant="contained"
                      color={drawerMode === "undo" ? "primary" : "error"}
                      fullWidth
                      onClick={() => {
                        if (!drawerAssignment) return;
                        const trimmedNote = cancelNote.trim();
                        if (!trimmedNote) return;
                        return drawerMode === "undo"
                          ? undoCancelMutation.mutate({ id: drawerAssignment.id, reason: trimmedNote })
                          : requestCancelMutation.mutate({ id: drawerAssignment.id, reason: trimmedNote });
                      }}
                      disabled={
                        !cancelNote.trim() ||
                        (drawerMode === "undo" ? undoCancelMutation.isPending : requestCancelMutation.isPending)
                      }
                    >
                      {drawerMode === "undo"
                        ? undoCancelMutation.isPending
                          ? "Submitting..."
                          : "Withdraw cancellation"
                        : requestCancelMutation.isPending
                        ? "Requesting..."
                        : "Submit request"}
                    </PillButton>
                  </Stack>
                </>
              );
            })()}
          </Stack>
        ) : (
          <Typography>No shift selected.</Typography>
        )}
      </Drawer>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => dispatch(setInvigilatorTimetableUi({ snackbar: { ...snackbar, open: false } }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => dispatch(setInvigilatorTimetableUi({ snackbar: { ...snackbar, open: false } }))}
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
    </LocalizationProvider>
  );
};

export default InvigilatorTimetable;
