import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { alpha } from '@mui/material/styles';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Toolbar,
  Typography,
  Collapse,
  Paper,
  Checkbox,
  IconButton,
  Tooltip,
  InputBase,
  CircularProgress,
  Chip,
  Divider,
  Stack,
  Snackbar,
  Alert,
  Fab,
  Link as MUILink,
  MenuItem,
  TextField,
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, ExpandMore as ExpandMoreIcon, Search as SearchIcon, AddLocationAlt as AddLocationAltIcon, ArrowForward as ArrowForwardIcon } from '@mui/icons-material';
import { visuallyHidden } from '@mui/utils';
import { Link } from 'react-router-dom';
import { apiBaseUrl, apiFetch } from '../../utils/api';
import { AddVenueDialog } from '../../components/admin/AddVenueDialog';
import { DeleteConfirmationDialog } from '../../components/admin/DeleteConfirmationDialog';
import { PillButton } from '../../components/PillButton';
import { Panel } from '../../components/Panel';
import { VENUE_TYPES } from '../../components/admin/venueTypes';
import { useAppDispatch, useAppSelector, setVenuesPrefs, setVenuesPageUi } from '../../state/store';
import { sharedInputSx } from "../../components/sharedInputSx";

interface ExamVenueData {
  exam_name: string;
  start_time: string | null;
  exam_length: number | null;
}

interface VenueData {
  venue_name: string;
  capacity: number;
  venuetype: string;
  is_accessible: boolean;
  qualifications: string[];
  availability: unknown[];
  provision_capabilities: string[];
  exam_venues: ExamVenueData[];
}

interface VenueExamDetail {
  name: string;
  start: string;
  end: string;
  duration: string;
}

interface RowData {
  id: string;
  name: string;
  capacity: number;
  type: string;
  venueType: string;
  accessibility: string;
  provisionCapabilities: string;
  examDetails: VenueExamDetail[];
  examSearch: string;
}

type Order = 'asc' | 'desc';

interface HeadCell {
  disablePadding: boolean;
  id: keyof RowData;
  label: string;
  numeric: boolean;
}

const headCells: readonly HeadCell[] = [
  { id: 'name', numeric: false, disablePadding: true, label: 'Venue' },
  { id: 'capacity', numeric: true, disablePadding: false, label: 'Capacity' },
  { id: 'type', numeric: false, disablePadding: false, label: 'Type' },
  { id: 'accessibility', numeric: false, disablePadding: false, label: 'Accessible' },
  { id: 'provisionCapabilities', numeric: false, disablePadding: false, label: 'Provisions' },
];

const fetchVenues = async (): Promise<VenueData[]> => {
  const response = await apiFetch(apiBaseUrl + "/venues/");
  if (!response.ok) throw new Error('Unable to load venues');
  return response.json();
};

const formatLabel = (text?: string): string => {
  if (!text) return 'Unknown';
  const spaced = text.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const formatDateTime = (dateTime?: string): string => {
  if (!dateTime) return 'N/A';
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDurationFromLength = (length: number | null | undefined): string => {
  if (length == null) return 'N/A';
  const hours = Math.floor(length / 60);
  const minutes = Math.round(length % 60);
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(' ') || '0m';
};

const calculateEndTime = (start: string | null, length: number | null): string => {
  if (!start || length == null) return '';
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return '';
  const end = new Date(startDate.getTime() + length * 60000);
  return end.toISOString();
};

const descendingComparator = <T,>(a: T, b: T, orderBy: keyof T) => {
  if (b[orderBy] < a[orderBy]) return -1;
  if (b[orderBy] > a[orderBy]) return 1;
  return 0;
};

const getComparator = <Key extends keyof RowData>(
  order: Order,
  orderBy: Key,
): ((a: RowData, b: RowData) => number) =>
  order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);

interface EnhancedTableProps {
  numSelected: number;
  onRequestSort: (e: React.MouseEvent<unknown>, p: keyof RowData) => void;
  onSelectAllClick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  order: Order;
  orderBy: keyof RowData;
  rowCount: number;
}

const EnhancedTableHead = ({
  numSelected,
  onRequestSort,
  onSelectAllClick,
  order,
  orderBy,
  rowCount,
}: EnhancedTableProps) => {
  const createSortHandler =
    (property: keyof RowData) => (event: React.MouseEvent<unknown>) =>
      onRequestSort(event, property);

  return (
    <TableHead>
      <TableRow>
        <TableCell padding="checkbox">
          <Checkbox
            color="primary"
            checked={rowCount > 0 && numSelected === rowCount}
            indeterminate={numSelected > 0 && numSelected < rowCount}
            onChange={onSelectAllClick}
            disabled={rowCount === 0}
          />
        </TableCell>

        {headCells.map((headCell) => (
          <TableCell
            key={headCell.id}
            align={headCell.numeric ? 'right' : 'left'}
            padding={headCell.disablePadding ? 'none' : 'normal'}
            sortDirection={orderBy === headCell.id ? order : false}
          >
            <TableSortLabel
              active={orderBy === headCell.id}
              direction={orderBy === headCell.id ? order : 'asc'}
              onClick={createSortHandler(headCell.id)}
            >
              {headCell.label}
              {orderBy === headCell.id ? (
                <Box component="span" sx={visuallyHidden}>
                  {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
                </Box>
              ) : null}
            </TableSortLabel>
          </TableCell>
        ))}

        <TableCell align="center">Details</TableCell>
      </TableRow>
    </TableHead>
  );
};

interface EnhancedTableToolbarProps {
  numSelected: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: () => void;
  onAddVenue: () => void;
  onDeleteSelected: () => void;
  deleteLoading: boolean;
}

const EnhancedTableToolbar = ({ numSelected, searchQuery, onSearchChange, onSearchSubmit, onAddVenue, onDeleteSelected, deleteLoading }: EnhancedTableToolbarProps) => {
  return (
    <Toolbar
      sx={[
        { pl: { sm: 2 }, pr: { xs: 1, sm: 1 } },
        numSelected > 0 && {
          bgcolor: (theme) =>
            alpha(theme.palette.primary.main, theme.palette.action.activatedOpacity),
        },
      ]}
    >
      {numSelected > 0 ? (
        <Typography sx={{ flex: '1 1 100%' }} color="inherit" variant="subtitle1">
          {numSelected} selected
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: '1 1 100%' }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'action.hover',
              borderRadius: 1,
              px: 2,
              py: 0.5,
            }}
          >
            <SearchIcon sx={{ color: 'action.active', mr: 1 }} />
            <InputBase
              placeholder="Search venues…"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSearchSubmit();
                }
              }}
              sx={{ width: 220 }}
            />
            <IconButton aria-label="Apply search" color="primary" onClick={onSearchSubmit} sx={{ ml: 1 }}>
              <ArrowForwardIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      )}

      {numSelected > 0 && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          {numSelected === 1 && (
            <PillButton
              variant="contained"
              color="primary"
              startIcon={<EditIcon />}
            >
              Edit
            </PillButton>
          )}
          <PillButton
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            disabled={deleteLoading}
            onClick={onDeleteSelected}
          >
            {deleteLoading ? "Deleting..." : "Delete"}
          </PillButton>
        </Box>
      )}
    </Toolbar>
  );
};

export const AdminVenues: React.FC = () => {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const { order, orderBy: rawOrderBy, page, rowsPerPage, searchQuery, searchDraft } = useAppSelector((s) => s.adminTables.venues);
  const {
    addOpen,
    deleteOpen,
    deleteTargets,
    deleteError,
    successOpen,
    successMessage,
    errorMessage,
    venueTypeOverrides,
    updatingVenueIds,
    selectedIds,
    openRows,
  } = useAppSelector((s) => s.adminTables.venuesPage);
  const allowedSortKeys = ['name', 'capacity', 'type', 'accessibility', 'provisionCapabilities'] as const;
  type VenueSortKey = typeof allowedSortKeys[number];
  const orderBy: VenueSortKey = allowedSortKeys.includes(rawOrderBy as VenueSortKey)
    ? (rawOrderBy as VenueSortKey)
    : 'name';
  const selected = selectedIds;
  const searchDraftInitialized = React.useRef(false);
  React.useEffect(() => {
    if (searchDraftInitialized.current) return;
    if (!searchDraft && searchQuery) {
      dispatch(setVenuesPrefs({ searchDraft: searchQuery }));
    }
    searchDraftInitialized.current = true;
  }, [dispatch, searchDraft, searchQuery]);

  const {
    data: venuesData = [],
    isLoading,
    isError,
    error,
  } = useQuery<VenueData[], Error>({
    queryKey: ['venues'],
    queryFn: fetchVenues,
  });

  const rows = React.useMemo<RowData[]>(
    () =>
      venuesData.map((venue) => ({
        venueType: venueTypeOverrides[venue.venue_name] ?? venue.venuetype,
        id: venue.venue_name,
        name: venue.venue_name,
        capacity: venue.capacity,
        type: formatLabel(venueTypeOverrides[venue.venue_name] ?? venue.venuetype),
        accessibility: venue.is_accessible ? 'Yes' : 'No',
        provisionCapabilities: (venue.provision_capabilities || []).join(', '),
        examDetails: (venue.exam_venues || []).map((ex) => ({
          name: ex.exam_name,
          start: ex.start_time || '',
          end: calculateEndTime(ex.start_time, ex.exam_length),
          duration: formatDurationFromLength(ex.exam_length),
        })),
        examSearch: (venue.exam_venues || []).map((ev) => ev.exam_name).join(', '),
      })),
    [venuesData, venueTypeOverrides],
  );

  const updateVenueTypeMutation = useMutation<any, Error, { venueName: string; venueType: string; previousType?: string }>({
    mutationFn: async (payload) => {
      const res = await apiFetch(`${apiBaseUrl}/venues/${encodeURIComponent(payload.venueName)}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venuetype: payload.venueType }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update venue type");
      }
      return res.json();
    },
    onMutate: (payload) => {
      dispatch(setVenuesPageUi({
        updatingVenueIds: {
          ...updatingVenueIds,
          [payload.venueName]: true,
        },
      }));
    },
    onSuccess: (_data, payload) => {
      dispatch(setVenuesPageUi({
        successMessage: `Updated venue type for ${payload.venueName}.`,
        successOpen: true,
      }));
      queryClient.invalidateQueries({ queryKey: ['venues'] });
      queryClient.invalidateQueries({ queryKey: ['venue', payload.venueName] });
    },
    onError: (err: any, payload) => {
      if (payload?.venueName) {
        if (payload.previousType) {
          dispatch(setVenuesPageUi({
            venueTypeOverrides: {
              ...venueTypeOverrides,
              [payload.venueName]: payload.previousType,
            },
          }));
        } else {
          const next = { ...venueTypeOverrides };
          delete next[payload.venueName];
          dispatch(setVenuesPageUi({ venueTypeOverrides: next }));
        }
      }
      dispatch(setVenuesPageUi({ errorMessage: err?.message || "Failed to update venue type." }));
    },
    onSettled: (_data, _error, payload) => {
      if (payload?.venueName) {
        const next = { ...updatingVenueIds };
        delete next[payload.venueName];
        dispatch(setVenuesPageUi({ updatingVenueIds: next }));
      }
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiFetch(`${apiBaseUrl}/venues/bulk-delete/`, {
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
      dispatch(setVenuesPageUi({ selectedIds: [] }));
      dispatch(setVenuesPageUi({
        deleteOpen: false,
        deleteTargets: [],
        deleteError: null,
        successMessage: `Deleted ${ids.length} venue${ids.length === 1 ? "" : "s"}.`,
        successOpen: true,
      }));
      await queryClient.invalidateQueries({ queryKey: ['venues'] });
    },
    onError: (err: any) => {
      dispatch(setVenuesPageUi({ deleteError: err?.message || "Failed to delete venues." }));
    },
  });

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      dispatch(setVenuesPageUi({ selectedIds: rows.map((n) => n.id) }));
      return;
    }
    dispatch(setVenuesPageUi({ selectedIds: [] }));
  };

  const handleRequestSort = (_event: React.MouseEvent<unknown>, property: keyof RowData) => {
    const isAsc = orderBy === property && order === 'asc';
    dispatch(setVenuesPrefs({ order: isAsc ? 'desc' : 'asc', orderBy: property }));
  };

  const handleClick = (event: React.MouseEvent<unknown>, id: string) => {
    const selectedIndex = selected.indexOf(id);
    let newSelected: readonly string[] = [];

    if (selectedIndex === -1) newSelected = newSelected.concat(selected, id);
    else if (selectedIndex === 0) newSelected = newSelected.concat(selected.slice(1));
    else if (selectedIndex === selected.length - 1)
      newSelected = newSelected.concat(selected.slice(0, -1));
    else if (selectedIndex > 0)
      newSelected = newSelected.concat(
        selected.slice(0, selectedIndex),
        selected.slice(selectedIndex + 1),
      );

    dispatch(setVenuesPageUi({ selectedIds: [...newSelected] }));
  };

  const handleSearchChange = (q: string) => {
    if (q === "") {
      dispatch(setVenuesPrefs({ searchDraft: "", searchQuery: "", page: 0 }));
      return;
    }
    dispatch(setVenuesPrefs({ searchDraft: q }));
  };

  const handleVenueTypeChange = (venueName: string, nextType: string, currentType: string) => {
    if (!nextType || nextType === currentType) return;
    dispatch(setVenuesPageUi({
      venueTypeOverrides: {
        ...venueTypeOverrides,
        [venueName]: nextType,
      },
    }));
    updateVenueTypeMutation.mutate({
      venueName,
      venueType: nextType,
      previousType: currentType,
    });
  };

  const openDeleteDialogForSelection = () => {
    if (!selected.length) return;
    dispatch(setVenuesPageUi({
      deleteTargets: [...selected],
      deleteError: null,
      deleteOpen: true,
    }));
  };

  const deleteCount = deleteTargets.length;
  const deleteTarget = deleteTargets[0];

  const filteredRows = React.useMemo(() => {
    if (!searchQuery) return rows;
    const q = searchQuery.toLowerCase();

    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.type.toLowerCase().includes(q) ||
        row.accessibility.toLowerCase().includes(q) ||
        row.examSearch.toLowerCase().includes(q) ||
        row.provisionCapabilities.toLowerCase().includes(q) ||
        row.capacity.toString().includes(q),
    );
  }, [rows, searchQuery]);

  const emptyRows = page > 0 ? Math.max(0, (1 + page) * rowsPerPage - filteredRows.length) : 0;

  const visibleRows = React.useMemo(
    () =>
      [...filteredRows]
        .sort(getComparator(order, orderBy as keyof RowData))
        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [order, orderBy, page, rowsPerPage, filteredRows],
  );

  React.useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredRows.length / rowsPerPage) - 1);
    if (page > maxPage) dispatch(setVenuesPrefs({ page: maxPage }));
  }, [filteredRows.length, rowsPerPage, page, dispatch]);

  const summary = React.useMemo(() => {
    const total = venuesData.length;
    const accessible = venuesData.filter((v) => v.is_accessible).length;
    const examCount = venuesData.reduce((acc, v) => acc + (v.exam_venues?.length || 0), 0);
    return { total, accessible, examCount };
  }, [venuesData]);

  if (isLoading)
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography sx={{ mt: 2 }}>Loading venues…</Typography>
      </Box>
    );

  if (isError)
    return (
      <Box sx={{ width: '100%', maxWidth: 1050, mx: 'auto', p: 3 }}>
        <Panel>
          <Typography color="error" variant="h6">
            {error?.message || 'Failed to load venues'}
          </Typography>
        </Panel>
      </Box>
    );

  return (
    <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto', p: { xs: 2, md: 4 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" rowGap={1.5}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Venues</Typography>
          <Typography variant="body2" color="text.secondary">Browse and manage all exam venues.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Chip
            label={`${summary.total} Venues`}
            size="medium"
            sx={{
              backgroundColor: "#e3f2fd",
              color: "primary.main",
              fontWeight: 600,
            }}
          />
          <Chip
            label={`${summary.accessible} Accessible`}
            size="medium"
            sx={{
              backgroundColor: alpha("#2e7d32", 0.12),
              color: "success.main",
              fontWeight: 600,
            }}
          />
          <Chip
            label={`${summary.examCount} Exam slots`}
            size="medium"
            sx={{
              backgroundColor: "#f0f0f0ff",
              fontWeight: 600,
            }}
          />
        </Stack>
      </Stack>

      <Panel disableDivider sx={{ width: '100%', mb: 2, p: 0, overflow: 'hidden' }}>
        <EnhancedTableToolbar
          numSelected={selected.length}
          searchQuery={searchDraft || searchQuery}
          onSearchChange={handleSearchChange}
          onSearchSubmit={() => {
            const trimmed = searchDraft.trim();
            dispatch(setVenuesPrefs({ searchQuery: trimmed, searchDraft: trimmed, page: 0 }));
          }}
          onAddVenue={() => dispatch(setVenuesPageUi({ addOpen: true }))}
          onDeleteSelected={openDeleteDialogForSelection}
          deleteLoading={bulkDeleteMutation.isPending}
        />
        <Divider />

        <TableContainer>
          <Table sx={{ minWidth: 750 }} size="medium">
            <EnhancedTableHead
              numSelected={selected.length}
              order={order}
              orderBy={orderBy}
              onSelectAllClick={handleSelectAllClick}
              onRequestSort={handleRequestSort}
              rowCount={filteredRows.length}
            />

            <TableBody>
              {visibleRows.map((row, index) => {
                const isItemSelected = selected.includes(row.id);
                const labelId = `enhanced-table-checkbox-${index}`;
                const isOpen = openRows[row.id] || false;
                const isTypeUpdating = Boolean(updatingVenueIds[row.id]);

                return (
                  <React.Fragment key={row.id}>
                    <TableRow hover role="checkbox" aria-checked={isItemSelected} selected={isItemSelected}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          color="primary"
                          checked={isItemSelected}
                          onClick={(event) => handleClick(event, row.id)}
                          inputProps={{ 'aria-labelledby': labelId }}
                        />
                      </TableCell>

                      <TableCell id={labelId} component="th" scope="row" padding="none">
                        <MUILink
                          component={Link}
                          to={`/admin/venues/${encodeURIComponent(row.id)}`}
                          sx={{ cursor: 'pointer', fontWeight: 600 }}
                          underline="hover"
                        >
                          {row.name}
                        </MUILink>
                      </TableCell>

                      <TableCell align="right">{row.capacity}</TableCell>
                      <TableCell>
                        <TextField
                          select
                          size="small"
                          value={row.venueType}
                          onChange={(event) => handleVenueTypeChange(row.id, event.target.value, row.venueType)}
                          disabled={isTypeUpdating}
                          sx={[sharedInputSx, { minWidth: 180 }]}
                        >
                          {VENUE_TYPES.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>{row.accessibility}</TableCell>
                      <TableCell>{row.provisionCapabilities || '—'}</TableCell>

                      <TableCell align="center">
                        <IconButton
                          onClick={() =>
                            dispatch(
                              setVenuesPageUi({
                                openRows: {
                                  ...openRows,
                                  [row.id]: !openRows[row.id],
                                },
                              })
                            )
                          }
                        >
                          <ExpandMoreIcon
                            sx={{
                              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s ease',
                            }}
                          />
                        </IconButton>
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell colSpan={headCells.length + 2} sx={{ py: 0 }}>
                        <Collapse in={isOpen} unmountOnExit>
                          <Box sx={{ m: 2 }}>
                            <Typography variant="subtitle1" gutterBottom>
                              Exams in this venue
                            </Typography>

                            {row.examDetails.length > 0 ? (
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Exam</TableCell>
                                    <TableCell>Start</TableCell>
                                    <TableCell>End</TableCell>
                                    <TableCell>Duration</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {row.examDetails.map((exam) => (
                                    <TableRow key={`${row.id}-${exam.name}-${exam.start}`}>
                                      <TableCell>{exam.name}</TableCell>
                                      <TableCell>{formatDateTime(exam.start)}</TableCell>
                                      <TableCell>{formatDateTime(exam.end)}</TableCell>
                                      <TableCell>{exam.duration}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                No exams scheduled for this venue.
                              </Typography>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}

              {!filteredRows.length && (
                <TableRow>
                  <TableCell colSpan={headCells.length + 2}>
                    <Typography variant="body2" color="text.secondary">No venue records found.</Typography>
                  </TableCell>
                </TableRow>
              )}
              {emptyRows > 0 && (
                <TableRow style={{ height: 53 * emptyRows }}>
                  <TableCell colSpan={headCells.length + 2} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Divider />
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={filteredRows.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_e, newPage) => dispatch(setVenuesPrefs({ page: newPage }))}
          onRowsPerPageChange={(e) => {
            dispatch(setVenuesPrefs({ rowsPerPage: parseInt(e.target.value, 10), page: 0 }));
          }}
        />
      </Panel>
      <AddVenueDialog
        open={addOpen}
        onClose={() => dispatch(setVenuesPageUi({ addOpen: false }))}
        onSuccess={(name) => {
          dispatch(setVenuesPageUi({
            successMessage: `${name} added successfully!`,
            successOpen: true,
            addOpen: false,
          }));
          queryClient.invalidateQueries({ queryKey: ['venues'] });
        }}
      />
      <DeleteConfirmationDialog
        open={deleteOpen}
        title={deleteCount > 1 ? "Delete venues?" : "Delete venue?"}
        description={
          <>
            {deleteCount > 1 ? (
              <>
                This will permanently delete <strong>{deleteCount}</strong> venues.
              </>
            ) : (
              <>
                This will permanently delete the venue record for{" "}
                <strong>{deleteTarget || "this venue"}</strong>.
              </>
            )}
            {deleteError ? (
              <Typography sx={{ mt: 2 }} color="error">
                {deleteError}
              </Typography>
            ) : null}
          </>
        }
        confirmText={deleteCount > 1 ? `Delete ${deleteCount}` : "Delete"}
        loading={bulkDeleteMutation.isPending}
        onClose={() => {
          if (!bulkDeleteMutation.isPending) {
            dispatch(setVenuesPageUi({ deleteOpen: false, deleteTargets: [], deleteError: null }));
          }
        }}
        onConfirm={() => {
          if (deleteTargets.length) bulkDeleteMutation.mutate(deleteTargets);
        }}
      />
      <Snackbar
        open={successOpen}
        autoHideDuration={3000}
        onClose={() => dispatch(setVenuesPageUi({ successOpen: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => dispatch(setVenuesPageUi({ successOpen: false }))}
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
      <Snackbar
        open={Boolean(errorMessage)}
        autoHideDuration={4000}
        onClose={() => dispatch(setVenuesPageUi({ errorMessage: null }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity="error"
          onClose={() => dispatch(setVenuesPageUi({ errorMessage: null }))}
          variant="filled"
        >
          {errorMessage}
        </Alert>
      </Snackbar>
      <Fab
        color="primary"
        onClick={() => dispatch(setVenuesPageUi({ addOpen: true }))}
        sx={{
          position: 'fixed',
          bottom: 32,
          right: 32,
          boxShadow: 4,
        }}
        aria-label="Add venue"
      >
        <AddLocationAltIcon />
      </Fab>
    </Box>
  );
};
