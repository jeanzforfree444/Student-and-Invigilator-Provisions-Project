import * as React from "react";
import { useEffect, useRef } from "react";
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
  InputAdornment,
  Divider,
  Typography,
} from "@mui/material";
import { Close, Visibility, VisibilityOff } from "@mui/icons-material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CollapsibleSection } from "../../components/CollapsibleSection";
import { BooleanCheckboxRow } from "../../components/BooleanCheckboxRow";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { PillButton } from "../PillButton";
import { sharedInputSx } from "../sharedInputSx";
import {
  resetAddInvigilatorDraft,
  setAddInvigilatorDraft,
  useAppDispatch,
  useAppSelector,
} from "../../state/store";

const STEPS = ["Personal Details", "Login Details", "Qualifications", "Restrictions", "Availability"];

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

interface AddInvigilatorDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (name: string) => void;
}

type Diet = {
  id: number;
  code: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
};

const formatDietLabel = (diet: Diet) => {
  return (diet.name && diet.name.trim()) || diet.code || "";
};

export const AddInvigilatorDialog: React.FC<AddInvigilatorDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const DEFAULT_TEMP_PASSWORD = "TempPass123!";
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const {
    activeStep,
    preferredName,
    fullName,
    loginUsername,
    tempPassword,
    showPassword,
    mobile,
    mobileTextOnly,
    altPhone,
    universityEmail,
    personalEmail,
    dietContracts,
    notes,
    qualifications,
    restrictions,
    resigned,
    availabilityDiets,
  } = useAppSelector((state) => state.adminTables.invigilatorDialogs.add);

  // Personal details
  const lastDerivedUsername = useRef("");

  // Multi-step selections
  const dietsQuery = useQuery<Diet[]>({
    queryKey: ["diets"],
    queryFn: async () => {
      const res = await apiFetch(`${apiBaseUrl}/diets/`);
      if (!res.ok) throw new Error("Unable to load diets");
      return res.json();
    },
  });
  const dietOptions = React.useMemo(() => dietsQuery.data || [], [dietsQuery.data]);

  const toggleArrayValue = (current: string[], value: string) =>
    current.includes(value) ? current.filter((v) => v !== value) : [...current, value];

  const handleClose = () => {
    onClose();
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const deriveUsernameFromEmail = (email: string) => {
        const trimmed = (email || "").trim();
        if (!trimmed) return "";
        const atIdx = trimmed.indexOf("@");
        return atIdx === -1 ? trimmed : trimmed.slice(0, atIdx);
      };
      const emailUsername = deriveUsernameFromEmail(universityEmail);
      const usernameToUse = (loginUsername || emailUsername || "").trim();
      const passwordToUse = (tempPassword || "").trim();
      if (!usernameToUse) {
        throw new Error("Username is required to create the invigilator login.");
      }
      if (!passwordToUse) {
        throw new Error("Temporary password cannot be empty.");
      }

      const diet_contracts = Object.entries(dietContracts || {})
        .map(([diet, value]) => ({ diet, contracted_hours: Number(value) }))
        .filter((entry) => Number.isFinite(entry.contracted_hours));

      const response = await apiFetch(`${apiBaseUrl}/invigilators/`, {
        method: "POST",
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
          user: {
            username: usernameToUse,
            email: universityEmail || personalEmail || undefined,
            password: passwordToUse,
          },

          qualifications: qualifications.map(q => ({ qualification: q })),

          restrictions: availabilityDiets.map(diet => ({
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

    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ["invigilators"] });
      onSuccess?.(data.preferred_name || data.full_name || "Invigilator");
      dispatch(resetAddInvigilatorDraft());
      onClose();
    },

    onError: (err: any) => {
      alert(`Failed to add invigilator: ${err.message}`);
    },
  });

  useEffect(() => {
    dispatch(setAddInvigilatorDraft({ tempPassword: DEFAULT_TEMP_PASSWORD }));
  }, [DEFAULT_TEMP_PASSWORD, dispatch]);

  useEffect(() => {
    if (!open) return;
  }, [dispatch, open]);

  useEffect(() => {
    // Autofill username from university email until the admin overrides it.
    const trimmed = (universityEmail || "").trim();
    if (!trimmed) {
      lastDerivedUsername.current = "";
      return;
    }
    const atIdx = trimmed.indexOf("@");
    const derived = atIdx === -1 ? trimmed : trimmed.slice(0, atIdx);
    const lastDerived = lastDerivedUsername.current;
    const shouldSync = !loginUsername || loginUsername === lastDerived;
    if (shouldSync && loginUsername !== derived) {
      dispatch(setAddInvigilatorDraft({ loginUsername: derived }));
    }
    lastDerivedUsername.current = derived;
  }, [dispatch, loginUsername, universityEmail]);

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Stack spacing={2.5}>
            <TextField
              label="Preferred Name"
              value={preferredName}
              onChange={e => dispatch(setAddInvigilatorDraft({ preferredName: e.target.value }))}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Full Name"
              value={fullName}
              onChange={e => dispatch(setAddInvigilatorDraft({ fullName: e.target.value }))}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Mobile"
              value={mobile}
              onChange={e => dispatch(setAddInvigilatorDraft({ mobile: e.target.value }))}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Mobile Text Only"
              value={mobileTextOnly}
              onChange={e => dispatch(setAddInvigilatorDraft({ mobileTextOnly: e.target.value }))}
              fullWidth
              sx={sharedInputSx}
            />
            <TextField
              label="Alternative Phone"
              value={altPhone}
              onChange={e => dispatch(setAddInvigilatorDraft({ altPhone: e.target.value }))}
              fullWidth
              sx={sharedInputSx}
            />
            <TextField
              label="University Email"
              value={universityEmail}
              onChange={e => dispatch(setAddInvigilatorDraft({ universityEmail: e.target.value }))}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Personal Email"
              value={personalEmail}
              onChange={e => dispatch(setAddInvigilatorDraft({ personalEmail: e.target.value }))}
              fullWidth
              required
              sx={sharedInputSx}
            />
            <TextField
              label="Notes"
              value={notes}
              onChange={e => dispatch(setAddInvigilatorDraft({ notes: e.target.value }))}
              fullWidth
              multiline
              rows={3}
              sx={[sharedInputSx, { height: "auto", "& .MuiInputBase-root": { minHeight: 96 }}]}
            />
            <BooleanCheckboxRow
              label="Resigned"
              value={resigned}
              onChange={(value) => dispatch(setAddInvigilatorDraft({ resigned: value }))}
              yesLabel="Has resigned"
              noLabel="Active invigilator"
            />
          </Stack>
        );

      case 1:
        return (
          <Stack spacing={5}>
            <TextField
              label="Username"
              value={loginUsername}
              onChange={e => dispatch(setAddInvigilatorDraft({ loginUsername: e.target.value }))}
              fullWidth
              required
              helperText="Auto-filled from University Email if left blank."
              sx={sharedInputSx}
            />
            <TextField
              label="Temporary Password"
              value={tempPassword}
              onChange={e => dispatch(setAddInvigilatorDraft({ tempPassword: e.target.value }))}
              fullWidth
              required
              helperText="Starter password which the invigilator can change after first login."
              type={showPassword ? "text" : "password"}
              sx={sharedInputSx}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => dispatch(setAddInvigilatorDraft({ showPassword: !showPassword }))}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Stack>
        );

      case 2:
        return (
          <CollapsibleSection title="Qualifications" defaultExpanded>
            {QUALIFICATION_CHOICES.map(q => (
              <Tooltip key={q.value} title={q.help || q.label}>
                <Box>
                  <BooleanCheckboxRow
                    label={q.label}
                    value={qualifications.includes(q.value)}
                    onChange={() =>
                      dispatch(setAddInvigilatorDraft({
                        qualifications: toggleArrayValue(qualifications, q.value),
                      }))
                    }
                  />
                </Box>
              </Tooltip>
            ))}
          </CollapsibleSection>
        );

      case 3:
        return (
          <Stack spacing={2.5}>
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
                        onChange={() =>
                          dispatch(setAddInvigilatorDraft({
                            restrictions: toggleArrayValue(restrictions, choice.value),
                          }))
                        }
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
                        onChange={() =>
                          dispatch(setAddInvigilatorDraft({
                            restrictions: toggleArrayValue(restrictions, choice.value),
                          }))
                        }
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
                        onChange={() =>
                          dispatch(setAddInvigilatorDraft({
                            restrictions: toggleArrayValue(restrictions, choice.value),
                          }))
                        }
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

      case 4:
        return (
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {dietOptions.map(diet => {
                const label = formatDietLabel(diet);
                const selected = availabilityDiets.includes(diet.code);
                return (
                  <Tooltip key={diet.code} title={selected ? `Remove ${label}` : `Add ${label}`}>
                    <Chip
                      label={label}
                      clickable
                      color={selected ? "primary" : "default"}
                      variant={selected ? "filled" : "outlined"}
                      sx={{ opacity: diet.is_active ? 1 : 0.55 }}
                      onClick={() =>
                        dispatch(setAddInvigilatorDraft({
                          availabilityDiets: toggleArrayValue(availabilityDiets, diet.code),
                          dietContracts: selected
                            ? dietContracts
                            : { ...dietContracts, [diet.code]: dietContracts?.[diet.code] || "100" },
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
                const label = diet ? formatDietLabel(diet) : dietCode;
                const isActive = diet ? diet.is_active : true;
                return (
                  <TextField
                    key={dietCode}
                    label={label}
                    type="number"
                    value={dietContracts?.[dietCode] ?? ""}
                    onChange={(e) =>
                      dispatch(setAddInvigilatorDraft({
                        dietContracts: { ...dietContracts, [dietCode]: e.target.value },
                      }))
                    }
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
    preferredName &&
    fullName &&
    mobile &&
    universityEmail &&
    personalEmail &&
    (loginUsername || universityEmail || personalEmail) &&
    tempPassword;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Add New Invigilator
        <IconButton onClick={handleClose} sx={{ position: "absolute", right: 8, top: 8 }}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ overflowY: "visible" }}>
        <Stepper activeStep={activeStep} alternativeLabel>
          {STEPS.map(step => (
            <Step key={step}>
              <StepLabel>{step}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Box mt={3}>{renderStepContent()}</Box>
      </DialogContent>

      <DialogActions>
        <PillButton
          variant="outlined"
          onClick={() => dispatch(resetAddInvigilatorDraft())}
          disabled={addMutation.isPending}
          sx={{ border: "none" }}
        >
          Clear
        </PillButton>
        {activeStep > 0 && (
          <PillButton onClick={() => dispatch(setAddInvigilatorDraft({ activeStep: activeStep - 1 }))}>
            Back
          </PillButton>
        )}
        {activeStep < STEPS.length - 1 ? (
          <PillButton
            variant="contained"
            onClick={() => dispatch(setAddInvigilatorDraft({ activeStep: activeStep + 1 }))}
            disabled={activeStep === 0 && !mandatoryFieldsFilled}
          >
            Next
          </PillButton>
        ) : (
          <PillButton
            variant="contained"
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending || !mandatoryFieldsFilled}
          >
            {addMutation.isPending ? <CircularProgress size={22} /> : "Add"}
          </PillButton>
        )}
      </DialogActions>
    </Dialog>
  );
};
