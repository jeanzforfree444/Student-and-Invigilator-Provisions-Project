import React, { useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  Typography,
  MenuItem,
  Select,
  FormControl,
  Snackbar,
  Alert,
  Stack,
  Chip,
} from "@mui/material";
import { Upload as UploadIcon, InsertDriveFile, Eject, ArrowDropDown } from "@mui/icons-material";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { PillButton } from "../PillButton";
import { Panel } from "../Panel";
import { sharedInputSx } from "../sharedInputSx";
import { setUploadFileDraft, useAppDispatch, useAppSelector } from "../../state/store";
import {
  DietUploadSuggestionDialog,
  DietSuggestionPayload,
  UploadExamDateRange,
} from "./DietUploadSuggestionDialog";

export const UploadFile: React.FC = () => {
  const dispatch = useAppDispatch();
  const { uploadType, selectedFileName, uploading, snackbar } = useAppSelector((state) => state.adminTables.uploadFile);
  const selectedFileRef = useRef<File | null>(null);
  const [dietSuggestion, setDietSuggestion] = useState<DietSuggestionPayload | null>(null);
  const [uploadDateRange, setUploadDateRange] = useState<UploadExamDateRange | null>(null);
  const [dietDialogOpen, setDietDialogOpen] = useState(false);

  const apiMap: Record<string, string> = {
    exam: "/exams-upload",
    provisions: "/exams-upload",
    venues: "/exams-upload",
  };

  const acceptMap: Record<string, string> = {
    exam: ".csv,.xlsx,.xls",
    provisions: ".csv,.xlsx,.xls",
    venues: ".csv,.xlsx,.xls",
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      selectedFileRef.current = file;
      dispatch(setUploadFileDraft({ selectedFileName: file.name, snackbar: { type: null, message: "" } }));
    }
  };

  const handleUpload = async () => {
    if (!uploadType) {
      dispatch(setUploadFileDraft({ snackbar: { type: "error", message: "Please select a file type." } }));
      return;
    }
    if (!selectedFileRef.current) {
      dispatch(setUploadFileDraft({ snackbar: { type: "error", message: "Please select a file first." } }));
      return;
    }

    dispatch(setUploadFileDraft({ uploading: true, snackbar: { type: null, message: "" } }));

    try {
      const formData = new FormData();
      formData.append("file", selectedFileRef.current);

      const response = await apiFetch(apiBaseUrl + apiMap[uploadType], {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const result = await response.json();
      if (result?.diet_suggestion) {
        setDietSuggestion(result.diet_suggestion as DietSuggestionPayload);
        setUploadDateRange(result.upload_exam_date_range as UploadExamDateRange);
        setDietDialogOpen(true);
      }
      const created = result.records_created ?? result.created ?? result.count ?? 0;
      const updated = result.records_updated ?? result.updated ?? 0;
      const deleted = result.records_deleted ?? result.deleted ?? 0;
      const parts = [
        `Added ${created}`,
        `Updated ${updated}`,
        deleted ? `Deleted ${deleted}` : null,
      ].filter(Boolean);

      const typeLabel =
        uploadType === "exam"
          ? "Exam timetable"
          : uploadType === "provisions"
          ? "Student provisions"
          : "Venue data";

      dispatch(setUploadFileDraft({
        snackbar: {
          type: "success",
          message: `Upload complete: ${typeLabel} (${selectedFileRef.current?.name || "file"}). ${parts.join(", ")}.`,
        },
      }));

      selectedFileRef.current = null;
      dispatch(setUploadFileDraft({ selectedFileName: "" }));
      const fileInput = document.getElementById("file-upload") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } catch (err) {
      dispatch(setUploadFileDraft({
        snackbar: {
          type: "error",
          message: err instanceof Error ? err.message : "Failed to upload file",
        },
      }));
    } finally {
      dispatch(setUploadFileDraft({ uploading: false }));
    }
  };

  const handleDietConfirm = async (selection: string[]) => {
    if (!dietSuggestion || dietSuggestion.status !== "ok") {
      setDietDialogOpen(false);
      return;
    }

    if (dietSuggestion.action === "none") {
      setDietDialogOpen(false);
      return;
    }

    let payload: Record<string, unknown> | null = null;
    if (dietSuggestion.action === "create_new" && dietSuggestion.suggested) {
      payload = {
        action: "create_new",
        code: dietSuggestion.suggested.code,
        name: dietSuggestion.suggested.name,
        start_date: dietSuggestion.suggested.start_date,
        end_date: dietSuggestion.suggested.end_date,
      };
    } else if (dietSuggestion.action === "adjust_existing") {
      const current = dietSuggestion.current;
      const uploaded = dietSuggestion.uploaded;
      if (!current || !uploaded || !dietSuggestion.diet_id) {
        setDietDialogOpen(false);
        return;
      }

      const extendStart = selection.includes("extend_start");
      const contractStart = selection.includes("contract_start");
      const extendEnd = selection.includes("extend_end");
      const contractEnd = selection.includes("contract_end");

      const startDate = extendStart
        ? uploaded.start_date
        : contractStart
        ? uploaded.start_date
        : current.start_date;
      const endDate = extendEnd
        ? uploaded.end_date
        : contractEnd
        ? uploaded.end_date
        : current.end_date;

      payload = {
        action: "adjust_existing",
        diet_id: dietSuggestion.diet_id,
        start_date: startDate,
        end_date: endDate,
      };
    }

    if (!payload) {
      setDietDialogOpen(false);
      return;
    }

    try {
      const response = await apiFetch(`${apiBaseUrl}/diets/adjust/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to update diet.");
      }

      const data = await response.json();
      dispatch(
        setUploadFileDraft({
          snackbar: {
            type: "success",
            message: `Diet updated: ${data?.diet?.name || data?.diet?.code || "Updated"}.`,
          },
        }),
      );
    } catch (err) {
      dispatch(
        setUploadFileDraft({
          snackbar: {
            type: "error",
            message: err instanceof Error ? err.message : "Failed to update diet.",
          },
        }),
      );
    } finally {
      setDietDialogOpen(false);
    }
  };

  return (
    <Panel
      title="Upload data"
      disableDivider
      sx={{ mb: 0 }}
    >
      <Stack spacing={1.25}>
        <Typography variant="body2" color="text.secondary">
          Select a file type and upload a CSV or Excel file to populate the database.
        </Typography>

        <FormControl fullWidth size="small" variant="standard">
          <Select
            value={uploadType}
            onChange={(e) => dispatch(setUploadFileDraft({ uploadType: e.target.value }))}
            displayEmpty
            renderValue={(selected) => {
              if (!selected) {
                return <Typography color="text.secondary">Select file type...</Typography>;
              }
              if (selected === "exam") return "Exam Timetable";
              if (selected === "provisions") return "Student Provisions";
              if (selected === "venues") return "Venue Data";
              return selected;
            }}
            IconComponent={ArrowDropDown}
            disableUnderline
            sx={[
              sharedInputSx,
              {
                display: "flex",
                alignItems: "center",
                "& .MuiSelect-icon": {
                  color: "action.active",
                  right: 15,
                },
              },
            ]}
          >
            <MenuItem value="exam">Exam Timetable</MenuItem>
            <MenuItem value="provisions">Student Provisions</MenuItem>
            <MenuItem value="venues">Venue Data</MenuItem>
          </Select>
        </FormControl>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ width: "100%" }}>
          <PillButton
            variant="outlined"
            component="label"
            disabled={!uploadType || uploading}
            startIcon={<Eject />}
            sx={{ width: "100%", minHeight: 44 }}
          >
            Choose File
            <input
              id="file-upload"
              data-testid="file-upload"
              type="file"
              hidden
              accept={acceptMap[uploadType] || ".csv,.xlsx,.xls"}
              onChange={handleFileChange}
            />
          </PillButton>
          {selectedFileName && (
            <Chip
              icon={<InsertDriveFile fontSize="small" />}
              label={selectedFileName}
              sx={{ maxWidth: "100%", "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }}
            />
          )}
        </Stack>

        <PillButton
          variant="contained"
          color="primary"
          onClick={handleUpload}
          disabled={!uploadType || !selectedFileName || uploading}
          startIcon={uploading ? <CircularProgress size={20} /> : <UploadIcon />}
          sx={{ width: "100%", minHeight: 46 }}
        >
          {uploading ? "Uploading..." : "Upload"}
        </PillButton>
      </Stack>

      <Snackbar
        open={Boolean(snackbar.type)}
        autoHideDuration={6000}
        onClose={() => dispatch(setUploadFileDraft({ snackbar: { type: null, message: "" } }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => dispatch(setUploadFileDraft({ snackbar: { type: null, message: "" } }))}
          severity={snackbar.type || undefined}
          variant="filled"
          sx={
            snackbar.type === "success"
              ? {
                  backgroundColor: "#d4edda",
                  color: "#155724",
                  border: "1px solid #155724",
                  borderRadius: "50px",
                  fontWeight: 500,
                }
              : undefined
          }
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      <DietUploadSuggestionDialog
        open={dietDialogOpen}
        suggestion={dietSuggestion}
        dateRange={uploadDateRange}
        onClose={() => setDietDialogOpen(false)}
        onConfirm={handleDietConfirm}
      />
    </Panel>
  );
};
