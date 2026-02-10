import React, { useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Grid,
  Fab,
  Tooltip,
  Snackbar,
  Button,
} from "@mui/material";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { formatDateTime } from "../../utils/dates";
import { EditVenueDialog } from "../../components/admin/EditVenueDialog";
import { Edit, Delete } from "@mui/icons-material";
import { ExamDetailsPopup, ExamDetails as PopupExamDetails, ExamVenueInfo as PopupExamVenueInfo } from "../../components/admin/ExamDetailsPopup";
import { DeleteConfirmationDialog } from "../../components/admin/DeleteConfirmationDialog";
import { PillButton } from "../../components/PillButton";
import { Panel } from "../../components/Panel";
import { resetVenuePageUi, setVenuePageUi, useAppDispatch, useAppSelector } from "../../state/store";

interface ExamVenueData {
  exam_name: string;
  venue_name?: string | null;
  start_time: string | null;
  exam_length: number | null;
}

interface VenueData {
  venue_name: string;
  capacity: number;
  venuetype: string;
  is_accessible: boolean;
  provision_capabilities: string[];
  exam_venues: ExamVenueData[];
}

const formatVenueType = (text?: string): string => {
  if (!text) return "Unknown";

  return text
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatLabel = (text?: string): string => {
  if (!text) return "Unknown";
  const spaced = text.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const formatDurationFromLength = (length: number | null | undefined): string => {
  if (length == null) return "N/A";
  const hours = Math.floor(length / 60);
  const minutes = Math.round(length % 60);
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(" ") || "0m";
};

const calculateEndTime = (start: string | null, length: number | null): string | null => {
  if (!start || length == null) return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  const end = new Date(startDate.getTime() + length * 60000);
  return end.toISOString();
};

export const AdminVenuePage: React.FC = () => {
  const { venueId } = useParams();
  const venueKey = venueId ? decodeURIComponent(venueId) : "";
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const {
    editOpen,
    popupOpen,
    selectedExam,
    visibleCount,
    successOpen,
    successMessage,
    deleteOpen,
    deleting,
  } = useAppSelector((state) => state.adminTables.venuePage);

  useEffect(() => {
    dispatch(resetVenuePageUi());
    return () => {
      dispatch(resetVenuePageUi());
    };
  }, [dispatch, venueKey]);

  const { data, isLoading, isError, error, refetch } = useQuery<VenueData>({
    queryKey: ["venue", venueKey],
    queryFn: async () => {
      const res = await apiFetch(`${apiBaseUrl}/venues/${encodeURIComponent(venueKey)}/`);
      if (!res.ok) throw new Error("Unable to load venue");
      return res.json();
    },
    enabled: Boolean(venueKey),
  });

  const exams = (data?.exam_venues ?? []).filter((ev) => !ev.venue_name || ev.venue_name === data?.venue_name);
  const examCount = exams.length;
  const visibleExams = exams.slice(0, visibleCount);

  const handleExamClick = (exam: ExamVenueData) => {
    const start = exam.start_time || "";
    const end = calculateEndTime(exam.start_time, exam.exam_length) || exam.start_time || "";

    const venueInfo: PopupExamVenueInfo = {
      examVenueId: exam.examvenue_id,
      venue: data.venue_name,
      startTime: start,
      endTime: end,
      students: 0,
      invigilators: 0,
    };

    const popupExam: PopupExamDetails = {
      code: exam.exam_name,
      subject: exam.exam_name,
      department: undefined,
      mainVenue: data.venue_name,
      mainStartTime: start,
      mainEndTime: end,
      venues: [venueInfo],
    };

    dispatch(setVenuePageUi({ selectedExam: popupExam, popupOpen: true }));
  };

  const handleDelete = async () => {
    if (!venueKey) return;
    try {
      dispatch(setVenuePageUi({ deleting: true }));
      const res = await apiFetch(`${apiBaseUrl}/venues/${encodeURIComponent(venueKey)}/`, { method: "DELETE" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Delete failed");
      }
      dispatch(setVenuePageUi({
        successMessage: `${venueKey} deleted successfully!`,
        successOpen: true,
        deleteOpen: false,
      }));
      setTimeout(() => navigate("/admin/venues"), 400);
    } catch (err: any) {
      alert(err?.message || "Delete failed");
    } finally {
      dispatch(setVenuePageUi({ deleting: false }));
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading venue...</Typography>
      </Box>
    );
  }

  if (isError || !data) {
    return (
      <Box sx={{ p: 4 }}>
        <Panel>
          <Alert severity="error">{error?.message || "Failed to load venue"}</Alert>
        </Panel>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: { xs: 2, md: 4 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" rowGap={1.5}>
        <Box>
          <Typography variant="h4" fontWeight={700}>{data.venue_name}</Typography>
          <Typography variant="body2" color="text.secondary">
            Capacity {data.capacity} | {data.is_accessible ? "Accessible" : "Not accessible"}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Chip
            label={`${examCount} Exams`}
            size="medium"
            sx={{
              backgroundColor: "#f0f0f0ff",
              fontWeight: 600,
            }}
          />
          <Chip
            label={formatVenueType(data.venuetype)}
            size="medium"
            sx={{
              backgroundColor: "#e3f2fd",
              color: "primary.main",
              fontWeight: 600,
            }}
          />
        </Stack>
      </Stack>

      <Panel title="Venue details">
        <Stack spacing={1.5}>
          <Typography variant="body2"><strong>Capacity:</strong> {data.capacity}</Typography>
          <Typography variant="body2"><strong>Accessible:</strong> {data.is_accessible ? "Yes" : "No"}</Typography>
          <Box>
            <Typography variant="body2" fontWeight={700}>Provision Capabilities</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1} mt={1}>
              {(data.provision_capabilities || []).length
                ? data.provision_capabilities.map((p) => <Chip key={p} label={formatLabel(p)} size="small" />)
                : <Typography variant="body2" color="text.secondary">No provisions listed.</Typography>}
            </Stack>
          </Box>
        </Stack>
      </Panel>

      <Panel title="Exams in this venue">
        {examCount === 0 ? (
          <Typography variant="body2" color="text.secondary">No exams scheduled for this venue.</Typography>
        ) : (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "repeat(1, minmax(0, 1fr))",
                  sm: "repeat(2, minmax(0, 1fr))",
                  md: "repeat(4, minmax(0, 1fr))",
                },
                gap: 3,
              }}
            >
              {visibleExams.map((ex, idx) => (
                <Panel
                  key={`${ex.exam_name}-${idx}`}
                  disableDivider
                  sx={{
                    p: 2,
                    mb: 0,
                    height: "100%",
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    cursor: "pointer",
                    transition: "0.2s",
                    minHeight: 200,
                    boxSizing: "border-box",
                    "&:hover": { transform: "translateY(-6px)", boxShadow: 8 },
                  }}
                  onClick={() => handleExamClick(ex)}
                >
                  <Typography
                    variant="subtitle1"
                    fontWeight={600}
                    title={ex.exam_name}
                    sx={{
                      maxWidth: "100%",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {ex.exam_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">{formatDateTime(ex.start_time)}</Typography>
                  <Typography variant="body2">Duration: {formatDurationFromLength(ex.exam_length)}</Typography>
                  <Box sx={{ flexGrow: 1 }} />
                  <Typography variant="body2" color="primary.main" sx={{ fontWeight: 600 }}>
                    View details
                  </Typography>
                </Panel>
              ))}
            </Box>

            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, mt: 3 }}>
              <PillButton
                variant="outlined"
                onClick={() => dispatch(setVenuePageUi({ visibleCount: 4 }))}
                disabled={visibleCount <= 4}
              >
                Show less
              </PillButton>
              <PillButton
                variant="contained"
                onClick={() =>
                  dispatch(setVenuePageUi({ visibleCount: Math.min(visibleCount + 4, examCount) }))
                }
                disabled={visibleCount >= examCount}
              >
                {examCount - visibleCount <= 0 ? "No more exams to show" : `Show ${Math.min(4, examCount - visibleCount)} more`}
              </PillButton>
            </Box>
          </>
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
        <Tooltip title="Edit venue">
          <Fab color="primary" onClick={() => dispatch(setVenuePageUi({ editOpen: true }))}>
            <Edit />
          </Fab>
        </Tooltip>
        <Tooltip title="Delete venue">
          <Fab color="error" onClick={() => dispatch(setVenuePageUi({ deleteOpen: true }))}>
            <Delete />
          </Fab>
        </Tooltip>
      </Box>

      <EditVenueDialog
        open={editOpen}
        venueId={venueKey || null}
        onClose={() => dispatch(setVenuePageUi({ editOpen: false }))}
        onSuccess={(name?: string) => {
          dispatch(setVenuePageUi({
            successMessage: `${name || venueKey} updated successfully!`,
            successOpen: true,
            editOpen: false,
          }));
          refetch();
        }}
      />

      <ExamDetailsPopup
        open={popupOpen}
        onClose={() => dispatch(setVenuePageUi({ popupOpen: false }))}
        exam={selectedExam}
      />

      <DeleteConfirmationDialog
        open={deleteOpen}
        title="Delete venue?"
        description="This will permanently delete this venue."
        confirmText="Delete"
        loading={deleting}
        onClose={() => {
          if (!deleting) dispatch(setVenuePageUi({ deleteOpen: false }));
        }}
        onConfirm={handleDelete}
      />

      <Snackbar
        open={successOpen}
        autoHideDuration={3000}
        onClose={() => dispatch(setVenuePageUi({ successOpen: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => dispatch(setVenuePageUi({ successOpen: false }))}
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
