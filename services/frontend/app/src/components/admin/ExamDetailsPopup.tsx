import React from "react";
import { Dialog, DialogTitle, DialogContent, IconButton, Typography, Stack, Paper, Chip, Box } from "@mui/material";
import { Close } from "@mui/icons-material";
import { Panel } from "../Panel";

export interface ExamVenueInfo {
  examVenueId?: number;
  venue: string;
  startTime: string;
  endTime: string;
  students: number;
  invigilators: number;
}

export interface ExamDetails {
  code: string;
  subject: string;
  department?: string;
  mainVenue?: string;
  mainStartTime?: string;
  mainEndTime?: string;
  venues: ExamVenueInfo[];
}

interface ExamDetailsPopupProps {
  open: boolean;
  onClose: () => void;
  exam: ExamDetails | null;
  departmentColors?: Record<string, string>;
}

export const ExamDetailsPopup: React.FC<ExamDetailsPopupProps> = ({ open, onClose, exam, departmentColors }) => {
  if (!exam) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {exam.code} - {exam.subject}{" "}
        {exam.department && (
          <Chip
            label={exam.department}
            sx={{ ml: 1, bgcolor: departmentColors?.[exam.department] || "#9e9e9e", color: "#fff" }}
          />
        )}
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: "absolute", right: 12, top: 10 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {exam.mainVenue && exam.mainStartTime && exam.mainEndTime && (
            <Panel title="Main Exam Location" sx={{ mb: 0 }}>
              <Typography variant="body2">Venue: {exam.mainVenue}</Typography>
              <Typography variant="body2">
                Time: {new Date(exam.mainStartTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                {new Date(exam.mainEndTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Typography>
            </Panel>
          )}

          <Panel title="All Venues" sx={{ mb: 0 }}>
            <Stack spacing={1.5}>
              {exam.venues.map((v, i) => (
                <Paper
                  key={i}
                  sx={{
                    p: 2.5,
                    borderRadius: 3,
                    border: "1px solid #e5e7eb",
                    background: "linear-gradient(135deg, #f8fafc, #e3f2fd)",
                    boxShadow: "0 8px 25px rgba(0,0,0,0.04)",
                  }}
                >
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "140px 1fr" },
                      gap: 2.5,
                      alignItems: "center",
                    }}
                  >
                    <Stack spacing={0.8} alignItems="flex-start">
                      <Typography variant="body2" color="text.secondary">
                        Start
                      </Typography>
                      <Typography fontWeight={700} fontSize="1.05rem">
                        {new Date(v.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Typography>
                      <Box sx={{ width: "100%" }}>
                        <Typography variant="body2" color="text.secondary">
                          End
                        </Typography>
                      </Box>
                      <Typography fontWeight={700} fontSize="1.05rem">
                        {new Date(v.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Typography>
                    </Stack>

                    <Stack spacing={1}>
                      <Typography variant="h6" fontWeight={700}>
                        {v.venue}
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Chip
                          size="small"
                          label={`Students: ${v.students ?? 0}`}
                          sx={{
                            bgcolor: "#fff4e5",
                            color: "#b45309",
                            fontWeight: 700,
                          }}
                        />
                        <Chip
                          size="small"
                          label={`Invigilators: ${v.invigilators ?? 0}`}
                          sx={{
                            bgcolor: "#e8f5e9",
                            color: "#1b5e20",
                            fontWeight: 700,
                          }}
                        />
                      </Stack>
                    </Stack>
                  </Box>
                </Paper>
              ))}
            </Stack>
          </Panel>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};
