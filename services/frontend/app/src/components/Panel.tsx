import React from "react";
import { Paper, Stack, Typography, Divider, PaperProps, Box } from "@mui/material";
import { SxProps, Theme } from "@mui/system";

type PanelProps = PaperProps & {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  disableDivider?: boolean;
};

const baseSx: SxProps<Theme> = {
  p: 3,
  mb: 3,
  borderRadius: 3,
  border: "1px solid #e5e7eb",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  backgroundColor: "#fff",
};

export const Panel: React.FC<PanelProps> = ({
  title,
  actions,
  children,
  sx,
  disableDivider = false,
  ...paperProps
}) => {
  const hasHeader = Boolean(title) || Boolean(actions);
  return (
    <Paper sx={[baseSx, sx]} {...paperProps}>
      {hasHeader && (
        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems="flex-start" mb={2} spacing={1}>
          {title &&
            (typeof title === "string" || typeof title === "number" ? (
              <Typography variant="h6" fontWeight={700}>
                {title}
              </Typography>
            ) : (
              <Box>{title}</Box>
            ))}
          {actions}
        </Stack>
      )}
      {hasHeader && !disableDivider && <Divider sx={{ mb: 2 }} />}
      {children}
    </Paper>
  );
};

export default Panel;
