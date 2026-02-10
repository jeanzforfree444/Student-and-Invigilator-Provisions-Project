import React, { useState } from "react";
import { Box, TextField, Typography, CircularProgress, Alert, Stack, InputAdornment, IconButton } from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import { apiBaseUrl, getAuthToken, getStoredRole, setAuthSession } from "../utils/api";
import { Panel } from "../components/Panel";
import { PillButton } from "../components/PillButton";
import { sharedInputSx } from "../components/sharedInputSx";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = (location.state as { from?: string } | null)?.from || "";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const resolveRedirect = (role: string | null, requested: string) => {
    if (role === "admin") {
      return requested && requested.startsWith("/admin") ? requested : "/admin";
    }
    if (role === "invigilator") {
      return requested && requested.startsWith("/invigilator") ? requested : "/invigilator";
    }
    return "/login";
  };

  React.useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    const role = getStoredRole();
    const target = resolveRedirect(role, fromPath);
    navigate(target, { replace: true });
  }, [fromPath, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch(`${apiBaseUrl}/auth/token/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data?.detail || data?.non_field_errors?.[0] || "Login failed.");
        setLoading(false);
        return;
      }

      const sessionToken = data.session || data.token;
      if (!sessionToken) {
        setErrorMsg("Invalid server response.");
        setLoading(false);
        return;
      }

      // Use per-login UserSession token so DRF's UserSessionAuthentication accepts requests
      setAuthSession(sessionToken, data.user);
      const role = data.user?.role || (data.user?.is_staff || data.user?.is_superuser ? "admin" : "invigilator");
      const target = resolveRedirect(role, fromPath);
      navigate(target, { replace: true });
    } catch (err: any) {
      setErrorMsg(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: { xs: 2, sm: 4 },
        background:
          "radial-gradient(circle at 15% 25%, rgba(79,70,229,0.16), transparent 35%), radial-gradient(circle at 80% 10%, rgba(14,165,233,0.18), transparent 32%), radial-gradient(circle at 70% 80%, rgba(16,185,129,0.12), transparent 34%), linear-gradient(135deg, #f8fafc 0%, #eef2ff 45%, #f1f5f9 100%)",
      }}
    >
      <Panel
        sx={{
          width: "100%",
          maxWidth: 480,
          p: { xs: 3, sm: 4 },
          borderRadius: 4,
          backdropFilter: "blur(6px)",
        }}
        disableDivider
      >
        <Stack spacing={3} alignItems="center" textAlign="center">
          <Stack spacing={0.5}>
            <Typography variant="h4" fontWeight={700}>
              Sign in
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Use your account credentials to access your dashboard.
            </Typography>
          </Stack>

          {errorMsg && (
            <Alert severity="error" sx={{ width: "100%" }}>
              {errorMsg}
            </Alert>
          )}

          <Box component="form" onSubmit={handleLogin} sx={{ width: "100%" }}>
            <Stack spacing={1.5}>
              <TextField
                fullWidth
                label="Username"
                variant="outlined"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                sx={sharedInputSx}
              />

              <TextField
                fullWidth
                label="Password"
                variant="outlined"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                required
                sx={sharedInputSx}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((s) => !s)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <PillButton
                fullWidth
                variant="contained"
                color="primary"
                type="submit"
                size="large"
                sx={{ py: 1.3, mt: 1 }}
                disabled={loading}
              >
                {loading ? <CircularProgress size={22} color="inherit" /> : "Log in"}
              </PillButton>
            </Stack>
          </Box>
        </Stack>
      </Panel>
    </Box>
  );
}
