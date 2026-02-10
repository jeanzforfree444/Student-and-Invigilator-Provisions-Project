import { Dialog, DialogContent, Stack, Typography, CircularProgress } from "@mui/material";
import React from "react";

type Props = {
  open: boolean;
};

export const ExportProgressDialog: React.FC<Props> = ({ open }) => {
  return (
    <Dialog open={open} aria-labelledby="export-progress" fullWidth maxWidth="xs">
      <DialogContent>
        <Stack spacing={2} alignItems="center" textAlign="center">
          <CircularProgress size={32} />
          <Typography variant="h6" id="export-progress" fontWeight={600}>
            Preparing your export
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gathering your profile, sessions, uploads, and notifications. This may take a few seconds.
          </Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};
