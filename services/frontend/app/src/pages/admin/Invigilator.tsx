import React, { useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  Grid,
  Button,
  Tooltip,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
  Fab,
  Snackbar,
  Select,
  MenuItem,
} from "@mui/material";
import { GridView, CalendarViewMonth, Edit, Delete as DeleteIcon } from "@mui/icons-material";
import dayjs, { Dayjs } from "dayjs";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ContractedHoursReport } from "../../components/admin/ContractedHoursReport";
import { CollapsibleSection } from "../../components/CollapsibleSection";
import { BooleanCheckboxRow } from "../../components/BooleanCheckboxRow";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { StaticDatePicker } from "@mui/x-date-pickers/StaticDatePicker";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { formatDateWithWeekday } from "../../utils/dates";
import { EditInvigilatorDialog } from "../../components/admin/EditInvigilatorDialog";
import { DeleteConfirmationDialog } from "../../components/admin/DeleteConfirmationDialog";
import { PillButton } from "../../components/PillButton";
import { Panel } from "../../components/Panel";
import { resetInvigilatorProfileUi, setInvigilatorProfileUi, useAppDispatch, useAppSelector } from "../../state/store";
import { sharedInputSx } from "../../components/sharedInputSx";

const formatDietLabel = (diet: Diet | { code: string; label?: string }) => {
  return (
    (typeof (diet as Diet).name === "string" && (diet as Diet).name?.trim()) ||
    (diet as any).label ||
    diet.code ||
    ""
  );
};

const allQualifications: Record<string, string> = {
  SENIOR_INVIGILATOR: "Senior Invigilator",
  AKT_TRAINED: "AKT Trained",
  CHECK_IN: "Check-In",
  DETACHED_DUTY: "Detached Duty",
};

interface InvigilatorAvailability {
  date: string;
  slot: string;
  available: boolean;
}

interface InvigilatorRestriction {
  diet: string;
  restrictions: string[];
  notes?: string;
}

interface InvigilatorQualification {
  qualification: string;
}

interface Diet {
  id: number;
  code: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}

interface InvigilatorData {
  id: number;
  user_id?: number | null;
  user_is_staff?: boolean;
  user_is_superuser?: boolean;
  user_is_senior_admin?: boolean;
  preferred_name: string | null;
  full_name: string;
  mobile: string | null;
  mobile_text_only: string | null;
  alt_phone: string | null;
  university_email: string | null;
  personal_email: string | null;
  notes: string | null;
  resigned: boolean;
  diet_contracts?: { diet: string; contracted_hours: number }[];
  qualifications: InvigilatorQualification[];
  restrictions: InvigilatorRestriction[];
  availabilities: InvigilatorAvailability[];
  assignments?: InvigilatorAssignment[];
}

interface InvigilatorAssignment {
  assigned_start: string;
  assigned_end: string;
  break_time_minutes: number;
  cancel?: boolean;
}

const slotLabelMap: Record<string, string> = {
  MORNING: "Morning",
  EVENING: "Evening",
};
const allowedSlots = new Set(Object.keys(slotLabelMap));

export const AdminInvigilatorProfile: React.FC = () => {
  const dispatch = useAppDispatch();
  const invigilatorProfileUi = useAppSelector((state) => state.adminTables.invigilatorProfileUi);
  const {
    availabilityView,
    availabilityLimit,
    selectedAvailabilityDate,
    editDialogOpen,
    deleteOpen,
    deleting,
    successMessage,
    successOpen,
    selectedContractDiet,
    selectedAvailabilityDiet,
    promoteOpen,
    promoteMode,
    promoting,
    promoteError,
    demoteOpen,
    demoting,
    demoteError,
    seniorDemoteOpen,
    seniorDemoting,
    seniorDemoteError,
  } = invigilatorProfileUi;
  const { id } = useParams();
  const navigate = useNavigate();
  const selectedAvailabilityDay = useMemo(
    () => (selectedAvailabilityDate ? dayjs(selectedAvailabilityDate) : dayjs()),
    [selectedAvailabilityDate]
  );

  useEffect(() => {
    dispatch(resetInvigilatorProfileUi());
    return () => {
      dispatch(resetInvigilatorProfileUi());
    };
  }, [dispatch, id]);

  const { data: currentUser, isSuccess: currentUserLoaded } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await apiFetch(`${apiBaseUrl}/auth/me/`);
      if (!res.ok) throw new Error("Unable to load profile");
      return res.json();
    },
  });

  const { data, isLoading, isError, error, refetch } = useQuery<InvigilatorData, Error>({
    queryKey: ["invigilator", id],
    queryFn: async () => {
      const response = await apiFetch(`${apiBaseUrl}/invigilators/${id}/`);
      if (!response.ok) throw new Error("Unable to load invigilator");
      return response.json();
    },
    enabled: Boolean(id),
  });

  const isSeniorAdmin = Boolean(currentUser?.is_senior_admin);
  const canSeniorDemote = isSeniorAdmin && Boolean(data?.user_is_senior_admin);

  const { data: diets = [] } = useQuery<Diet[]>({
    queryKey: ["diets"],
    queryFn: async () => {
      const res = await apiFetch(`${apiBaseUrl}/diets/`);
      if (!res.ok) throw new Error("Unable to load diets");
      return res.json();
    },
  });

  const restrictionsUnion = useMemo(() => {
    const set = new Set<string>();
    data?.restrictions?.forEach((r) => r.restrictions?.forEach((code) => set.add(code)));
    return set;
  }, [data]);

  const dietsFromData = useMemo(() => data?.restrictions?.map((r) => r.diet) || [], [data]);
  const dietsSelected = useMemo(() => new Set(dietsFromData.filter(Boolean)), [dietsFromData]);

  const dietOptions = useMemo(() => {
    const base = diets.map((d) => ({ code: d.code, label: formatDietLabel(d) }));
    const extras =
      dietsFromData
        .filter((code) => !base.some((d) => d.code === code))
        .map((code) => ({ code, label: formatDietLabel({ code }) })) || [];
    return [...base, ...extras];
  }, [diets, dietsFromData]);

  const contractedDietOptions = useMemo(() => {
    const base = diets.map((d) => ({
      code: d.code,
      label: formatDietLabel(d),
      is_active: d.is_active,
      start_date: d.start_date,
      end_date: d.end_date,
    }));
    const contractCodes = (data?.diet_contracts || []).map((entry) => entry.diet).filter(Boolean);
    const extras =
      contractCodes
        .filter((code) => !base.some((d) => d.code === code))
        .map((code) => ({ code, label: formatDietLabel({ code }), is_active: true })) || [];
    return [...base, ...extras];
  }, [data?.diet_contracts, diets]);

  const availabilityDietOptions = useMemo(() => {
    return diets.map((diet) => ({
      code: diet.code,
      label: formatDietLabel(diet),
      is_active: diet.is_active,
      start_date: diet.start_date,
      end_date: diet.end_date,
    }));
  }, [diets]);

  const selectedContractMeta = useMemo(
    () => contractedDietOptions.find((diet) => diet.code === selectedContractDiet),
    [contractedDietOptions, selectedContractDiet]
  );
  const selectedAvailabilityMeta = useMemo(
    () => availabilityDietOptions.find((diet) => diet.code === selectedAvailabilityDiet),
    [availabilityDietOptions, selectedAvailabilityDiet]
  );
  useEffect(() => {
    const savedContractDiet = window.localStorage.getItem("adminInvigilatorContractDiet");
    if (savedContractDiet) {
      dispatch(setInvigilatorProfileUi({ selectedContractDiet: savedContractDiet }));
    }
    const savedAvailabilityDiet = window.localStorage.getItem("adminInvigilatorAvailabilityDiet");
    if (savedAvailabilityDiet) {
      dispatch(setInvigilatorProfileUi({ selectedAvailabilityDiet: savedAvailabilityDiet }));
    }
  }, [dispatch]);

  useEffect(() => {
    if (!contractedDietOptions.length) return;
    if (!selectedContractDiet || !contractedDietOptions.some((d) => d.code === selectedContractDiet)) {
      dispatch(setInvigilatorProfileUi({ selectedContractDiet: contractedDietOptions[0].code }));
    }
  }, [contractedDietOptions, dispatch, selectedContractDiet]);
  useEffect(() => {
    if (selectedContractDiet) {
      window.localStorage.setItem("adminInvigilatorContractDiet", selectedContractDiet);
    }
  }, [selectedContractDiet]);
  useEffect(() => {
    if (!availabilityDietOptions.length) return;
    if (!selectedAvailabilityDiet || !availabilityDietOptions.some((d) => d.code === selectedAvailabilityDiet)) {
      dispatch(setInvigilatorProfileUi({ selectedAvailabilityDiet: availabilityDietOptions[0].code }));
    }
  }, [availabilityDietOptions, dispatch, selectedAvailabilityDiet]);
  useEffect(() => {
    if (selectedAvailabilityDiet) {
      window.localStorage.setItem("adminInvigilatorAvailabilityDiet", selectedAvailabilityDiet);
    }
  }, [selectedAvailabilityDiet]);

  const groupedAvailability = (data?.availabilities || []).reduce<Record<string, InvigilatorAvailability[]>>((acc, slot) => {
    if (!allowedSlots.has(slot.slot)) return acc;
    if (!acc[slot.date]) acc[slot.date] = [];
    acc[slot.date].push(slot);
    return acc;
  }, {});

  const availabilityByDate = useMemo(() => {
    if (!selectedAvailabilityDiet) return groupedAvailability;
    const dietMeta = availabilityDietOptions.find((diet) => diet.code === selectedAvailabilityDiet);
    if (!dietMeta?.start_date || !dietMeta?.end_date) return groupedAvailability;
    const start = dayjs(dietMeta.start_date);
    const end = dayjs(dietMeta.end_date);
    const filtered: Record<string, InvigilatorAvailability[]> = {};
    Object.entries(groupedAvailability).forEach(([date, slots]) => {
      const day = dayjs(date);
      if (day.isBefore(start, "day") || day.isAfter(end, "day")) return;
      filtered[date] = slots;
    });
    return filtered;
  }, [availabilityDietOptions, groupedAvailability, selectedAvailabilityDiet]);

  const sortedAvailabilityEntries = useMemo(
    () =>
      Object.entries(availabilityByDate).sort(
        ([a], [b]) => new Date(a).getTime() - new Date(b).getTime()
      ),
    [availabilityByDate]
  );

  const assignmentMetrics = useMemo(() => {
    const assignments = data?.assignments || [];
    let totalHours = 0;
    let completedHours = 0;
    let assignedShiftCount = 0;
    let completedShiftCount = 0;
    assignments.forEach((assignment) => {
      const start = new Date(assignment.assigned_start).getTime();
      const end = new Date(assignment.assigned_end).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
      assignedShiftCount += 1;
      const durationMinutes = (end - start) / 60000 - (assignment.break_time_minutes || 0);
      const hours = Math.max(durationMinutes, 0) / 60;
      totalHours += hours;
      if (!assignment.cancel) {
        completedShiftCount += 1;
        completedHours += hours;
      }
    });
    return {
      totalHours,
      completedHours,
      assignedShiftCount,
      completedShiftCount,
    };
  }, [data]);

  const contractedHoursReport = useMemo(() => {
    if (!selectedContractDiet) return null;
    const dietEntry = (data?.diet_contracts || []).find((entry) => entry.diet === selectedContractDiet);
    const contracted = Number(dietEntry?.contracted_hours) || 0;

    const dietMeta = contractedDietOptions.find((d) => d.code === selectedContractDiet);
    const startDate = dietMeta?.start_date ? new Date(dietMeta.start_date) : null;
    const endDate = dietMeta?.end_date ? new Date(dietMeta.end_date) : null;

    let totalHours = 0;
    let completedHours = 0;
    let assignedShiftCount = 0;
    let completedShiftCount = 0;

    if (startDate && endDate) {
      const assignments = data?.assignments || [];
      assignments.forEach((assignment) => {
        const start = new Date(assignment.assigned_start);
        const end = new Date(assignment.assigned_end);
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return;
        const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        if (startOnly < startDate || startOnly > endDate) return;
        assignedShiftCount += 1;
        const durationMinutes = (end.getTime() - start.getTime()) / 60000 - (assignment.break_time_minutes || 0);
        const hours = Math.max(durationMinutes, 0) / 60;
        totalHours += hours;
        if (!assignment.cancel) {
          completedShiftCount += 1;
          completedHours += hours;
        }
      });
    }

    if (contracted === 0 && totalHours === 0 && assignedShiftCount === 0) return null;

    return {
      contracted_hours: contracted,
      total_hours: totalHours,
      completed_hours: completedHours,
      assigned_shift_count: assignedShiftCount,
      completed_shift_count: completedShiftCount,
      remaining_hours: contracted - totalHours,
    };
  }, [contractedDietOptions, data?.assignments, data?.diet_contracts, selectedContractDiet]);

  const canPromote = Boolean(data?.user_id) && !data?.user_is_superuser && isSeniorAdmin;
  const canDemote =
    Boolean(data?.user_id) &&
    (data?.user_is_staff || data?.user_is_superuser) &&
    !data?.user_is_senior_admin &&
    isSeniorAdmin;
  const canSeniorPromote =
    Boolean(data?.user_id) &&
    (data?.user_is_staff || data?.user_is_superuser) &&
    !data?.user_is_senior_admin &&
    isSeniorAdmin;

  const handleDelete = async () => {
    if (!id) return;
    try {
      dispatch(setInvigilatorProfileUi({ deleting: true }));
      const response = await apiFetch(`${apiBaseUrl}/invigilators/${id}/`, { method: "DELETE" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to delete invigilator");
      }
      dispatch(
        setInvigilatorProfileUi({
          successMessage: "Invigilator deleted successfully!",
          successOpen: true,
        })
      );
      setTimeout(() => navigate("/admin/invigilators"), 400);
    } catch (err: any) {
      alert(err?.message || "Delete failed");
    } finally {
      dispatch(setInvigilatorProfileUi({ deleting: false, deleteOpen: false }));
    }
  };

  const handlePromote = async () => {
    if (!id) return;
    try {
      dispatch(setInvigilatorProfileUi({ promoting: true, promoteError: null }));
      const response = await apiFetch(`${apiBaseUrl}/invigilators/${id}/make-admin/`, { method: "POST" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to promote invigilator to administrator.");
      }
      dispatch(
        setInvigilatorProfileUi({
          successMessage: "Invigilator promoted to administrator.",
          successOpen: true,
        })
      );
      await refetch();
    } catch (err: any) {
      dispatch(
        setInvigilatorProfileUi({
          promoteError: err?.message || "Failed to promote invigilator to administrator.",
        })
      );
    } finally {
      dispatch(setInvigilatorProfileUi({ promoting: false, promoteOpen: false }));
    }
  };

  const handleDemote = async () => {
    if (!id) return;
    try {
      dispatch(setInvigilatorProfileUi({ demoting: true, demoteError: null }));
      const response = await apiFetch(`${apiBaseUrl}/invigilators/${id}/remove-admin/`, { method: "POST" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to remove administrator privileges");
      }
      dispatch(
        setInvigilatorProfileUi({
          successMessage: "Administrator privileges removed.",
          successOpen: true,
        })
      );
      await refetch();
    } catch (err: any) {
      dispatch(
        setInvigilatorProfileUi({
          demoteError: err?.message || "Failed to remove administrator privileges.",
        })
      );
    } finally {
      dispatch(setInvigilatorProfileUi({ demoting: false, demoteOpen: false }));
    }
  };

  const handleSeniorPromote = async () => {
    if (!id) return;
    try {
      dispatch(setInvigilatorProfileUi({ promoting: true, promoteError: null }));
      const response = await apiFetch(`${apiBaseUrl}/invigilators/${id}/make-senior-admin/`, { method: "POST" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to promote administrator to senior administrator.");
      }
      dispatch(
        setInvigilatorProfileUi({
          successMessage: "Administrator promoted to senior administrator.",
          successOpen: true,
        })
      );
      await refetch();
    } catch (err: any) {
      dispatch(
        setInvigilatorProfileUi({
          promoteError: err?.message || "Failed to promote administrator to senior administrator.",
        })
      );
    } finally {
      dispatch(setInvigilatorProfileUi({ promoting: false, promoteOpen: false }));
    }
  };

  const handleSeniorDemote = async () => {
    if (!id) return;
    try {
      dispatch(setInvigilatorProfileUi({ seniorDemoting: true, seniorDemoteError: null }));
      const response = await apiFetch(`${apiBaseUrl}/invigilators/${id}/remove-senior-admin/`, { method: "POST" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to remove senior administrator privileges.");
      }
      dispatch(
        setInvigilatorProfileUi({
          successMessage: "Senior administrator privileges removed.",
          successOpen: true,
        })
      );
      await refetch();
    } catch (err: any) {
      dispatch(
        setInvigilatorProfileUi({
          seniorDemoteError: err?.message || "Failed to remove senior administrator privileges.",
        })
      );
    } finally {
      dispatch(setInvigilatorProfileUi({ seniorDemoting: false, seniorDemoteOpen: false }));
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !data) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error">{error?.message || "Failed to load invigilator"}</Alert>
      </Box>
    );
  }

  return (
    <>
    <Box sx={{ p: { xs: 2, md: 4 }, minHeight: "100vh" }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={4}>
        <Tooltip title="Invigilator identity">
          <Box>
            <Typography variant="h4" fontWeight={700}>
              {data.preferred_name || data.full_name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {data.full_name} • {data.university_email || "No university email"}
            </Typography>
          </Box>
        </Tooltip>

        <Stack direction="row" spacing={2} alignItems="center">
          <Tooltip
            title={
              data.user_is_superuser
                ? canDemote
                  ? "Click to remove administrator access."
                  : "Senior administrators cannot be demoted."
                : canPromote
                  ? "Click to grant administrator access."
                  : "No user account available to promote."
            }
          >
            <span>
              <PillButton
                variant={data.user_is_superuser ? "contained" : "outlined"}
                color="primary"
                onClick={() => {
                  if (data.user_is_superuser) {
                    if (!canDemote) return;
                    dispatch(setInvigilatorProfileUi({ demoteOpen: true }));
                    return;
                  }
                  if (!canPromote) return;
                  dispatch(setInvigilatorProfileUi({ promoteMode: "admin", promoteOpen: true }));
                }}
                disabled={promoting || demoting || data.user_is_senior_admin}
                aria-disabled={data.user_is_superuser ? !canDemote || data.user_is_senior_admin : !canPromote}
                sx={!currentUserLoaded || !isSeniorAdmin ? { display: "none" } : undefined}
              >
                Administrator
              </PillButton>
            </span>
          </Tooltip>
          {isSeniorAdmin && data.user_is_superuser && (
            <Tooltip
              title={
                data.user_is_senior_admin
                  ? "Toggle off to remove senior administrator access."
                  : canSeniorPromote
                    ? "Toggle on to grant senior administrator access."
                    : "Only administrators can be made senior."
              }
            >
              <span>
                <FormControlLabel
                  label="Senior"
                  sx={{ ml: 0 }}
                  control={
                    <Switch
                      checked={Boolean(data.user_is_senior_admin)}
                      onChange={(_, checked) => {
                        if (checked) {
                          if (!canSeniorPromote || promoting) return;
                          dispatch(setInvigilatorProfileUi({ promoteMode: "senior", promoteOpen: true }));
                          return;
                        }
                        if (!canSeniorDemote || seniorDemoting) return;
                        dispatch(setInvigilatorProfileUi({ seniorDemoteOpen: true }));
                      }}
                      disabled={data.user_is_senior_admin ? seniorDemoting : (!canSeniorPromote || promoting)}
                      color="primary"
                    />
                  }
                />
              </span>
            </Tooltip>
          )}
          <ToggleButtonGroup
            value={availabilityView}
            exclusive
            color="primary"
            onChange={(_, v) => v && dispatch(setInvigilatorProfileUi({ availabilityView: v }))}
          >
            <ToggleButton value="list">
              <GridView />
            </ToggleButton>
            <ToggleButton value="calendar">
              <CalendarViewMonth />
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>
      </Stack>
      {promoteError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {promoteError}
        </Alert>
      )}
      {demoteError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {demoteError}
        </Alert>
      )}
      {seniorDemoteError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {seniorDemoteError}
        </Alert>
      )}

      {/* Container for left and right columns */}
      <Box sx={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {/* Left Column - Contact, Qualifications, Diet, Restrictions */}
        <Box sx={{ flex: "0 0 450px" }}>
          <Panel sx={{ p: 4, height: "fit-content", mb: 3 }}>
            <Stack spacing={5}>
              {/* Contact Details */}
              <Box>
                <Typography variant="h6" fontWeight={700} mb={3}>
                  Contact Details
                </Typography>
                <Stack spacing={2}>
                  <Tooltip title="Primary mobile number for urgent contact">
                    <Box>
                      <Typography variant="body2" color="text.secondary">Mobile</Typography>
                      {data.mobile ? (
                        <Typography
                          variant="body1"
                          component="a"
                          href={`tel:${data.mobile}`}
                          sx={{ textDecoration: "none", color: "primary.main" }}
                        >
                          {data.mobile}
                        </Typography>
                      ) : (
                        <Typography variant="body1">—</Typography>
                      )}
                    </Box>
                  </Tooltip>
                  {data.mobile_text_only && (
                    <Tooltip title="Text-only mobile number">
                      <Box>
                        <Typography variant="body2" color="text.secondary">Mobile (Text Only)</Typography>
                        <Typography
                          variant="body1"
                          component="a"
                          href={`sms:${data.mobile_text_only}`}
                          sx={{ textDecoration: "none", color: "primary.main" }}
                        >
                          {data.mobile_text_only}
                        </Typography>
                      </Box>
                    </Tooltip>
                  )}
                  {data.alt_phone && (
                    <Tooltip title="Alternative phone number">
                      <Box>
                        <Typography variant="body2" color="text.secondary">Alternative Phone</Typography>
                        <Typography
                          variant="body1"
                          component="a"
                          href={`tel:${data.alt_phone}`}
                          sx={{ textDecoration: "none", color: "primary.main" }}
                        >
                          {data.alt_phone}
                        </Typography>
                      </Box>
                    </Tooltip>
                  )}
                  <Tooltip title="Preferred university email">
                    <Box>
                      <Typography variant="body2" color="text.secondary">University Email</Typography>
                      {data.university_email ? (
                        <Typography
                          variant="body1"
                          component="a"
                          href={`mailto:${data.university_email}`}
                          sx={{ textDecoration: "none", color: "primary.main" }}
                        >
                          {data.university_email}
                        </Typography>
                      ) : (
                        <Typography variant="body1">—</Typography>
                      )}
                    </Box>
                  </Tooltip>
                  {data.personal_email && (
                    <Tooltip title="Personal email on file">
                      <Box>
                        <Typography variant="body2" color="text.secondary">Personal Email</Typography>
                        <Typography
                          variant="body1"
                          component="a"
                          href={`mailto:${data.personal_email}`}
                          sx={{ textDecoration: "none", color: "primary.main" }}
                        >
                          {data.personal_email}
                        </Typography>
                      </Box>
                    </Tooltip>
                  )}
                </Stack>
              </Box>

              <Divider />

              {/* Qualifications */}
              <Box>
                <Typography variant="h6" fontWeight={700} mb={3}>
                  Qualifications
                </Typography>
                <Stack direction="row" flexWrap="wrap" sx={{ columnGap: 1, rowGap: 1.5 }}>
                  {Object.entries(allQualifications).map(([key, label]) => {
                    const hasQual = data.qualifications?.some((q) => q.qualification === key);
                    return (
                      <Tooltip key={key} title={hasQual ? `${label}: Qualified` : `${label}: Not qualified`}>
                        <Chip
                          label={label}
                          color={hasQual ? "primary" : "default"}
                          variant={hasQual ? "filled" : "outlined"}
                          size="medium"
                        />
                      </Tooltip>
                    );
                  })}
                </Stack>
              </Box>

              <Divider />

              {/* Restrictions & Requirements */}
              <Box>
                <Typography variant="h6" fontWeight={700} mb={3}>
                  Restrictions & Requirements
                </Typography>

                <Stack spacing={4}>
                  {/* Exam Diets */}
                  <CollapsibleSection title="Exam Diets" defaultExpanded={false}>
                    <Stack direction="row" flexWrap="wrap" sx={{ columnGap: 1, rowGap: 1.5 }}>
                      {dietOptions.map((d) => {
                        const hasDiet = dietsSelected.has(d.code);
                        return (
                          <Tooltip key={d.code} title={hasDiet ? `Contracted for ${d.label}` : `Not contracted for ${d.label}`}>
                            <Chip
                              label={d.label}
                              size="medium"
                              color={hasDiet ? "primary" : "default"}
                              variant={hasDiet ? "filled" : "outlined"}
                            />
                          </Tooltip>
                        );
                      })}
                    </Stack>
                  </CollapsibleSection>

                  {/* General Requirements */}
                  <CollapsibleSection title="General Requirements" defaultExpanded={false}>
                    <Stack spacing={1.8}>
                      <Tooltip
                        title={
                          restrictionsUnion.has("accessibility_required")
                            ? "Has accessibility needs"
                            : "No accessibility requirements"
                        }
                      >
                        <Box>
                          <BooleanCheckboxRow
                            label="Accessibility Requirements"
                            value={restrictionsUnion.has("accessibility_required")}
                            onChange={() => {}}
                            yesLabel="Has accessibility needs"
                            noLabel="No accessibility requirements"
                          />
                        </Box>
                      </Tooltip>
                      <Tooltip
                        title={
                          restrictionsUnion.has("separate_room_only")
                            ? "Must be in separate room"
                            : "Can be in regular exam room"
                        }
                      >
                        <Box>
                          <BooleanCheckboxRow
                            label="Separate Room Only"
                            value={restrictionsUnion.has("separate_room_only")}
                            onChange={() => {}}
                            yesLabel="Must be in separate room"
                            noLabel="Can be in regular exam room"
                          />
                        </Box>
                      </Tooltip>
                      <Tooltip
                        title={
                          restrictionsUnion.has("purple_cluster")
                            ? "Can work in a Purple Cluster"
                            : "Cannot work in a Purple Cluster"
                        }
                      >
                        <Box>
                          <BooleanCheckboxRow
                            label="Purple Cluster"
                            value={restrictionsUnion.has("purple_cluster")}
                            onChange={() => {}}
                            yesLabel="Can work in a Purple Cluster"
                            noLabel="Cannot work in a Purple Cluster"
                          />
                        </Box>
                      </Tooltip>
                      <Tooltip
                        title={
                          restrictionsUnion.has("computer_cluster")
                            ? "Can work in a Computer Cluster"
                            : "Cannot work in a Computer Cluster"
                        }
                      >
                        <Box>
                          <BooleanCheckboxRow
                            label="Computer Cluster"
                            value={restrictionsUnion.has("computer_cluster")}
                            onChange={() => {}}
                            yesLabel="Can work in a Computer Cluster"
                            noLabel="Cannot work in a Computer Cluster"
                          />
                        </Box>
                      </Tooltip>
                    </Stack>
                  </CollapsibleSection>

                  {/* Locations & OSCE Sites */}
                  <CollapsibleSection title="Locations & OSCE Sites" defaultExpanded={false}>
                    <Stack spacing={1.8}>
                      <Tooltip
                        title={
                          restrictionsUnion.has("vet_school")
                            ? "Can work at the Vet School"
                            : "Cannot work at the Vet School"
                        }
                      >
                        <Box>
                          <BooleanCheckboxRow
                            label="Vet School"
                            value={restrictionsUnion.has("vet_school")}
                            onChange={() => {}}
                            yesLabel="Can work at the Vet School"
                            noLabel="Cannot work at the Vet School"
                          />
                        </Box>
                      </Tooltip>
                      <Tooltip
                        title={
                          restrictionsUnion.has("osce_golden_jubilee")
                            ? "Can work at the Golden Jubilee"
                            : "Cannot work at the Golden Jubilee"
                        }
                      >
                        <Box>
                          <BooleanCheckboxRow
                            label="Golden Jubilee"
                            value={restrictionsUnion.has("osce_golden_jubilee")}
                            onChange={() => {}}
                            yesLabel="Can work at the Golden Jubilee"
                            noLabel="Cannot work at the Golden Jubilee"
                          />
                        </Box>
                      </Tooltip>
                      <Tooltip
                        title={
                          restrictionsUnion.has("osce_wolfson")
                            ? "Can work at the Wolfson"
                            : "Cannot work at the Wolfson"
                        }
                      >
                        <Box>
                          <BooleanCheckboxRow
                            label="Wolfson"
                            value={restrictionsUnion.has("osce_wolfson")}
                            onChange={() => {}}
                            yesLabel="Can work at the Wolfson"
                            noLabel="Cannot work at the Wolfson"
                          />
                        </Box>
                      </Tooltip>
                      <Tooltip
                        title={
                          restrictionsUnion.has("osce_queen_elizabeth")
                            ? "Can work at the Queen Elizabeth"
                            : "Cannot work at the Queen Elizabeth"
                        }
                      >
                        <Box>
                          <BooleanCheckboxRow
                            label="Queen Elizabeth"
                            value={restrictionsUnion.has("osce_queen_elizabeth")}
                            onChange={() => {}}
                            yesLabel="Can work at the Queen Elizabeth"
                            noLabel="Cannot work at the Queen Elizabeth"
                          />
                        </Box>
                      </Tooltip>
                    </Stack>
                  </CollapsibleSection>

                  {/* Status */}
                  <CollapsibleSection title="Status" defaultExpanded={false}>
                    <Stack spacing={1.8}>
                      <Tooltip title={data.resigned ? "Has resigned" : "Active invigilator"}>
                        <Box>
                          <BooleanCheckboxRow
                            label="Resigned"
                            value={data.resigned || false}
                            onChange={() => {}}
                            yesLabel="Has resigned"
                            noLabel="Active invigilator"
                          />
                        </Box>
                      </Tooltip>
                      <Tooltip
                        title={
                          restrictionsUnion.has("approved_exemption") ? "Exemption approved" : "No exemption"
                        }
                      >
                        <Box>
                          <BooleanCheckboxRow
                            label="Approved Exemption"
                            value={restrictionsUnion.has("approved_exemption")}
                            onChange={() => {}}
                            yesLabel="Exemption approved"
                            noLabel="No exemption"
                          />
                        </Box>
                      </Tooltip>
                    </Stack>
                  </CollapsibleSection>
                </Stack>

                {/* Notes */}
                {(data.restrictions?.[0]?.notes || data.notes) && (
                  <Box mt={4}>
                    <Typography variant="body2">
                      <strong>Notes:</strong> {data.restrictions?.[0]?.notes || data.notes}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Stack>
          </Panel>
        </Box>

        {/* Right Column - Availability, Contract */}
        <Box sx={{ flex: 1, minWidth: 300 }}>
          {/* Availability */}
          {availabilityView === "list" ? (
            <Panel sx={{ p: 4 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} mb={3}>
                <Typography variant="h6" fontWeight={700}>
                  Availability
                </Typography>
                {availabilityDietOptions.length > 0 && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      size="medium"
                      label={selectedAvailabilityMeta?.is_active === false ? "Inactive" : "Active"}
                      sx={{
                        fontWeight: 600,
                        bgcolor: selectedAvailabilityMeta?.is_active === false ? "#f0f0f0ff" : "#e3f2fd",
                        color: selectedAvailabilityMeta?.is_active === false ? "text.primary" : "#1e3a8a",
                      }}
                    />
                    <Select
                      size="small"
                      value={selectedAvailabilityDiet || ""}
                      onChange={(e) => dispatch(setInvigilatorProfileUi({ selectedAvailabilityDiet: e.target.value }))}
                      sx={[sharedInputSx, { minWidth: 200 }]}
                    >
                      {availabilityDietOptions.map((diet) => (
                        <MenuItem key={diet.code} value={diet.code} sx={{ opacity: diet.is_active === false ? 0.55 : 1 }}>
                          {diet.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </Stack>
                )}
              </Stack>

              <Grid container spacing={3}>
                {sortedAvailabilityEntries.slice(0, availabilityLimit).map(([date, slots]) => (
                  <Grid item xs={12} key={date} sx={{ display: "flex", justifyContent: "center" }}>
                    <Panel sx={{ p: 3, bgcolor: "#f9f9f9", borderRadius: 2, mb: 0, width: { xs: "100%", sm: 350 } }}>
                      <Typography variant="subtitle1" fontWeight={600} mb={2} noWrap title={formatDateWithWeekday(date)}>
                        {formatDateWithWeekday(date)}
                      </Typography>
                      <Stack direction="row" spacing={1.5} flexWrap="wrap">
                        {slots.map((s, i) => (
                          <Tooltip key={i} title={s.available ? "Available for this slot" : "Unavailable for this slot"}>
                            <Chip
                              label={slotLabelMap[s.slot] || s.slot}
                              size="medium"
                              sx={{
                                borderRadius: 999,
                                border: "1.5px solid transparent",
                                boxSizing: "border-box",
                                minWidth: 120,
                                minHeight: 36,
                                bgcolor: s.available ? "success.main" : "#d4edda",
                                color: s.available ? "#fff" : "#155724",
                                fontWeight: 600,
                              }}
                            />
                          </Tooltip>
                        ))}
                      </Stack>
                    </Panel>
                  </Grid>
                ))}
              </Grid>
              {(sortedAvailabilityEntries.length > availabilityLimit || availabilityLimit > 4) && (
                <Box sx={{ mt: 2, display: "flex", gap: 1.5, justifyContent: "flex-end" }}>
                  <PillButton
                    variant="outlined"
                    onClick={() => dispatch(setInvigilatorProfileUi({ availabilityLimit: 4 }))}
                    disabled={availabilityLimit <= 4}
                  >
                    Show less
                  </PillButton>
                  <PillButton
                    variant="contained"
                    onClick={() =>
                      dispatch(
                        setInvigilatorProfileUi({
                          availabilityLimit: Math.min(availabilityLimit + 4, sortedAvailabilityEntries.length),
                        })
                      )
                    }
                    disabled={availabilityLimit >= sortedAvailabilityEntries.length}
                  >
                    {`Show ${Math.min(4, sortedAvailabilityEntries.length - availabilityLimit)} more`}
                  </PillButton>
                </Box>
              )}
            </Panel>
          ) : (
            <Panel sx={{ p: 4 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} mb={3}>
                <Typography variant="h6" fontWeight={700}>
                  Availability Calendar
                </Typography>
                {availabilityDietOptions.length > 0 && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip
                      size="medium"
                      label={selectedAvailabilityMeta?.is_active === false ? "Inactive" : "Active"}
                      sx={{
                        fontWeight: 600,
                        bgcolor: selectedAvailabilityMeta?.is_active === false ? "#f0f0f0ff" : "#e3f2fd",
                        color: selectedAvailabilityMeta?.is_active === false ? "text.primary" : "#1e3a8a",
                      }}
                    />
                    <Select
                      size="small"
                      value={selectedAvailabilityDiet || ""}
                      onChange={(e) => dispatch(setInvigilatorProfileUi({ selectedAvailabilityDiet: e.target.value }))}
                      sx={[sharedInputSx, { minWidth: 200 }]}
                    >
                      {availabilityDietOptions.map((diet) => (
                        <MenuItem key={diet.code} value={diet.code} sx={{ opacity: diet.is_active === false ? 0.55 : 1 }}>
                          {diet.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </Stack>
                )}
              </Stack>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <StaticDatePicker
                  displayStaticWrapperAs="desktop"
                  value={selectedAvailabilityDay}
                  onChange={(newValue) =>
                    dispatch(
                      setInvigilatorProfileUi({
                        selectedAvailabilityDate: (newValue ?? dayjs()).toISOString(),
                      })
                    )
                  }
                  slots={{
                    toolbar: () => null,
                  }}
                  slotProps={{
                    actionBar: { actions: [] },
                    day: (ownerState) => {
                      const dateStr = (ownerState.day as Dayjs).format("YYYY-MM-DD");
                      const hasAvailability = availabilityByDate[dateStr]?.some((a) => a.available);
                      return {
                        sx: hasAvailability
                          ? {
                              "&::after": {
                                content: '""',
                                position: "absolute",
                                bottom: 6,
                                right: 6,
                                width: 8,
                                height: 8,
                                bgcolor: "success.main",
                                borderRadius: "50%",
                                border: "2px solid white",
                              },
                            }
                          : {},
                      };
                    },
                  }}
                  views={["day"]}
                  showDaysOutsideCurrentMonth
                  sx={{
                    "& .MuiPickersDay-root": {
                      width: 38,
                      height: 38,
                      fontSize: "0.9rem",
                      margin: "3px",
                      borderRadius: "50%",
                      lineHeight: "38px",
                    },
                    "& .MuiDayCalendar-weekContainer": {
                      justifyContent: "center",
                    },
                    "& .MuiDayCalendar-monthContainer": {
                      overflow: "visible",
                    },
                    "& .MuiDayCalendar-slideTransition": {
                      minHeight: "320px",
                    },
                  }}
                />
              </LocalizationProvider>

              {selectedAvailabilityDay && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle1" fontWeight={600} mb={1}>
                    {formatDateWithWeekday(selectedAvailabilityDay)}
                  </Typography>
                  <Stack direction="row" spacing={1.5} flexWrap="wrap">
                    {(availabilityByDate[selectedAvailabilityDay.format("YYYY-MM-DD")] || []).map((slot, i) => (
                      <Chip
                        key={i}
                        label={slotLabelMap[slot.slot] || slot.slot}
                        size="medium"
                        sx={{
                          borderRadius: 999,
                          border: "1.5px solid transparent",
                          boxSizing: "border-box",
                          minWidth: 120,
                          minHeight: 36,
                          bgcolor: slot.available ? "success.main" : "#d4edda",
                          color: slot.available ? "#fff" : "#155724",
                          fontWeight: 600,
                        }}
                      />
                    ))}
                    {(availabilityByDate[selectedAvailabilityDay.format("YYYY-MM-DD")] || []).length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        No availability recorded for this date.
                      </Typography>
                    )}
                  </Stack>
                </Box>
              )}
            </Panel>
          )}

          {/* Contracted Hours */}
          <Box sx={{ mt: 4, mr: { xs: 0, md: 6 }, width: "100%" }}>
            <ContractedHoursReport
              report={contractedHoursReport}
              loading={false}
              error={null}
              invigName={data.preferred_name || data.full_name}
              diets={contractedDietOptions.map((diet) => ({
                code: diet.code,
                label: diet.label,
                is_active: diet.is_active,
              }))}
              selectedDiet={selectedContractDiet}
              onDietChange={(diet) => dispatch(setInvigilatorProfileUi({ selectedContractDiet: diet }))}
            />
          </Box>
        </Box>
      </Box>
    </Box>

      <Box
        sx={{
          position: "fixed",
          bottom: 32,
          right: 32,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          zIndex: 1000,
        }}
      >
        <Tooltip title="Edit invigilator">
          <Fab
            color="primary"
            aria-label="edit invigilator"
            onClick={() => dispatch(setInvigilatorProfileUi({ editDialogOpen: true }))}
          >
            <Edit />
          </Fab>
        </Tooltip>
        <Tooltip title="Delete invigilator">
          <Fab
            color="error"
            aria-label="delete invigilator"
            onClick={() => dispatch(setInvigilatorProfileUi({ deleteOpen: true }))}
          >
            <DeleteIcon />
          </Fab>
        </Tooltip>
      </Box>

      <EditInvigilatorDialog
        open={editDialogOpen}
        invigilatorId={data.id}
        onClose={() => dispatch(setInvigilatorProfileUi({ editDialogOpen: false }))}
        onSuccess={(name) => {
          dispatch(
            setInvigilatorProfileUi({
              successMessage: `${name} updated successfully!`,
              successOpen: true,
              editDialogOpen: false,
            })
          );
          refetch();
        }}
      />
      <DeleteConfirmationDialog
        open={deleteOpen}
        title="Delete invigilator account?"
        description="This will permanently delete this invigilator."
        confirmText="Delete"
        loading={deleting}
        onClose={() => {
          if (!deleting) dispatch(setInvigilatorProfileUi({ deleteOpen: false }));
        }}
        onConfirm={handleDelete}
      />
      <DeleteConfirmationDialog
        open={promoteOpen}
        title={promoteMode === "senior" ? "Grant senior administrator privileges?" : "Grant administrator privileges?"}
        description={
          promoteMode === "senior"
            ? "This gives this invigilator senior administrator privileges while keeping their existing login and account the same."
            : "This gives this invigilator full administrator privileges while keeping their existing login and account the same."
        }
        confirmText={promoteMode === "senior" ? "Promote" : "Promote"}
        destructive={false}
        loading={promoting}
        onClose={() => {
          if (!promoting) dispatch(setInvigilatorProfileUi({ promoteOpen: false }));
        }}
        onConfirm={promoteMode === "senior" ? handleSeniorPromote : handlePromote}
      />
      <DeleteConfirmationDialog
        open={demoteOpen}
        title="Remove administrator privileges?"
        description="This will remove this invigilator's administrator privileges while keeping their existing login and account the same."
        confirmText="Demote"
        loading={demoting}
        onClose={() => {
          if (!demoting) dispatch(setInvigilatorProfileUi({ demoteOpen: false }));
        }}
        onConfirm={handleDemote}
      />
      <DeleteConfirmationDialog
        open={seniorDemoteOpen}
        title="Remove senior administrator privileges?"
        description="This will remove senior administrator privileges while keeping this invigilator as an administrator."
        confirmText="Demote"
        loading={seniorDemoting}
        onClose={() => {
          if (!seniorDemoting) dispatch(setInvigilatorProfileUi({ seniorDemoteOpen: false }));
        }}
        onConfirm={handleSeniorDemote}
      />
      <Snackbar
        open={successOpen}
        autoHideDuration={3000}
        onClose={() => dispatch(setInvigilatorProfileUi({ successOpen: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => dispatch(setInvigilatorProfileUi({ successOpen: false }))}
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
          {successMessage}
        </Alert>
      </Snackbar>
    </>
  );
};
