import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
  Fab,
  Tooltip,
  Snackbar,
  Grid,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useNavigate, useParams } from "react-router-dom";
import { Edit, Delete } from "@mui/icons-material";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { formatDateTime } from "../../utils/dates";
import { AssignInvigilatorDialog } from "../../components/admin/AssignInvigilatorDialog";
import { EditExamDialog } from "../../components/admin/EditExamDialog";
import { DeleteConfirmationDialog } from "../../components/admin/DeleteConfirmationDialog";
import { PillButton } from "../../components/PillButton";
import { Panel } from "../../components/Panel";
import { resetExamPageUi, setExamPageUi, useAppDispatch, useAppSelector } from "../../state/store";

type ExamVenue = {
  examvenue_id: number;
  exam: number;
  venue_name: string | null;
  start_time: string | null;
  exam_length: number | null;
  core: boolean;
  provision_capabilities: string[];
  students_count?: number | null;
};

type ExamData = {
  exam_id: number;
  exam_name: string;
  course_code: string;
  exam_type: string;
  no_students: number;
  exam_school: string;
  school_contact: string;
  exam_venues: ExamVenue[];
};

type Invigilator = {
  id: number;
  preferred_name: string | null;
  full_name: string | null;
  resigned: boolean;
  availabilities?: { date: string; slot: "MORNING" | "EVENING"; available: boolean }[];
  qualifications?: { qualification: string }[];
};

type InvigilatorAssignment = {
  id: number;
  invigilator: number;
  exam_venue: number;
  assigned_start: string;
  assigned_end: string;
  cancel?: boolean;
};

type ExamRouteParams = {
  examId?: string;
};

const fetchExam = async (examId: string): Promise<ExamData> => {
  const response = await apiFetch(`${apiBaseUrl}/exams/${examId}/`);
  if (!response.ok) throw new Error("Unable to load exam");
  return response.json();
};

const fetchInvigilators = async (): Promise<Invigilator[]> => {
  const response = await apiFetch(`${apiBaseUrl}/invigilators/`);
  if (!response.ok) throw new Error("Unable to load invigilators");
  return response.json();
};

const fetchAssignments = async (): Promise<InvigilatorAssignment[]> => {
  const response = await apiFetch(`${apiBaseUrl}/invigilator-assignments/`);
  if (!response.ok) throw new Error("Unable to load invigilator assignments");
  const data = await response.json();
  if (Array.isArray(data)) return data as InvigilatorAssignment[];
  if (Array.isArray(data?.results)) return data.results as InvigilatorAssignment[];
  if (Array.isArray(data?.assignments)) return data.assignments as InvigilatorAssignment[];
  return [];
};

const formatDuration = (minutes?: number | null) => {
  if (minutes == null || Number.isNaN(minutes)) return "N/A";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return [hrs ? `${hrs}h` : "", mins ? `${mins}m` : ""].filter(Boolean).join(" ") || "0m";
};

const formatExamType = (code?: string) => {
  if (!code) return "N/A";
  const normalized = code.trim().toUpperCase();
  if (normalized === "ONCM") return "On campus";
  if (normalized === "CMOL") return "On campus online";
  return code;
};

const formatSchool = (text?: string): string => {
  if (!text) return "Unknown";

  return text
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export const AdminExamDetails: React.FC = () => {
  const { examId } = useParams<ExamRouteParams>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const {
    editOpen,
    successOpen,
    successMessage,
    deleteOpen,
    deleting,
    assignOpen,
    assignVenueId,
  } = useAppSelector((state) => state.adminTables.examPage);

  useEffect(() => {
    dispatch(resetExamPageUi());
    return () => {
      dispatch(resetExamPageUi());
    };
  }, [dispatch, examId]);

  const { data, isLoading, isError, error, refetch } = useQuery<ExamData, Error>({
    queryKey: ["exam", examId],
    queryFn: () => fetchExam(examId || ""),
    enabled: Boolean(examId),
  });
  const { data: invigilators = [] } = useQuery<Invigilator[], Error>({
    queryKey: ["invigilators"],
    queryFn: fetchInvigilators,
  });
  const { data: assignments = [] } = useQuery<InvigilatorAssignment[], Error>({
    queryKey: ["invigilator-assignments"],
    queryFn: fetchAssignments,
  });

  if (isLoading) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading exam...</Typography>
      </Box>
    );
  }

  if (isError || !data) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">{error?.message || "Failed to load exam"}</Alert>
      </Box>
    );
  }

  const studentsPerInvigilator = 50;
  const coreVenue = data.exam_venues.find((ev) => ev.core) || data.exam_venues[0];
  const coreVenueId = coreVenue?.examvenue_id ?? null;
  const extraVenues = data.exam_venues.filter((ev) => !coreVenue || ev.examvenue_id !== coreVenue.examvenue_id);
  const extraStudentsTotal = extraVenues.reduce((sum, ev) => sum + (ev.students_count ?? 0), 0);
  const totalStudents = data.no_students ?? 0;

  const venueStats = data.exam_venues.map((venue) => {
    const students =
      coreVenueId && venue.examvenue_id === coreVenueId
        ? Math.max(totalStudents - extraStudentsTotal, 0)
        : (venue.students_count ?? 0);
    const required = Math.ceil(students / studentsPerInvigilator);
    const assigned = assignments.filter(
      (assignment) => assignment.exam_venue === venue.examvenue_id && !assignment.cancel
    ).length;
    return {
      venue,
      students,
      required,
      assigned,
      remaining: Math.max(required - assigned, 0),
      ratioMet: assigned >= required,
    };
  });
  const ratioLabel = `1:${studentsPerInvigilator}`;
  const venueStatsById = new Map(venueStats.map((stat) => [stat.venue.examvenue_id, stat]));
  const assignVenue =
    assignVenueId != null
      ? data.exam_venues.find((venue) => venue.examvenue_id === assignVenueId) || null
      : null;

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" rowGap={1.5}>
        <Box>
          <Typography variant="h4" fontWeight={700}>{data.exam_name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {data.course_code} • {formatExamType(data.exam_type)}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Chip
            label={`${data.no_students} Students`}
            size="medium"
            sx={{
              backgroundColor: "#f0f0f0ff",
              fontWeight: 600,
            }}
          />
          <Chip
            label={formatSchool(data.exam_school) || "School"}
            size="medium"
            sx={{
              backgroundColor: "#e3f2fd",
              color: "primary.main",
              fontWeight: 600,
            }}
          />
        </Stack>
      </Stack>

      <Panel title="Exam details">
        <Stack spacing={1.2}>
          <Typography variant="body2"><strong>Course code:</strong> {data.course_code}</Typography>
          <Typography variant="body2"><strong>Exam type:</strong> {formatExamType(data.exam_type)}</Typography>
          <Typography variant="body2"><strong>School contact:</strong> {data.school_contact || "N/A"}</Typography>
        </Stack>
      </Panel>

      <Panel title="Main venue">
        {coreVenue ? (
          <Stack spacing={1}>
            <Typography variant="subtitle1" fontWeight={600}>{coreVenue.venue_name || "Unassigned"}</Typography>
            <Typography variant="body2" color="text.secondary">{formatDateTime(coreVenue.start_time)}</Typography>
            <Typography variant="body2">Duration: {formatDuration(coreVenue.exam_length)}</Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" rowGap={1}>
              <PillButton
                variant="outlined"
                onClick={() => {
                  dispatch(setExamPageUi({ assignVenueId: coreVenue.examvenue_id, assignOpen: true }));
                }}
              >
                Assign invigilator
              </PillButton>
              {(() => {
                const stats = venueStatsById.get(coreVenue.examvenue_id);
                if (!stats) return null;
                return (
                  <Tooltip
                    title={(
                      <Stack spacing={0.5}>
                        <Typography variant="caption">Target ratio: {ratioLabel}</Typography>
                        <Typography variant="caption">
                          {stats.assigned}/{stats.required} ({stats.students} students)
                        </Typography>
                        {!stats.ratioMet && stats.remaining > 0 && (
                          <Typography variant="caption">{stats.remaining} more needed for this venue</Typography>
                        )}
                      </Stack>
                    )}
                  >
                    <Chip
                      label={`Invigilators: ${stats.assigned} / ${stats.required}`}
                      size="medium"
                      sx={{
                        fontWeight: 700,
                        backgroundColor: stats.ratioMet ? alpha("#2e7d32", 0.12) : "#fff4e5",
                        color: stats.ratioMet ? "success.main" : "#b45309",
                      }}
                    />
                  </Tooltip>
                );
              })()}
            </Stack>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">No venue assigned.</Typography>
        )}
      </Panel>

      <Panel title="Additional venues">
        {extraVenues.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No additional venues.</Typography>
        ) : (
          <Grid container spacing={2} alignItems="stretch">
            {extraVenues.map((ev) => (
              <Grid item xs={12} sm={6} md={4} key={ev.examvenue_id} sx={{ display: "flex" }}>
                <Panel
                  disableDivider
                  sx={{
                    p: 2,
                    mb: 0,
                    width: "100%",
                    borderRadius: 2,
                  }}
                >
                  <Typography variant="subtitle1" fontWeight={600}>
                    {ev.venue_name || "Unassigned"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">{formatDateTime(ev.start_time)}</Typography>
                  <Typography variant="body2">Duration: {formatDuration(ev.exam_length)}</Typography>
                  <Box sx={{ mt: 1, display: "flex", justifyContent: "center", width: "100%" }}>
                    {(() => {
                      const stats = venueStatsById.get(ev.examvenue_id);
                      if (!stats) return null;
                      return (
                        <Tooltip
                          title={(
                            <Stack spacing={0.5}>
                              <Typography variant="caption">Target ratio: {ratioLabel}</Typography>
                              <Typography variant="caption">
                                {stats.assigned}/{stats.required} ({stats.students} students)
                              </Typography>
                              {!stats.ratioMet && stats.remaining > 0 && (
                                <Typography variant="caption">{stats.remaining} more needed for this venue</Typography>
                              )}
                            </Stack>
                          )}
                        >
                          <Chip
                            label={`Invigilators: ${stats.assigned} / ${stats.required}`}
                            size="medium"
                            sx={{
                              width: "100%",
                              fontWeight: 700,
                              backgroundColor: stats.ratioMet ? alpha("#2e7d32", 0.12) : "#fff4e5",
                              color: stats.ratioMet ? "success.main" : "#b45309",
                              justifyContent: "center",
                            }}
                          />
                        </Tooltip>
                      );
                    })()}
                  </Box>
                  <Box sx={{ mt: 1, display: "flex", justifyContent: "center", width: "100%" }}>
                    <PillButton
                      variant="outlined"
                      fullWidth
                      onClick={() => {
                        dispatch(setExamPageUi({ assignVenueId: ev.examvenue_id, assignOpen: true }));
                      }}
                    >
                      Assign invigilator
                    </PillButton>
                  </Box>
                </Panel>
              </Grid>
            ))}
          </Grid>
        )}
      </Panel>

      <Box
        sx={{
          position: "fixed",
          bottom: 32,
          right: 32,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        <Tooltip title="Edit exam">
          <Fab aria-label="Edit exam" color="primary" onClick={() => dispatch(setExamPageUi({ editOpen: true }))}>
            <Edit />
          </Fab>
        </Tooltip>
        <Tooltip title="Delete exam">
          <Fab aria-label="Delete exam" color="error" onClick={() => dispatch(setExamPageUi({ deleteOpen: true }))}>
            <Delete />
          </Fab>
        </Tooltip>
      </Box>

      {data && (
        <EditExamDialog
          open={editOpen}
          examId={data?.exam_id ?? null}
          onClose={() => dispatch(setExamPageUi({ editOpen: false }))}
          onSuccess={(name) => {
            dispatch(setExamPageUi({
              successMessage: `${name || "Exam"} updated successfully!`,
              successOpen: true,
              editOpen: false,
            }));
            refetch();
          }}
        />
      )}

      <DeleteConfirmationDialog
        open={deleteOpen}
        title="Delete exam?"
        description="This will permanently delete this exam."
        confirmText="Delete"
        loading={deleting}
        onClose={() => {
          if (!deleting) dispatch(setExamPageUi({ deleteOpen: false }));
        }}
        onConfirm={async () => {
          if (!examId) return;
          try {
            dispatch(setExamPageUi({ deleting: true }));
            const res = await apiFetch(`${apiBaseUrl}/exams/${examId}/`, { method: "DELETE" });
            if (!res.ok) {
              const text = await res.text();
              throw new Error(text || "Delete failed");
            }
            dispatch(setExamPageUi({
              successMessage: "Exam deleted successfully!",
              successOpen: true,
              deleteOpen: false,
            }));
            setTimeout(() => navigate("/admin/exams"), 400);
          } catch (err: any) {
            alert(err?.message || "Delete failed");
          } finally {
            dispatch(setExamPageUi({ deleting: false }));
          }
        }}
      />

      <AssignInvigilatorDialog
        open={assignOpen}
        onClose={() => dispatch(setExamPageUi({ assignOpen: false }))}
        examVenue={assignVenue}
        invigilators={invigilators}
        assignments={assignments}
        onAssigned={(summary) => {
          refetch();
          if (!summary) return;
          const { assigned, unassigned, updated } = summary;
          if (assigned && unassigned) {
            dispatch(setExamPageUi({
              successMessage: `Assigned ${assigned} and unassigned ${unassigned} invigilator${unassigned === 1 ? "" : "s"}.`,
              successOpen: true,
            }));
            return;
          }
          if (assigned) {
            dispatch(setExamPageUi({
              successMessage: `Assigned ${assigned} invigilator${assigned === 1 ? "" : "s"}.`,
              successOpen: true,
            }));
            return;
          }
          if (unassigned) {
            dispatch(setExamPageUi({
              successMessage: `Unassigned ${unassigned} invigilator${unassigned === 1 ? "" : "s"}.`,
              successOpen: true,
            }));
            return;
          }
          if (updated) {
            dispatch(setExamPageUi({
              successMessage: "Assignments updated.",
              successOpen: true,
            }));
          }
        }}
      />

      <Snackbar
        open={successOpen}
        autoHideDuration={3000}
        onClose={() => dispatch(setExamPageUi({ successOpen: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => dispatch(setExamPageUi({ successOpen: false }))}
          severity="success"
          variant="filled"
          sx={{
            backgroundColor: "#d4edda",
            color: "#155724",
            border: "1px solid #155724",
            borderRadius: "50px",
            fontWeight: 500,
          }}
        >
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};
