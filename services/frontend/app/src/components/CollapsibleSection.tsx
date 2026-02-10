import { Collapse, Stack, Typography, IconButton, Box } from "@mui/material";
import { ExpandMore, ExpandLess } from "@mui/icons-material";
import { useState } from "react";

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultExpanded = false }) => {
  const [open, setOpen] = useState(defaultExpanded);
  
  return (
    <Box mb={2} borderRadius={2}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>
        <IconButton size="small" onClick={() => setOpen(!open)}>
          {open ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Stack spacing={1.5}>{children}</Stack>
      </Collapse>
    </Box>
  );
};