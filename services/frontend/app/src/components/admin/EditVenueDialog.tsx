import React, { useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  FormControlLabel,
  Checkbox,
  MenuItem,
  Chip,
  Box,
  Tooltip,
  CircularProgress,
  IconButton,
  Alert,
  Typography,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { PillButton } from "../PillButton";
import { VENUE_TYPES } from "./venueTypes";
import { sharedInputSx } from "../sharedInputSx";
import {
  resetEditVenueDraft,
  setEditVenueDraft,
  useAppDispatch,
  useAppSelector,
} from "../../state/store";

const ALLOWED_PROVISION_CHOICES = [
  { value: "use_computer", label: "Use of a computer" },
  { value: "accessible_hall", label: "Accessible hall" },
];

interface EditVenueDialogProps {
  open: boolean;
  venueId: string | null;
  onClose: () => void;
  onSuccess?: (name: string) => void;
}

interface VenueData {
  venue_name: string;
  capacity: number;
  venuetype: string;
  is_accessible: boolean;
  provision_capabilities: string[];
}



const ALLOWED_CAPS = new Set(ALLOWED_PROVISION_CHOICES.map((p) => p.value));

export const EditVenueDialog: React.FC<EditVenueDialogProps> = ({ open, venueId, onClose, onSuccess }) => {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const draft = useAppSelector((state) =>
    venueId ? state.adminTables.venueDialogs.edit[venueId] : undefined
  );
  const venueName = draft?.venueName ?? "";
  const capacity = draft?.capacity ?? "";
  const venueType = draft?.venueType ?? "";
  const isAccessible = draft?.isAccessible ?? true;
  const provisions = draft?.provisions ?? [];

  const { data, isLoading, isError } = useQuery<VenueData>({
    queryKey: ["venue", venueId],
    queryFn: async () => {
      const res = await apiFetch(`${apiBaseUrl}/venues/${encodeURIComponent(venueId || "")}/`);
      if (!res.ok) throw new Error("Unable to load venue");
      return res.json();
    },
    enabled: open && Boolean(venueId),
  });

  useEffect(() => {
    if (!data) return;
    if (!venueId || draft?.initialized) return;
    dispatch(setEditVenueDraft({
      venueId,
      draft: {
        venueName: data.venue_name,
        capacity: data.capacity,
        venueType: data.venuetype,
        isAccessible: data.is_accessible,
        provisions: (data.provision_capabilities || []).filter((p) => ALLOWED_CAPS.has(p)),
        initialized: true,
      },
    }));
  }, [data, dispatch, draft?.initialized, venueId]);

  useEffect(() => {
    if (!venueId) return;
    if (open) return;
  }, [dispatch, open, venueId]);

  const toggleProvision = (value: string) => {
    const next = provisions.includes(value)
      ? provisions.filter((p) => p !== value)
      : [...provisions, value];
    if (!venueId) return;
    dispatch(setEditVenueDraft({ venueId, draft: { provisions: next } }));
  };

  const mandatoryFilled = venueName && capacity !== "" && venueType;

  const updateMutation = useMutation({
    mutationFn: async () => {
      const allowedCaps = provisions.filter((p) => ALLOWED_CAPS.has(p));
      const res = await apiFetch(`${apiBaseUrl}/venues/${venueId}/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venue_name: venueName,
          capacity: capacity ? Number(capacity) : 0,
          venuetype: venueType,
          is_accessible: isAccessible,
          provision_capabilities: allowedCaps,
          qualifications: [],
          availability: [],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update venue");
      }
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["venues"] });
      queryClient.invalidateQueries({ queryKey: ["venue", venueId] });
      onSuccess?.(updated.venue_name);
      if (venueId) {
        dispatch(resetEditVenueDraft(venueId));
      }
      onClose();
    },
    onError: (err: any) => alert(err?.message || "Failed to update venue"),
  });

  return (
    <Dialog open={open} onClose={updateMutation.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Edit Venue
        <IconButton
          aria-label="close"
          onClick={() => {
            if (!updateMutation.isPending) onClose();
          }}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {isLoading && (
          <Stack alignItems="center" py={2}>
            <CircularProgress />
          </Stack>
        )}
        {isError && <Alert severity="error">Failed to load venue details.</Alert>}
        {!isLoading && !isError && (
          <Stack spacing={2}>
            <TextField
              label="Venue Name"
              value={venueName}
              onChange={(e) => {
                if (!venueId) return;
                dispatch(setEditVenueDraft({ venueId, draft: { venueName: e.target.value } }));
              }}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Capacity"
              type="number"
              value={capacity}
              onChange={(e) => {
                if (!venueId) return;
                dispatch(setEditVenueDraft({
                  venueId,
                  draft: { capacity: e.target.value === "" ? "" : Number(e.target.value) },
                }));
              }}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Venue Type"
              select
              value={venueType}
              onChange={(e) => {
                if (!venueId) return;
                dispatch(setEditVenueDraft({ venueId, draft: { venueType: e.target.value } }));
              }}
              fullWidth
              required
              sx={sharedInputSx}
            >
              {VENUE_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Checkbox
                  checked={isAccessible}
                  onChange={(e) => {
                    if (!venueId) return;
                    dispatch(setEditVenueDraft({ venueId, draft: { isAccessible: e.target.checked } }));
                  }}
                />
              }
              label="Accessible"
            />
            <Box>
              <Typography variant="body2" fontWeight={600} mb={1}>
                Provision Capabilities
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
                {ALLOWED_PROVISION_CHOICES.map((p) => {
                  const selected = provisions.includes(p.value);
                  return (
                    <Tooltip key={p.value} title={selected ? "Click to remove" : "Click to add"}>
                      <Chip
                        label={p.label}
                        color={selected ? "primary" : "default"}
                        variant={selected ? "filled" : "outlined"}
                        onClick={() => toggleProvision(p.value)}
                        sx={{ cursor: "pointer" }}
                      />
                    </Tooltip>
                  );
                })}
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <PillButton
          variant="outlined"
          onClick={() => {
            if (venueId) {
              dispatch(resetEditVenueDraft(venueId));
            }
          }}
          disabled={!venueId || updateMutation.isPending}
          sx={{ border: "none" }}
        >
          Clear
        </PillButton>
        <PillButton
          variant="contained"
          onClick={() => updateMutation.mutate()}
          disabled={!mandatoryFilled || updateMutation.isPending}
          startIcon={updateMutation.isPending ? <CircularProgress size={18} /> : undefined}
        >
          Save
        </PillButton>
      </DialogActions>
    </Dialog>
  );
};
