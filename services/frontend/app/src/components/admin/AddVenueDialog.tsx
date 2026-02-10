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
  Typography,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import IconButton from "@mui/material/IconButton";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { PillButton } from "../PillButton";
import { VENUE_TYPES } from "./venueTypes";
import { sharedInputSx } from "../sharedInputSx";
import { resetAddVenueDraft, setAddVenueDraft, useAppDispatch, useAppSelector } from "../../state/store";

const PROVISION_CHOICES = [
  { value: "use_computer", label: "Use of a computer" },
  { value: "accessible_hall", label: "Accessible hall" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: (name: string) => void;
}

export const AddVenueDialog: React.FC<Props> = ({ open, onClose, onSuccess }) => {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const { venueName, capacity, venueType, isAccessible, provisions } = useAppSelector(
    (state) => state.adminTables.venueDialogs.add
  );

  useEffect(() => {
    if (!open) return;
  }, [dispatch, open]);

  const addMutation = useMutation({
    mutationFn: async () => {
      const allowedCaps = provisions.filter((p) => p === "use_computer" || p === "accessible_hall");
      const response = await apiFetch(`${apiBaseUrl}/venues/`, {
        method: "POST",
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
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Unable to add venue");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["venues"] });
      onSuccess?.(data.venue_name);
      dispatch(resetAddVenueDraft());
      onClose();
    },
    onError: (err: any) => {
      alert(err?.message || "Failed to add venue");
    },
  });

  const toggleProvision = (value: string) => {
    const next = provisions.includes(value)
      ? provisions.filter((p) => p !== value)
      : [...provisions, value];
    dispatch(setAddVenueDraft({ provisions: next }));
  };

  const mandatoryFilled = venueName && capacity !== "" && venueType;

  return (
    <Dialog open={open} onClose={addMutation.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Add Venue
        <IconButton
          aria-label="close"
          onClick={() => {
            if (!addMutation.isPending) onClose();
          }}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <TextField
            label="Venue Name"
            value={venueName}
            onChange={(e) => dispatch(setAddVenueDraft({ venueName: e.target.value }))}
            fullWidth
            required
            sx={sharedInputSx}
          />
          <TextField
            label="Capacity"
            type="number"
            value={capacity}
            onChange={(e) =>
              dispatch(setAddVenueDraft({ capacity: e.target.value === "" ? "" : Number(e.target.value) }))
            }
            fullWidth
            required
            sx={sharedInputSx}
          />
          <TextField
            label="Venue Type"
            select
            value={venueType}
            onChange={(e) => dispatch(setAddVenueDraft({ venueType: e.target.value }))}
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
                onChange={(e) => dispatch(setAddVenueDraft({ isAccessible: e.target.checked }))}
              />
            }
            label="Accessible"
          />
          <Box>
            <Typography variant="body2" fontWeight={600} mb={1}>
              Provision Capabilities
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1}>
              {PROVISION_CHOICES.map((p) => {
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
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <PillButton
          variant="outlined"
          onClick={() => dispatch(resetAddVenueDraft())}
          disabled={addMutation.isPending}
          sx={{ border: "none" }}
        >
          Clear
        </PillButton>
        <PillButton
          variant="contained"
          onClick={() => addMutation.mutate()}
          disabled={!mandatoryFilled || addMutation.isPending}
          startIcon={addMutation.isPending ? <CircularProgress size={18} /> : undefined}
        >
          Add
        </PillButton>
      </DialogActions>
    </Dialog>
  );
};
