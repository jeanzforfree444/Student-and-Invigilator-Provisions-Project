import * as React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from "react-router-dom";
import { Link as RouterLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  Grid,
  Card,
  CardContent,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Avatar,
  ListItemAvatar,
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination,
  Chip,
  Divider,
  Tooltip,
  InputBase,
  Checkbox,
  Fab,
  Snackbar,
  Alert,
  IconButton,
  Link as MUILink,
} from '@mui/material';
import {
  ViewList,
  GridView,
  CalendarViewMonth,
  Pending,
  Download,
  Notifications,
  PersonAddAlt1,
  Search,
  ArrowUpward,
  ArrowDownward,
  ArrowBack,
  ArrowForward,
  Clear,
  Done,
  Delete,
} from '@mui/icons-material';
import {
  StaticDatePicker,
} from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import dayjs, { Dayjs } from 'dayjs';
import { InvigilatorAvailabilityModal } from "../../components/admin/InvigilatorAvailabilityModal";
import { AddInvigilatorDialog } from '../../components/admin/AddInvigilatorDialog';
import { DeleteConfirmationDialog } from '../../components/admin/DeleteConfirmationDialog';
import { NotifyDialog } from '../../components/admin/NotifyDialog';
import { ExportInvigilatorTimetablesDialog } from "../../components/admin/ExportInvigilatorTimetablesDialog";
import { apiBaseUrl, apiFetch } from '../../utils/api';
import { formatMonthYear } from '../../utils/dates';
import { PillButton } from "../../components/PillButton";
import { Panel } from "../../components/Panel";
import { sharedInputSx } from "../../components/sharedInputSx";
import {
  resetInvigilatorsPageUi,
  setInvigilatorsPageUi,
  setInvigilatorsPrefs,
  useAppDispatch,
  useAppSelector,
} from "../../state/store";

interface Invigilator {
  id: number;
  preferred_name: string | null;
  full_name: string | null;
  avatar?: string | null;
  mobile: string | null;
  mobile_text_only: string | null;
  alt_phone: string | null;
  university_email: string | null;
  personal_email: string | null;
  notes: string | null;
  resigned: boolean;
  availableDates?: string[]; // Optional legacy shape
  availableSlots?: string[]; // Optional legacy shape
  availabilities?: { date: string; slot: string; available: boolean }[]; // Newer shape from backend
  assignments?: InvigilatorAssignment[];
}

interface InvigilatorAssignment {
  id: number;
  invigilator: number;
  invigilator_name?: string | null;
  exam_venue: number;
  exam_name?: string | null;
  venue_name?: string | null;
  exam_start?: string | null;
  exam_length?: number | null;
  role?: string | null;
  assigned_start: string;
  assigned_end: string;
  notes?: string | null;
  break_time_minutes?: number | null;
}

const fetchInvigilators = async (): Promise<Invigilator[]> => {
  const response = await apiFetch(`${apiBaseUrl}/invigilators/`);
  if (!response.ok) throw new Error('Unable to load invigilators');
  return response.json();
};

type ViewMode = 'list' | 'grid' | 'calendar';
type SortField = 'firstName' | 'lastName';
type SortOrder = 'asc' | 'desc';
type NotifyMethod = 'email' | 'sms' | 'call';

export const AdminInvigilators: React.FC = () => {
  const dispatch = useAppDispatch();
  const { data: invigilatorsData = [], isLoading, isError, error } = useQuery<Invigilator[], Error>({ queryKey: ['invigilators'], queryFn: fetchInvigilators });
  const invigilators = useMemo(() => invigilatorsData, [invigilatorsData]);

  const {
    addOpen,
    successOpen,
    successMessage,
    deleteOpen,
    deleteError,
    calendarModalOpen,
    currentMonthIndex,
    bulkAction,
    exporting,
    notifyOpen,
    exportDialogOpen,
    selectedIds,
    selectedDate,
  } = useAppSelector((state) => state.adminTables.invigilatorsPageUi);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view") as ViewMode | null;
  const {
    viewMode,
    firstLetter,
    lastLetter,
    page,
    showAll,
    searchQuery,
    searchDraft,
    sortField,
    sortOrder,
  } = useAppSelector((state) => state.adminTables.invigilators);

  const itemsPerPage = viewMode === 'grid' ? 12 : 10;

  const selectedDateValue = selectedDate ? dayjs(selectedDate) : null;

  // Selection state
  const selected = selectedIds;

  const searchDraftInitialized = useRef(false);

  useEffect(() => {
    dispatch(resetInvigilatorsPageUi());
    return () => {
      dispatch(resetInvigilatorsPageUi());
    };
  }, [dispatch]);

  useEffect(() => {
    if (viewParam && viewParam !== viewMode) {
      dispatch(setInvigilatorsPrefs({ viewMode: viewParam }));
    }
  }, [dispatch, viewMode, viewParam]);

  useEffect(() => {
    if (!viewParam && viewMode) {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.set("view", viewMode);
        return newParams;
      });
    }
  }, [setSearchParams, viewMode, viewParam]);

  useEffect(() => {
    if (!searchDraftInitialized.current && searchQuery && !searchDraft) {
      dispatch(setInvigilatorsPrefs({ searchDraft: searchQuery }));
      searchDraftInitialized.current = true;
    }
  }, [dispatch, searchDraft, searchQuery]);

  // Handle view mode change
  const handleViewChange = (event: React.MouseEvent<HTMLElement>, value: ViewMode) => {
    if (!value) return;

    dispatch(setInvigilatorsPrefs({ viewMode: value }));

    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set("view", value);
      return newParams;
    });
  };

  // Helper to display preferred and full names
  const displayPreferredAndFull = (i: Invigilator) => {
    if (i.preferred_name && i.full_name && i.preferred_name !== i.full_name) {
      return { main: i.preferred_name, sub: i.full_name };
    }
    return { main: i.preferred_name || i.full_name || `Invigilator #${i.id}`, sub: '' };
  };

  // Sorting function
  const sortInvigilators = (data: Invigilator[]) => {
    return [...data].sort((a, b) => {
      const getName = (i: Invigilator) => {
        if (sortField === 'firstName') return ((i.preferred_name || i.full_name || '').split(' ')[0] || '').toUpperCase();
        const parts = (i.full_name || '').split(' ');
        return (parts[parts.length - 1] || '').toUpperCase();
      };

      const nameA = getName(a);
      const nameB = getName(b);

      if (nameA < nameB) return sortOrder === 'asc' ? -1 : 1;
      if (nameA > nameB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Filtering logic
  const filtered = useMemo(() => {
    let result = invigilators;

    if (firstLetter !== 'All') {
      result = result.filter(i => {
        const name = (i.preferred_name || i.full_name || '').trim();
        return name.charAt(0).toUpperCase() === firstLetter;
      });
    }
    if (lastLetter !== 'All') {
      result = result.filter(i => {
        const parts = (i.full_name || '').split(' ');
        const last = parts[parts.length - 1] || '';
        return last.charAt(0).toUpperCase() === lastLetter;
      });
    }

    // Filter by search query
    if (searchQuery.trim() !== '') {
      const query = searchQuery.trim().toLowerCase();
      result = result.filter(i => {
        const preferred = (i.preferred_name || '').toLowerCase();
        const full = (i.full_name || '').toLowerCase();
        const first = full.split(' ')[0] || '';
        const last = full.split(' ').slice(-1)[0] || '';
        return preferred.includes(query) || first.includes(query) || last.includes(query);
      });
    }

    // Sort after filtering
    result = sortInvigilators(result);

    return result;
  }, [firstLetter, lastLetter, invigilators, sortField, sortOrder, searchQuery]);

  useEffect(() => {
    dispatch(setInvigilatorsPrefs({ page: 1 }));
  }, [dispatch, firstLetter, lastLetter, sortField, sortOrder, searchQuery, invigilatorsData]);

  const queryClient = useQueryClient();

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiFetch(`${apiBaseUrl}/invigilators/bulk-delete/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Bulk delete failed");
      }
      return true;
    },
    onSuccess: async (_data, ids) => {
      const count = ids?.length ?? 0;
      dispatch(
        setInvigilatorsPageUi({
          successMessage:
            count === 1
              ? "Invigilator account deleted!"
              : `${count} invigilator accounts deleted!`,
          successOpen: true,
          deleteOpen: false,
          bulkAction: "",
        })
      );
      dispatch(setInvigilatorsPageUi({ selectedIds: [], deleteError: null }));
      await queryClient.invalidateQueries({ queryKey: ["invigilators"] });
    },
    onError: (err: any) => {
      dispatch(setInvigilatorsPageUi({ deleteError: err?.message || "Delete failed" }));
    },
  });

  // Find invigilators available on a specific date
  const getAvailableOnDate = (date: Dayjs) => {
    const dateStr = date.format('YYYY-MM-DD');
    return filtered.filter(i => 
      i.availableDates?.includes(dateStr)
    );
  };

  // Toggle selection of an invigilator
  const toggleSelect = (id: number) => {
    dispatch(setInvigilatorsPageUi({
      selectedIds: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    }));
  };

  const toggleSelectAll = () => {
    if (selected.length === filtered.length) {
      dispatch(setInvigilatorsPageUi({ selectedIds: [] }));
    } else {
      dispatch(setInvigilatorsPageUi({ selectedIds: filtered.map(i => i.id) }));
    }
  };

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = showAll
    ? filtered
    : filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const displayName = (i: Invigilator) =>
    i.preferred_name || i.full_name || `Invigilator #${i.id}`;

  const getInitials = (i: Invigilator) =>
    displayName(i)
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const selectedCount = selected.length;
  const selectionLabel = (singular: string, plural: string) => selectedCount === 1 ? singular : plural;
  const selectedRecipients = React.useMemo(
    () =>
      invigilators
        .filter((inv) => selected.includes(inv.id))
        .map((inv) => ({
          id: inv.id,
          name: displayName(inv),
          emails: [inv.university_email, inv.personal_email].filter(
            (email): email is string => Boolean(email)
          ),
        })),
    [invigilators, selected]
  );

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const extractFilename = (contentDisposition: string | null, fallback: string) => {
    if (!contentDisposition) return fallback;
    const match = contentDisposition.match(/filename="?([^"]+)"?/i);
    return match?.[1] || fallback;
  };

  const exportSelected = async (options: {
    onlyConfirmed: boolean;
    includeCancelled: boolean;
    includeProvisions: boolean;
  }) => {
    if (!selected.length || exporting) return;
    dispatch(setInvigilatorsPageUi({ exporting: true }));
    try {
      const response = await apiFetch(`${apiBaseUrl}/invigilators/timetables/export/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invigilator_ids: selected,
          only_confirmed: options.onlyConfirmed,
          include_cancelled: options.includeCancelled,
          include_provisions: options.includeProvisions,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to export timetables");
      }

      const blob = await response.blob();
      const fallbackName = selected.length === 1 ? "invigilator_timetable.csv" : "invigilators_timetables.zip";
      const filename = extractFilename(response.headers.get("Content-Disposition"), fallbackName);
      downloadBlob(blob, filename);

      dispatch(
        setInvigilatorsPageUi({
          successMessage:
            selected.length === 1 ? "Timetable export downloaded." : "Timetables export downloaded.",
          successOpen: true,
          bulkAction: "",
          exportDialogOpen: false,
        })
      );
    } catch (err: any) {
      alert(err?.message || "Failed to export timetables");
    } finally {
      dispatch(setInvigilatorsPageUi({ exporting: false }));
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography sx={{ mt: 2 }}>Loading invigilators…</Typography>
      </Box>
    );
  }

  if (isError) {
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <Typography color="error" variant="h6">
          {error?.message || 'Failed to load invigilators'}
        </Typography>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ maxWidth: 1400, mx: 'auto', p: 3 }}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
          <Stack direction="column">
            <Typography variant="h4" fontWeight={700}>Invigilators</Typography>
            <Typography variant="body2" color="text.secondary">Browse and manage invigilator details, availability, and scheduling.</Typography>
          </Stack>
          <ToggleButtonGroup value={viewMode} exclusive onChange={handleViewChange} color="primary">
            <ToggleButton value="grid"><GridView /></ToggleButton>
            <ToggleButton value="list"><ViewList /></ToggleButton>
            <ToggleButton value="calendar"><CalendarViewMonth /></ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" mb={2} flexWrap="wrap">
          {/* Search input */}
          <Box
              sx={{
                display: "flex",
                alignItems: "center",
                backgroundColor: "action.hover",
                borderRadius: 1,
                px: 2,
                py: 0.5,
              }}
            >
            <Search sx={{ color: "action.active", mr: 1 }} />
            <InputBase
              placeholder="Search invigilators..."
              value={searchDraft || searchQuery}
              onChange={(e) => {
                const nextValue = e.target.value;
                dispatch(setInvigilatorsPrefs({
                  searchDraft: nextValue,
                  searchQuery: nextValue,
                }));
              }}
              sx={{ width: 250 }}
            />
          </Box>

          {/* Sort by First Name */}
          <PillButton
            variant="outlined"
            size="medium"
            endIcon={
              sortField === 'firstName' ? (
                sortOrder === 'asc' ? <ArrowUpward /> : <ArrowDownward />
              ) : null
            }
            onClick={() => {
              if (sortField === 'firstName') {
                dispatch(setInvigilatorsPrefs({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' }));
              } else {
                dispatch(setInvigilatorsPrefs({ sortField: 'firstName', sortOrder: 'asc' }));
              }
            }}
            sx={{
              minWidth: 160,
              justifyContent: 'space-between',
            }}
          >
            First Name
          </PillButton>

          {/* Sort by Last Name */}
          <PillButton
            variant="outlined"
            size="medium"
            endIcon={
              sortField === 'lastName' ? (
                sortOrder === 'asc' ? <ArrowUpward /> : <ArrowDownward />
              ) : null
            }
            onClick={() => {
              if (sortField === 'lastName') {
                dispatch(setInvigilatorsPrefs({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' }));
              } else {
                dispatch(setInvigilatorsPrefs({ sortField: 'lastName', sortOrder: 'asc' }));
              }
            }}
            sx={{
              minWidth: 160,
              justifyContent: 'space-between',
            }}
          >
            Last Name
          </PillButton>
        </Stack>

        {/* A-Z Filters */}
        <Stack spacing={2} mb={3}>
          <Typography variant="subtitle2">First name</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip
              label="All"
              color={firstLetter === 'All' ? 'primary' : 'default'}
              onClick={() => dispatch(setInvigilatorsPrefs({ firstLetter: 'All' }))}
            />
            {alphabet.map(l => (
              <Chip
                key={l}
                label={l}
                color={firstLetter === l ? 'primary' : 'default'}
                onClick={() => dispatch(setInvigilatorsPrefs({ firstLetter: l }))}
              />
            ))}
          </Stack>

          <Typography variant="subtitle2" sx={{ mt: 2 }}>Last name</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip
              label="All"
              color={lastLetter === 'All' ? 'primary' : 'default'}
              onClick={() => dispatch(setInvigilatorsPrefs({ lastLetter: 'All' }))}
            />
            {alphabet.map(l => (
              <Chip
                key={l}
                label={l}
                color={lastLetter === l ? 'primary' : 'default'}
                onClick={() => dispatch(setInvigilatorsPrefs({ lastLetter: l }))}
              />
            ))}
          </Stack>
        </Stack>

        {/* Counter */}
        <Typography variant="h6" gutterBottom color="primary">
          {filtered.length} invigilators found
        </Typography>

        <Divider sx={{ mb: 3 }} />

        {/* Content */}
        {viewMode === 'calendar' ? (
          <Paper
            elevation={4}
            sx={{
              m: 3,
              borderRadius: 3,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              height: 'calc(100vh - 165px)',
            }}
          >
            {/* Header */}
            <Box sx={{ p: 3, backgroundColor: 'primary.main', color: 'white', textAlign: 'center' }}>
              <Typography variant="h5" fontWeight={600}>
                Invigilator Availability
              </Typography>
            </Box>

            {/* Three Independent Calendars */}
            <Box sx={{ display: 'flex', p: 3, gap: 3, flex: 1, overflow: 'hidden' }}>
              {[-1, 0, 1].map((offset) => {
                const monthDate = dayjs().startOf("month").add(currentMonthIndex + offset, "month");
                const isCurrentMonth = offset === 0;

                return (
                  <Box
                    key={monthDate.format('YYYY-MM')}
                    sx={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      bgcolor: isCurrentMonth ? 'action.selected' : 'background.paper',
                      borderRadius: 2,
                      p: 2,
                      boxShadow: isCurrentMonth ? 3 : 1,
                    }}
                  >
                    <Typography variant="h6" align="center" gutterBottom sx={{ fontWeight: 600 }}>
                      {formatMonthYear(monthDate)}
                    </Typography>

                    <StaticDatePicker
                      displayStaticWrapperAs="desktop"
                      value={null}
                      referenceDate={monthDate}
                      onChange={(newValue) => {
                        dispatch(
                          setInvigilatorsPageUi({
                            selectedDate: newValue ? newValue.toISOString() : null,
                            calendarModalOpen: true,
                          })
                        );
                      }}
                      slots={{
                        toolbar: () => null,
                        calendarHeader: () => null,
                        layout: (props) => <>{props.children}</>,
                      }}
                      slotProps={{
                        day: (ownerState) => ({
                          sx: invigilators.some((i) => {
                            const dateStr = (ownerState.day as Dayjs).format('YYYY-MM-DD');
                            const hasLegacyDate = i.availableDates?.includes(dateStr);
                            const hasAvailability = i.availabilities?.some(
                              (a) => a.available && a.date === dateStr
                            );
                            return hasLegacyDate || hasAvailability;
                          })
                            ? {
                                '&::after': {
                                  content: '""',
                                  position: 'absolute',
                                  bottom: 6,
                                  right: 6,
                                  width: 10,
                                  height: 10,
                                  bgcolor: 'success.main',
                                  borderRadius: '50%',
                                  border: '2px solid white',
                                },
                              }
                            : {},
                        }),
                      }}
                      views={['day']}
                      showDaysOutsideCurrentMonth
                      sx={{
                        '& .MuiPickersDay-root': {
                          width: 42,
                          height: 42,
                          fontSize: '0.9rem',
                        },
                      }}
                    />
                  </Box>
                );
              })}
            </Box>

            {/* Navigation */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
              <PillButton
                variant="contained"
                startIcon={<ArrowBack />}
                onClick={() => dispatch(setInvigilatorsPageUi({ currentMonthIndex: currentMonthIndex - 1 }))}
                size="large"
              >
                Previous
              </PillButton>
              <PillButton
                variant="contained"
                endIcon={<ArrowForward />}
                onClick={() => dispatch(setInvigilatorsPageUi({ currentMonthIndex: currentMonthIndex + 1 }))}
                size="large"
              >
                Next
              </PillButton>
            </Box>
          </Paper>
        ) : viewMode === 'list' ? (
          <Panel disableDivider sx={{ p: 0, mb: 0, overflow: 'hidden' }}>
            <List>
              {paginated.map(i => (
                <ListItem key={i.id} divider sx={{ pl: 1 }}>
                  <Checkbox
                    checked={selected.includes(i.id)}
                    onChange={() => toggleSelect(i.id)}
                    sx={{ mr: 2 }}
                  />

                  <ListItemAvatar>
                    <Avatar src={i.avatar || undefined} sx={{ bgcolor: 'primary.main', fontSize: '1rem' }}>
                      {getInitials(i)}
                    </Avatar>
                  </ListItemAvatar>

                  <ListItemText
                    primary={
                      <Box>
                        <MUILink
                          component={RouterLink}
                          to={`/admin/invigilators/${i.id}`}
                          color="primary"
                          underline="none"
                          sx={{ fontWeight: 600, mr: 1 }}
                        >
                          {displayPreferredAndFull(i).main}
                        </MUILink>
                        {displayPreferredAndFull(i).sub && (
                          <Typography component="span" variant="body2" color="text.secondary">
                            ({displayPreferredAndFull(i).sub})
                          </Typography>
                        )}
                      </Box>
                    }
                    secondary={i.university_email || i.personal_email || 'No email'}
                  />
                </ListItem>
              ))}
            </List>
          </Panel>
        ) : (
          <Grid container spacing={3}>
            {paginated.map(i => (
              // @ts-ignore
              <Grid component="div" item xs={12} sm={6} md={4} lg={3} key={i.id} sx={{ display: "flex", justifyContent: "center" }}>
                <Panel
                  disableDivider
                  sx={{
                    width: 200,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    p: 0,
                    mb: 0,
                    height: '100%',
                    cursor: "pointer",
                    transition: '0.2s',
                    '&:hover': { transform: "translateY(-6px)", boxShadow: 8 },
                  }}
                >
                  {/* Checkbox in top-right */}
                  <Checkbox
                    checked={selected.includes(i.id)}
                    onChange={() => toggleSelect(i.id)}
                    sx={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      p: 0.5
                    }}
                  />
                  <Box sx={{ textAlign: 'center', pt: 4, px: 2, pb: 2 }}>
                    <Avatar
                      src={i.avatar || undefined}
                      sx={{ width: 80, height: 80, mx: 'auto', bgcolor: 'primary.main', fontSize: '2rem' }}
                    >
                      {getInitials(i)}
                    </Avatar>

                    {(() => {
                      const names = displayPreferredAndFull(i);
                      return (
                        <>
                          <MUILink
                            component={RouterLink}
                            to={`/admin/invigilators/${i.id}`}
                            color="primary"
                            underline="none"
                            sx={{
                              display: 'block',
                              mt: 2,
                              fontWeight: 600,
                              fontSize: '1.15rem',
                              lineHeight: 1.3,
                              fontFamily: theme => theme.typography.fontFamily,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={names.main}
                          >
                            {names.main}
                          </MUILink>

                          {names.sub && (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                mt: 0.5,
                                display: 'block',
                                fontFamily: theme => theme.typography.fontFamily,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title={names.sub}
                            >
                              ({names.sub})
                            </Typography>
                          )}
                        </>
                      );
                    })()}

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mt: 1,
                        fontFamily: theme => theme.typography.fontFamily,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={i.university_email || i.personal_email || 'No email'}
                    >
                      {i.university_email || i.personal_email || 'No email'}
                    </Typography>
                  </Box>
                </Panel>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Calendar Modal */}
        <InvigilatorAvailabilityModal
          open={calendarModalOpen}
          onClose={() => dispatch(setInvigilatorsPageUi({ calendarModalOpen: false }))}
          date={selectedDateValue}
          invigilators={invigilators}
        />

        {/* Pagination & Bulk Actions */}
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={3} mt={4}>
          <Stack direction="row" spacing={2} alignItems="center">
            <PillButton
              variant="outlined"
              startIcon={selected.length === filtered.length ? (<Clear />) : (<Done />)}
              onClick={toggleSelectAll}
            >
              {selected.length === filtered.length
                ? "Deselect all invigilators"
                : `Select all ${filtered.length} invigilators`}
            </PillButton>
            <FormControl size="small" sx={[sharedInputSx, { minWidth: 280 }]}>
              <InputLabel>With all selected users...</InputLabel>
              <Select
                label="With all selected users..."
                value={bulkAction}
                disabled={selected.length === 0}
                onChange={(e) => dispatch(setInvigilatorsPageUi({ bulkAction: e.target.value }))}
                disableUnderline
              >
                <MenuItem value="">
                  <em>Choose...</em>
                </MenuItem>
                <MenuItem value="export">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Download fontSize="small" /> {selectionLabel("Export timetable", "Export timetables")}
                  </Stack>
                </MenuItem>
                <MenuItem value="notify">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Notifications fontSize="small" /> Send notification
                  </Stack>
                </MenuItem>
                <MenuItem value="delete">
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Delete fontSize="small" /> {selectionLabel("Delete account", "Delete accounts")}
                  </Stack>
                </MenuItem>
              </Select>
            </FormControl>

            {/* Dynamic Action Icon */}
            <Tooltip
              title={
                selected.length === 0
                  ? "Select at least one invigilator"
                  : bulkAction === "export"
                  ? selectionLabel(
                      "Download the selected invigilator's timetable",
                      "Download the selected invigilators' timetables"
                    )
                  : bulkAction === "notify"
                  ? selectionLabel(
                      "Send a notification to the selected invigilator",
                      "Send a notification to the selected invigilators"
                    )
                  : bulkAction === "delete"
                  ? selectionLabel(
                      "Delete the selected invigilator's account",
                      "Delete the selected invigilators' accounts"
                    )
                  : "Choose an action"
              }
            >
              <span>
                <IconButton
                  size="small"
                  data-testid={bulkAction === "export" ? "bulk-action-export" : undefined}
                  disabled={selected.length === 0 || !bulkAction || exporting}
                  onClick={() => {
                    if (bulkAction === "delete") {
                      dispatch(setInvigilatorsPageUi({ deleteError: null }));
                      dispatch(setInvigilatorsPageUi({ deleteOpen: true }));
                      return;
                    }

                    if (bulkAction === "export") {
                      dispatch(setInvigilatorsPageUi({ exportDialogOpen: true }));
                      return;
                    }

                    if (bulkAction === "notify") {
                      dispatch(setInvigilatorsPageUi({ notifyOpen: true }));
                      return;
                    }
                  }}
                >
                  {bulkAction === "export" ? (
                    <Download color="action" />
                  ) : bulkAction === "notify" ? (
                    <Notifications color="action" />
                  ) : bulkAction === "delete" ? (
                    <Delete color="error" />
                  ) : (
                    <Pending color="disabled" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          <Pagination
            count={totalPages}
            page={page}
            onChange={(e, v) => dispatch(setInvigilatorsPrefs({ page: v }))}
            color="primary"
          />
        </Stack>

        {/* Show All Button */}
        {filtered.length > itemsPerPage && (
          <Box sx={{ textAlign: 'center', mt: 2, display: 'flex', justifyContent: 'center', gap: 1.5 }}>
            <PillButton
              variant="outlined"
              onClick={() => dispatch(setInvigilatorsPrefs({ showAll: false }))}
              disabled={!showAll}
            >
              Show less
            </PillButton>
            <PillButton
              variant="contained"
              onClick={() => dispatch(setInvigilatorsPrefs({ showAll: true }))}
              disabled={showAll}
            >
              {`Show all ${filtered.length}`}
            </PillButton>
          </Box>
        )}

        <Tooltip title="Add a new invigilator">
          <Fab
            color="primary"
            size="large"
            onClick={() => dispatch(setInvigilatorsPageUi({ addOpen: true }))}
            sx={{
              position: 'fixed',
              bottom: 32,
              right: 32,
              boxShadow: 3,
            }}
          >
            <PersonAddAlt1 fontSize="medium" />
          </Fab>
        </Tooltip>

        {/* Add Invigilator Dialog */}
        <AddInvigilatorDialog
          open={addOpen}
          onClose={() => dispatch(setInvigilatorsPageUi({ addOpen: false }))}
          onSuccess={(name) => {
            dispatch(
              setInvigilatorsPageUi({
                successMessage: `${name} added successfully!`,
                successOpen: true,
              })
            );
          }}
        />

        <NotifyDialog
          open={notifyOpen}
          recipients={selectedRecipients}
          onClose={() => {
            dispatch(setInvigilatorsPageUi({ notifyOpen: false, bulkAction: "" }));
          }}
          onSent={(count) => {
            dispatch(
              setInvigilatorsPageUi({
                successMessage:
                  count === 1
                    ? "Mail merge ready for 1 invigilator."
                    : `Mail merge ready for ${count} invigilators.`,
                successOpen: true,
                notifyOpen: false,
                bulkAction: "",
              })
            );
          }}
        />

        <ExportInvigilatorTimetablesDialog
          open={exportDialogOpen}
          invigilators={invigilators
            .filter((inv) => selected.includes(inv.id))
            .map((inv) => ({
              id: inv.id,
              name: displayName(inv),
            }))}
          loading={exporting}
          onClose={() => {
            if (!exporting) {
              dispatch(setInvigilatorsPageUi({ exportDialogOpen: false, bulkAction: "" }));
            }
          }}
          onExport={exportSelected}
        />

        {/* Delete Confirmation Dialog */}
        <DeleteConfirmationDialog
          open={deleteOpen}
          title="Delete invigilator accounts?"
          description={
            <>
              You are about to permanently delete <strong>{selected.length}</strong>{" "}
              invigilator's {selectionLabel("account", "accounts")}.
              {deleteError ? (
                <Typography sx={{ mt: 2 }} color="error">
                  {deleteError}
                </Typography>
              ) : null}
            </>
          }
          confirmText={`Delete ${selected.length}`}
          loading={bulkDeleteMutation.isPending}
          onClose={() => {
            if (!bulkDeleteMutation.isPending) {
              dispatch(setInvigilatorsPageUi({ deleteOpen: false }));
              dispatch(setInvigilatorsPageUi({ deleteError: null }));
            }
          }}
          onConfirm={() => bulkDeleteMutation.mutate(selected)}
        />

        <Snackbar
          open={successOpen}
          autoHideDuration={3000}
          onClose={() => dispatch(setInvigilatorsPageUi({ successOpen: false }))}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert
            onClose={() => dispatch(setInvigilatorsPageUi({ successOpen: false }))}
            severity="success"
            variant="filled"
            sx={{
              backgroundColor: '#d4edda',
              color: '#155724',
              border: '1px solid #155724',
              borderRadius: '50px',
              fontWeight: 500,
            }}
          >
            {successMessage}
          </Alert>
        </Snackbar>
      </Box>
    </LocalizationProvider>
  );
};
