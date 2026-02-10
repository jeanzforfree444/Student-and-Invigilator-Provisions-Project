import React from "react";
import { Button, ButtonProps } from "@mui/material";

/**
 * Shared pill-style button used across the app.
 * Keeps styling consistent without duplicating sx everywhere.
 */
export const PillButton: React.FC<ButtonProps> = ({ children, sx, ...props }) => {
  return (
    <Button
      {...props}
      sx={{
        borderRadius: "999px",
        textTransform: "none",
        letterSpacing: 0.2,
        fontWeight: 600,
        px: 2.3,
        py: 0.7,
        boxShadow: "none",
        "&:hover": {
          boxShadow: "0px 4px 18px rgba(0,0,0,0.14)",
          transform: "translateY(-1px)",
        },
        "&:active": {
          transform: "translateY(0)",
        },
        ...sx,
      }}
    >
      {children}
    </Button>
  );
};
