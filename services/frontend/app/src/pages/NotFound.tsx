import React from "react";
import { Box, Typography, Button } from "@mui/material";
import { Link } from "react-router-dom";

export const NotFound: React.FC = () => {
  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        px: 2
      }}
    >
      <Typography variant="h1" sx={{ fontSize: 120, fontWeight: 700, mb: -2 }}>
        404
      </Typography>

      <Typography variant="h5" sx={{ mb: 2 }}>
        Oops! Page not found.
      </Typography>

      <Typography sx={{ mb: 4, maxWidth: 400 }}>
        The page you're looking for doesn't exist or may have been moved.
      </Typography>

      <Button
        variant="contained"
        component={Link}
        to="/admin"
        sx={{ px: 4, py: 1.2 }}
      >
        Go Home
      </Button>
    </Box>
  );
};