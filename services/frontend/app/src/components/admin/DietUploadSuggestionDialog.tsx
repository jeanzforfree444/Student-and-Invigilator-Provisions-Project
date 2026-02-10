import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  IconButton,
  Stack,
  Typography,
  Checkbox,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import ArrowRightAltIcon from "@mui/icons-material/ArrowRightAlt";
import { PillButton } from "../PillButton";
import { Panel } from "../Panel";

export type DietSuggestionOption =
  | "extend_start"
  | "extend_end"
  | "contract_start"
  | "contract_end";

export type DietSuggestionPayload = {
  status: "ok";
  action: "create_new" | "adjust_existing" | "none";
  options?: DietSuggestionOption[];
  diet_id?: number;
  diet_code?: string;
  diet_name?: string;
  current?: { start_date: string; end_date: string };
  uploaded?: { start_date: string; end_date: string };
  suggested?: { code: string; name: string; start_date: string; end_date: string };
} | {
  status: "error";
  message: string;
};

export type UploadExamDateRange = {
  min_date: string;
  max_date: string;
  row_count: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (selection: DietSuggestionOption[]) => void;
  suggestion: DietSuggestionPayload | null;
  dateRange: UploadExamDateRange | null;
};

const optionLabels: Record<DietSuggestionOption, string> = {
  extend_start: "Extend start date",
  extend_end: "Extend end date",
  contract_start: "Contract start date",
  contract_end: "Contract end date",
};

export const DietUploadSuggestionDialog: React.FC<Props> = ({
  open,
  onClose,
  onConfirm,
  suggestion,
  dateRange,
}) => {
  const availableOptions = useMemo(
    () => (suggestion && suggestion.status === "ok" ? suggestion.options || [] : []),
    [suggestion],
  );
  const [selectedOptions, setSelectedOptions] = useState<DietSuggestionOption[]>([]);

  useEffect(() => {
    setSelectedOptions(availableOptions);
  }, [availableOptions, open]);

  const toggleOption = (option: DietSuggestionOption) => {
    setSelectedOptions((prev) =>
      prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option],
    );
  };

  const renderRange = () => {
    if (!dateRange) return null;
    return (
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        alignItems={{ xs: "flex-start", sm: "center" }}
        sx={{
          px: 2,
          py: 1.5,
          borderRadius: 2,
          backgroundColor: "#f6f7fb",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Exam dates detected
        </Typography>
        <Chip
          label={
            <Stack direction="row" spacing={0.5} alignItems="center">
              <span>{dateRange.min_date}</span>
              <ArrowRightAltIcon fontSize="small" />
              <span>{dateRange.max_date}</span>
            </Stack>
          }
          size="small"
          sx={{
            fontWeight: 700,
            backgroundColor: "#e3f2fd",
            color: "#1e3a8a",
            "& .MuiChip-label": { display: "flex", alignItems: "center" },
            "& .MuiChip-icon": { color: "#1e3a8a" },
          }}
        />
        <Chip
          label={`${dateRange.row_count} rows`}
          size="small"
          sx={{ backgroundColor: "#f0f0f0ff", fontWeight: 700 }}
        />
      </Stack>
    );
  };

  const confirmDisabled =
    !suggestion ||
    suggestion.status === "error" ||
    (suggestion.status === "ok" &&
      suggestion.action === "adjust_existing" &&
      availableOptions.length > 0 &&
      selectedOptions.length === 0);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Update diet dates?
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8 }}>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {renderRange()}

          {!suggestion && (
            <Alert severity="info">No diet suggestions are available for this upload.</Alert>
          )}

          {suggestion?.status === "error" && (
            <Alert severity="warning">{suggestion.message}</Alert>
          )}

          {suggestion?.status === "ok" && suggestion.action === "none" && (
            <Alert severity="info">No diet changes are needed for this upload.</Alert>
          )}

          {suggestion?.status === "ok" && suggestion.action === "create_new" && suggestion.suggested && (
            <Panel title="Suggested diet" disableDivider sx={{ backgroundColor: "#fbfbff" }}>
              <Stack spacing={1}>
                <Typography variant="body2">
                  Code: <strong>{suggestion.suggested.code}</strong>
                </Typography>
                <Typography variant="body2">
                  Name: <strong>{suggestion.suggested.name}</strong>
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip
                    label={`Start: ${suggestion.suggested.start_date}`}
                    size="small"
                    sx={{ backgroundColor: "#e3f2fd" }}
                  />
                  <Chip
                    label={`End: ${suggestion.suggested.end_date}`}
                    size="small"
                    sx={{ backgroundColor: "#e3f2fd" }}
                  />
                </Stack>
              </Stack>
            </Panel>
          )}

          {suggestion?.status === "ok" && suggestion.action === "adjust_existing" && (
            <Panel title="Existing diet" disableDivider sx={{ backgroundColor: "#fbfbff" }}>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="body2">
                    Diet: <strong>{suggestion.diet_name || suggestion.diet_code}</strong>
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                    {suggestion.current && (
                      <Chip
                        label={
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <span>Current:</span>
                            <span>{suggestion.current.start_date}</span>
                            <ArrowRightAltIcon fontSize="small" />
                            <span>{suggestion.current.end_date}</span>
                          </Stack>
                        }
                        size="small"
                        sx={{ backgroundColor: "#f0f0f0ff", fontWeight: 700 }}
                      />
                    )}
                    {suggestion.uploaded && (
                      <Chip
                        label={
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <span>Uploaded:</span>
                            <span>{suggestion.uploaded.start_date}</span>
                            <ArrowRightAltIcon fontSize="small" />
                            <span>{suggestion.uploaded.end_date}</span>
                          </Stack>
                        }
                        size="small"
                        sx={{
                          backgroundColor: "#d4edda",
                          color: "#155724",
                          fontWeight: 700,
                        }}
                      />
                    )}
                  </Stack>
                </Box>

                {availableOptions.length > 0 ? (
                  <FormGroup>
                    {availableOptions.map((option) => (
                      <FormControlLabel
                        key={option}
                        control={
                          <Checkbox
                            checked={selectedOptions.includes(option)}
                            onChange={() => toggleOption(option)}
                          />
                        }
                        label={optionLabels[option]}
                      />
                    ))}
                  </FormGroup>
                ) : (
                  <Alert severity="info">No available diet adjustments were detected.</Alert>
                )}
              </Stack>
            </Panel>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <PillButton variant="outlined" onClick={onClose}>
          Skip
        </PillButton>
        <PillButton
          variant="contained"
          color="primary"
          onClick={() => onConfirm(selectedOptions)}
          disabled={confirmDisabled}
        >
          Confirm
        </PillButton>
      </DialogActions>
    </Dialog>
  );
};
