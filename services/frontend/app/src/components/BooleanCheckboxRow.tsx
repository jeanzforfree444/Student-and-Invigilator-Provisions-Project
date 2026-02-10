import { FormControlLabel, Checkbox, Typography, Stack } from "@mui/material";

interface BoolRowProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
}

export const BooleanCheckboxRow: React.FC<BoolRowProps> = ({ label, value, onChange, yesLabel, noLabel }) => (
  <Stack direction="row" spacing={1} alignItems="center">
    <FormControlLabel
      control={<Checkbox checked={value} onChange={(e) => onChange(e.target.checked)} />}
      label={label}
    />
    <Typography variant="body2" color="text.secondary">
      {value ? yesLabel || "Yes" : noLabel || "No"}
    </Typography>
  </Stack>
);