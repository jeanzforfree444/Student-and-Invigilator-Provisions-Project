import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getAuthToken, getStoredRole } from "../utils/api";

interface RequireRoleProps {
  role: "admin" | "invigilator";
}

export const RequireRole: React.FC<RequireRoleProps> = ({ role }) => {
  const location = useLocation();
  const token = getAuthToken();
  const storedRole = getStoredRole();

  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!storedRole) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (storedRole !== role) {
    if (role === "invigilator" && storedRole === "admin") {
      return <Outlet />;
    }
    const redirectPath = storedRole === "admin" ? "/admin" : "/invigilator";
    return <Navigate to={redirectPath} replace />;
  }

  return <Outlet />;
};
