import React, { useEffect, useMemo, useRef } from "react";
import { Avatar, Box, Chip, Grid, IconButton, InputBase, Stack, Typography, CircularProgress } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import EditCalendarIcon from "@mui/icons-material/EditCalendar";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AccountBoxOutlined from "@mui/icons-material/AccountBoxOutlined";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import SearchIcon from "@mui/icons-material/Search";
import { Panel } from "../../components/Panel";
import { PillButton } from "../../components/PillButton";
import { NotificationItem, NotificationsPanel, NotificationType, notificationTypeStyles } from "../../components/admin/NotificationsPanel";
import { apiBaseUrl, apiFetch } from "../../utils/api";
import { formatDate, formatTime } from "../../utils/dates";
import { resetInvigilatorDashboardUi, setInvigilatorDashboardUi, useAppDispatch, useAppSelector } from "../../state/store";

type Announcement = {
  id: number;
  title: string;
  body: string;
  imageUrl?: string | null;
  image?: string | null;
  publishedAt?: string;
  published_at?: string;
  expiresAt?: string | null;
  expires_at?: string | null;
};

type InvigilatorStats = {
  total_shifts: number;
  upcoming_shifts: number;
  cancelled_shifts: number;
  hours_assigned: number;
  hours_upcoming: number;
  restrictions: number;
  availability_entries: number;
  next_assignment?: {
    exam_name?: string | null;
    venue_name?: string | null;
    start?: string | null;
    end?: string | null;
    role?: string | null;
  } | null;
};

type InvigilatorStatKey =
  | "total_shifts"
  | "upcoming_shifts"
  | "cancelled_shifts"
  | "hours_assigned"
  | "hours_upcoming"
  | "restrictions"
  | "availability_entries";

const notifications: NotificationItem[] = [
];

export const InvigilatorDashboard: React.FC = () => {
  const dispatch = useAppDispatch();
  const {
    visibleCount,
    activeAnnouncementIndex,
    notificationQuery,
    selectedNotificationType,
  } = useAppSelector((s) => s.adminTables.invigilatorDashboardUi);
  const announcementIndexRef = useRef(activeAnnouncementIndex);

  useEffect(() => {
    announcementIndexRef.current = activeAnnouncementIndex;
  }, [activeAnnouncementIndex]);
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
  } = useQuery<InvigilatorStats>({
    queryKey: ["invigilator-stats"],
    queryFn: async () => {
      const res = await apiFetch(`${apiBaseUrl}/invigilator/stats/`);
      if (!res.ok) throw new Error("Unable to load stats");
      return res.json();
    },
    retry: false,
  });

  const nextShift = useMemo(() => {
    const ns = stats?.next_assignment;
    if (!ns) return null;
    const start = ns.start ? new Date(ns.start) : null;
    const end = ns.end ? new Date(ns.end) : null;
    const formattedDate = formatDate(start, "TBC");
    const formattedTime =
      start && end
        ? `${formatTime(start, "Time TBC")} - ${formatTime(end, "Time TBC")}`
        : "Time TBC";
    return {
      date: formattedDate,
      time: formattedTime,
      exam: ns.exam_name || "Upcoming exam",
      venue: ns.venue_name || "Venue TBC",
      role: ns.role || "Invigilator",
    };
  }, [stats]);

  // Placeholder announcement when no announcements are available
  const placeholderAnnouncement: Announcement = {
    id: 0,
    title: "Exam operations",
    body: "The exams team will post important updates here. Check back soon.",
    imageUrl:
      "https://images.unsplash.com/photo-1623075840956-c95a6b0ea89e?q=80&w=1674&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    publishedAt: new Date().toISOString(),
  };

  const {
    data: announcementsFromApi = [],
    isError: announcementsError,
    isLoading: announcementsLoading,
  } = useQuery<Announcement[]>({
    queryKey: ["invigilator-announcements"],
    queryFn: async () => {
      const res = await apiFetch(
        `${apiBaseUrl}/announcements/?audience=invigilator&active=true`
      );
      if (res.status === 404) return [];
      if (!res.ok) throw new Error("Unable to load announcements");
      const data = await res.json();
      const allRes = await apiFetch(`${apiBaseUrl}/announcements/?audience=all&active=true`);
      if (allRes.status === 404) return data;
      if (!allRes.ok) throw new Error("Unable to load announcements");
      const allData = await allRes.json();
      return [...data, ...allData];
    },
    retry: false,
  });

  const announcements = useMemo(() => {
    const now = new Date();
    const safeData = announcementsError ? [] : announcementsFromApi;
    const filtered = safeData.filter((a) => {
      if (!a) return false;
      const expires = a.expiresAt ?? a.expires_at;
      if (expires) {
        const exp = new Date(expires);
        if (!Number.isNaN(exp.getTime()) && exp < now) return false;
      }
      return true;
    });
    return filtered.slice().sort((a, b) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      const aDate = new Date(a.publishedAt ?? a.published_at ?? 0).getTime();
      const bDate = new Date(b.publishedAt ?? b.published_at ?? 0).getTime();
      return bDate - aDate;
    });
  }, [announcementsError, announcementsFromApi]);

  const {
    data: notificationsFromApi = [],
    isError: notificationsError,
  } = useQuery<NotificationItem[]>({
    queryKey: ["invigilator-notifications"],
    queryFn: async () => {
      const res = await apiFetch(`${apiBaseUrl}/invigilator/notifications/`);
      if (res.status === 404) return [];
      if (!res.ok) throw new Error("Unable to load notifications");
      return res.json();
    },
    retry: false,
  });

  const notifications = (notificationsError ? [] : notificationsFromApi) || [];
  const invigilatorNotificationTypes: NotificationType[] = [
    "availability",
    "cancellation",
    "assignment",
    "shiftPickup",
    "invigilatorUpdate",
    "mailMerge",
  ];

  const filteredNotifications = useMemo(() => {
    const search = notificationQuery.trim().toLowerCase();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return notifications.filter((n) => {
      const ts = new Date(n.timestamp);
      if (Number.isNaN(ts.getTime()) || ts < cutoff) return false;
      if (!invigilatorNotificationTypes.includes(n.type)) return false;
      if (selectedNotificationType && n.type !== selectedNotificationType) return false;
      if (search) {
        const message = (n.invigilator_message || n.admin_message || "").toLowerCase();
        if (!message.includes(search)) return false;
      }
      return true;
    });
  }, [notifications, notificationQuery, selectedNotificationType]);

  useEffect(() => {
    dispatch(setInvigilatorDashboardUi({ visibleCount: 4 }));
  }, [dispatch, notificationQuery, selectedNotificationType]);

  const activityStats: { label: string; key: InvigilatorStatKey; tone: string }[] = [
    { label: "Total shifts", key: "total_shifts", tone: "#0b4f8c" },
    { label: "Upcoming shifts", key: "upcoming_shifts", tone: "#1565c0" },
    { label: "Cancelled shifts", key: "cancelled_shifts", tone: "#d84315" },
    { label: "Hours assigned", key: "hours_assigned", tone: "#546e7a" },
    { label: "Hours upcoming", key: "hours_upcoming", tone: "#00796b" },
    { label: "Restrictions", key: "restrictions", tone: "#2e7d32" },
    { label: "Availability entries", key: "availability_entries", tone: "#4a148c" },
  ];

  useEffect(() => {
    const total = announcements.length || 1;
    dispatch(setInvigilatorDashboardUi({ activeAnnouncementIndex: 0 }));
    announcementIndexRef.current = 0;
    const timer = window.setInterval(() => {
      const next = (announcementIndexRef.current + 1) % total;
      announcementIndexRef.current = next;
      dispatch(setInvigilatorDashboardUi({ activeAnnouncementIndex: next }));
    }, 7000);
    return () => window.clearInterval(timer);
  }, [announcements.length, dispatch]);

  const showPrevAnnouncement = () => {
    const total = announcements.length || 1;
    const next = activeAnnouncementIndex === 0 ? total - 1 : activeAnnouncementIndex - 1;
    announcementIndexRef.current = next;
    dispatch(setInvigilatorDashboardUi({ activeAnnouncementIndex: next }));
  };

  const showNextAnnouncement = () => {
    const total = announcements.length || 1;
    const next = (activeAnnouncementIndex + 1) % total;
    announcementIndexRef.current = next;
    dispatch(setInvigilatorDashboardUi({ activeAnnouncementIndex: next }));
  };

  const activeAnnouncement =
    announcements[activeAnnouncementIndex] ?? placeholderAnnouncement;
  const announcementCount = announcements.length;
  const heroImage =
    activeAnnouncement.imageUrl ||
    activeAnnouncement.image ||
    placeholderAnnouncement.imageUrl;
  const publishedAtDisplay =
    activeAnnouncement.publishedAt ||
    activeAnnouncement.published_at ||
    placeholderAnnouncement.publishedAt ||
    new Date().toISOString();

  return (
    <Box sx={{ p: 3, height: "100%", overflowY: "auto" }}>
      <Typography variant="h4" fontWeight={700}>
        Dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Stay on top of upcoming exams, important information, and your actions.
      </Typography>

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2.5}
        alignItems="stretch"
        sx={{ width: "100%" }}
      >
        <Box sx={{ flex: { xs: "1 1 100%", md: "0 0 350px" }, display: "flex" }}>
          <Panel title="Your Next Exam" sx={{ flex: 1 }}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Avatar sx={{ bgcolor: "primary.main", width: 52, height: 52 }}>
                  <EventAvailableIcon />
                </Avatar>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {nextShift?.exam || "No upcoming exam"}
                  </Typography>
                  <Typography variant="body2">
                    {nextShift ? `${nextShift.date} - ${nextShift.time}` : "Awaiting schedule"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Venue: {nextShift?.venue || "TBC"}
                  </Typography>
                </Box>
              </Stack>

              <Box sx={{ display: "flex", justifyContent: "center" }}>
                <PillButton
                  variant="contained"
                  startIcon={<CalendarMonthIcon />}
                  href="/invigilator/timetable"
                >
                  Show more
                </PillButton>
              </Box>
            </Stack>
          </Panel>
        </Box>

        <Box sx={{ flex: { xs: "1 1 100%", md: "0 0 250px" }, display: "flex" }}>
          <Panel title="Quick Actions" sx={{ flex: 1 }}>
            <Stack spacing={1}>
              <PillButton
                variant="outlined"
                fullWidth
                startIcon={<EditCalendarIcon />}
                href="/invigilator/timetable"
              >
                View timetable
              </PillButton>
              <PillButton
                variant="outlined"
                fullWidth
                startIcon={<AccessTimeIcon />}
                href="/invigilator/restrictions"
              >
                Submit restrictions
              </PillButton>
              <PillButton
                variant="outlined"
                fullWidth
                startIcon={<AccountBoxOutlined />}
                href="/invigilator/profile"
              >
                Edit profile
              </PillButton>
            </Stack>
          </Panel>
        </Box>

        <Box sx={{ flex: { xs: "1 1 100%", md: "1 1 auto" }, display: "flex" }}>
          <Panel
            title={activeAnnouncement ? activeAnnouncement.title : "Announcements"}
            actions={
              <Stack direction="row" spacing={1}>
                <IconButton
                  aria-label="Previous announcement"
                  onClick={showPrevAnnouncement}
                  sx={{
                    color: "#fff",
                    backgroundColor: "rgba(255,255,255,0.14)",
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.24)" },
                  }}
                >
                  <ChevronLeftIcon />
                </IconButton>
                <IconButton
                  aria-label="Next announcement"
                  onClick={showNextAnnouncement}
                  sx={{
                    color: "#fff",
                    backgroundColor: "rgba(255,255,255,0.14)",
                    "&:hover": { backgroundColor: "rgba(255,255,255,0.24)" },
                  }}
                >
                  <ChevronRightIcon />
                </IconButton>
              </Stack>
            }
            disableDivider
            sx={{
              flex: 1,
              width: "100%",
              position: "relative",
              overflow: "hidden",
              minHeight: { xs: 220, md: 240 },
              color: "#fff",
              backgroundImage: heroImage
                ? `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.65) 100%), url(${heroImage})`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              "& .MuiTypography-h6": { color: "#fff" },
            }}
          >
            {activeAnnouncement && (
              <Stack
                key={activeAnnouncement.id}
                spacing={1.2}
                sx={{
                  pt: 0.5,
                  color: "#fff",
                  maxWidth: "82%",
                  animation: "fadeIn 0.6s ease-in-out",
                  "@keyframes fadeIn": {
                    from: { opacity: 0, transform: "translateY(6px)" },
                    to: { opacity: 1, transform: "translateY(0)" },
                  },
                }}
              >
                <Typography variant="overline" sx={{ letterSpacing: 0.6, opacity: 0.9 }}>
                  {formatDate(publishedAtDisplay)}
                </Typography>
                <Typography variant="body1" sx={{ color: "#e8ecf1" }}>
                  {activeAnnouncement.body}
                </Typography>
              </Stack>
            )}

            {announcementsLoading && (
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backdropFilter: "blur(2px)",
                  backgroundColor: "rgba(0,0,0,0.45)",
                }}
              >
                <Stack spacing={1} alignItems="center" sx={{ color: "#fff" }}>
                  <CircularProgress size={32} sx={{ color: "#fff" }} />
                  <Typography variant="caption" sx={{ color: "#e8ecf1" }}>
                    Loading announcements...
                  </Typography>
                </Stack>
              </Box>
            )}

            {announcementCount > 1 && (
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  position: "absolute",
                  bottom: 12,
                  left: 16,
                  zIndex: 2,
                }}
              >
                {announcements.map((a, idx) => {
                  const isActive = idx === activeAnnouncementIndex;
                  return (
                    <Box
                      key={a.id}
                      onClick={() => {
                        announcementIndexRef.current = idx;
                        dispatch(setInvigilatorDashboardUi({ activeAnnouncementIndex: idx }));
                      }}
                      role="button"
                      aria-label={`Go to announcement ${idx + 1}`}
                      sx={{
                        width: isActive ? 12 : 10,
                        height: isActive ? 12 : 10,
                        borderRadius: "50%",
                        backgroundColor: isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)",
                        border: "1px solid rgba(255,255,255,0.7)",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        boxShadow: isActive ? "0 0 0 3px rgba(255,255,255,0.18)" : "none",
                      }}
                    />
                  );
                })}
              </Stack>
            )}
          </Panel>
        </Box>
      </Stack>

      <Panel title="Your Activity" disableDivider sx={{ mt: 1 }}>
        <Grid container spacing={2.5}>
          {activityStats.map((item) => (
            <Grid item xs={12} sm={6} md={4} lg={2} key={item.label}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: "#f8f8f8",
                  textAlign: "center",
                }}
              >
                <Typography variant="subtitle1" sx={{ color: item.tone, fontWeight: 700, mb: 0.5 }}>
                  {item.label}
                </Typography>
                <Typography variant="h5" fontWeight={700} sx={{ color: "#0f172a" }}>
                  {statsError
                    ? "�"
                    : statsLoading || !stats
                    ? "..."
                    : (stats?.[item.key] ?? 0).toString()}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Panel>

      <Box sx={{ mt: 1.5 }}>
        <Panel title="Notifications" disableDivider sx={{ overflow: "hidden" }}>
          <Stack spacing={2.5}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: "action.hover",
                  borderRadius: 1,
                  px: 2,
                  py: 0.5,
                  minHeight: 40,
                  flex: 1,
                }}
              >
                <SearchIcon sx={{ color: "action.active", mr: 1 }} />
                <InputBase
                  placeholder="Search notifications..."
                  value={notificationQuery}
                  onChange={(e) =>
                    dispatch(setInvigilatorDashboardUi({ notificationQuery: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                    }
                  }}
                  sx={{ width: "100%" }}
                />
              </Box>
              <Stack direction="row" spacing={1} flexWrap="wrap" rowGap={1.2}>
                {invigilatorNotificationTypes.map((type) => {
                  const style = notificationTypeStyles[type];
                  const selected = selectedNotificationType === type;
                  return (
                    <Chip
                      key={type}
                      icon={style.icon as any}
                      label={style.label}
                      size="small"
                      onClick={() =>
                        dispatch(
                          setInvigilatorDashboardUi({
                            selectedNotificationType: selected ? null : type,
                          })
                        )
                      }
                      sx={{
                        backgroundColor: selected ? style.bg : "#fff",
                        color: style.color,
                        fontWeight: 700,
                        border: `1px solid ${style.color}`,
                        opacity: selected ? 1 : 0.7,
                        "& .MuiChip-icon": {
                          color: style.color,
                        },
                      }}
                    />
                  );
                })}
              </Stack>
            </Stack>
            <NotificationsPanel
              notifications={filteredNotifications.slice(0, visibleCount)}
              messageKey="invigilator_message"
              showPanel={false}
            />
          </Stack>
        </Panel>
        {filteredNotifications.length > 0 && (
          <Box
            sx={{
              textAlign: "center",
              mt: 2,
              display: "flex",
              justifyContent: "flex-end",
              gap: 1.5,
            }}
          >
            <PillButton
              variant="outlined"
              onClick={() => dispatch(setInvigilatorDashboardUi({ visibleCount: 4 }))}
              disabled={visibleCount <= 4}
            >
              Show less
            </PillButton>
            <PillButton
              variant="contained"
              onClick={() =>
                dispatch(
                  setInvigilatorDashboardUi({
                    visibleCount: Math.min(visibleCount + 4, filteredNotifications.length),
                  })
                )
              }
              disabled={visibleCount >= filteredNotifications.length}
            >
              {`Show ${Math.min(4, Math.max(filteredNotifications.length - visibleCount, 0))} more`}
            </PillButton>
          </Box>
        )}
      </Box>
    </Box>
  );
};
