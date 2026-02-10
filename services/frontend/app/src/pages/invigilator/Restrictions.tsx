import React, { useEffect, useMemo, useRef } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Grid,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { FreeCancellation } from "@mui/icons-material";
import dayjs from "dayjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "../../components/Panel";
import { PillButton } from "../../components/PillButton";
import { sharedInputSx } from "../../components/sharedInputSx";
import { setInvigilatorRestrictionsUi, useAppDispatch, useAppSelector } from "../../state/store";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { formatDate, formatDateWithWeekday } from "../../utils/dates";

type SlotCode = "MORNING" | "EVENING";

type AvailabilityEntry = {
  date: string;
  slot: SlotCode;
  available: boolean;
};

type AvailabilityResponse = {
  diet: string;
  diet_name?: string | null;
  start_date: string | null;
  end_date: string | null;
  restriction_cutoff?: string | null;
  diets: {
    code: string;
    name?: string;
    start_date: string;
    end_date: string;
    restriction_cutoff?: string | null;
    is_active?: boolean;
  }[];
  days: {
    date: string;
    slots: { slot: SlotCode; available: boolean }[];
  }[];
  availabilities?: AvailabilityEntry[];
};

const slotLabels: Record<SlotCode, string> = {
  MORNING: "Morning",
  EVENING: "Evening",
};

const slotOrder: SlotCode[] = ["MORNING", "EVENING"];

export const InvigilatorRestrictions: React.FC = () => {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const { selectedDiet, queryDiet, days, snackbar } = useAppSelector(
    (state) => state.adminTables.invigilatorRestrictionsUi
  );
  const daysRef = useRef<AvailabilityResponse["days"]>([]);

  const availabilityQueryKey = ["invigilator-availability", queryDiet || "default"] as const;

  const availabilityQuery = useQuery<AvailabilityResponse>({
    queryKey: availabilityQueryKey,
    queryFn: async () => {
      const dietParam = queryDiet ? `?diet=${encodeURIComponent(queryDiet)}` : "";
      const res = await apiFetch(`${apiBaseUrl}/invigilator/availability/${dietParam}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to load restrictions");
      }
      const data = await res.json();
      return data as AvailabilityResponse;
    },
    staleTime: 0,
  });

  useEffect(() => {
    if (!availabilityQuery.data) return;
    if (!selectedDiet) {
      dispatch(setInvigilatorRestrictionsUi({ selectedDiet: availabilityQuery.data.diet }));
    }
    const built = buildDays(availabilityQuery.data);
    daysRef.current = built;
    dispatch(setInvigilatorRestrictionsUi({ days: built }));
  }, [availabilityQuery.data, selectedDiet, dispatch]);

  const buildDays = (data: AvailabilityResponse) => {
    const entries = data.availabilities || [];
    const byDate: Record<string, Record<SlotCode, boolean>> = {};
    const isKnownSlot = (slot: string): slot is SlotCode => slot === "MORNING" || slot === "EVENING";

    entries.forEach((e) => {
      if (!isKnownSlot(e.slot)) return;
      if (!byDate[e.date]) byDate[e.date] = {} as Record<SlotCode, boolean>;
      byDate[e.date][e.slot] = e.available;
    });

    // Prefer server-provided days if present
    if (data.days && data.days.length > 0) {
      return data.days.map((d) => ({
        ...d,
        slots: slotOrder.map((slot) => {
          const fromServer = d.slots.find((s) => s.slot === slot);
          const fallback = byDate[d.date]?.[slot];
          return { slot, available: fromServer ? fromServer.available : fallback ?? true };
        }),
      }));
    }

    // Build from date range if supplied
    if (data.start_date && data.end_date) {
      const start = dayjs(data.start_date);
      const end = dayjs(data.end_date);
      const rows: { date: string; slots: { slot: SlotCode; available: boolean }[] }[] = [];
      if (start.isValid() && end.isValid()) {
        let cursor = start.startOf("day");
        while (cursor.isSame(end, "day") || cursor.isBefore(end, "day")) {
          const key = cursor.format("YYYY-MM-DD");
          const slots = slotOrder.map((slot) => ({
            slot,
            available: byDate[key]?.[slot] ?? true,
          }));
          rows.push({ date: key, slots });
          cursor = cursor.add(1, "day");
        }
        return rows;
      }
    }

    // Fallback to whatever entries we have grouped by date
    return Object.entries(byDate)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([date, slotsMap]) => ({
        date,
        slots: slotOrder.map((slot) => ({ slot, available: slotsMap[slot] ?? true })),
      }));
  };

  const diets = useMemo(() => {
    return (availabilityQuery.data?.diets || [])
      .filter((d) => d.is_active !== false)
      .map((d) => ({
      code: d.code,
      label: d.name || d.code.replace(/_/g, " "),
      restriction_cutoff: d.restriction_cutoff,
      }));
  }, [availabilityQuery.data?.diets]);

  const toggleSlot = (date: string, slot: SlotCode) => {
    const nextDays = days.map((day) => {
      if (day.date !== date) return day;
      const nextSlots = day.slots.map((s) => (s.slot === slot ? { ...s, available: !s.available } : s));
      return { ...day, slots: nextSlots };
    });
    dispatch(setInvigilatorRestrictionsUi({ days: nextDays }));
    daysRef.current = nextDays;
  };

  const mutation = useMutation({
    mutationFn: async (payload: { diet: string; unavailable: { date: string; slot: SlotCode }[] }) => {
      const res = await apiFetch(`${apiBaseUrl}/invigilator/availability/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to submit restrictions");
      }
      return res.json();
    },
    onSuccess: (data: AvailabilityResponse & { unavailable_count?: number }) => {
      const built = buildDays(data);
      dispatch(
        setInvigilatorRestrictionsUi({
          days: built,
          snackbar: { open: true, message: "Restrictions updated!", severity: "success" },
        })
      );
      daysRef.current = built;
      queryClient.setQueryData(availabilityQueryKey, data);
    },
    onError: (_err: any) => {
      dispatch(
        setInvigilatorRestrictionsUi({
          snackbar: { open: true, message: "Failed to update restrictions", severity: "error" },
        })
      );
    },
  });

  const handleDietChange = (diet: string) => {
    dispatch(setInvigilatorRestrictionsUi({ selectedDiet: diet, queryDiet: diet }));
  };

  const startDate = availabilityQuery.data?.start_date;
  const endDate = availabilityQuery.data?.end_date;
  const selectedDietLabel =
    diets.find((d) => d.code === selectedDiet)?.label || availabilityQuery.data?.diet_name || selectedDiet || "";
  const selectedDietCutoff =
    diets.find((d) => d.code === selectedDiet)?.restriction_cutoff ||
    availabilityQuery.data?.restriction_cutoff ||
    null;
  const cutoffReached =
    selectedDietCutoff && dayjs().isSame(dayjs(selectedDietCutoff), "day")
      ? true
      : selectedDietCutoff
      ? dayjs().isAfter(dayjs(selectedDietCutoff), "day")
      : false;

  return (
    <Box sx={{ p: 3 }}>
      <Stack spacing={2.5}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} spacing={1.5}>
            <Stack spacing={0.5}>
              <Typography variant="h4" fontWeight={700}>
                Restrictions
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Deselect the slots you cannot work for the selected exam diet, then submit your restrictions.
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography variant="body2" color="text.secondary">
                Exam diet
              </Typography>
              <Select
                size="small"
                value={selectedDiet || ""}
                onChange={(e) => handleDietChange(e.target.value)}
                sx={[sharedInputSx, { minWidth: 200 }]}
              >
                {diets.map((d) => (
                  <MenuItem key={d.code} value={d.code}>
                    {d.label}
                  </MenuItem>
                ))}
              </Select>
              <PillButton
                variant="outlined"
                onClick={() => availabilityQuery.refetch()}
                disabled={availabilityQuery.isFetching}
                size="small"
              >
                Refresh
              </PillButton>
              <PillButton
                variant="contained"
                onClick={() => {
                  if (!selectedDiet) return;
                  const unavailable = days
                    .flatMap((day) =>
                      day.slots
                        .filter((s) => !s.available)
                        .map((s) => ({ date: day.date, slot: s.slot }))
                    );
                  mutation.mutate({ diet: selectedDiet, unavailable });
                }}
                disabled={cutoffReached || availabilityQuery.isPending || mutation.isPending || days.length === 0}
                size="small"
              >
                Submit restrictions
              </PillButton>
            </Stack>
          </Stack>

        <Panel
          disableDivider
          title={
            <Stack direction="row" spacing={1} alignItems="center">
              <FreeCancellation fontSize="small" />
              <Typography variant="subtitle1" fontWeight={700}>
                Update your restrictions
              </Typography>
            </Stack>
          }
          sx={{
            mb: 1,
            background: "linear-gradient(135deg, #f8fafc, #eef2ff)",
            borderColor: "#e0e7ff",
            boxShadow: "0 12px 35px rgba(79, 70, 229, 0.08)",
          }}
        >
          <Typography color="text.secondary" sx={{ mb: 1 }}>
            Find the dates and times you are unavailable to invigilate and deselect the corresponding slots.
          </Typography>
          {selectedDietCutoff && (
            <Alert severity={cutoffReached ? "warning" : "info"} sx={{ mt: 1 }}>
              {cutoffReached
                ? "Restrictions are closed for this diet. Please email admin to request changes."
                : `Restrictions remain open until ${formatDate(selectedDietCutoff)}.`}
            </Alert>
          )}
        </Panel>

        <Panel sx={{ p: 3 }}>
          <Stack spacing={2}>
            {availabilityQuery.isPending && (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress />
              </Box>
            )}

            {availabilityQuery.isError && (
              <Alert severity="error">
                {(availabilityQuery.error as Error)?.message || "Unable to load restrictions"}
              </Alert>
            )}

            {!availabilityQuery.isPending && !availabilityQuery.isError && days.length === 0 && (
              <Alert severity="info">No availability data found for this diet.</Alert>
            )}

            <Grid container spacing={1.5}>
              {days.map((day) => {
                const dateLabel = formatDateWithWeekday(day.date);
                return (
                  <Grid item xs={12} sm={6} md={4} key={day.date}>
                    <Panel
                      disableDivider
                      title={
                        <Typography variant="subtitle2" fontWeight={700}>
                          {dateLabel}
                        </Typography>
                      }
                      sx={{
                        height: "100%",
                        borderRadius: 3,
                        p: 2,
                      }}
                    >
                      <Stack spacing={1.25}>
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          {day.slots.map((slot) => {
                            const available = slot.available;
                            const label = slotLabels[slot.slot];
                            return (
                              <PillButton
                                key={slot.slot}
                                variant="contained"
                                color="success"
                                size="medium"
                                onClick={() => !cutoffReached && toggleSlot(day.date, slot.slot)}
                                disabled={cutoffReached}
                                sx={{
                                  borderRadius: 10,
                                  minWidth: 120,
                                  minHeight: 36,
                                  justifyContent: "center",
                                  border: "1.5px solid transparent",
                                  boxSizing: "border-box",
                                  backgroundColor: available ? "success.main" : "#d4edda",
                                  color: available ? "#fff" : "#155724",
                                  opacity: cutoffReached ? 0.6 : 1,
                                  boxShadow: "none",
                                  "&:hover": {
                                    backgroundColor: cutoffReached
                                      ? undefined
                                      : available
                                      ? "success.dark"
                                      : "#c6e9cf",
                                    color: available ? "#fff" : "#155724",
                                  },
                                }}
                              >
                                {label}
                              </PillButton>
                            );
                          })}
                        </Stack>
                      </Stack>
                    </Panel>
                  </Grid>
                );
              })}
            </Grid>
          </Stack>
        </Panel>
      </Stack>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() =>
          dispatch(setInvigilatorRestrictionsUi({ snackbar: { ...snackbar, open: false } }))
        }
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() =>
            dispatch(setInvigilatorRestrictionsUi({ snackbar: { ...snackbar, open: false } }))
          }
          severity={snackbar.severity}
          variant="filled"
          sx={
            snackbar.severity === "success"
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
    </Box>
  );
};

export default InvigilatorRestrictions;
