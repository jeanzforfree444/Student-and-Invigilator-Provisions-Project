import React, { useMemo } from "react";
import {
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { Close, FileDownloadOutlined } from "@mui/icons-material";
import { Panel } from "../Panel";
import { PillButton } from "../PillButton";
import {
  setExportInvigilatorDialogDraft,
  useAppDispatch,
  useAppSelector,
} from "../../state/store";

export type InvigilatorExportRecipient = {
  id: number;
  name: string;
  username?: string | null;
};

export type InvigilatorExportOptions = {
  onlyConfirmed: boolean;
  includeCancelled: boolean;
  includeProvisions: boolean;
};

type ExportInvigilatorTimetablesDialogProps = {
  open: boolean;
  invigilators: InvigilatorExportRecipient[];
  loading?: boolean;
  onClose: () => void;
  onExport: (options: InvigilatorExportOptions) => void;
};

export const ExportInvigilatorTimetablesDialog: React.FC<ExportInvigilatorTimetablesDialogProps> = ({
  open,
  invigilators,
  loading = false,
  onClose,
  onExport,
}) => {
  const dispatch = useAppDispatch();
  const { onlyConfirmed, includeCancelled, includeProvisions } = useAppSelector(
    (state) => state.adminTables.exportInvigilatorDialog
  );

  const recipientCount = invigilators.length;
  const exportType = recipientCount > 1 ? "ZIP" : "CSV";
  const fileSummary = useMemo(() => {
    if (recipientCount > 1) {
      return ["Combined timetable", "Per-invigilator timetables"];
    }
    return ["Single timetable file"];
  }, [recipientCount]);

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        Export timetables
        <IconButton aria-label="Close dialog" size="small" onClick={loading ? undefined : onClose}>
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              {recipientCount === 1
                ? "Exporting timetable for 1 invigilator."
                : `Exporting timetables for ${recipientCount} invigilators.`}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
              <Chip
                label={`${exportType} export`}
                size="medium"
                sx={{ backgroundColor: "#E3F2FD", color: "primary.main", fontWeight: 600 }}
              />
              {fileSummary.map((item) => (
                <Chip
                  key={item}
                  label={item}
                  size="medium"
                  sx={{ backgroundColor: "#F2F4F7", color: "#344054", fontWeight: 600 }}
                />
              ))}
            </Stack>
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Selected invigilators
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {invigilators.map((invigilator) => (
                <Chip
                  key={invigilator.id}
                  label={invigilator.name}
                  size="medium"
                  sx={{ backgroundColor: "#E3F2FD", color: "primary.main", fontWeight: 600 }}
                />
              ))}
              {!invigilators.length && (
                <Typography variant="caption" color="text.secondary">
                  No invigilators selected.
                </Typography>
              )}
            </Stack>
          </Box>

          <Panel sx={{ p: 2, mb: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Export options
            </Typography>
            <Stack spacing={1.5}>
              <Stack>
                <FormControlLabel
                  control={
                    <Switch
                      checked={onlyConfirmed}
                      onChange={(e) => dispatch(setExportInvigilatorDialogDraft({ onlyConfirmed: e.target.checked }))}
                      color="primary"
                    />
                  }
                  label="Only confirmed shifts"
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>
                  Exports only shifts that are confirmed by invigilators and admin staff.
                </Typography>
              </Stack>
              <Stack>
                <FormControlLabel
                  control={
                    <Switch
                      checked={includeCancelled}
                      onChange={(e) => dispatch(setExportInvigilatorDialogDraft({ includeCancelled: e.target.checked }))}
                      color="primary"
                    />
                  }
                  label="Include cancelled shifts"
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>
                  Includes shifts that have been cancelled in the export.
                </Typography>
              </Stack>
              <Stack>
                <FormControlLabel
                  control={
                    <Switch
                      checked={includeProvisions}
                      onChange={(e) => dispatch(setExportInvigilatorDialogDraft({ includeProvisions: e.target.checked }))}
                      color="primary"
                    />
                  }
                  label="Include student provisions"
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>
                  Adds columns for student provisions and notes attached to each exam venue.
                </Typography>
              </Stack>
            </Stack>
          </Panel>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <PillButton
          variant="outlined"
          onClick={() =>
            dispatch(
              setExportInvigilatorDialogDraft({
                onlyConfirmed: false,
                includeCancelled: false,
                includeProvisions: false,
              })
            )
          }
          disabled={loading}
          sx={{ border: "none" }}
        >
          Clear
        </PillButton>
        <PillButton
          variant="contained"
          startIcon={<FileDownloadOutlined />}
          onClick={() => onExport({ onlyConfirmed, includeCancelled, includeProvisions })}
          disabled={!invigilators.length || loading}
        >
          Export
        </PillButton>
      </DialogActions>
    </Dialog>
  );
};
