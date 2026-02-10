import { createTheme, ThemeProvider } from "@mui/material";
import React, { useMemo } from "react";
import { BrowserRouter, Routes as RouterRoutes, Route as RouterRoute } from "react-router-dom";
import { NotFound } from "./pages/NotFound";
import Login from "./pages/Login";
import { RequireAuth } from "./components/RequireAuth";
import { RequireRole } from "./components/RequireRole";

// Import admin pages and layout
import { AdminLayout } from "./components/admin/Layout";
import { AdminDashboard } from "./pages/admin/Dashboard";
import { AdminCalendar } from "./pages/admin/Calendar";
import { AdminProfile } from "./pages/admin/Profile";
import { AdminExams } from "./pages/admin/Exams";
import { AdminExamDetails } from "./pages/admin/Exam";
import { AdminVenues } from "./pages/admin/Venues";
import { AdminVenuePage } from "./pages/admin/Venue";
import { AdminInvigilators } from "./pages/admin/Invigilators";
import { AdminInvigilatorProfile } from "./pages/admin/Invigilator";

// Import invigilator pages and layout
import { InvigilatorLayout } from "./components/invigilator/Layout";
import { InvigilatorDashboard } from "./pages/invigilator/Dashboard";
import { InvigilatorTimetable } from "./pages/invigilator/Timetable";
import { InvigilatorProfile } from "./pages/invigilator/Profile";
import { InvigilatorRestrictions } from "./pages/invigilator/Restrictions";
import { InvigilatorShifts } from "./pages/invigilator/Shifts";
import { AdminStudents } from "./pages/admin/Students";

export const Routes: React.FC = () => {

  const theme = useMemo(
    () => createTheme({
      palette: {
        primary: { main: "#005399" },
        secondary: { main: "#7bc653" }
      },
    }), []
  );

  return (
    <ThemeProvider theme={theme}>
      <BrowserRouter>
        <RouterRoutes>
          {/* Public Routes */}
          <RouterRoute path="/" element={<Login />} />
          <RouterRoute path="/login" element={<Login />} />

          {/* Protected Routes */}
          <RouterRoute element={<RequireAuth />}>
            <RouterRoute element={<RequireRole role="admin" />}>
              {/* Administrator Pages */}
              <RouterRoute path="/admin" element={<AdminLayout />}>
                <RouterRoute index element={<AdminDashboard />} />
                <RouterRoute path="exams" element={<AdminExams />} />
                <RouterRoute path="exam/:examId" element={<AdminExamDetails />} />
                <RouterRoute path="venues" element={<AdminVenues />} />
                <RouterRoute path="venues/:venueId" element={<AdminVenuePage />} />
                <RouterRoute path="calendar" element={<AdminCalendar />} />
                <RouterRoute path="profile" element={<AdminProfile />} />
                <RouterRoute path="students" element={<AdminStudents />} />
                <RouterRoute path="invigilators" element={<AdminInvigilators />} />
                <RouterRoute path="invigilators/:id" element={<AdminInvigilatorProfile />} />
              </RouterRoute>
            </RouterRoute>

            <RouterRoute element={<RequireRole role="invigilator" />}>
              {/* Invigilator Pages */}
              <RouterRoute path="/invigilator" element={<InvigilatorLayout />}>
                <RouterRoute index element={<InvigilatorDashboard />} /> 
                <RouterRoute path="timetable" element={<InvigilatorTimetable />} />
                <RouterRoute path="restrictions" element={<InvigilatorRestrictions />} />
                <RouterRoute path="shifts" element={<InvigilatorShifts />} />
                <RouterRoute path="profile" element={<InvigilatorProfile />} />
              </RouterRoute>
            </RouterRoute>

            {/* Fallback Route for authenticated users */}
            <RouterRoute path="*" element={<NotFound />} />
          </RouterRoute>

          {/* Fallback Route for unauthenticated users */}
          <RouterRoute path="*" element={<NotFound />} />
        </RouterRoutes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
