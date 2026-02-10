import * as React from "react";
import { useEffect, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Stack,
  Chip,
  Stepper,
  Step,
  StepLabel,
  Box,
  IconButton,
  Tooltip,
  Alert,
  Typography,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CollapsibleSection } from "../../components/CollapsibleSection";
import { BooleanCheckboxRow } from "../../components/BooleanCheckboxRow";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { PillButton } from "../PillButton";
import { sharedInputSx } from "../sharedInputSx";
import {
  resetEditInvigilatorDraft,
  setEditInvigilatorDraft,
  useAppDispatch,
  useAppSelector,
} from "../../state/store";

const STEPS = ["Personal Details", "Qualifications", "Restrictions", "Availability"];

const QUALIFICATION_CHOICES = [
  { value: "SENIOR_INVIGILATOR", label: "Senior Invigilator", help: "Can lead an exam room and supervise assistants" },
  { value: "AKT_TRAINED", label: "AKT Trained", help: "Approved for AKT duties" },
  { value: "CHECK_IN", label: "Check-In", help: "Can support candidate check-in" },
  { value: "DETACHED_DUTY", label: "Detached Duty", help: "Eligible for detached duty assignments" },
];

const RESTRICTION_CHOICES = [
  { value: "accessibility_required", label: "Accessibility required", yes: "Has accessibility needs", no: "No accessibility needs" },
  { value: "separate_room_only", label: "Separate room only", yes: "Must be in a separate room", no: "Can work in main rooms" },
  { value: "purple_cluster", label: "Purple cluster", yes: "Can work in Purple Cluster", no: "Cannot work in Purple Cluster" },
  { value: "computer_cluster", label: "Computer cluster", yes: "Can work in computer clusters", no: "Cannot work in computer clusters" },
  { value: "vet_school", label: "Vet School", yes: "Can work at the Vet School", no: "Cannot work at the Vet School" },
  { value: "osce_golden_jubilee", label: "Golden Jubilee", yes: "Can work at Golden Jubilee", no: "Cannot work at Golden Jubilee" },
  { value: "osce_wolfson", label: "Wolfson", yes: "Can work at Wolfson", no: "Cannot work at Wolfson" },
  { value: "osce_queen_elizabeth", label: "Queen Elizabeth", yes: "Can work at Queen Elizabeth", no: "Cannot work at Queen Elizabeth" },
  { value: "approved_exemption", label: "Approved exemption", yes: "Has approved exemption", no: "No exemption" },
];

interface EditInvigilatorDialogProps {
  open: boolean;
  invigilatorId: number | null;
  onClose: () => void;
  onSuccess?: (name: string) => void;
}

interface InvigilatorRestriction {
  diet: string;
  restrictions: string[];
}

interface InvigilatorDietContract {
  diet: string;
}

interface InvigilatorQualification {
  qualification: string;
}

type Diet = {
  id: number;
  code: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
};

const formatDietLabel = (diet: Diet | { code: string; label?: string }) => {
  return (
    (typeof (diet as Diet).name === "string" && (diet as Diet).name?.trim()) ||
    (diet as any).label ||
    diet.code ||
    ""
  );
};

interface InvigilatorData {
  id: number;
  preferred_name: string | null;
  full_name: string;
  mobile: string | null;
  mobile_text_only: string | null;
  alt_phone: string | null;
  university_email: string | null;
  personal_email: string | null;
  notes: string | null;
  resigned: boolean;
  diet_contracts?: InvigilatorDietContract[];
  qualifications: InvigilatorQualification[];
  restrictions: InvigilatorRestriction[];
}

export const EditInvigilatorDialog: React.FC<EditInvigilatorDialogProps> = ({
  open,
  invigilatorId,
  onClose,
  onSuccess,
}) => {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const draft = useAppSelector((state) =>
    invigilatorId != null ? state.adminTables.invigilatorDialogs.edit[invigilatorId] : undefined
  );
  const activeStep = draft?.activeStep ?? 0;

  // Personal details
  const preferredName = draft?.preferredName ?? "";
  const fullName = draft?.fullName ?? "";
  const mobile = draft?.mobile ?? "";
  const mobileTextOnly = draft?.mobileTextOnly ?? "";
  const altPhone = draft?.altPhone ?? "";
  const universityEmail = draft?.universityEmail ?? "";
  const personalEmail = draft?.personalEmail ?? "";
  const dietContracts = draft?.dietContracts ?? {};
  const notes = draft?.notes ?? "";

  // Multi-step selections
  const qualifications = draft?.qualifications ?? [];
  const restrictions = draft?.restrictions ?? [];
  const resigned = draft?.resigned ?? false;
  const availabilityDiets = draft?.availabilityDiets ?? [];
  const toggleArrayValue = (current: string[], value: string) =>
    current.includes(value) ? current.filter((v) => v !== value) : [...current, value];

  const { data, isLoading, isError } = useQuery<InvigilatorData>({
    queryKey: ["invigilator", invigilatorId],
    queryFn: async () => {
      const response = await apiFetch(`${apiBaseUrl}/invigilators/${invigilatorId}/`);
      if (!response.ok) throw new Error("Unable to load invigilator");
      return response.json();
    },
    enabled: open && invigilatorId != null,
  });

  const { data: diets = [] } = useQuery<Diet[]>({
    queryKey: ["diets"],
    queryFn: async () => {
      const res = await apiFetch(`${apiBaseUrl}/diets/`);
      if (!res.ok) throw new Error("Unable to load diets");
      return res.json();
    },
  });

  const dietOptions = useMemo(() => {
    const base = (diets || []).map((d) => ({
      code: d.code,
      label: formatDietLabel(d),
      is_active: d.is_active,
    }));
    const extras =
      data?.restrictions
        ?.map((r) => ({ code: r.diet, label: r.diet.replace(/_/g, " "), is_active: true }))
        .filter((r) => !base.some((b) => b.code === r.code)) || [];
    return [...base, ...extras];
  }, [data?.restrictions, diets]);

  useEffect(() => {
    if (!data) return;
    if (invigilatorId == null || draft?.initialized) return;
    const initialDietContracts =
      data.diet_contracts?.reduce<Record<string, string>>((acc, entry) => {
        acc[entry.diet] = String(entry.contracted_hours ?? "");
        return acc;
      }, {}) || {};
    dispatch(setEditInvigilatorDraft({
      invigilatorId,
      draft: {
        preferredName: data.preferred_name || "",
        fullName: data.full_name || "",
        mobile: data.mobile || "",
        mobileTextOnly: data.mobile_text_only || "",
        altPhone: data.alt_phone || "",
        universityEmail: data.university_email || "",
        personalEmail: data.personal_email || "",
        dietContracts: initialDietContracts,
        notes: data.notes || "",
        resigned: Boolean(data.resigned),
        qualifications: data.qualifications?.map((q) => q.qualification) || [],
        restrictions: data.restrictions?.flatMap((r) => r.restrictions || []) || [],
        availabilityDiets: data.restrictions?.map((r) => r.diet) || [],
        activeStep: 0,
        initialized: true,
      },
    }));
  }, [data, dispatch, draft?.initialized, invigilatorId]);

  useEffect(() => {
    if (invigilatorId == null) return;
    if (open) return;
  }, [dispatch, invigilatorId, open]);

  const handleClose = () => {
    onClose();
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const diet_contracts = Object.entries(dietContracts || {})
        .map(([diet, value]) => ({ diet, contracted_hours: Number(value) }))
        .filter((entry) => Number.isFinite(entry.contracted_hours));

      const response = await apiFetch(`${apiBaseUrl}/invigilators/${invigilatorId}/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferred_name: preferredName,
          full_name: fullName,
          mobile,
          mobile_text_only: mobileTextOnly,
          alt_phone: altPhone,
          university_email: universityEmail,
          personal_email: personalEmail,
          diet_contracts,
          notes,
          resigned,
          qualifications: qualifications.map((q) => ({ qualification: q })),
          restrictions: availabilityDiets.map((diet) => ({
            diet,
            restrictions,
            notes: "",
          })),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text);
      }

      return response.json();
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["invigilator", invigilatorId] });
      queryClient.invalidateQueries({ queryKey: ["invigilators"] });
      onSuccess?.(updated.preferred_name || updated.full_name || "Invigilator");
      if (invigilatorId != null) {
        dispatch(resetEditInvigilatorDraft(invigilatorId));
      }
      onClose();
    },
    onError: (err: any) => {
      alert(`Failed to update invigilator: ${err.message}`);
    },
  });

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Stack spacing={2.5}>
            <TextField
              label="Preferred Name"
              value={preferredName}
              onChange={e => {
                if (invigilatorId == null) return;
                dispatch(setEditInvigilatorDraft({ invigilatorId, draft: { preferredName: e.target.value } }));
              }}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Full Name"
              value={fullName}
              onChange={e => {
                if (invigilatorId == null) return;
                dispatch(setEditInvigilatorDraft({ invigilatorId, draft: { fullName: e.target.value } }));
              }}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Mobile"
              value={mobile}
              onChange={e => {
                if (invigilatorId == null) return;
                dispatch(setEditInvigilatorDraft({ invigilatorId, draft: { mobile: e.target.value } }));
              }}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Mobile Text Only"
              value={mobileTextOnly}
              onChange={e => {
                if (invigilatorId == null) return;
                dispatch(setEditInvigilatorDraft({ invigilatorId, draft: { mobileTextOnly: e.target.value } }));
              }}
              fullWidth
              sx={sharedInputSx}
            />
            <TextField
              label="Alternative Phone"
              value={altPhone}
              onChange={e => {
                if (invigilatorId == null) return;
                dispatch(setEditInvigilatorDraft({ invigilatorId, draft: { altPhone: e.target.value } }));
              }}
              fullWidth
              sx={sharedInputSx}
            />
            <TextField
              label="University Email"
              value={universityEmail}
              onChange={e => {
                if (invigilatorId == null) return;
                dispatch(setEditInvigilatorDraft({ invigilatorId, draft: { universityEmail: e.target.value } }));
              }}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Personal Email"
              value={personalEmail}
              onChange={e => {
                if (invigilatorId == null) return;
                dispatch(setEditInvigilatorDraft({ invigilatorId, draft: { personalEmail: e.target.value } }));
              }}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Notes"
              value={notes}
              onChange={e => {
                if (invigilatorId == null) return;
                dispatch(setEditInvigilatorDraft({ invigilatorId, draft: { notes: e.target.value } }));
              }}
              fullWidth
              multiline
              rows={3}
              sx={[sharedInputSx, { height: "auto", "& .MuiInputBase-root": { minHeight: 96 }, "& .MuiInputBase-input": { py: 1 } }]}
            />
            <BooleanCheckboxRow
              label="Resigned"
              value={resigned}
              onChange={(value) => {
                if (invigilatorId == null) return;
                dispatch(setEditInvigilatorDraft({ invigilatorId, draft: { resigned: value } }));
              }}
              yesLabel="Has resigned"
              noLabel="Active invigilator"
            />
          </Stack>
        );

      case 1:
        return (
          <CollapsibleSection title="Qualifications" defaultExpanded>
            {QUALIFICATION_CHOICES.map(q => (
              <Tooltip key={q.value} title={q.help || q.label}>
                <Box>
                  <BooleanCheckboxRow
                    label={q.label}
                    value={qualifications.includes(q.value)}
                    onChange={() => {
                      if (invigilatorId == null) return;
                      dispatch(setEditInvigilatorDraft({
                        invigilatorId,
                        draft: { qualifications: toggleArrayValue(qualifications, q.value) },
                      }));
                    }}
                  />
                </Box>
              </Tooltip>
            ))}
          </CollapsibleSection>
        );

      case 2:
        return (
          <Stack spacing={2}>
            {/* General Requirements */}
            <CollapsibleSection title="General Requirements" defaultExpanded>
              {["accessibility_required", "separate_room_only", "purple_cluster", "computer_cluster"].map(r => {
                const choice = RESTRICTION_CHOICES.find(c => c.value === r);
                if (!choice) return null;
                return (
                  <Tooltip key={choice.value} title={restrictions.includes(choice.value) ? choice.yes || choice.label : choice.no || choice.label}>
                    <Box>
                      <BooleanCheckboxRow
                        label={choice.label}
                        value={restrictions.includes(choice.value)}
                        onChange={() => {
                          if (invigilatorId == null) return;
                          dispatch(setEditInvigilatorDraft({
                            invigilatorId,
                            draft: { restrictions: toggleArrayValue(restrictions, choice.value) },
                          }));
                        }}
                        yesLabel={choice.yes}
                        noLabel={choice.no}
                      />
                    </Box>
                  </Tooltip>
                );
              })}
            </CollapsibleSection>

            {/* Locations & OSCE Sites */}
            <CollapsibleSection title="Locations & OSCE Sites" defaultExpanded={false}>
              {["vet_school", "osce_golden_jubilee", "osce_wolfson", "osce_queen_elizabeth"].map(r => {
                const choice = RESTRICTION_CHOICES.find(c => c.value === r);
                if (!choice) return null;
                return (
                  <Tooltip key={choice.value} title={restrictions.includes(choice.value) ? choice.yes || choice.label : choice.no || choice.label}>
                    <Box>
                      <BooleanCheckboxRow
                        label={choice.label}
                        value={restrictions.includes(choice.value)}
                        onChange={() => {
                          if (invigilatorId == null) return;
                          dispatch(setEditInvigilatorDraft({
                            invigilatorId,
                            draft: { restrictions: toggleArrayValue(restrictions, choice.value) },
                          }));
                        }}
                        yesLabel={choice.yes}
                        noLabel={choice.no}
                      />
                    </Box>
                  </Tooltip>
                );
              })}
            </CollapsibleSection>

            {/* Status / Exemptions */}
            <CollapsibleSection title="Status / Exemptions" defaultExpanded={false}>
              {["approved_exemption"].map(r => {
                const choice = RESTRICTION_CHOICES.find(c => c.value === r);
                if (!choice) return null;
                return (
                  <Tooltip key={choice.value} title={restrictions.includes(choice.value) ? choice.yes || choice.label : choice.no || choice.label}>
                    <Box>
                      <BooleanCheckboxRow
                        label={choice.label}
                        value={restrictions.includes(choice.value)}
                        onChange={() => {
                          if (invigilatorId == null) return;
                          dispatch(setEditInvigilatorDraft({
                            invigilatorId,
                            draft: { restrictions: toggleArrayValue(restrictions, choice.value) },
                          }));
                        }}
                        yesLabel={choice.yes}
                        noLabel={choice.no}
                      />
                    </Box>
                  </Tooltip>
                );
              })}
            </CollapsibleSection>
          </Stack>
        );

      case 3:
        return (
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {dietOptions.map(diet => {
                const selected = availabilityDiets.includes(diet.code);
                return (
                  <Tooltip key={diet.code} title={selected ? `Remove ${diet.label}` : `Add ${diet.label}`}>
                    <Chip
                      label={diet.label}
                      clickable
                      color={selected ? "primary" : "default"}
                      variant={selected ? "filled" : "outlined"}
                      sx={{ opacity: diet.is_active ? 1 : 0.55 }}
                      onClick={() =>
                        invigilatorId == null
                          ? null
                          : dispatch(setEditInvigilatorDraft({
                              invigilatorId,
                              draft: {
                                availabilityDiets: toggleArrayValue(availabilityDiets, diet.code),
                                dietContracts: selected
                                  ? dietContracts
                                  : { ...dietContracts, [diet.code]: dietContracts?.[diet.code] || "100" },
                              },
                            }))
                      }
                    />
                  </Tooltip>
                );
              })}
              {dietOptions.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No diets available. Add diets first from the admin dashboard.
                </Typography>
              )}
            </Stack>
            <Stack spacing={4}>
              <Typography variant="subtitle2">Contracted hours by diet</Typography>
              {availabilityDiets.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Select at least one diet to set contracted hours.
                </Typography>
              )}
              {availabilityDiets.map((dietCode) => {
                const diet = dietOptions.find((option) => option.code === dietCode);
                const label = diet ? diet.label : dietCode;
                const isActive = diet ? diet.is_active : true;
                return (
                  <TextField
                    key={dietCode}
                    label={label}
                    type="number"
                    value={dietContracts?.[dietCode] ?? ""}
                    onChange={(e) => {
                      if (invigilatorId == null) return;
                      dispatch(setEditInvigilatorDraft({
                        invigilatorId,
                        draft: { dietContracts: { ...dietContracts, [dietCode]: e.target.value } },
                      }));
                    }}
                    fullWidth
                    helperText={!isActive ? "Inactive diet" : "Active diet"}
                    sx={[sharedInputSx, { opacity: isActive ? 1 : 0.55 }]}
                  />
                );
              })}
            </Stack>
          </Stack>
        );

      default:
        return null;
    }
  };

  const mandatoryFieldsFilled =
    preferredName && fullName && mobile && universityEmail && personalEmail;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Edit Invigilator
        <IconButton onClick={handleClose} sx={{ position: "absolute", right: 8, top: 8 }}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {isLoading && (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress />
          </Stack>
        )}

        {isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Failed to load invigilator details.
          </Alert>
        )}

        {!isLoading && !isError && (
          <>
            <Stepper activeStep={activeStep} alternativeLabel>
              {STEPS.map(step => (
                <Step key={step}>
                  <StepLabel>{step}</StepLabel>
                </Step>
              ))}
            </Stepper>

            <Box mt={3}>{renderStepContent()}</Box>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <PillButton
          variant="outlined"
          onClick={() => {
            if (invigilatorId != null) {
              dispatch(resetEditInvigilatorDraft(invigilatorId));
            }
          }}
          disabled={updateMutation.isPending || invigilatorId == null}
          sx={{ border: "none" }}
        >
          Clear
        </PillButton>
        {activeStep > 0 && (
          <PillButton
            onClick={() => {
              if (invigilatorId == null) return;
              dispatch(setEditInvigilatorDraft({ invigilatorId, draft: { activeStep: activeStep - 1 } }));
            }}
          >
            Back
          </PillButton>
        )}
        {activeStep < STEPS.length - 1 ? (
          <PillButton
            variant="contained"
            onClick={() => {
              if (invigilatorId == null) return;
              dispatch(setEditInvigilatorDraft({ invigilatorId, draft: { activeStep: activeStep + 1 } }));
            }}
            disabled={activeStep === 0 && !mandatoryFieldsFilled}
          >
            Next
          </PillButton>
        ) : (
          <PillButton
            variant="contained"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || !mandatoryFieldsFilled}
          >
            {updateMutation.isPending ? <CircularProgress size={22} /> : "Save"}
          </PillButton>
        )}
      </DialogActions>
    </Dialog>
  );
};
