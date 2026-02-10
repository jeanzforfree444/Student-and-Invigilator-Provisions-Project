import React, { useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  IconButton,
  Alert,
  CircularProgress,
  Snackbar,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { PillButton } from "../PillButton";
import { sharedInputSx } from "../sharedInputSx";
import {
  resetAddExamDraft,
  setAddExamDraft,
  setAddExamUi,
  useAppDispatch,
  useAppSelector,
} from "../../state/store";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess?: (name: string) => void;
};

export const AddExamDialog: React.FC<Props> = ({ open, onClose, onSuccess }) => {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const { name, code, examType, students, school, contact } = useAppSelector(
    (state) => state.adminTables.examDialogs.add
  );
  const { snackbarOpen } = useAppSelector((state) => state.adminTables.addExamUi);

  useEffect(() => {
    if (!open) return;
    dispatch(setAddExamUi({ snackbarOpen: false }));
  }, [dispatch, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const examRes = await apiFetch(`${apiBaseUrl}/exams/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam_name: name,
          course_code: code,
          exam_type: examType,
          no_students: students === "" ? 0 : Number(students),
          exam_school: school,
          school_contact: contact ?? "",
        }),
      });
      if (!examRes.ok) {
        const text = await examRes.text();
        throw new Error(text || "Failed to create exam");
      }
      return examRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams-table"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-exams"] });
      onSuccess?.(name);
      dispatch(resetAddExamDraft());
      dispatch(setAddExamUi({ snackbarOpen: true }));
      onClose();
    },
    onError: (err: any) => alert(err?.message || "Failed to create exam"),
  });

  const canSave = Boolean(name && code && examType && school);

  return (
    <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Add Exam
        <IconButton
          aria-label="close"
          onClick={() => {
            if (!mutation.isPending) onClose();
          }}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Exam name"
              value={name}
              onChange={(e) => dispatch(setAddExamDraft({ name: e.target.value }))}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Course code"
              value={code}
              onChange={(e) => dispatch(setAddExamDraft({ code: e.target.value }))}
              fullWidth
              required
              sx={sharedInputSx}
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Exam type"
              value={examType}
              onChange={(e) => dispatch(setAddExamDraft({ examType: e.target.value }))}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Number of students"
              type="number"
              value={students}
              onChange={(e) =>
                dispatch(setAddExamDraft({ students: e.target.value === "" ? "" : Number(e.target.value) }))
              }
              fullWidth
              sx={sharedInputSx}
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Exam school"
              value={school}
              onChange={(e) => dispatch(setAddExamDraft({ school: e.target.value }))}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="School contact"
              value={contact}
              onChange={(e) => dispatch(setAddExamDraft({ contact: e.target.value }))}
              fullWidth
              sx={sharedInputSx}
            />
          </Stack>
          {mutation.isError && (
            <Alert severity="error">Failed to create exam.</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <PillButton
          variant="outlined"
          onClick={() => dispatch(resetAddExamDraft())}
          disabled={mutation.isPending}
          sx={{ border: "none" }}
        >
          Clear
        </PillButton>
        <PillButton
          variant="contained"
          onClick={() => mutation.mutate()}
          disabled={!canSave || mutation.isPending}
          startIcon={mutation.isPending ? <CircularProgress size={18} /> : undefined}
        >
          Create
        </PillButton>
      </DialogActions>
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => dispatch(setAddExamUi({ snackbarOpen: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => dispatch(setAddExamUi({ snackbarOpen: false }))}
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
          Exam added successfully!
        </Alert>
      </Snackbar>
    </Dialog>
  );
};
