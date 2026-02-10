import React, { useMemo } from "react";
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormLabel,
  Stack,
  TextField,
  Typography,
  IconButton,
} from "@mui/material";
import { Panel } from "../Panel";
import { PillButton } from "../PillButton";
import { Close } from "@mui/icons-material";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { sharedInputSx } from "../sharedInputSx";
import {
  resetNotifyDialogDraft,
  setNotifyDialogDraft,
  useAppDispatch,
  useAppSelector,
} from "../../state/store";

type Recipient = {
  id: number;
  name: string;
  emails: string[];
};

type NotifyDialogProps = {
  open: boolean;
  recipients: Recipient[];
  onClose: () => void;
  onSent?: (count: number) => void;
};

export const NotifyDialog: React.FC<NotifyDialogProps> = ({
  open,
  recipients,
  onClose,
  onSent,
}) => {
  const dispatch = useAppDispatch();
  const { subject, message, error } = useAppSelector((state) => state.adminTables.notifyDialog);

  const recipientIds = useMemo(() => recipients.map((r) => r.id), [recipients]);
  const recipientEmails = useMemo(
    () =>
      Array.from(
        new Set(
          recipients
            .flatMap((r) => r.emails || [])
            .filter((email): email is string => Boolean(email))
        )
      ),
    [recipients]
  );

  const sending = false;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!sending) {
          onClose();
        }
      }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        Send notification
        <IconButton
          aria-label="Close dialog"
          size="small"
          onClick={() => {
            if (!sending) {
              onClose();
            }
          }}
        >
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {recipientIds.length === 1
            ? "Sending to 1 invigilator"
            : `Sending to ${recipientIds.length} invigilators`}
        </Typography>

        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
          {recipients.map((recipient) => (
            <Chip
              key={recipient.id}
              size="medium"
              label={recipient.name}
              sx={{
                backgroundColor: "#E3F2FD",
                color: "primary.main",
                fontWeight: 600,
              }}
            />
          ))}
          {recipients.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              No recipients selected yet.
            </Typography>
          )}
        </Stack>

        <TextField
          label="Subject (optional)"
          value={subject}
          fullWidth
          margin="dense"
          onChange={(e) => dispatch(setNotifyDialogDraft({ subject: e.target.value }))}
          sx={sharedInputSx}
        />
        <TextField
          label="Message"
          value={message}
          fullWidth
          required
          multiline
          minRows={4}
          margin="dense"
          onChange={(e) => dispatch(setNotifyDialogDraft({ message: e.target.value }))}
          sx={[sharedInputSx, { height: "auto", "& .MuiInputBase-root": { minHeight: 128 }, "& .MuiInputBase-input": { py: 1 } }]}
        />

        <Panel sx={{ mt: 2, mb: 0, p: 2 }}>
          <FormLabel component="legend" sx={{ mb: 1, display: "block" }}>
            Delivery
          </FormLabel>
          <Typography variant="body2">
            Opens your default mail app with all selected invigilators as a mail merge.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Recipients: {recipientEmails.length ? recipientEmails.join(", ") : "None found"}
          </Typography>
        </Panel>

        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <PillButton
          variant="outlined"
          onClick={() => dispatch(resetNotifyDialogDraft())}
          disabled={sending}
          sx={{ border: "none" }}
        >
          Clear
        </PillButton>
        <PillButton
          variant="contained"
          onClick={async () => {
            if (!recipientEmails.length) {
              dispatch(setNotifyDialogDraft({ error: "No email addresses found for selected invigilators." }));
              return;
            }
            if (!message.trim()) {
              dispatch(setNotifyDialogDraft({ error: "Message is required." }));
              return;
            }
            const mailSubject = subject.trim() || "Message from administrator";
            const mailBody = message.trim();

            try {
              await apiFetch(`${apiBaseUrl}/notifications/`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  invigilator_ids: recipientIds,
                  subject: mailSubject,
                  message: mailBody,
                  methods: ["email"],
                  log_only: true,
                }),
              });
            } catch (err: any) {
              dispatch(setNotifyDialogDraft({ error: err?.message || "Failed to record mail merge." }));
              // Still proceed to open the mail client
            }

            const mailto = `mailto:?bcc=${encodeURIComponent(
              recipientEmails.join(",")
            )}&subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`;
            window.location.href = mailto;
            onSent?.(recipientIds.length);
            dispatch(resetNotifyDialogDraft());
          }}
          disabled={!recipients.length}
        >
          Send notification
        </PillButton>
      </DialogActions>
    </Dialog>
  );
};
