import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  CircularProgress,
  IconButton,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import { PillButton } from "../PillButton";

type Props = {
  open: boolean;
  title?: string;
  description: React.ReactNode;
  confirmText?: string;
  loading?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export const DeleteConfirmationDialog: React.FC<Props> = ({
  open,
  title = "Confirm delete",
  description,
  confirmText = "Delete",
  loading = false,
  destructive = true,
  onConfirm,
  onClose,
}) => {
  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {title}
        <IconButton
          aria-label="close"
          onClick={onClose}
          disabled={loading}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body1">{description}</Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <PillButton
          variant="contained"
          color={destructive ? "error" : "primary"}
          onClick={onConfirm}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={18} /> : undefined}
        >
          {confirmText}
        </PillButton>
      </DialogActions>
    </Dialog>
  );
};
