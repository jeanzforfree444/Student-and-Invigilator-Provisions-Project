import React from "react";
import { Alert, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, Typography } from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { PillButton } from "../PillButton";
import { Panel } from "../Panel";

type ConfirmAllocationDialogProps = {
  open: boolean;
  studentExamId: number;
  studentName: string;
  examName: string;
  onClose: () => void;
  onConfirm: () => void;
  isSaving: boolean;
  error: string | null;
};

export const ConfirmAllocationDialog: React.FC<ConfirmAllocationDialogProps> = ({
  open,
  studentExamId,
  studentName,
  examName,
  onClose,
  onConfirm,
  isSaving,
  error,
}) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
    <DialogTitle>
      Confirm venue allocation
      <IconButton aria-label="Close" onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }}>
        <CloseIcon />
      </IconButton>
    </DialogTitle>
    <DialogContent>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        You are confirming that this venue can meet the student’s provisions even though required capabilities are missing.
      </Typography>
      <Panel
        sx={{ bgcolor: "grey.50", borderRadius: 2, p: 2, border: "1px solid", borderColor: "divider", mb: 0 }}
        disableDivider
      >
        <Stack spacing={0.5}>
          <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 0.8, lineHeight: 1.1, mb: 0 }}>
            Allocation details
          </Typography>
          <Typography variant="body2">
            Student: <strong>{studentName}</strong>
          </Typography>
          <Typography variant="body2">
            Exam: <strong>{examName}</strong>
          </Typography>
        </Stack>
      </Panel>
      {error ? <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert> : null}
    </DialogContent>
    <DialogActions>
      <PillButton
        variant="contained"
        color="primary"
        onClick={onConfirm}
        disabled={isSaving || !studentExamId}
      >
        {isSaving ? "Confirming..." : "Confirm"}
      </PillButton>
    </DialogActions>
  </Dialog>
);
