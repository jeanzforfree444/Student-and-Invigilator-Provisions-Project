import { AppBar, Toolbar, Box, Button, Avatar, IconButton, Tooltip, Menu, MenuItem, Divider, Typography } from "@mui/material";
import React, { useRef } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { apiBaseUrl, apiFetch, clearAuthSession, getStoredUser } from "../../utils/api";
import { setInvigilatorLayoutUi, useAppDispatch, useAppSelector } from "../../state/store";

export const InvigilatorLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { accountMenuOpen } = useAppSelector((state) => state.adminTables.invigilatorLayoutUi);
  const menuAnchorRef = useRef<HTMLElement | null>(null);

  const menuItems = [
    { text: "Home", path: "/invigilator" },
    { text: "Timetable", path: "/invigilator/timetable" },
    { text: "Restrictions", path: "/invigilator/restrictions" },
    { text: "Shifts", path: "/invigilator/shifts" }
  ];

  const handleLogout = async () => {
    try {
      await apiFetch(`${apiBaseUrl}/auth/logout/`, { method: "POST" });
    } catch (_err) {
      // Ignore failures; still clear local state.
    } finally {
      clearAuthSession();
      navigate("/login", { replace: true });
    }
  };

  const openMenu = (event: React.MouseEvent<HTMLElement>) => {
    menuAnchorRef.current = event.currentTarget;
    dispatch(setInvigilatorLayoutUi({ accountMenuOpen: true }));
  };
  const closeMenu = () => {
    menuAnchorRef.current = null;
    dispatch(setInvigilatorLayoutUi({ accountMenuOpen: false }));
  };

  const user = getStoredUser();
  const displayName = user?.username || user?.email || "User";
  const avatarSrc = (user as any)?.avatar || undefined;
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navContainerSx = {
    px: 2.5,
    py: 1.25,
    borderRadius: 3,
    border: "1px solid #e5e7eb",
    background: "linear-gradient(135deg, #eef2f7, #d9e9ff)",
    boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
  };

  const navButtonSx = (active: boolean) => ({
    textTransform: "none",
    fontWeight: 700,
    fontSize: "0.95rem",
    px: 2.2,
    py: 1,
    borderRadius: 999,
    color: active ? "#0f3c7c" : "text.primary",
    backgroundColor: active ? "#e3f2fd" : "transparent",
    border: active ? "1px solid #bfd9ff" : "1px solid transparent",
    transition: "all 0.2s ease",
    "&:hover": {
      backgroundColor: active ? "#d9ecff" : "rgba(2, 82, 155, 0.08)",
      color: "#0f3c7c",
    },
  });
    
  return (
    <>
      <AppBar elevation={0} color="transparent" sx={{ px: { xs: 1, sm: 1.5 }, pt: 2 }}>
        <Toolbar>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", ...navContainerSx }}>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              {menuItems.map((item) => (
                (() => {
                  const active = location.pathname === item.path;
                  return (
                <Button
                  key={item.path}
                  component={Link}
                  to={item.path}
                  size="large"
                  sx={navButtonSx(active)}
                >
                  {item.text}
                </Button>
                  );
                })()
              ))}
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Tooltip title={displayName}>
                <IconButton onClick={openMenu} aria-label="Account menu">
                  <Avatar
                    src={avatarSrc}
                    sx={{
                      bgcolor: avatarSrc ? "transparent" : "#0f3c7c",
                      width: 40,
                      height: 40,
                      color: "#fff",
                      fontWeight: 700,
                      border: "2px solid #d9ecff",
                    }}
                  >
                    {avatarSrc ? "" : initials}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={menuAnchorRef.current}
                open={accountMenuOpen && Boolean(menuAnchorRef.current)}
                onClose={closeMenu}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                PaperProps={{
                  elevation: 4,
                  sx: {
                    borderRadius: 3,
                    minWidth: 220,
                    p: 1,
                  },
                }}
              >
                <Box sx={{ px: 1.5, py: 1 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {displayName}
                  </Typography>
                  {user?.email && (
                    <Typography variant="body2" color="text.secondary">
                      {user.email}
                    </Typography>
                  )}
                </Box>
                <Divider sx={{ mb: 0.5 }} />
                <MenuItem component={Link} to="/invigilator/profile" onClick={closeMenu} sx={{ borderRadius: 2 }}>
                  Account
                </MenuItem>
                {(user?.is_staff || user?.is_superuser) && (
                  <MenuItem component={Link} to="/admin" onClick={closeMenu} sx={{ borderRadius: 2 }}>
                    View Administrator Dashboard
                  </MenuItem>
                )}
                <MenuItem
                  onClick={() => {
                    closeMenu();
                    handleLogout();
                  }}
                  sx={{ borderRadius: 2, color: "error.main", fontWeight: 600 }}
                >
                  Logout
                </MenuItem>
              </Menu>
            </Box>
          </Box>
        </Toolbar>
      </AppBar>

      {/* space */}
      <Toolbar />

      <Box component="main" sx={{ p: 2 }}>
        <Outlet />
      </Box>
    </>
  );
};
