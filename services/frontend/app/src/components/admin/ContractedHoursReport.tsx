import React from "react";
import {
  Typography,
  Stack,
  CircularProgress,
  Alert,
  Box,
  LinearProgress,
  Select,
  MenuItem,
  Chip,
} from "@mui/material";
import Panel from "../Panel";
import { sharedInputSx } from "../sharedInputSx";

export interface ContractedHoursData {
  contracted_hours: number;
  total_hours: number;
  completed_hours?: number;
  assigned_shift_count?: number;
  completed_shift_count?: number;
  remaining_hours?: number;
}

interface ContractedHoursReportProps {
  report: ContractedHoursData | null;
  loading: boolean;
  error: string | null;
  invigName?: string;
  diets?: { code: string; label: string; is_active?: boolean }[];
  selectedDiet?: string;
  onDietChange?: (diet: string) => void;
  fakeReport?: {
    total_hours: number;
    contracted_hours: number;
  };
}

export const ContractedHoursReport: React.FC<ContractedHoursReportProps> = ({
  report,
  loading,
  error,
  invigName,
  diets = [],
  selectedDiet,
  onDietChange,
}) => {
  const formatHours = (value: number) => (Number.isInteger(value) ? value.toString() : value.toFixed(1));
  const assignedHours = report?.total_hours ?? 0;
  const completedHours = report?.completed_hours ?? assignedHours;
  const completionPercent = assignedHours > 0
    ? Math.round((Math.min(completedHours, assignedHours) / assignedHours) * 100)
    : 0;
  
  return (
    <Panel disableDivider>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} mb={2}>
        <Typography variant="h6" fontWeight={600}>
          Contracted Hours
        </Typography>
        {diets.length > 0 && onDietChange && (
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="medium"
              label={diets.find((diet) => diet.code === selectedDiet)?.is_active === false ? "Inactive" : "Active"}
              sx={{
                fontWeight: 600,
                bgcolor: diets.find((diet) => diet.code === selectedDiet)?.is_active === false ? "#f0f0f0ff" : "#e3f2fd",
                color: diets.find((diet) => diet.code === selectedDiet)?.is_active === false ? "text.primary" : "#1e3a8a",
              }}
            />
            <Select
              size="small"
              value={selectedDiet || ""}
              onChange={(e) => onDietChange(e.target.value)}
              sx={[sharedInputSx, { minWidth: 200 }]}
            >
              {diets.map((diet) => (
                <MenuItem key={diet.code} value={diet.code} sx={{ opacity: diet.is_active === false ? 0.55 : 1 }}>
                  {diet.label}
                </MenuItem>
              ))}
            </Select>
          </Stack>
        )}
      </Stack>

      {/* Loading */}
      {loading && (
        <Stack alignItems="center" py={2}>
          <CircularProgress size={26} />
        </Stack>
      )}

      {/* Error */}
      {!loading && error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}

      {/* No data */}
      {!loading && !error && !report && (
        <Alert severity="info">No contracted hours available.</Alert>
      )}

      {/* Summary */}
      {!loading && !error && report && (
        <Stack spacing={2} mt={1}>
          <Stack direction="row" spacing={5} flexWrap="wrap" sx={{ rowGap: 2 }}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Total Allocated
              </Typography>
              <Typography variant="body1" fontWeight={600}>
                {formatHours(report.total_hours)} hours
              </Typography>
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary">
                Contracted
              </Typography>
              <Typography variant="body1" fontWeight={600}>
                {formatHours(report.contracted_hours)} hours
              </Typography>
            </Box>

            {typeof report.completed_shift_count === "number" && typeof report.assigned_shift_count === "number" && (
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Shifts worked
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {report.completed_shift_count}/{report.assigned_shift_count} worked
                </Typography>
              </Box>
            )}

            {report.remaining_hours !== undefined && (
              <Box mt={1}>
                <Typography
                  variant="body2"
                  color={
                    report.remaining_hours < 0 ? "error.main" : "success.main"
                  }
                >
                  {report.remaining_hours < 0 ? "Contract fulfilled" : "Remaining"}
                </Typography>
                <Typography
                  variant="body1"
                  fontWeight={600}
                  color={
                    report.remaining_hours < 0 ? "error.main" : "success.main"
                  }
                >
                  {formatHours(Math.abs(report.remaining_hours))} hours
                </Typography>
              </Box>
            )}
          </Stack>

          {(report.total_hours > 0 || report.assigned_shift_count !== undefined) && (
            <Stack spacing={1.5}>
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" color="text.secondary">
                    Completion rate
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {completionPercent}%
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={
                    assignedHours > 0
                      ? Math.min(100, Math.max(0, (completedHours / assignedHours) * 100))
                      : 0
                  }
                  sx={{ height: 8, borderRadius: 999, mt: 0.75 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {formatHours(completedHours)} of {formatHours(report.total_hours)} hours completed
                </Typography>
              </Box>

            </Stack>
          )}
        </Stack>
      )}
    </Panel>
  );
};
