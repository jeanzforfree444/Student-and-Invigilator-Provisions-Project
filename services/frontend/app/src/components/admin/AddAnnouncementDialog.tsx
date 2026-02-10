import React, { useEffect } from "react";
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { Close, Upload } from "@mui/icons-material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PillButton } from "../PillButton";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { sharedInputSx } from "../sharedInputSx";
import { resetAnnouncementDraft, setAnnouncementDraft, useAppDispatch, useAppSelector } from "../../state/store";

type Audience = "invigilator" | "all";

interface AddAnnouncementDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (title: string) => void;
}

const formatDateTimeInput = (value?: string | Date | null) => {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

export const AddAnnouncementDialog: React.FC<AddAnnouncementDialogProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const {
    title,
    body,
    audience,
    imageData,
    imageName,
    publishedAt,
    expiresAt,
    priority,
    isActive,
    error,
  } = useAppSelector((state) => state.adminTables.announcementDialog);

  const isValidDateInput = (value: string) => {
    if (!value) return true;
    const d = new Date(value);
    return !Number.isNaN(d.getTime());
  };

  useEffect(() => {
    if (!open) return;
    if (!publishedAt) {
      dispatch(setAnnouncementDraft({ publishedAt: formatDateTimeInput(new Date()) }));
    }
    if (!isActive) {
      dispatch(setAnnouncementDraft({ isActive: true }));
    }
  }, [dispatch, isActive, open, publishedAt]);

  const handleClose = () => {
    if (mutation.isPending) return;
    onClose();
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!imageData) {
        throw new Error("Image is required.");
      }

      const response = await apiFetch(`${apiBaseUrl}/announcements/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          audience,
          image: imageData,
          published_at: publishedAt ? new Date(publishedAt).toISOString() : undefined,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          is_active: isActive,
          priority: priority === "" ? 0 : Number(priority),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to create announcement");
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["invigilator-announcements"] });
      queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
      onCreated?.(data?.title ?? "Announcement");
      dispatch(resetAnnouncementDraft());
      onClose();
    },
    onError: (err: any) => {
      dispatch(setAnnouncementDraft({ error: err?.message || "Failed to create announcement" }));
    },
  });

  const isSaveDisabled =
    !title.trim() ||
    !body.trim() ||
    !imageData ||
    !audience ||
    priority === "" ||
    !isValidDateInput(publishedAt) ||
    !isValidDateInput(expiresAt);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        Post announcement
        <IconButton aria-label="Close dialog" size="small" onClick={handleClose}>
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.2}>
          <TextField
            label="Title"
            value={title}
            onChange={(e) => dispatch(setAnnouncementDraft({ title: e.target.value }))}
            fullWidth
            required
            sx={sharedInputSx}
          />
          <TextField
            label="Body"
            value={body}
            onChange={(e) => dispatch(setAnnouncementDraft({ body: e.target.value }))}
            fullWidth
            required
            multiline
            minRows={3}
            sx={[sharedInputSx, { height: "auto", "& .MuiInputBase-root": { minHeight: 96 }, "& .MuiInputBase-input": { py: 1 } }]}
          />

          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
            <TextField
              label="Audience"
              select
              value={audience}
              onChange={(e) => dispatch(setAnnouncementDraft({ audience: e.target.value as Audience | "" }))}
              fullWidth
              sx={sharedInputSx}
            >
              <MenuItem value="" disabled>
                Select audience
              </MenuItem>
              <MenuItem value="invigilator">Invigilators only</MenuItem>
              <MenuItem value="all">All users</MenuItem>
            </TextField>
            <TextField
              label="Priority"
              select
              value={priority === "" ? "" : String(priority)}
              onChange={(e) => dispatch(setAnnouncementDraft({ priority: Number(e.target.value) }))}
              fullWidth
              sx={sharedInputSx}
            >
              <MenuItem value="" disabled>
                Select priority
              </MenuItem>
              <MenuItem value="1">Low</MenuItem>
              <MenuItem value="2">Medium</MenuItem>
              <MenuItem value="3">High</MenuItem>
            </TextField>
            <FormControlLabel
              control={
                <Switch
                  checked={isActive}
                  onChange={(e) => dispatch(setAnnouncementDraft({ isActive: e.target.checked }))}
                  color="primary"
                />
              }
              label="Active"
              sx={{ ml: { md: 1 }, mt: { xs: 1, md: 0 } }}
            />
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
            <TextField
              label="Publish at"
              type="datetime-local"
              value={publishedAt}
              onChange={(e) => dispatch(setAnnouncementDraft({ publishedAt: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={sharedInputSx}
            />
            <TextField
              label="Expires at (optional)"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => dispatch(setAnnouncementDraft({ expiresAt: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
              sx={sharedInputSx}
            />
          </Stack>

          <Stack spacing={1}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Image
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  JPEG or PNG; shown as the announcement hero.
                </Typography>
                {imageName ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                    Selected: {imageName}
                  </Typography>
                ) : null}
              </Box>
              <PillButton
                variant="outlined"
                size="small"
                component="label"
                startIcon={<Upload />}
                disabled={mutation.isPending}
              >
                Upload
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!file.type.startsWith("image/")) {
                      dispatch(setAnnouncementDraft({ error: "Please select an image file." }));
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      dispatch(setAnnouncementDraft({
                        imageData: reader.result as string,
                        imageName: file.name,
                        error: null,
                      }));
                    };
                    reader.onerror = () => {
                      dispatch(setAnnouncementDraft({ error: "Failed to read image file." }));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </PillButton>
            </Stack>
            {imageData && (
              <Box
                sx={{
                  height: 180,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundImage: `url(${imageData})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            )}
          </Stack>

          {error && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "error.light",
                backgroundColor: "rgba(244, 67, 54, 0.06)",
              }}
            >
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <PillButton
          variant="outlined"
          onClick={() => dispatch(resetAnnouncementDraft())}
          disabled={mutation.isPending}
          sx={{ border: "none" }}
        >
          Clear
        </PillButton>
        <PillButton
          variant="contained"
          onClick={() => {
            if (!title.trim() || !body.trim()) {
              dispatch(setAnnouncementDraft({ error: "Title and body are required." }));
              return;
            }
            if (!imageData) {
              dispatch(setAnnouncementDraft({ error: "Image is required." }));
              return;
            }
            if (publishedAt && Number.isNaN(new Date(publishedAt).getTime())) {
              dispatch(setAnnouncementDraft({ error: "Publish date is invalid." }));
              return;
            }
            if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
              dispatch(setAnnouncementDraft({ error: "Expiry date is invalid." }));
              return;
            }
            dispatch(setAnnouncementDraft({ error: null }));
            mutation.mutate();
          }}
          disabled={mutation.isPending || isSaveDisabled}
        >
          {mutation.isPending ? "Posting..." : "Post"}
        </PillButton>
      </DialogActions>
    </Dialog>
  );
};
