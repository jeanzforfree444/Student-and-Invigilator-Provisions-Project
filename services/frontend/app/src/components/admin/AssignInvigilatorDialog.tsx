import React, { useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  Checkbox,
  FormControlLabel,
  FormControl,
  InputLabel,
  InputBase,
  Select,
  MenuItem,
  Box,
  Chip,
  Collapse,
  IconButton,
  TextField,
  Stack,
  Typography,
  Alert,
  Snackbar,
  Link as MUILink,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Close, ExpandMore, Search, ArrowDropDown } from "@mui/icons-material";
import dayjs from "dayjs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PillButton } from "../PillButton";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { formatDateTime } from "../../utils/dates";
import { sharedInputSx } from "../sharedInputSx";
import {
  resetAssignInvigilatorDraft,
  setAssignInvigilatorDraft,
  useAppDispatch,
  useAppSelector,
} from "../../state/store";

type ExamVenue = {
  examvenue_id: number;
  venue_name: string | null;
  start_time: string | null;
  exam_length: number | null;
  core: boolean;
};

type Invigilator = {
  id: number;
  preferred_name: string | null;
  full_name: string | null;
  resigned: boolean;
  availabilities?: InvigilatorAvailability[];
  qualifications?: { qualification: string }[];
  restrictions?: (string | { restrictions?: string[]; diet?: string })[];
};

type InvigilatorAvailability = {
  date: string;
  slot: SlotCode;
  available: boolean;
};

type InvigilatorAssignment = {
  id: number;
  invigilator: number;
  exam_venue: number;
  assigned_start: string;
  assigned_end: string;
  role?: string | null;
  confirmed?: boolean | null;
  cancel?: boolean;
  cancel_cause?: string | null;
};

type SlotCode = "MORNING" | "EVENING";

type AssignInvigilatorDialogProps = {
  open: boolean;
  onClose: () => void;
  examVenue: ExamVenue | null;
  invigilators: Invigilator[];
  assignments: InvigilatorAssignment[];
  onAssigned?: (summary?: { assigned: number; unassigned: number; updated: number }) => void;
};

const formatDuration = (minutes?: number | null) => {
  if (minutes == null || Number.isNaN(minutes)) return "N/A";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return [hrs ? `${hrs}h` : "", mins ? `${mins}m` : ""].filter(Boolean).join(" ") || "0m";
};

export const AssignInvigilatorDialog: React.FC<AssignInvigilatorDialogProps> = ({
  open,
  onClose,
  examVenue,
  invigilators,
  assignments,
  onAssigned,
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle sx={{ pr: 6, pb: 1.5 }}>
      Assign invigilator
      <IconButton
        aria-label="Close"
        onClick={onClose}
        sx={{ position: "absolute", right: 12, top: 10 }}
      >
        <Close />
      </IconButton>
    </DialogTitle>
    <DialogContent sx={{ pt: 0.5 }}>
      <AssignInvigilatorDialogBody
        open={open}
        examVenue={examVenue}
        invigilators={invigilators}
        assignments={assignments}
        onAssigned={onAssigned}
        onClose={onClose}
      />
    </DialogContent>
  </Dialog>
);

export default AssignInvigilatorDialog;

const displayName = (invigilator: Invigilator) =>
  invigilator.preferred_name || invigilator.full_name || `Invigilator #${invigilator.id}`;

const qualificationLabels: Record<string, string> = {
  SENIOR_INVIGILATOR: "Senior Invigilator",
  AKT_TRAINED: "AKT Trained",
  CHECK_IN: "Check-In",
  DETACHED_DUTY: "Detached Duty",
};
const restrictionLabels: Record<string, string> = {
  accessibility_required: "Accessibility required",
  separate_room_only: "Separate room only",
  purple_cluster: "Purple cluster",
  computer_cluster: "Computer cluster",
  vet_school: "Vet School",
  osce_golden_jubilee: "Golden Jubilee",
  osce_wolfson: "Wolfson",
  osce_queen_elizabeth: "Queen Elizabeth",
  approved_exemption: "Approved exemption",
};

const formatQualification = (code: string) => qualificationLabels[code] || code;
const formatRequirement = (code: string) => restrictionLabels[code] || code;
const roleOptions = [
  { value: "assistant", label: "Assistant invigilator" },
  { value: "lead", label: "Lead invigilator" },
  { value: "support", label: "Support invigilator" },
];

const AssignInvigilatorDialogBody: React.FC<{
  open: boolean;
  examVenue: ExamVenue | null;
  invigilators: Invigilator[];
  assignments: InvigilatorAssignment[];
  onAssigned?: (summary?: { assigned: number; unassigned: number; updated: number }) => void;
  onClose: () => void;
}> = ({ open, examVenue, invigilators, assignments, onAssigned, onClose }) => {
  const dispatch = useAppDispatch();
  const draft = useAppSelector((state) =>
    examVenue ? state.adminTables.assignInvigilatorDialogs[examVenue.examvenue_id] : undefined
  );
  const selectedIds = draft?.selectedIds ?? [];
  const search = draft?.search ?? "";
  const onlyAvailable = draft?.onlyAvailable ?? true;
  const expandedIds = useMemo(() => new Set(draft?.expandedIds ?? []), [draft?.expandedIds]);
  const manualCollapsedIds = useMemo(() => new Set(draft?.manualCollapsedIds ?? []), [draft?.manualCollapsedIds]);
  const manualExpandedIds = useMemo(() => new Set(draft?.manualExpandedIds ?? []), [draft?.manualExpandedIds]);
  const assignmentInputs = draft?.assignmentInputs ?? {};
  const error = draft?.error ?? null;
  const snackbar = draft?.snackbar ?? { open: false, message: "" };
  const queryClient = useQueryClient();

  const assignedAssignments = useMemo(() => {
    if (!examVenue) return [];
    return assignments.filter((a) => a.exam_venue === examVenue.examvenue_id);
  }, [assignments, examVenue]);

  const assignedIds = useMemo(() => new Set(assignedAssignments.map((a) => a.invigilator)), [assignedAssignments]);

  const assignmentByInvigilator = useMemo(() => {
    const map = new Map<number, InvigilatorAssignment>();
    assignedAssignments.forEach((assignment) => {
      map.set(assignment.invigilator, assignment);
    });
    return map;
  }, [assignedAssignments]);

  const slotInfo = useMemo(() => {
    if (!examVenue?.start_time) return null;
    const start = dayjs(examVenue.start_time);
    if (!start.isValid()) return null;
    const slot: SlotCode = start.hour() < 12 ? "MORNING" : "EVENING";
    return { slot, dateKey: start.format("YYYY-MM-DD") };
  }, [examVenue?.start_time]);

  const examWindow = useMemo(() => {
    if (!examVenue?.start_time || examVenue.exam_length == null) return null;
    const start = dayjs(examVenue.start_time);
    if (!start.isValid()) return null;
    return { start, end: start.add(examVenue.exam_length, "minute") };
  }, [examVenue?.start_time, examVenue?.exam_length]);

  const updateDraft = (updates: Partial<{
    selectedIds: number[];
    search: string;
    onlyAvailable: boolean;
    expandedIds: number[];
    manualCollapsedIds: number[];
    manualExpandedIds: number[];
    assignmentInputs: Record<number, { start: string; end: string; role: string }>;
    error: string | null;
    snackbar: { open: boolean; message: string };
    initialized?: boolean;
  }>) => {
    if (!examVenue) return;
    dispatch(setAssignInvigilatorDraft({ key: examVenue.examvenue_id, draft: updates }));
  };

  useEffect(() => {
    if (!open || !examVenue) return;
    if (draft?.initialized) return;
    updateDraft({
      selectedIds: Array.from(new Set(assignedAssignments.map((a) => a.invigilator))),
      search: "",
      onlyAvailable: true,
      expandedIds: [],
      manualCollapsedIds: [],
      manualExpandedIds: [],
      assignmentInputs: (() => {
        const next: Record<number, { start: string; end: string; role: string }> = {};
        const defaultStart = examWindow?.start ? examWindow.start.format("YYYY-MM-DDTHH:mm") : "";
        const defaultEnd = examWindow?.end ? examWindow.end.format("YYYY-MM-DDTHH:mm") : "";
        assignedAssignments.forEach((a) => {
          const start = dayjs(a.assigned_start);
          const end = dayjs(a.assigned_end);
          next[a.invigilator] = {
            start: start.isValid() ? start.format("YYYY-MM-DDTHH:mm") : defaultStart,
            end: end.isValid() ? end.format("YYYY-MM-DDTHH:mm") : defaultEnd,
            role: a.role || "",
          };
        });
        invigilators.forEach((i) => {
          if (!next[i.id]) {
            next[i.id] = {
              start: defaultStart,
              end: defaultEnd,
              role: "",
            };
          }
        });
        return next;
      })(),
      initialized: true,
    });
    updateDraft({ error: null });
  }, [assignedAssignments, draft?.initialized, examVenue, examWindow, invigilators, open]);

  useEffect(() => {
    if (!examVenue) return;
    if (open) return;
  }, [dispatch, examVenue, open]);

  useEffect(() => {
    if (!examVenue) return;
    const nextExpanded = Array.from(
      new Set([
        ...selectedIds.filter((id) => !manualCollapsedIds.has(id)),
        ...Array.from(manualExpandedIds),
      ])
    );
    const current = draft?.expandedIds ?? [];
    if (current.length === nextExpanded.length && current.every((id, idx) => id === nextExpanded[idx])) return;
    updateDraft({ expandedIds: nextExpanded });
  }, [examVenue, draft?.expandedIds, manualCollapsedIds, manualExpandedIds, selectedIds]);

  const hasConflict = (invigilatorId: number) => {
    if (!examWindow) return false;
    return assignments.some((assignment) => {
      if (assignment.invigilator !== invigilatorId) return false;
      if (assignment.cancel) return false;
      if (examVenue && assignment.exam_venue === examVenue.examvenue_id) return false;
      const start = dayjs(assignment.assigned_start);
      const end = dayjs(assignment.assigned_end);
      if (!start.isValid() || !end.isValid()) return false;
      return start.isBefore(examWindow.end) && examWindow.start.isBefore(end);
    });
  };

  const filteredInvigilators = useMemo(() => {
    const base = invigilators.filter((i) => !i.resigned || assignedIds.has(i.id));
    const query = search.trim().toLowerCase();
    const searched = query ? base.filter((i) => displayName(i).toLowerCase().includes(query)) : base;
    if (!onlyAvailable || !slotInfo) return searched;
    return searched.filter((invigilator) => {
      if (assignedIds.has(invigilator.id)) return true;
      const entry = invigilator.availabilities?.find(
        (a) => a.date === slotInfo.dateKey && a.slot === slotInfo.slot
      );
      if (hasConflict(invigilator.id)) return false;
      if (!entry) return false; // If no availability recorded for the exam slot, treat as unavailable
      return entry.available;
    });
  }, [assignedIds, invigilators, search, onlyAvailable, slotInfo, examWindow, assignments]);

  const getInputFor = (id: number) =>
    assignmentInputs[id]
    || {
      start: examWindow?.start?.format("YYYY-MM-DDTHH:mm") || "",
      end: examWindow?.end?.format("YYYY-MM-DDTHH:mm") || "",
      role: "",
    };

  const selectionDelta = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    const toAdd = selectedIds.filter((id) => !assignedIds.has(id));
    const toRemove = Array.from(assignedIds).filter((id) => !selectedSet.has(id));
    const toUpdate: number[] = [];

    selectedIds.forEach((id) => {
      if (!assignedIds.has(id)) return;
      const assignment = assignmentByInvigilator.get(id);
      if (!assignment) return;
      const input = getInputFor(id);
      const inputStart = dayjs(input.start);
      const inputEnd = dayjs(input.end);
      const currentStart = dayjs(assignment.assigned_start);
      const currentEnd = dayjs(assignment.assigned_end);
      const role = input.role || "";
      const currentRole = assignment.role || "";
      const startChanged = inputStart.isValid() && currentStart.isValid()
        ? !inputStart.isSame(currentStart, "minute")
        : input.start !== "";
      const endChanged = inputEnd.isValid() && currentEnd.isValid()
        ? !inputEnd.isSame(currentEnd, "minute")
        : input.end !== "";

      if (startChanged || endChanged || role !== currentRole) {
        toUpdate.push(id);
      }
    });

    return {
      toAdd,
      toRemove,
      toUpdate,
      hasChanges: toAdd.length > 0 || toRemove.length > 0 || toUpdate.length > 0,
    };
  }, [assignedIds, selectedIds, assignmentByInvigilator, assignmentInputs, examWindow]);

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!examVenue) throw new Error("Exam venue is missing.");
      if (!selectionDelta.hasChanges) {
        throw new Error("No assignment changes to save.");
      }
      const failures: { id: number; error: string; action: "assign" | "unassign" | "update" }[] = [];
      for (const invigilatorId of selectionDelta.toRemove) {
        const assignment = assignmentByInvigilator.get(invigilatorId);
        if (!assignment) {
          failures.push({ id: invigilatorId, error: "Assignment not found.", action: "unassign" });
          continue;
        }
        const response = await apiFetch(`${apiBaseUrl}/invigilator-assignments/${assignment.id}/`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const text = await response.text();
          failures.push({ id: invigilatorId, error: text || "Failed to unassign.", action: "unassign" });
        }
      }
      if (selectionDelta.toAdd.length > 0) {
        for (const invigilatorId of selectionDelta.toAdd) {
          const input = getInputFor(invigilatorId);
          const start = dayjs(input.start);
          const end = dayjs(input.end);
          if (!start.isValid() || !end.isValid()) {
            throw new Error(`Invalid start or end time for ${displayName(invigilators.find((i) => i.id === invigilatorId) || { id: invigilatorId, preferred_name: null, full_name: null, resigned: false })}.`);
          }
          if (!input.role) {
            throw new Error(`Select a role for ${displayName(invigilators.find((i) => i.id === invigilatorId) || { id: invigilatorId, preferred_name: null, full_name: null, resigned: false })}.`);
          }
          const response = await apiFetch(`${apiBaseUrl}/invigilator-assignments/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              invigilator: invigilatorId,
              exam_venue: examVenue.examvenue_id,
              role: input.role,
              assigned_start: start.toISOString(),
              assigned_end: end.toISOString(),
              break_time_minutes: 0,
            }),
          });
          if (!response.ok) {
            const text = await response.text();
            failures.push({ id: invigilatorId, error: text || "Failed to assign.", action: "assign" });
          }
        }
      }
      if (selectionDelta.toUpdate.length > 0) {
        for (const invigilatorId of selectionDelta.toUpdate) {
          const assignment = assignmentByInvigilator.get(invigilatorId);
          if (!assignment) {
            failures.push({ id: invigilatorId, error: "Assignment not found.", action: "update" });
            continue;
          }
          const input = getInputFor(invigilatorId);
          const start = dayjs(input.start);
          const end = dayjs(input.end);
          if (!start.isValid() || !end.isValid()) {
            throw new Error(`Invalid start or end time for ${displayName(invigilators.find((i) => i.id === invigilatorId) || { id: invigilatorId, preferred_name: null, full_name: null, resigned: false })}.`);
          }
          if (!input.role) {
            throw new Error(`Select a role for ${displayName(invigilators.find((i) => i.id === invigilatorId) || { id: invigilatorId, preferred_name: null, full_name: null, resigned: false })}.`);
          }
          const response = await apiFetch(`${apiBaseUrl}/invigilator-assignments/${assignment.id}/`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: input.role,
              assigned_start: start.toISOString(),
              assigned_end: end.toISOString(),
            }),
          });
          if (!response.ok) {
            const text = await response.text();
            failures.push({ id: invigilatorId, error: text || "Failed to update assignment.", action: "update" });
          }
        }
      }
      if (failures.length) {
        const names = failures
          .map((f) => displayName(invigilators.find((i) => i.id === f.id) || { id: f.id, preferred_name: null, full_name: null, resigned: false }))
          .join(", ");
        const hasAssignFailures = failures.some((f) => f.action === "assign");
        const hasUnassignFailures = failures.some((f) => f.action === "unassign");
        const hasUpdateFailures = failures.some((f) => f.action === "update");
        let actionLabel = "update";
        if ((hasAssignFailures || hasUpdateFailures) && hasUnassignFailures) actionLabel = "assign/unassign/update";
        else if (hasAssignFailures && hasUpdateFailures) actionLabel = "assign/update";
        else if (hasAssignFailures) actionLabel = "assign";
        else if (hasUnassignFailures) actionLabel = "unassign";
        else if (hasUpdateFailures) actionLabel = "update";
        throw new Error(`Failed to ${actionLabel} ${failures.length} invigilator(s): ${names}`);
      }
      return { success: true };
    },
    onSuccess: () => {
      const summary = {
        assigned: selectionDelta.toAdd.length,
        unassigned: selectionDelta.toRemove.length,
        updated: selectionDelta.toUpdate.length,
      };
      queryClient.invalidateQueries({ queryKey: ["invigilator-assignments"] });
      onAssigned?.(summary);
      onClose();
    },
    onError: (err: unknown) => {
      updateDraft({
        error: err instanceof Error ? err.message : "Failed to update invigilator assignments.",
      });
    },
  });

  const cancellationMutation = useMutation({
    mutationFn: async ({ assignmentId, action }: { assignmentId: number; action: "approve" | "reject" }) => {
      if (action === "approve") {
        const res = await apiFetch(`${apiBaseUrl}/invigilator-assignments/${assignmentId}/`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmed: true }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to approve cancellation.");
        }
        return { action };
      }
      const res = await apiFetch(`${apiBaseUrl}/invigilator-assignments/${assignmentId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel: false, cancel_cause: "" }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to reject cancellation.");
      }
      return { action };
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["invigilator-assignments"] });
      onAssigned?.();
      updateDraft({
        snackbar: {
          open: true,
          message: vars.action === "approve" ? "Cancellation approved." : "Cancellation rejected.",
        },
      });
    },
    onError: (err: unknown) => {
      updateDraft({
        error: err instanceof Error ? err.message : "Failed to update cancellation status.",
      });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      const res = await apiFetch(`${apiBaseUrl}/invigilator-assignments/${assignmentId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to confirm assignment.");
      }
      return { assignmentId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invigilator-assignments"] });
      onAssigned?.();
      updateDraft({ snackbar: { open: true, message: "Shift confirmed." } });
    },
    onError: (err: unknown) => {
      updateDraft({
        error: err instanceof Error ? err.message : "Failed to confirm assignment.",
      });
    },
  });

  const canUpdate = Boolean(examVenue)
    && selectionDelta.hasChanges;

  const toggleSelected = (id: number) => {
    updateDraft({
      selectedIds: selectedIds.includes(id)
        ? selectedIds.filter((value) => value !== id)
        : [...selectedIds, id],
    });
  };

  const toggleExpanded = (id: number) => {
    const isExpanded = expandedIds.has(id);
    const nextCollapsed = new Set(manualCollapsedIds);
    const nextExpanded = new Set(manualExpandedIds);
    if (isExpanded) {
      nextExpanded.delete(id);
      if (selectedIds.includes(id)) nextCollapsed.add(id);
    } else {
      nextCollapsed.delete(id);
      nextExpanded.add(id);
    }
    updateDraft({
      manualCollapsedIds: Array.from(nextCollapsed),
      manualExpandedIds: Array.from(nextExpanded),
    });
  };

  const updateInput = (id: number, patch: Partial<{ start: string; end: string; role: string }>) => {
    const current = assignmentInputs[id] || { start: "", end: "", role: "" };
    updateDraft({
      assignmentInputs: {
        ...assignmentInputs,
        [id]: { ...current, ...patch },
      },
    });
  };
  const requirementLabelsFor = (invigilator: Invigilator) => {
    const raw = invigilator.restrictions || [];
    const codes = raw.flatMap((entry) => {
      if (!entry) return [];
      if (typeof entry === "string") return [entry];
      if (Array.isArray(entry.restrictions)) return entry.restrictions.filter(Boolean) as string[];
      return [];
    });
    return Array.from(new Set(codes.map(formatRequirement))).filter(Boolean);
  };

  const toneStyles = (tone: "success" | "error" | "warning" | "info" | "default", solid?: boolean) => {
    const palette: Record<typeof tone, { bg: string; fg: string; solidBg: string }> = {
      success: { bg: alpha("#2e7d32", 0.12), fg: "#166534", solidBg: "#2e7d32" },
      warning: { bg: alpha("#ed6c02", 0.12), fg: "#b45309", solidBg: "#ed6c02" },
      info: { bg: "#e3f2fd", fg: "primary.main", solidBg: "#1d4ed8" },
      error: { bg: alpha("#b91c1c", 0.12), fg: "#b91c1c", solidBg: "#dc2626" },
      default: { bg: "#f5f5f5", fg: "#424242", solidBg: "#424242" },
    };
    const colors = palette[tone] || palette.default;
    if (solid) {
      return { bg: colors.solidBg, fg: "#fff" };
    }
    return { bg: colors.bg, fg: colors.fg };
  };

  const pluralize = (count: number, singular: string, plural?: string) =>
    count === 1 ? singular : plural || `${singular}s`;

  return (
    <Stack spacing={2}>
      {examVenue ? (
        <Stack spacing={0.25} sx={{ bgcolor: "grey.50", borderRadius: 2, p: 2, border: "1px solid", borderColor: "divider" }}>
          <Typography
            variant="overline"
            sx={{
              color: "text.secondary",
              letterSpacing: 0.8,
              lineHeight: 1.1,
              mb: 0,
            }}
          >
            Venue
          </Typography>
          <Typography variant="h6" fontWeight={700}>{examVenue.venue_name || "Unassigned"}</Typography>
          <Typography variant="body2" color="text.secondary">
            {formatDateTime(examVenue.start_time)} • {formatDuration(examVenue.exam_length)}
          </Typography>
        </Stack>
      ) : (
        <Typography variant="body2" color="text.secondary">
          No exam venue selected.
        </Typography>
      )}

      <Stack spacing={0.75}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Invigilators</Typography>
            <Typography variant="caption" color="text.secondary">
              Select or deselect invigilators to assign or unassign to this exam.
            </Typography>
          </Box>
          <FormControlLabel
            control={
              <Checkbox
                checked={onlyAvailable}
                onChange={(e) => updateDraft({ onlyAvailable: e.target.checked })}
              />
            }
            label="Available"
            sx={{ m: 0, "& .MuiFormControlLabel-label": { fontSize: 12, color: "text.secondary" } }}
          />
        </Stack>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "action.hover",
            borderRadius: 1,
            px: 2,
            py: 0.75,
          }}
        >
          <Search sx={{ color: "action.active", mr: 1 }} />
          <InputBase
            placeholder="Search invigilators..."
            value={search}
            onChange={(e) => updateDraft({ search: e.target.value })}
            sx={{ width: "100%" }}
          />
        </Box>
        {filteredInvigilators.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No invigilators available.</Typography>
        ) : (
          <Stack spacing={1.25}>
            {filteredInvigilators.map((invigilator) => {
              const assigned = assignedIds.has(invigilator.id);
              const isSelected = selectedIds.includes(invigilator.id);
              const conflict = hasConflict(invigilator.id);
              const assignment = assignmentByInvigilator.get(invigilator.id);
              const isCancelled = Boolean(assignment?.cancel);
              const isConfirmed = Boolean(assignment?.confirmed);
              const isCancelledConfirmed = isCancelled && isConfirmed;
              const showConfirmationBanner = assigned && !isCancelled;
              const showPendingBanner = showConfirmationBanner && !isConfirmed;
              const showConfirmedBanner = showConfirmationBanner && isConfirmed;
              const canEditAssignment = isSelected && !isCancelledConfirmed;
              let availabilityLabel: string | null = null;
              if (slotInfo && invigilator.availabilities) {
                const entry = invigilator.availabilities.find(
                  (a) => a.date === slotInfo.dateKey && a.slot === slotInfo.slot
                );
                if (entry) {
                  availabilityLabel = entry.available ? "Available for this slot" : "Unavailable for this slot";
                }
              }
              if (!availabilityLabel && hasConflict(invigilator.id)) {
                availabilityLabel = "Conflicts with another shift";
              }
              let assignmentLabel: string | null = null;
              if (assigned && isSelected) assignmentLabel = "Assigned to this exam";
              if (assigned && !isSelected) assignmentLabel = "Will be unassigned";
              if (!assigned && isSelected) assignmentLabel = "Will be assigned";
              const qualificationNames = Array.from(
                new Set(
                  (invigilator.qualifications || [])
                    .map((q) => formatQualification(q.qualification))
                    .filter(Boolean)
                )
              );
              const requirementNames = requirementLabelsFor(invigilator);
              const summaryParts = [
                qualificationNames.length ? `${qualificationNames.length} qualification${qualificationNames.length > 1 ? "s" : ""}` : null,
                requirementNames.length ? `${requirementNames.length} requirement${requirementNames.length > 1 ? "s" : ""}` : null,
              ].filter(Boolean);
              const statusChips: { label: string; tone: "success" | "error" | "warning" | "info" | "default"; solid?: boolean }[] = [];
              if (!isCancelledConfirmed) {
                if (assigned && isSelected) statusChips.push({ label: "Assigned", tone: "success", solid: true });
                if (assigned && !isSelected) statusChips.push({ label: "Unassigning", tone: "error", solid: true });
                if (!assigned && isSelected) statusChips.push({ label: "Assigning", tone: "success" });
              }
              if (isCancelled) statusChips.push({
                label: isCancelledConfirmed ? "Cancelled" : "Cancellation requested",
                tone: isCancelledConfirmed ? "error" : "warning",
                solid: true,
              });
              if (conflict) statusChips.push({ label: "Has conflict", tone: "error", solid: true });
              if (isConfirmed && !isCancelled) {
                statusChips.push({ label: "Confirmed", tone: "success", solid: false });
              } else if (isCancelled) {
                statusChips.push({ label: "Not available", tone: "warning", solid: false });
              } else if (availabilityLabel) {
                const available = availabilityLabel.toLowerCase().startsWith("available");
                statusChips.push({ label: available ? "Available" : "Unavailable", tone: available ? "success" : "warning", solid: !available });
              }
              if (invigilator.resigned) statusChips.push({ label: "Resigned", tone: "default" });

              return (
                <Box
                  key={invigilator.id}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1.5,
                    overflow: "hidden",
                    backgroundColor: "background.paper",
                    boxShadow: "0 4px 12px rgba(18, 38, 63, 0.05)",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      px: 1.25,
                      py: 1,
                      borderBottom: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Checkbox
                      checked={selectedIds.includes(invigilator.id)}
                      onChange={() => toggleSelected(invigilator.id)}
                      disabled={!assigned && conflict || isCancelledConfirmed}
                      inputProps={{ "aria-label": displayName(invigilator) }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" fontWeight={700} noWrap title={displayName(invigilator)}>
                        <MUILink
                          href={`/admin/invigilators/${invigilator.id}`}
                          underline="none"
                          color="primary"
                          sx={{ fontWeight: 700, "&:hover": { textDecoration: "none" } }}
                        >
                          {displayName(invigilator)}
                        </MUILink>
                      </Typography>
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" rowGap={0.75} sx={{ mt: 0.5 }}>
                        {statusChips.map((chip) => {
                          const tone = toneStyles(chip.tone, chip.solid);
                          return (
                            <Chip
                              key={chip.label}
                              label={chip.label}
                              size="small"
                              variant="outlined"
                              sx={{
                                fontWeight: 600,
                                borderRadius: 999,
                                px: 0.75,
                                bgcolor: tone.bg,
                                color: tone.fg,
                                borderColor: "transparent",
                              }}
                            />
                          );
                        })}
                      </Stack>
                      {summaryParts.length > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                          {summaryParts.join(" / ")}
                        </Typography>
                      )}
                      {assignmentLabel && (
                        <Typography variant="caption" color="text.secondary">
                          {assignmentLabel}
                        </Typography>
                      )}
                      {conflict && (
                        <Typography variant="caption" color="error.main">
                          Conflicts with existing shift
                        </Typography>
                      )}
                    </Box>
                    <IconButton
                      onClick={() => toggleExpanded(invigilator.id)}
                      size="small"
                      aria-label="Toggle details"
                      sx={{
                        transform: expandedIds.has(invigilator.id) ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.15s ease",
                        color: "text.secondary",
                      }}
                    >
                      <ExpandMore />
                    </IconButton>
                  </Box>
                  {(showPendingBanner || showConfirmedBanner) && (
                    <Box
                      sx={{
                        px: 2,
                        py: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 2,
                        bgcolor: showConfirmedBanner ? alpha("#2e7d32", 0.12) : alpha("#ed6c02", 0.12),
                        borderBottom: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          color={showConfirmedBanner ? "#166534" : "#b45309"}
                        >
                          {showConfirmedBanner ? "Confirmed" : "Pending confirmation"}
                        </Typography>
                      </Box>
                      {showPendingBanner && assignment && (
                        <PillButton
                          variant="contained"
                          color="success"
                          disabled={confirmMutation.isPending}
                          onClick={() => confirmMutation.mutate(assignment.id)}
                        >
                          Confirm
                        </PillButton>
                      )}
                    </Box>
                  )}
                  {assignment?.cancel && (
                    <Box
                      sx={{
                        px: 2,
                        py: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 2,
                        bgcolor: alpha(isCancelledConfirmed ? "#b91c1c" : "#ed6c02", 0.12),
                        borderBottom: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} color={isCancelledConfirmed ? "#b91c1c" : "#b45309"}>
                          {isCancelledConfirmed ? "Cancelled" : "Cancellation requested"}
                        </Typography>
                      </Box>
                      {!isCancelledConfirmed && (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <PillButton
                            variant="contained"
                            color="error"
                            disabled={cancellationMutation.isPending}
                            onClick={() => cancellationMutation.mutate({ assignmentId: assignment.id, action: "approve" })}
                          >
                            Approve
                          </PillButton>
                          <PillButton
                            variant="outlined"
                            disabled={cancellationMutation.isPending}
                            onClick={() => cancellationMutation.mutate({ assignmentId: assignment.id, action: "reject" })}
                          >
                            Reject
                          </PillButton>
                        </Stack>
                      )}
                    </Box>
                  )}
                  <Collapse in={expandedIds.has(invigilator.id)} timeout="auto" unmountOnExit>
                    <Box sx={{ px: 2, py: 1.5 }}>
                      <Stack spacing={1.5}>
                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary" fontWeight={700}>Qualifications</Typography>
                            {qualificationNames.length ? (
                              <Stack direction="row" spacing={0.75} flexWrap="wrap" rowGap={0.75}>
                                {qualificationNames.map((q) => (
                                  <Chip
                                    key={q}
                                    label={q}
                                    size="small"
                                    variant="filled"
                                    sx={{
                                      borderRadius: 999,
                                      bgcolor: "#e3f2fd",
                                      color: "primary.main",
                                      borderColor: "transparent",
                                      fontWeight: 600,
                                    }}
                                  />
                                ))}
                              </Stack>
                          ) : (
                            <Typography variant="body2" color="text.secondary">None recorded.</Typography>
                          )}
                        </Stack>
                        <Stack spacing={0.5}>
                          <Typography variant="caption" color="text.secondary" fontWeight={700}>Requirements</Typography>
                            {requirementNames.length ? (
                              <Stack direction="row" spacing={0.75} flexWrap="wrap" rowGap={0.75}>
                                {requirementNames.map((r) => (
                                  <Chip
                                    key={r}
                                    label={r}
                                    size="small"
                                    variant="filled"
                                    sx={{
                                      borderRadius: 999,
                                      bgcolor: "#fff4e5",
                                      color: "#b45309",
                                      borderColor: "transparent",
                                      fontWeight: 600,
                                    }}
                                  />
                                ))}
                              </Stack>
                          ) : (
                            <Typography variant="body2" color="text.secondary">No requirements recorded.</Typography>
                          )}
                        </Stack>
                        <Stack spacing={0.75}>
                          <Typography variant="caption" color="text.secondary" fontWeight={700}>Assignment details</Typography>
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                            <TextField
                              label="Start"
                              type="datetime-local"
                              size="small"
                              value={getInputFor(invigilator.id).start}
                              onChange={(e) => updateInput(invigilator.id, { start: e.target.value })}
                              disabled={!canEditAssignment}
                              InputLabelProps={{ shrink: true }}
                              sx={[sharedInputSx, { flex: 1 }]}
                            />
                            <TextField
                              label="End"
                              type="datetime-local"
                              size="small"
                              value={getInputFor(invigilator.id).end}
                              onChange={(e) => updateInput(invigilator.id, { end: e.target.value })}
                              disabled={!canEditAssignment}
                              InputLabelProps={{ shrink: true }}
                              sx={[sharedInputSx, { flex: 1 }]}
                            />
                          </Stack>
                          <FormControl
                            size="small"
                            variant="standard"
                            sx={{
                              minWidth: 200,
                              ...sharedInputSx,
                              display: "flex",
                              justifyContent: "center",
                            }}
                          >
                            <Select
                              value={getInputFor(invigilator.id).role}
                              onChange={(e) => updateInput(invigilator.id, { role: e.target.value as string })}
                              disabled={!canEditAssignment}
                              displayEmpty
                              disableUnderline
                              IconComponent={ArrowDropDown}
                              renderValue={(selected) => {
                                if (!selected) {
                                  return <Typography color="text.secondary">Invigilator role</Typography>;
                                }
                                const match = roleOptions.find((o) => o.value === selected);
                                return match?.label || selected;
                              }}
                              sx={{
                                height: 40,
                                "& .MuiSelect-select": { p: 0, display: "flex", alignItems: "center" },
                                "& .MuiSelect-icon": { color: "action.active" },
                              }}
                            >
                              {roleOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>
                                  {option.label}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          {assignment?.cancel && assignment.cancel_cause && (
                            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
                              Reason: {assignment.cancel_cause}
                            </Typography>
                          )}
                          {isCancelledConfirmed ? (
                            <Typography variant="caption" color="error.main">
                              This shift is cancelled and cannot be edited.
                            </Typography>
                          ) : !isSelected ? (
                            <Typography variant="caption" color="text.secondary">
                              Select the invigilator to edit assignment details.
                            </Typography>
                          ) : null}
                        </Stack>
                        {availabilityLabel && (
                          <Typography variant="body2" color="text.secondary">
                            {availabilityLabel}
                          </Typography>
                        )}
                      </Stack>
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </Stack>
        )}
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => updateDraft({ snackbar: { ...snackbar, open: false } })}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => updateDraft({ snackbar: { ...snackbar, open: false } })}
          severity="success"
          variant="filled"
          sx={{
            backgroundColor: "#d4edda",
            color: "#155724",
            border: "1px solid #155724",
            borderRadius: "50px",
            fontWeight: 500,
          }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
      {/** Helper to keep singular/plural tidy */}      
      <Stack direction="row" spacing={1} justifyContent="space-between">
        <PillButton
          variant="outlined"
          onClick={() => {
            if (examVenue) dispatch(resetAssignInvigilatorDraft(examVenue.examvenue_id));
          }}
          disabled={!examVenue || assignMutation.isPending}
          sx={{ border: "none" }}
        >
          Clear
        </PillButton>
        <PillButton
          variant="contained"
          onClick={() => assignMutation.mutate()}
          disabled={!canUpdate || assignMutation.isPending}
        >
          {assignMutation.isPending
            ? "Updating..."
            : selectionDelta.toAdd.length && selectionDelta.toRemove.length
              ? "Update assignments"
              : selectionDelta.toAdd.length
                ? `Assign ${selectionDelta.toAdd.length} ${pluralize(selectionDelta.toAdd.length, "invigilator")}`
                : selectionDelta.toRemove.length
                  ? `Unassign ${selectionDelta.toRemove.length} ${pluralize(selectionDelta.toRemove.length, "invigilator")}`
                  : "Update assignments"}
        </PillButton>
      </Stack>
    </Stack>
  );
};
