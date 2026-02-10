import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getAuthToken } from "../utils/api";

export const RequireAuth: React.FC = () => {
  const location = useLocation();
  const token = getAuthToken();

  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
};
